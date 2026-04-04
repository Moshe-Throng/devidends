/**
 * TED (Tenders Electronic Daily) Adapter — EU Public Procurement
 * Source: ted.europa.eu API v3
 * Free access, no authentication required
 */

import type { CrawlAdapter, SourceConfig, RawOpportunity } from "../types";
import { createLogger } from "../utils/logger";

// TED API v3 — POST-only search endpoint (no auth required)
const SEARCH_URL = "https://api.ted.europa.eu/v3/notices/search";

interface TedConfig {
  keywords?: string[];
  pageSize?: number;
  daysBack?: number;
}

interface TedNotice {
  ND?: string;       // Notice document number
  TI?: string;       // Title
  CY?: string;       // Country of buyer
  OJ?: string;       // Official Journal reference
  PD?: string;       // Publication date
  DT?: string;       // Deadline date
  TY?: string;       // Type (Contract notice, Prior information, etc.)
  AC?: string;       // Award criteria / procedure type
  RC?: string;       // Region code
  OL?: string;       // Original language
  AU?: string;       // Authority (buyer)
  IA?: string;       // Internet address / link
  TVL?: string;      // Total value
  NC?: string;       // Nature of contract
  // v3 may also use these field names
  title?: string;
  buyer?: string;
  publicationDate?: string;
  deadline?: string;
  noticeType?: string;
  documentNumber?: string;
  estimatedValue?: string | number;
  link?: string;
  country?: string;
}

/**
 * Determine pipeline stage and signal type from TED notice type.
 */
function classifyNotice(noticeType: string | undefined): {
  pipeline_stage: string;
  signal_type: string;
  signal_confidence: string;
} {
  const ty = (noticeType || "").toLowerCase();
  if (ty.includes("prior information") || ty.includes("pre-information")) {
    return {
      pipeline_stage: "forecast",
      signal_type: "iati_planned",
      signal_confidence: "medium",
    };
  }
  // Contract notice, contract award, etc.
  return {
    pipeline_stage: "published",
    signal_type: "tender_published",
    signal_confidence: "high",
  };
}

/**
 * Build a TED notice URL from the notice document number.
 */
function buildNoticeUrl(nd: string | undefined, ia: string | undefined): string {
  if (ia) return ia;
  if (nd) {
    // ND format: "2026/S 050-123456" → extract numeric part
    const match = nd.match(/(\d{4})-?(\d+)/);
    if (match) return `https://ted.europa.eu/en/notice/-/detail/${match[1]}-${match[2]}`;
    // Fallback: URL-encode the full ND
    return `https://ted.europa.eu/en/notice/-/detail/${encodeURIComponent(nd)}`;
  }
  return "https://ted.europa.eu";
}

/**
 * Safely extract a string field from a notice, trying multiple possible field names.
 */
function pick(notice: TedNotice, ...keys: (keyof TedNotice)[]): string {
  for (const k of keys) {
    const v = notice[k];
    if (v != null && v !== "") return String(v);
  }
  return "";
}

export class TedAdapter implements CrawlAdapter {
  name = "ted";

  async crawl(source: SourceConfig): Promise<RawOpportunity[]> {
    const log = createLogger(source.id);
    const cfg = source.config as TedConfig;

    const keywords = cfg.keywords || ["Ethiopia"];
    const pageSize = cfg.pageSize || 50;
    const daysBack = cfg.daysBack || 60;

    const seen = new Map<string, RawOpportunity>();

    for (const keyword of keywords) {
      log.info(`Searching TED for "${keyword}"...`);

      try {
        const results = await this.fetchNotices(keyword, pageSize, daysBack, log);
        log.info(`  "${keyword}": ${results.length} notices returned`);

        for (const notice of results) {
          const noticeId = pick(notice, "ND", "documentNumber") || null;
          const dedupeKey = noticeId || pick(notice, "TI", "title") || JSON.stringify(notice);
          if (seen.has(dedupeKey)) continue;

          const noticeType = pick(notice, "TY", "noticeType");
          const classification = classifyNotice(noticeType);
          const title = pick(notice, "TI", "title");
          const organization = pick(notice, "AU", "buyer") || "European Union";
          const deadline = pick(notice, "DT", "deadline") || null;
          const published = pick(notice, "PD", "publicationDate") || null;
          const sourceUrl = buildNoticeUrl(
            pick(notice, "ND", "documentNumber") || undefined,
            pick(notice, "IA", "link") || undefined,
          );
          const totalValue = pick(notice, "TVL", "estimatedValue") || null;

          const opp: RawOpportunity = {
            title: title || "Untitled",
            organization,
            description: [
              title,
              noticeType ? `Type: ${noticeType}` : "",
              notice.AC ? `Procedure: ${notice.AC}` : "",
              notice.NC ? `Nature: ${notice.NC}` : "",
              totalValue ? `Estimated Value: ${totalValue}` : "",
            ].filter(Boolean).join("\n"),
            deadline,
            published,
            country: "Ethiopia",
            city: null,
            source_url: sourceUrl,
            source_domain: "ted.europa.eu",
            content_type: source.content_type,
            scraped_at: new Date().toISOString(),
            raw_fields: {
              donor_ref: noticeId,
              pipeline_stage: classification.pipeline_stage,
              signal_type: classification.signal_type,
              signal_confidence: classification.signal_confidence,
              budget_min: totalValue ? parseFloat(totalValue) || null : null,
              budget_max: totalValue ? parseFloat(totalValue) || null : null,
              notice_type: noticeType || null,
              procedure_type: notice.AC || null,
              buyer_country: pick(notice, "CY", "country") || null,
              region_code: notice.RC || null,
              contract_nature: notice.NC || null,
              original_language: notice.OL || null,
            },
          };

          seen.set(dedupeKey, opp);
        }
      } catch (err) {
        log.error(`Failed to fetch keyword "${keyword}":`, err);
        continue;
      }
    }

    // Post-fetch filter: reject notices where ALL dates are before 2025
    const cutoffYear = new Date().getFullYear() - 1; // e.g. 2025
    const cutoffDate = `${cutoffYear}-01-01`;
    const filtered = Array.from(seen.values()).filter((opp) => {
      const dates = [opp.published, opp.deadline].filter(Boolean) as string[];
      if (dates.length === 0) return true; // keep if no dates (can't tell if stale)
      // Keep if ANY date is >= cutoff
      return dates.some((d) => d >= cutoffDate);
    });

    log.info(`Total: ${filtered.length} unique notices from TED (${seen.size - filtered.length} stale filtered out)`);
    return filtered;
  }

