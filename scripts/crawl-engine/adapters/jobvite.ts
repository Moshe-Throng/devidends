/**
 * Jobvite Adapter — HTML scraping with Cheerio
 *
 * URL pattern: jobs.jobvite.com/{company}/search?q={searchText}
 *
 * Used for: Heifer International, Mercy Corps, etc.
 */

import type { CrawlAdapter, SourceConfig, RawOpportunity } from "../types";
import { fetchWithRetry, stripHtml } from "../utils/http";
import { createLogger } from "../utils/logger";

interface JobviteConfig {
  companySlug: string; // e.g. "heaborheiferinternational"
  orgName: string;
  sourceDomain?: string;
  searchText?: string; // e.g. "Ethiopia"
}

export class JobviteAdapter implements CrawlAdapter {
  name = "jobvite";

  async crawl(source: SourceConfig): Promise<RawOpportunity[]> {
    const cheerio = require("cheerio");
    const log = createLogger(source.id);
    const cfg = source.config as JobviteConfig;

    const searchText = cfg.searchText || "Ethiopia";
    const url = `https://jobs.jobvite.com/${cfg.companySlug}/search?q=${encodeURIComponent(searchText)}`;
    log.info(`Fetching ${url}...`);

    const res = await fetchWithRetry(url);
    if (!res.ok) {
      throw new Error(`Jobvite HTTP ${res.status}`);
    }

    const html = await res.text();
    const $ = cheerio.load(html);
    log.info(`Page fetched (${(html.length / 1024).toFixed(0)} KB)`);

    const jobs: RawOpportunity[] = [];

    // Jobvite uses .jv-job-list with job cards
    $(".jv-job-list .jv-job-item, table.jv-job-list tr, .job-listing, .job-item").each(
      (_: number, el: any) => {
        const $el = $(el);
        const titleEl = $el.find("a.jv-job-link, a[href*='/job/'], .jv-header a, td:first-child a").first();
        const title = titleEl.text().trim();
        let href = titleEl.attr("href") || "";

        if (!title || title.length < 5) return;
        if (!href.startsWith("http")) {
          href = `https://jobs.jobvite.com${href.startsWith("/") ? "" : "/"}${href}`;
        }

        const location = $el.find(".jv-job-detail-location, .location, td:nth-child(2)").text().trim();
        const department = $el.find(".jv-job-detail-department, .department, td:nth-child(3)").text().trim();

        jobs.push({
          title,
          organization: cfg.orgName,
          description: "",
          deadline: null,
          published: null,
          country: location || "Unknown",
          city: null,
          source_url: href,
          source_domain: cfg.sourceDomain || "jobvite.com",
          content_type: source.content_type,
          scraped_at: new Date().toISOString(),
          raw_fields: {
            location,
            department,
          },
        });
      }
    );

    // Fallback: look for any job links
    if (jobs.length === 0) {
      log.info("Primary selectors found nothing, trying fallback...");
      $('a[href*="/job/"]').each((_: number, el: any) => {
        const title = $(el).text().trim();
        let href = $(el).attr("href") || "";
        if (!title || title.length < 5 || title.length > 200) return;
        if (/^(home|about|contact|menu|search|login|back)/i.test(title)) return;

        if (!href.startsWith("http")) {
          href = `https://jobs.jobvite.com${href}`;
        }

        jobs.push({
          title,
          organization: cfg.orgName,
          description: "",
          deadline: null,
          published: null,
          country: "Unknown",
          city: null,
          source_url: href,
          source_domain: cfg.sourceDomain || "jobvite.com",
          content_type: source.content_type,
          scraped_at: new Date().toISOString(),
        });
      });
    }

    log.info(`Done: ${jobs.length} jobs`);
    return jobs;
  }
}
