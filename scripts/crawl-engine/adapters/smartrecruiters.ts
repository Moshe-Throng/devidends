/**
 * SmartRecruiters Adapter — Public REST API
 *
 * API: api.smartrecruiters.com/v1/companies/{companyId}/postings
 * Well-documented, no auth needed.
 *
 * Used for: EDC, Beginnings Fund, etc.
 */

import type { CrawlAdapter, SourceConfig, RawOpportunity } from "../types";
import { stripHtml } from "../utils/http";
import { createLogger } from "../utils/logger";

interface SmartRecruitersConfig {
  companyId: string; // e.g. "EDC1"
  orgName: string;
  sourceDomain?: string;
  countryFilter?: string;
  limit?: number;
}

export class SmartRecruitersAdapter implements CrawlAdapter {
  name = "smartrecruiters";

  async crawl(source: SourceConfig): Promise<RawOpportunity[]> {
    const log = createLogger(source.id);
    const cfg = source.config as SmartRecruitersConfig;

    const limit = cfg.limit || 100;
    const params = new URLSearchParams({ limit: String(limit) });
    if (cfg.countryFilter) {
      params.set("q", cfg.countryFilter);
    }

    const apiUrl = `https://api.smartrecruiters.com/v1/companies/${cfg.companyId}/postings?${params}`;
    log.info(`Fetching from SmartRecruiters API (${cfg.companyId})...`);

    const res = await fetch(apiUrl, {
      headers: { Accept: "application/json" },
    });

    if (!res.ok) {
      throw new Error(`SmartRecruiters API error ${res.status}`);
    }

    const data = await res.json();
    const allJobs = data.content || [];
    log.info(`API returned ${allJobs.length} postings`);

    // Filter by country if specified
    const filtered = cfg.countryFilter
      ? allJobs.filter((job: any) => {
          const loc = (job.location?.city || "").toLowerCase() +
                      " " + (job.location?.country || "").toLowerCase() +
                      " " + (job.name || "").toLowerCase();
          return loc.includes(cfg.countryFilter!.toLowerCase());
        })
      : allJobs;

    log.info(`After filter: ${filtered.length} jobs`);

    return filtered.map((job: any): RawOpportunity => {
      const location = [job.location?.city, job.location?.country]
        .filter(Boolean)
        .join(", ");

      return {
        title: job.name || "",
        organization: cfg.orgName,
        description: job.jobAd?.sections?.jobDescription?.text
          ? stripHtml(job.jobAd.sections.jobDescription.text)
          : "",
        deadline: null,
        published: job.releasedDate || null,
        country: job.location?.country || cfg.countryFilter || "Unknown",
        city: job.location?.city || null,
        source_url: job.ref || `https://jobs.smartrecruiters.com/${cfg.companyId}/${job.id}`,
        source_domain: cfg.sourceDomain || "smartrecruiters.com",
        content_type: source.content_type,
        scraped_at: new Date().toISOString(),
        raw_fields: {
          department: job.department?.label || "",
          experience: job.experienceLevel?.name || "",
          work_type: job.typeOfEmployment?.name || "",
        },
      };
    });
  }
}