  /**
   * Convert keyword to TED expert query syntax.
   * TED v3 uses eForms field-based queries, not free text.
   */
  private buildExpertQuery(keyword: string): string {
    // Map common country names to ISO 3166-1 alpha-3 codes for BT-5141-Lot
    const COUNTRY_CODES: Record<string, string> = {
      ethiopia: "ETH",
      kenya: "KEN",
      rwanda: "RWA",
      tanzania: "TZA",
      uganda: "UGA",
      mozambique: "MOZ",
      "south africa": "ZAF",
    };

    // Build date cutoff: only notices from the last N months
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - 6);
    const cutoffStr = cutoff.toISOString().split("T")[0]; // YYYY-MM-DD

    const lower = keyword.toLowerCase();
    const code = COUNTRY_CODES[lower];
    const countryClause = code
      ? `BT-5141-Lot = ${code}`
      : `BT-5141-Lot = ${keyword}`;

    // Add date filter to reject stale 2023/2024 notices
    return `${countryClause} AND BT-05(a)-Procedure >= ${cutoffStr}`;
  }

  /**
   * Fetch notices from TED API v3 (POST-only search endpoint).
   * Uses expert query syntax with eForms field names.
   */
  private async fetchNotices(
    query: string,
    _pageSize: number,
    _daysBack: number,
    log: ReturnType<typeof createLogger>,
  ): Promise<TedNotice[]> {
    const expertQuery = this.buildExpertQuery(query);
    log.info(`Expert query: ${expertQuery}`);

    const requestedFields = [
      "BT-21-Procedure",       // Title
      "BT-01-notice",          // Legal basis
      "BT-5141-Lot",           // Place of performance country
      "deadline-receipt-tender-date-lot",
      "organisation-country-buyer",
      "description-glo",
    ];

    try {
      const res = await fetch(SEARCH_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          query: expertQuery,
          fields: requestedFields,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const totalCount = data.totalNoticeCount || 0;
        log.info(`TED returned ${totalCount} total notices`);

        const notices = data.notices || [];
        if (Array.isArray(notices)) {
          // Transform TED v3 eForms response to our TedNotice interface
          return notices.map((n: any) => {
            // Extract title from BT-21 (multilingual object)
            const titleObj = n["BT-21-Procedure"] || {};
            const title = typeof titleObj === "string" ? titleObj :
              titleObj.eng || titleObj.fra || Object.values(titleObj)[0] || "";

            return {
              ND: n["publication-number"],
              TI: String(title).slice(0, 500),
              AU: "", // buyer not in this response
              PD: null,
              DT: n["deadline-receipt-tender-date-lot"] || null,
              TY: "Contract notice", // default since we're searching active notices
              IA: n.links?.html?.ENG || null,
              RC: n["BT-5141-Lot"] || null,
              CY: n["organisation-country-buyer"] || null,
            } as TedNotice;
          });
        }
        return [];
      }

      const errBody = await res.text().catch(() => "");
      log.warn(`TED POST returned ${res.status}: ${errBody.slice(0, 200)}`);
    } catch (err) {
      log.warn("TED POST failed:", err);
    }

    log.error("TED API failed — returning empty results");
    return [];
  }
}
