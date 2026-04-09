/**
 * DevEx Local Adapter — reads from pre-scraped JSON file.
 *
 * DevEx requires Playwright + authentication, so the scraping happens locally
 * via `python tools/devex_scraper.py` and outputs to .tmp/devex_jobs.json.
 *
 * This adapter reads that file and normalizes it for the crawl engine.
 * The file gets committed to git and picked up by VPS publish.
 *
 * Config in sources.json:
 *   { "id": "devex", "adapter": "devex-local", "config": { "jsonPath": ".tmp/devex_jobs.json" } }
 */

import type { CrawlAdapter, SourceConfig, RawOpportunity } from "../types";
import { createLogger } from "../utils/logger";
import fs from "fs";
import path from "path";

interface DevexLocalConfig {
  jsonPath: string; // relative to project root
  orgName?: string;
}

export class DevexLocalAdapter implements CrawlAdapter {
  name = "devex-local";

  async crawl(source: SourceConfig): Promise<RawOpportunity[]> {
    const log = createLogger(source.id);
    const cfg = source.config as DevexLocalConfig;

    // Resolve path relative to project root
    const jsonPath = path.resolve(process.cwd(), cfg.jsonPath);

    if (!fs.existsSync(jsonPath)) {
      log.info(`DevEx JSON not found at ${jsonPath} — run 'python tools/devex_scraper.py' first`);
      return [];
    }

    const stat = fs.statSync(jsonPath);
    const ageHours = (Date.now() - stat.mtimeMs) / (1000 * 60 * 60);

    if (ageHours > 48) {
      log.info(`DevEx JSON is ${Math.round(ageHours)}h old — consider re-running scraper`);
    }

    const raw = JSON.parse(fs.readFileSync(jsonPath, "utf-8")) as any[];
    log.info(`Loaded ${raw.length} items from ${cfg.jsonPath}`);

    // Filter out expired jobs
    const now = new Date();
    const jobs: RawOpportunity[] = [];

    for (const item of raw) {
      // Skip if deadline is in the past
      if (item.deadline) {
        const dl = new Date(item.deadline);
        if (dl < now && !isNaN(dl.getTime())) continue;
      }

      // Skip if URL points to a source we already scrape directly
      const url = item.url || item.application_link || "";
      const skipDomains = [
        "unjobs.org", "reliefweb.int", "careers.un.org",
        "jobs.unicef.org", "fhi.wd1.myworkdayjobs.com",
        "unhcr.wd3.myworkdayjobs.com", "jobs.unops.org",
      ];
      if (skipDomains.some(d => url.includes(d))) continue;

      // Detect country from location text
      let country = "Ethiopia";
      const loc = (item.location || "").toLowerCase();
      if (loc.includes("kenya")) country = "Kenya";
      else if (loc.includes("uganda")) country = "Uganda";
      else if (loc.includes("tanzania")) country = "Tanzania";
      else if (loc.includes("somalia")) country = "Somalia";

      jobs.push({
        title: item.title || "",
        organization: item.company || item.org || cfg.orgName || "Various (DevEx)",
        description: (item.description || "").slice(0, 8000),
        deadline: item.deadline || null,
        published: item.published_date || null,
        country,
        city: null,
        source_url: url || `https://www.devex.com/jobs`,
        source_domain: "devex.com",
        content_type: item.content_type || "job",
        scraped_at: new Date().toISOString(),
      });
    }

    log.info(`After filtering: ${jobs.length} active, non-duplicate jobs`);
    return jobs;
  }
}
