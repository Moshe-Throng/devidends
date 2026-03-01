/**
 * iCIMS Adapter — HTML scraping
 *
 * URL pattern: {baseUrl}/jobs/search?ss=1&searchKeyword={searchText}
 *
 * Used for: SOS Children's Villages, etc.
 */

import type { CrawlAdapter, SourceConfig, RawOpportunity } from "../types";
import { fetchWithRetry, sleep } from "../utils/http";
import { createLogger } from "../utils/logger";

interface IcimsConfig {
  baseUrl: string; // e.g. "https://careers-sos-kd.icims.com"
  orgName: string;
  sourceDomain?: string;
  searchText?: string;
  locale?: string;
}

export class IcimsAdapter implements CrawlAdapter {
  name = "icims";

  async crawl(source: SourceConfig): Promise<RawOpportunity[]> {
    const cheerio = require("cheerio");
    const log = createLogger(source.id);
    const cfg = source.config as IcimsConfig;

    const searchText = cfg.searchText || "Ethiopia";
    const locale = cfg.locale || "en";
    const url = `${cfg.baseUrl}/jobs/search?ss=1&searchKeyword=${encodeURIComponent(searchText)}&searchCategory=&in_iframe=1`;
    log.info(`Fetching ${url}...`);

    const res = await fetchWithRetry(url);
    if (!res.ok) {
      throw new Error(`iCIMS HTTP ${res.status}`);
    }

    const html = await res.text();
    const $ = cheerio.load(html);
    log.info(`Page fetched (${(html.length / 1024).toFixed(0)} KB)`);

    const jobs: RawOpportunity[] = [];

    // iCIMS uses .iCIMS_JobsTable or various container patterns
    $(
      ".iCIMS_JobsTable .row, .iCIMS_MainWrapper .row, .iCIMS_Anchor, " +
      'a[href*="/jobs/"], .listContent .title a, .iCIMS_JobPage_Job'
    ).each((_: number, el: any) => {
      const $el = $(el);

      // Try to find title
      let title = "";
      let href = "";

      if ($el.is("a")) {
        title = $el.text().trim();
        href = $el.attr("href") || "";
      } else {
        const $link = $el.find("a").first();
        title = $link.text().trim() || $el.find(".title, .iCIMS_JobTitle, h2, h3").text().trim();
        href = $link.attr("href") || "";
      }

      if (!title || title.length < 5 || title.length > 250) return;
      if (/^(home|about|contact|menu|search|login|back|sign in)/i.test(title)) return;

      if (href && !href.startsWith("http")) {
        href = `${cfg.baseUrl}${href.startsWith("/") ? "" : "/"}${href}`;
      }

      // Extract location
      const location = $el.find(".iCIMS_JobLocation, .location").text().trim();

      jobs.push({
        title,
        organization: cfg.orgName,
        description: "",
        deadline: null,
        published: null,
        country: location || "Unknown",
        city: null,
        source_url: href || url,
        source_domain: cfg.sourceDomain || new URL(cfg.baseUrl).hostname,
        content_type: source.content_type,
        scraped_at: new Date().toISOString(),
        raw_fields: { location },
      });
    });

    // Dedup by URL
    const seen = new Set<string>();
    const unique = jobs.filter((j) => {
      if (seen.has(j.source_url)) return false;
      seen.add(j.source_url);
      return true;
    });

    log.info(`Done: ${unique.length} jobs (${jobs.length} before dedup)`);
    return unique;
  }
}
