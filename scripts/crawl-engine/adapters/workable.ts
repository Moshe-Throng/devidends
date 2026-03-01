/**
 * Workable Adapter — JSON API or HTML scraping
 *
 * URL pattern: apply.workable.com/{company}/
 * API: apply.workable.com/api/v3/accounts/{company}/jobs
 *
 * Used for: Humanity & Inclusion, Inkomoko, etc.
 */

import type { CrawlAdapter, SourceConfig, RawOpportunity } from "../types";
import { fetchWithRetry, stripHtml } from "../utils/http";
import { createLogger } from "../utils/logger";

interface WorkableConfig {
  companySlug: string; // e.g. "humanity-and-inclusion"
  orgName: string;
  sourceDomain?: string;
  countryFilter?: string;
}

export class WorkableAdapter implements CrawlAdapter {
  name = "workable";

  async crawl(source: SourceConfig): Promise<RawOpportunity[]> {
    const log = createLogger(source.id);
    const cfg = source.config as WorkableConfig;

    // Try JSON API first
    const apiUrl = `https://apply.workable.com/api/v3/accounts/${cfg.companySlug}/jobs`;
    log.info(`Trying Workable API (${cfg.companySlug})...`);

    try {
      const res = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          query: cfg.countryFilter || "",
          location: [],
          department: [],
          worktype: [],
          remote: [],
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const allJobs = data.results || [];
        log.info(`API returned ${allJobs.length} jobs`);

        // Filter by country if specified
        const filtered = cfg.countryFilter
          ? allJobs.filter((job: any) => {
              const loc = (job.location?.city || "").toLowerCase() +
                          " " + (job.location?.country || "").toLowerCase() +
                          " " + (job.title || "").toLowerCase();
              return loc.includes(cfg.countryFilter!.toLowerCase());
            })
          : allJobs;

        return filtered.map((job: any): RawOpportunity => ({
          title: job.title || "",
          organization: cfg.orgName,
          description: job.description ? stripHtml(job.description) : "",
          deadline: null,
          published: job.published || null,
          country: job.location?.country || cfg.countryFilter || "Unknown",
          city: job.location?.city || null,
          source_url: job.url || `https://apply.workable.com/${cfg.companySlug}/j/${job.shortcode}/`,
          source_domain: cfg.sourceDomain || "workable.com",
          content_type: source.content_type,
          scraped_at: new Date().toISOString(),
          raw_fields: {
            department: job.department || "",
            work_type: job.employment_type || "",
          },
        }));
      }

      log.warn(`API returned ${res.status}, trying HTML fallback...`);
    } catch (err: any) {
      log.warn(`API failed: ${err.message}, trying HTML fallback...`);
    }

    // HTML fallback
    const cheerio = require("cheerio");
    const pageUrl = `https://apply.workable.com/${cfg.companySlug}/`;
    const res = await fetchWithRetry(pageUrl);
    if (!res.ok) {
      throw new Error(`Workable HTML HTTP ${res.status}`);
    }

    const html = await res.text();
    const $ = cheerio.load(html);
    const jobs: RawOpportunity[] = [];

    $('a[href*="/j/"], [data-ui="job"]').each((_: number, el: any) => {
      const title = $(el).text().trim();
      let href = $(el).attr("href") || "";
      if (!title || title.length < 5) return;

      if (!href.startsWith("http")) {
        href = `https://apply.workable.com${href}`;
      }

      jobs.push({
        title,
        organization: cfg.orgName,
        description: "",
        deadline: null,
        published: null,
        country: cfg.countryFilter || "Unknown",
        city: null,
        source_url: href,
        source_domain: cfg.sourceDomain || "workable.com",
        content_type: source.content_type,
        scraped_at: new Date().toISOString(),
      });
    });

    log.info(`HTML fallback: ${jobs.length} jobs`);
    return jobs;
  }
}
