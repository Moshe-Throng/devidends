/**
 * Workday Adapter — Hidden CXS JSON API
 *
 * One adapter handles ALL Workday orgs via config:
 *   - FHI 360: fhi.wd1.myworkdayjobs.com
 *   - UNHCR: unhcr.wd3.myworkdayjobs.com
 *   - Mastercard Foundation: mastercardfoundation.wd10.myworkdayjobs.com
 *   - Any new org: just add to sources.json
 */

import type { CrawlAdapter, SourceConfig, RawOpportunity } from "../types";
import { stripHtml, sleep } from "../utils/http";
import { createLogger } from "../utils/logger";

interface WorkdayConfig {
  baseUrl: string; // e.g. "https://fhi.wd1.myworkdayjobs.com"
  tenant: string; // e.g. "fhi"
  siteId: string; // e.g. "FHI_360_External_Career_Portal"
  searchText?: string; // e.g. "Ethiopia"
  orgName: string; // e.g. "FHI 360"
  limit?: number;
  fetchDetails?: boolean;
}

export class WorkdayAdapter implements CrawlAdapter {
  name = "workday";

  async crawl(source: SourceConfig): Promise<RawOpportunity[]> {
    const log = createLogger(source.id);
    const cfg = source.config as WorkdayConfig;
    const {
      baseUrl,
      tenant,
      siteId,
      orgName,
      searchText = "Ethiopia",
      limit = 20,
      fetchDetails = true,
    } = cfg;

    const searchUrl = `${baseUrl}/wday/cxs/${tenant}/${siteId}/jobs`;
    const referer = `${baseUrl}/en-US/${siteId}`;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Referer: referer,
      Origin: baseUrl,
    };

    log.info(`Fetching via CXS API (search="${searchText}")...`);

    let postings: any[] = [];

    // Try Ethiopia search first
    try {
      const res = await fetch(searchUrl, {
        method: "POST",
        headers,
        body: JSON.stringify({ appliedFacets: {}, limit, offset: 0, searchText }),
      });

      if (res.ok) {
        const data = await res.json();
        postings = data.jobPostings || [];
        log.info(`Search returned ${postings.length} postings (${data.total} total)`);

        // If 0, try broad search and filter client-side
        if (postings.length === 0 && searchText) {
          log.info("0 results, trying broad search...");
          const broadRes = await fetch(searchUrl, {
            method: "POST",
            headers,
            body: JSON.stringify({ appliedFacets: {}, limit, offset: 0, searchText: "" }),
          });
          if (broadRes.ok) {
            const broadData = await broadRes.json();
            const allBroad = broadData.jobPostings || [];
            const ethiopiaFiltered = allBroad.filter(
              (j: any) =>
                (j.locationsText || "").toLowerCase().includes("ethiopia") ||
                (j.title || "").toLowerCase().includes("ethiopia")
            );
            // Return Ethiopia-specific if found, otherwise return all (original scraper behavior)
            postings = ethiopiaFiltered.length > 0 ? ethiopiaFiltered : allBroad;
            log.info(`Broad search: ${broadData.total} total, ${ethiopiaFiltered.length} Ethiopia-specific, returning ${postings.length}`);
          }
        }
      } else {
        log.warn(`API returned ${res.status}`);
      }
    } catch (err: any) {
      log.error(`API failed: ${err.message}`);
    }

    // Map postings to RawOpportunity
    const jobs: RawOpportunity[] = postings.map((job: any) => ({
      title: job.title || job.bulletFields?.[0] || "",
      organization: orgName,
      description: job.locationsText || "",
      deadline: null,
      published: job.postedOn || null,
      country: job.locationsText || "Unknown",
      city: null,
      source_url: job.externalPath
        ? `${baseUrl}/en-US/${siteId}${job.externalPath}`
        : baseUrl,
      source_domain: new URL(baseUrl).hostname,
      content_type: source.content_type,
      scraped_at: new Date().toISOString(),
      raw_fields: {
        externalPath: job.externalPath || null,
        bulletFields: job.bulletFields || [],
      },
    }));

    // Fetch detailed descriptions
    if (fetchDetails && jobs.length > 0) {
      log.info(`Fetching details for ${jobs.length} jobs...`);
      for (let i = 0; i < jobs.length; i++) {
        const job = jobs[i];
        const externalPath = job.raw_fields?.externalPath as string;
        if (!externalPath) continue;

        try {
          const detailUrl = `${baseUrl}/wday/cxs/${tenant}/${siteId}${externalPath}`;
          const res = await fetch(detailUrl, {
            headers: {
              Accept: "application/json",
              "User-Agent": headers["User-Agent"],
              Referer: `${baseUrl}/en-US/${siteId}${externalPath}`,
              Origin: baseUrl,
            },
          });

          if (res.ok) {
            const detail = await res.json();
            const posting = detail.jobPostingInfo || detail;

            const parts: string[] = [];
            if (posting.jobDescription) parts.push(stripHtml(posting.jobDescription));
            if (posting.responsibilities) parts.push(`Responsibilities: ${stripHtml(posting.responsibilities)}`);
            if (posting.qualifications) parts.push(`Qualifications: ${stripHtml(posting.qualifications)}`);
            if (posting.additionalInformation) parts.push(`Additional Information: ${stripHtml(posting.additionalInformation)}`);

            if (parts.length > 0) job.description = parts.join("\n\n");
            if (posting.endDate) job.deadline = posting.endDate;
            if (posting.location || posting.locationsText) {
              job.country = posting.location || posting.locationsText;
            }
            job.raw_fields = {
              ...job.raw_fields,
              work_type: posting.timeType || "",
              category: posting.jobCategory || "",
            };
          }
        } catch {
          // Silently skip failed detail fetches
        }

        // Polite delay
        await sleep(800);
      }
    }

    // Clean up internal fields
    for (const job of jobs) {
      if (job.raw_fields) {
        delete (job.raw_fields as any).externalPath;
        delete (job.raw_fields as any).bulletFields;
      }
    }

    log.info(`Done: ${jobs.length} jobs`);
    return jobs;
  }
}
