/**
 * SAM.gov Adapter — Federal Opportunities API v2
 * Source: api.sam.gov/opportunities/v2/search
 * Requires free API key from sam.gov
 */

import type { CrawlAdapter, SourceConfig, RawOpportunity } from "../types";
import { createLogger } from "../utils/logger";

const BASE_URL = "https://api.sam.gov/opportunities/v2/search";

interface SamGovConfig {
  apiKey?: string;
  keywords?: string[];
  limit?: number;
  daysBack?: number;
}

interface SamOpportunity {
  noticeId: string;
  title: string;
  solicitationNumber: string;
  fullParentPathName: string;
  postedDate: string;
  responseDeadLine: string | null;
  type: string;
  baseType: string;
  archiveType: string;
  archiveDate: string | null;
  setAside: string | null;
  setAsideDescription: string | null;
  naicsCode: string;
  classificationCode: string;
  description: string;
  organizationType: string;
  uiLink: string;
  additionalInfoLink: string | null;
  resourceLinks: string[];
}

/**
 * Parse SAM.gov deadline format "MM/DD/YYYY HH:MM AM/PM" to ISO date string.
 */
function parseDeadline(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    // Handle "04/15/2026 02:00 PM" format
    const match = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    if (match) {
      const [, month, day, year] = match;
      return `${year}-${month}-${day}`;
    }
    // Fallback: try direct Date parse
    const d = new Date(raw);
    if (!isNaN(d.getTime())) return d.toISOString().split("T")[0];
    return null;
  } catch {
    return null;
  }
}

/**
 * Extract meaningful organization name from fullParentPathName.
 * Input:  "AGENCY FOR INTERNATIONAL DEVELOPMENT.USAID/ETHIOPIA"
 * Output: "USAID/ETHIOPIA"
 */
function cleanOrganization(raw: string | null | undefined): string {
  if (!raw) return "U.S. Federal Government";
  const parts = raw.split(".");
  // Take the last meaningful segment
  const last = parts[parts.length - 1]?.trim();
  return last || raw.trim();
}

/**
 * Format a date N days ago as YYYY-MM-DD for the postedFrom param.
 */
/** Format date as MM/dd/yyyy (required by SAM.gov API) */
function formatSamDate(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${mm}/${dd}/${yyyy}`;
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return formatSamDate(d);
}

export class SamGovAdapter implements CrawlAdapter {
  name = "samgov";

  async crawl(source: SourceConfig): Promise<RawOpportunity[]> {
    const log = createLogger(source.id);
    const cfg = source.config as SamGovConfig;

    const apiKey = cfg.apiKey || process.env.SAM_GOV_API_KEY;
    if (!apiKey) {
      log.warn("No SAM.gov API key found in config or SAM_GOV_API_KEY env var — skipping");
      return [];
    }

    const keywords = cfg.keywords || ["Ethiopia", "East Africa"];
    const limit = cfg.limit || 100;
    const daysBack = cfg.daysBack || 60;
    const postedFrom = daysAgo(daysBack);
    const postedTo = formatSamDate(new Date());

    const seen = new Map<string, RawOpportunity>();

    for (const keyword of keywords) {
      log.info(`Searching SAM.gov for "${keyword}" (${postedFrom} to ${postedTo})...`);

      try {
        const params = new URLSearchParams({
          api_key: apiKey,
          postedFrom,
          postedTo,
          ptype: "o",
          keyword,
          limit: String(limit),
          offset: "0",
        });

        const res = await fetch(`${BASE_URL}?${params}`);

        if (!res.ok) {
          const errBody = await res.text();
          log.error(`API error ${res.status} for keyword "${keyword}": ${errBody.slice(0, 200)}`);
          continue;
        }

        const data = await res.json();
        const items: SamOpportunity[] = data.opportunitiesData || [];
        log.info(`  "${keyword}": ${items.length} results (${data.totalRecords || 0} total)`);

        for (const item of items) {
          if (seen.has(item.noticeId)) continue;

          const opp: RawOpportunity = {
            title: item.title || "Untitled",
            organization: cleanOrganization(item.fullParentPathName),
            description: item.description || "",
            deadline: parseDeadline(item.responseDeadLine),
            published: item.postedDate || null,
            country: "Ethiopia",
            city: null,
            source_url: item.uiLink || `https://sam.gov/opp/${item.noticeId}/view`,
            source_domain: "sam.gov",
            content_type: source.content_type,
            scraped_at: new Date().toISOString(),
            raw_fields: {
              donor_ref: item.solicitationNumber || null,
              pipeline_stage: "published",
              signal_type: "tender_published",
              signal_confidence: "high",
              procurement_method: null,
              naics_code: item.naicsCode || null,
              notice_id: item.noticeId,
              classification_code: item.classificationCode || null,
              set_aside: item.setAsideDescription || null,
              notice_type: item.type || null,
              full_parent_path: item.fullParentPathName || null,
              description_raw: item.description || null,
            },
          };

          seen.set(item.noticeId, opp);
        }
      } catch (err) {
        log.error(`Failed to fetch keyword "${keyword}":`, err);
        continue;
      }
    }

    const results = Array.from(seen.values());
    log.info(`Total: ${results.length} unique opportunities from SAM.gov`);
    return results;
  }
}
