/**
 * Greenhouse Adapter — Public JSON API
 *
 * API: boards-api.greenhouse.io/v1/boards/{boardToken}/jobs
 * Clean, well-documented, no auth needed.
 *
 * Used for: Girl Effect, and any org with a Greenhouse job board.
 */

import type { CrawlAdapter, SourceConfig, RawOpportunity } from "../types";
import { stripHtml } from "../utils/http";
import { createLogger } from "../utils/logger";

interface GreenhouseConfig {
  boardToken: string; // e.g. "girleffect"
  orgName: string;
  sourceDomain?: string;
  countryFilter?: string; // e.g. "Ethiopia" — filter by location text
}

export class GreenhouseAdapter implements CrawlAdapter {
  name = "greenhouse";

  async crawl(source: SourceConfig): Promise<RawOpportunity[]> {
    const log = createLogger(source.id);
    const cfg = source.config as GreenhouseConfig;

    const apiUrl = `https://boards-api.greenhouse.io/v1/boards/${cfg.boardToken}/jobs?content=true`;
    log.info(`Fetching from Greenhouse API (${cfg.boardToken})...`);

    const res = await fetch(apiUrl);
    if (!res.ok) {
      throw new Error(`Greenhouse API error ${res.status}`);
    }

    const data = await res.json();
    const allJobs = data.jobs || [];
    log.info(`API returned ${allJobs.length} jobs`);

    // Filter by country if specified
    const filtered = cfg.countryFilter
      ? allJobs.filter((job: any) => {
          const loc = (job.location?.name || "").toLowerCase();
          return loc.includes(cfg.countryFilter!.toLowerCase()) ||
                 loc.includes("remote") ||
                 loc.includes("global");
        })
      : allJobs;

    log.info(`After filter: ${filtered.length} jobs`);

    return filtered.map((job: any): RawOpportunity => {
      const description = job.content ? stripHtml(job.content) : "";
      const location = job.location?.name || "";

      return {
        title: job.title || "",
        organization: cfg.orgName,
        description,
        deadline: null, // Greenhouse doesn't expose deadlines
        published: job.updated_at || job.created_at || null,
        country: location || "Unknown",
        city: null,
        source_url: job.absolute_url || `https://boards.greenhouse.io/${cfg.boardToken}/jobs/${job.id}`,
        source_domain: cfg.sourceDomain || "greenhouse.io",
        content_type: source.content_type,
        scraped_at: new Date().toISOString(),
        raw_fields: {
          departments: (job.departments || []).map((d: any) => d.name).join(", "),
        },
      };
    });
  }
}
