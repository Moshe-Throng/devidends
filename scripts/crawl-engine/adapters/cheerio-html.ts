/**
 * Cheerio HTML Adapter — Generic server-rendered HTML scraper
 *
 * Configurable via selectors. Used for:
 *   - DRC (Danish Refugee Council): drc.ngo/jobs/
 *   - Kifiya: kifiya.com/careers
 *   - Any org with server-rendered job listings
 */

import type { CrawlAdapter, SourceConfig, RawOpportunity } from "../types";
import { fetchWithRetry, stripHtml, sleep } from "../utils/http";
import { createLogger } from "../utils/logger";

interface CheerioConfig {
  url: string;
  orgName: string;
  sourceDomain: string;
  // CSS selectors for job listing
  jobSelector: string; // e.g. ".job-item"
  titleSelector: string; // e.g. ".job-title"
  linkSelector: string; // e.g. "a[href]"
  deadlineSelector?: string;
  publishedSelector?: string;
  // Country extraction
  countrySelector?: string; // CSS selector for country text within the job element
  countryFromTitle?: boolean; // Fallback: extract country from title text
  defaultCountry?: string;
  // Detail page config
  fetchDetails?: boolean;
  detailSelector?: string; // CSS selector for description on detail page
  detailDelay?: number; // Delay between detail requests (ms)
  maxDetails?: number; // Max detail pages to fetch
  // POST request support (for forms like UNDP procurement that require POST)
  method?: "GET" | "POST";
  postBody?: string; // URL-encoded form body
  postContentType?: string; // defaults to "application/x-www-form-urlencoded"
}

const COUNTRY_PATTERNS: [RegExp, string][] = [
  [/ethiopia/i, "Ethiopia"],
  [/kenya/i, "Kenya"],
  [/somalia/i, "Somalia"],
  [/south sudan/i, "South Sudan"],
  [/sudan/i, "Sudan"],
  [/uganda/i, "Uganda"],
  [/tanzania/i, "Tanzania"],
  [/nigeria/i, "Nigeria"],
  [/cameroon/i, "Cameroon"],
  [/drc|congo/i, "DRC (Congo)"],
  [/mali/i, "Mali"],
  [/niger\b/i, "Niger"],
  [/burkina/i, "Burkina Faso"],
  [/ukraine/i, "Ukraine"],
  [/syria/i, "Syria"],
  [/iraq/i, "Iraq"],
  [/yemen/i, "Yemen"],
  [/bangladesh/i, "Bangladesh"],
  [/afghanistan/i, "Afghanistan"],
  [/global/i, "Global"],
];

function detectCountry(text: string, fallback: string): string {
  for (const [pattern, name] of COUNTRY_PATTERNS) {
    if (pattern.test(text)) return name;
  }
  return fallback;
}

export class CheerioHtmlAdapter implements CrawlAdapter {
  name = "cheerio-html";

  async crawl(source: SourceConfig): Promise<RawOpportunity[]> {
    const cheerio = require("cheerio");
    const log = createLogger(source.id);
    const cfg = source.config as CheerioConfig;

    log.info(`Fetching ${cfg.url}...`);

    const fetchInit: RequestInit = {};
    if (cfg.method === "POST" && cfg.postBody) {
      const now = new Date();
      const year = now.getFullYear();
      // Support dynamic date placeholders in postBody:
      //   {YEAR_START} → YYYY-01-01, {YEAR_END} → YYYY-12-31
      const body = cfg.postBody
        .replace(/\{YEAR_START\}/g, `${year}-01-01`)
        .replace(/\{YEAR_END\}/g, `${year}-12-31`);
      fetchInit.method = "POST";
      fetchInit.body = body;
      fetchInit.headers = {
        "Content-Type": cfg.postContentType || "application/x-www-form-urlencoded",
      };
      log.info(`Using POST with body: ${body.substring(0, 120)}...`);
    }

    const res = await fetchWithRetry(cfg.url, fetchInit);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} from ${cfg.url}`);
    }

    const html = await res.text();
    const $ = cheerio.load(html);
    log.info(`Page fetched (${(html.length / 1024).toFixed(0)} KB)`);

    const jobs: RawOpportunity[] = [];

    $(cfg.jobSelector).each((_: number, el: any) => {
      const $el = $(el);

      let title = $el.find(cfg.titleSelector).text().trim();
      if (!title) title = $el.find("a").first().text().trim();
      if (!title || title.length < 5) return;

      // Extract link
      let link = "";
      const $anchor = $el.find(cfg.linkSelector).first();
      if ($anchor.length) {
        link = $anchor.attr("href") || "";
      } else if ($el.is("a")) {
        link = $el.attr("href") || "";
      }
      if (link && !link.startsWith("http")) {
        const urlObj = new URL(cfg.url);
        link = `${urlObj.origin}${link.startsWith("/") ? "" : "/"}${link}`;
      }

      // Extract dates
      const deadline = cfg.deadlineSelector
        ? $el.find(cfg.deadlineSelector).text().trim() || $el.attr("data-deadline") || null
        : $el.attr("data-deadline") || null;
      const published = cfg.publishedSelector
        ? $el.find(cfg.publishedSelector).text().trim() || $el.attr("data-published") || null
        : $el.attr("data-published") || null;

      // Determine country — in this order:
      //  1. Explicit CSS selector (most reliable when available, e.g. DRC)
      //  2. Detect from title (e.g. "M&E Officer, Kenya")
      //  3. Default from config
      let country: string = cfg.defaultCountry || "Unknown";
      if (cfg.countrySelector) {
        const rawCountry = $el.find(cfg.countrySelector).text().trim();
        if (rawCountry) country = rawCountry;
        else if (cfg.countryFromTitle) country = detectCountry(title, country);
      } else if (cfg.countryFromTitle) {
        country = detectCountry(title, country);
      }

      jobs.push({
        title: title.replace(/\s+/g, " ").slice(0, 300),
        organization: cfg.orgName,
        description: "",
        deadline,
        published,
        country,
        city: null,
        source_url: link || cfg.url,
        source_domain: cfg.sourceDomain,
        content_type: source.content_type,
        scraped_at: new Date().toISOString(),
        raw_fields: {
          region: $el.attr("data-region") || "",
          category: $el.attr("data-category") || "",
          contract_type: $el.attr("data-contract") || "",
        },
      });
    });

    log.info(`Found ${jobs.length} listings`);

    // Optionally fetch detail pages for descriptions
    if (cfg.fetchDetails && cfg.detailSelector && jobs.length > 0) {
      const maxDetails = cfg.maxDetails || jobs.length;
      const detailDelay = cfg.detailDelay || 1200;

      log.info(`Fetching details for up to ${maxDetails} jobs...`);
      for (let i = 0; i < Math.min(jobs.length, maxDetails); i++) {
        const job = jobs[i];
        if (!job.source_url || job.source_url === cfg.url) continue;

        try {
          const detailRes = await fetchWithRetry(job.source_url);
          if (detailRes.ok) {
            const detailHtml = await detailRes.text();
            const $detail = cheerio.load(detailHtml);
            const desc = $detail(cfg.detailSelector).text().trim();
            if (desc && desc.length > 50) {
              job.description = desc.slice(0, 5000);
            }
          }
        } catch {
          // Skip failed detail pages
        }

        if (i < Math.min(jobs.length, maxDetails) - 1) {
          await sleep(detailDelay);
        }
      }
    }

    return jobs;
  }
}
