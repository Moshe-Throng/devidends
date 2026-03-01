/**
 * Taleo Adapter — REST API + HTML fallback
 *
 * URL pattern: phg.tbe.taleo.net/phg01/ats/careers/v2/searchResults?...
 *
 * Used for: Vital Strategies, CARE, etc.
 */

import type { CrawlAdapter, SourceConfig, RawOpportunity } from "../types";
import { fetchWithRetry, stripHtml } from "../utils/http";
import { createLogger } from "../utils/logger";

interface TaleoConfig {
  baseUrl: string; // e.g. "https://phg.tbe.taleo.net/phg01/ats/careers/v2"
  orgCode: string; // Used in API calls
  orgName: string;
  sourceDomain?: string;
  searchText?: string;
}

export class TaleoAdapter implements CrawlAdapter {
  name = "taleo";

  async crawl(source: SourceConfig): Promise<RawOpportunity[]> {
    const cheerio = require("cheerio");
    const log = createLogger(source.id);
    const cfg = source.config as TaleoConfig;

    const searchText = cfg.searchText || "Ethiopia";

    // Try API endpoint first
    const apiUrl = `${cfg.baseUrl}/searchResults?org=${cfg.orgCode}&cws=37&keyword=${encodeURIComponent(searchText)}`;
    log.info(`Fetching ${apiUrl}...`);

    const res = await fetchWithRetry(apiUrl);
    if (!res.ok) {
      throw new Error(`Taleo HTTP ${res.status}`);
    }

    const html = await res.text();

    // Check if we got JSON
    if (html.trim().startsWith("{") || html.trim().startsWith("[")) {
      try {
        const data = JSON.parse(html);
        const items = data.requisitionList || data.results || [];
        log.info(`JSON API: ${items.length} results`);

        return items.map((item: any): RawOpportunity => ({
          title: item.title || item.jobTitle || "",
          organization: cfg.orgName,
          description: item.description ? stripHtml(item.description) : "",
          deadline: item.closeDate || null,
          published: item.postingDate || null,
          country: item.location || searchText,
          city: null,
          source_url: item.applyUrl || item.detailUrl || cfg.baseUrl,
          source_domain: cfg.sourceDomain || new URL(cfg.baseUrl).hostname,
          content_type: source.content_type,
          scraped_at: new Date().toISOString(),
        }));
      } catch {
        log.warn("JSON parse failed, treating as HTML");
      }
    }

    // HTML parsing
    const $ = cheerio.load(html);
    const jobs: RawOpportunity[] = [];
    const seen = new Set<string>();

    // Taleo uses accordion-style layout with oracletaleocwsv2-* classes
    $(
      ".oracletaleocwsv2-accordion, .oracletaleocwsv2-requisition-list-row, " +
      ".requisition, tr[data-job-id]"
    ).each((_: number, el: any) => {
      const $el = $(el);

      // Title from .viewJobLink or first anchor with viewRequisition href
      const $link = $el.find("a.viewJobLink, a[href*='viewRequisition']").first();
      const title = $link.text().trim() ||
        $el.find(".oracletaleocwsv2-head-title, .title, .job-title").first().text().trim();
      let href = $link.attr("href") || "";

      if (!title || title.length < 5 || title.length > 250) return;
      if (/^(home|about|contact|search|login|back|toggle|share|view|apply)/i.test(title)) return;

      if (href && !href.startsWith("http")) {
        const base = new URL(cfg.baseUrl);
        href = `${base.origin}${href.startsWith("/") ? "" : "/"}${href}`;
      }

      // Dedup by URL within this page
      const key = href || title;
      if (seen.has(key)) return;
      seen.add(key);

      // Location from sibling divs
      const headInfo = $el.find(".oracletaleocwsv2-accordion-head-info");
      const locationText = headInfo.find("div[tabindex]").first().text().trim();

      jobs.push({
        title,
        organization: cfg.orgName,
        description: "",
        deadline: null,
        published: null,
        country: locationText || searchText,
        city: null,
        source_url: href || cfg.baseUrl,
        source_domain: cfg.sourceDomain || new URL(cfg.baseUrl).hostname,
        content_type: source.content_type,
        scraped_at: new Date().toISOString(),
      });
    });

    log.info(`Done: ${jobs.length} jobs`);
    return jobs;
  }
}
