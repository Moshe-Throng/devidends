/**
 * IATI Datastore Adapter — Devisor Pipeline Intelligence
 * Source: api.iatistandard.org/datastore
 *
 * Queries the IATI Datastore for donor pipeline signals:
 * - Planned activities (status=1) → early pipeline detection
 * - Winding-down activities (status=2, ending within 12mo) → successor RFP signals
 * - New commitments (transaction_type=2) → fresh funding signals
 */

import type { CrawlAdapter, SourceConfig, RawOpportunity } from "../types";
import { createLogger } from "../utils/logger";

// Use the free iati.cloud endpoint (no auth required)
// The official api.iatistandard.org now requires a subscription key
// Note: /search/ redirects to /api/v2/ — use the direct path
const BASE_URL = "https://datastore.iati.cloud/api/v2";

const FIELDS = [
  "iati_identifier",
  "title_narrative",
  "description_narrative",
  "reporting_org_narrative",
  "participating_org_narrative",
  "activity_status_code",
  "budget_value",
  "budget_period_start_iso_date",
  "budget_period_end_iso_date",
  "activity_date_iso_date",
  "sector_code",
  "sector_vocabulary",
  "recipient_country_code",
].join(",");

/** DAC sector code → Devidends sector */
const DAC_SECTOR_MAP: Record<string, string> = {
  "15110": "Governance",
  "15112": "Governance",
  "25010": "Economic Development",
  "33110": "Economic Development",
  "16010": "Protection & Human Rights",
};

// Range-based mappings (applied in order)
const DAC_SECTOR_RANGES: Array<{ min: number; max: number; sector: string }> = [
  { min: 11110, max: 11130, sector: "Education" },
  { min: 12110, max: 12191, sector: "Health" },
  { min: 14010, max: 14081, sector: "WASH" },
  { min: 31110, max: 31195, sector: "Food Security & Livelihoods" },
];

function mapDacSector(codes: string[] | undefined): string {
  if (!codes || codes.length === 0) return "Other";

  for (const code of codes) {
    if (DAC_SECTOR_MAP[code]) return DAC_SECTOR_MAP[code];

    const num = parseInt(code, 10);
    if (!isNaN(num)) {
      for (const range of DAC_SECTOR_RANGES) {
        if (num >= range.min && num <= range.max) return range.sector;
      }
    }
  }

  return "Other";
}

/** Safely extract first element from an array field (IATI returns arrays) */
function first(val: unknown): string {
  if (Array.isArray(val) && val.length > 0) return String(val[0]);
  if (typeof val === "string") return val;
  return "";
}

/** Get all elements joined */
function joined(val: unknown): string {
  if (Array.isArray(val)) return val.map(String).join("; ");
  if (typeof val === "string") return val;
  return "";
}

/** Get budget min/max from budget_value array */
function budgetRange(val: unknown): { budget_min: number | null; budget_max: number | null } {
  if (!Array.isArray(val) || val.length === 0) return { budget_min: null, budget_max: null };
  const nums = val.map(Number).filter((n) => !isNaN(n) && n > 0);
  if (nums.length === 0) return { budget_min: null, budget_max: null };
  return { budget_min: Math.min(...nums), budget_max: Math.max(...nums) };
}

/** Determine pipeline stage from status code and budget end dates */
function getPipelineStage(
  statusCode: number,
  budgetEndDates: string[] | undefined
): string {
  if (statusCode === 1) return "forecast";

  if (statusCode === 2 && budgetEndDates && budgetEndDates.length > 0) {
    const now = Date.now();
    const sixMonths = 6 * 30 * 24 * 60 * 60 * 1000;
    const latestEnd = budgetEndDates
      .map((d) => new Date(d).getTime())
      .filter((t) => !isNaN(t))
      .sort((a, b) => b - a)[0];

    if (latestEnd && latestEnd - now > sixMonths) return "pipeline";
    return "published";
  }

  return "pipeline";
}

/** Determine signal type */
function getSignalType(
  statusCode: number,
  budgetEndDates: string[] | undefined
): string {
  if (statusCode === 1) return "iati_planned";

  if (budgetEndDates && budgetEndDates.length > 0) {
    const now = Date.now();
    const twelveMonths = 12 * 30 * 24 * 60 * 60 * 1000;
    const latestEnd = budgetEndDates
      .map((d) => new Date(d).getTime())
      .filter((t) => !isNaN(t))
      .sort((a, b) => b - a)[0];

    if (latestEnd && latestEnd - now <= twelveMonths) return "iati_winding_down";
  }

  return "iati_planned";
}

/** Determine signal confidence */
function getSignalConfidence(
  budgetValues: unknown,
  participatingOrgs: unknown
): "high" | "medium" | "low" {
  const hasBudget =
    Array.isArray(budgetValues) &&
    budgetValues.some((v) => Number(v) > 0);
  const hasImplementingOrg =
    Array.isArray(participatingOrgs) && participatingOrgs.length > 0;

  if (hasBudget && hasImplementingOrg) return "high";
  if (hasBudget || hasImplementingOrg) return "medium";
  return "low";
}

interface IATIDoc {
  iati_identifier?: string;
  title_narrative?: string[];
  description_narrative?: string[];
  reporting_org_narrative?: string[];
  participating_org_narrative?: string[];
  activity_status_code?: number[];
  budget_value?: number[];
  budget_period_start_iso_date?: string[];
  budget_period_end_iso_date?: string[];
  activity_date_iso_date?: string[];
  sector_code?: string[];
  sector_vocabulary?: string[];
  recipient_country_code?: string[];
}

interface IATIResponse {
  response: {
    numFound: number;
    docs: IATIDoc[];
  };
}

async function queryIATI(
  query: string,
  rows: number,
  log: ReturnType<typeof createLogger>
): Promise<IATIDoc[]> {
  const params = new URLSearchParams({
    q: query,
    fl: FIELDS,
    rows: String(rows),
    wt: "json",
  });

  const url = `${BASE_URL}/activity?${params.toString()}`;
  log.info(`Querying: ${query} (rows=${rows})`);

  const res = await fetch(url);

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`IATI API error ${res.status}: ${errBody.slice(0, 200)}`);
  }

  const data: IATIResponse = await res.json();
  const docs = data.response?.docs || [];
  log.info(`Query returned ${docs.length} results (${data.response?.numFound || 0} total)`);
  return docs;
}

export class IATIAdapter implements CrawlAdapter {
  name = "iati";

  async crawl(source: SourceConfig): Promise<RawOpportunity[]> {
    const log = createLogger(source.id);
    const cfg = source.config as {
      countryCode?: string;
      rows?: number;
    };

    const countryCode = cfg.countryCode || "ET";
    const rows = cfg.rows || 200;

    log.info(`Starting IATI pipeline scan for country=${countryCode}...`);

    // Date filters: only get activities with budget periods ending in the future
    // or recently (within last 12 months) — these are actionable signals
    const now = new Date();
    const twelveMonthsAgo = new Date(now);
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);
    const dateFloor = twelveMonthsAgo.toISOString().split("T")[0];

    // Run all three queries — with date filters to avoid stale data
    const [planned, windingDown, commitments] = await Promise.all([
      // Planned activities (status=1) — these are always forward-looking
      queryIATI(
        `recipient_country_code:${countryCode} AND activity_status_code:1`,
        rows,
        log
      ).catch((err) => {
        log.warn(`Planned activities query failed: ${err.message}`);
        return [] as IATIDoc[];
      }),
      // Active activities (status=2) with budget ending soon (future or last 12 months)
      queryIATI(
        `recipient_country_code:${countryCode} AND activity_status_code:2 AND budget_period_end_iso_date:[${dateFloor} TO *]`,
        rows,
        log
      ).catch((err) => {
        log.warn(`Active activities query failed: ${err.message}`);
        return [] as IATIDoc[];
      }),
      // Recent commitments (last 12 months) — fresh money signals
      queryIATI(
        `recipient_country_code:${countryCode} AND transaction_type:2 AND transaction_date_iso_date:[${dateFloor} TO *]`,
        rows,
        log
      ).catch((err) => {
        log.warn(`Commitments query failed: ${err.message}`);
        return [] as IATIDoc[];
      }),
    ]);

    // Deduplicate by iati_identifier across all queries
    const seen = new Set<string>();
    const allDocs: IATIDoc[] = [];

    for (const doc of [...planned, ...windingDown, ...commitments]) {
      const id = doc.iati_identifier;
      if (!id || seen.has(id)) continue;
      seen.add(id);
      allDocs.push(doc);
    }

    log.info(
      `Total unique activities: ${allDocs.length} ` +
      `(planned=${planned.length}, active=${windingDown.length}, commitments=${commitments.length})`
    );

    const opportunities: RawOpportunity[] = allDocs.map((doc): RawOpportunity => {
      const statusCode = Array.isArray(doc.activity_status_code)
        ? doc.activity_status_code[0]
        : 2;
      const budgetEndDates = doc.budget_period_end_iso_date;
      const budget = budgetRange(doc.budget_value);
      const sectorCodes = doc.sector_code?.map(String);
      const iatiId = doc.iati_identifier || "";

      // Use budget_period_start as published date, or activity_date
      const published =
        first(doc.budget_period_start_iso_date) ||
        first(doc.activity_date_iso_date) ||
        null;

      // Use latest budget_period_end as a proxy deadline
      const deadline = budgetEndDates && budgetEndDates.length > 0
        ? budgetEndDates.sort().reverse()[0]
        : null;

      return {
        title: first(doc.title_narrative) || `IATI Activity ${iatiId}`,
        organization: first(doc.reporting_org_narrative),
        description: first(doc.description_narrative),
        deadline,
        published,
        country: countryCode === "ET" ? "Ethiopia" : countryCode,
        city: null,
        source_url: `https://d-portal.org/ctrack.html#view=act&aid=${encodeURIComponent(iatiId)}`,
        source_domain: "iatistandard.org",
        content_type: source.content_type,
        scraped_at: new Date().toISOString(),
        raw_fields: {
          ...budget,
          pipeline_stage: getPipelineStage(statusCode, budgetEndDates),
          signal_type: getSignalType(statusCode, budgetEndDates),
          signal_confidence: getSignalConfidence(
            doc.budget_value,
            doc.participating_org_narrative
          ),
          donor_ref: iatiId,
          procurement_method: null,
          sector: mapDacSector(sectorCodes),
          participating_orgs: joined(doc.participating_org_narrative),
          activity_status_code: statusCode,
        },
      };
    });

    // ── Post-query quality filtering ──────────────────────────────
    const JUNK_TITLES = new Set([
      "not applicable", "n/a", "na", "none", "tbd", "tbc",
      "untitled", "test", "unknown",
    ]);

    // Single-word generic titles that are internal sub-activity labels
    const GENERIC_SINGLE_WORD_TITLES = new Set([
      "financial sector", "gender integration project", "administration",
      "monitoring", "evaluation", "management", "support", "technical",
      "capacity", "governance", "operations", "program",
    ]);

    const BUDGET_CUTOFF_YEAR = 2024;
    const WINDING_DOWN_CUTOFF = "2025-01-01";

    const filtered = opportunities.filter((opp) => {
      const title = (opp.title || "").trim();
      const titleLower = title.toLowerCase();

      // Reject empty or very short titles
      if (!title || title.length < 15) {
        log.info(`SKIP (short title): "${title}"`);
        return false;
      }

      // Reject known junk titles
      if (JUNK_TITLES.has(titleLower)) {
        log.info(`SKIP (junk title): "${title}"`);
        return false;
      }

      // Reject single-word generic titles (or two-word generic combos)
      const wordCount = title.split(/\s+/).length;
      if (wordCount <= 3 && GENERIC_SINGLE_WORD_TITLES.has(titleLower)) {
        log.info(`SKIP (generic title): "${title}"`);
        return false;
      }

      // Reject "IATI Activity XY-1..." fallback titles
      if (title.startsWith("IATI Activity ")) {
        log.info(`SKIP (no real title): "${title}"`);
        return false;
      }

      // Reject activities where ALL budget periods ended before 2024
      const budgetEndDates = opp.raw_fields?.donor_ref
        ? allDocs.find((d) => d.iati_identifier === opp.raw_fields?.donor_ref)
            ?.budget_period_end_iso_date
        : undefined;
      if (budgetEndDates && budgetEndDates.length > 0) {
        const allExpired = budgetEndDates.every((d) => {
          const year = new Date(d).getFullYear();
          return !isNaN(year) && year < BUDGET_CUTOFF_YEAR;
        });
        if (allExpired) {
          log.info(`SKIP (all budgets ended before ${BUDGET_CUTOFF_YEAR}): "${title}"`);
          return false;
        }
      }

      // For winding_down items, only keep if deadline/end date is after 2025-01-01
      if (opp.raw_fields?.signal_type === "iati_winding_down") {
        const deadline = opp.deadline || "";
        if (deadline && deadline < WINDING_DOWN_CUTOFF) {
          log.info(`SKIP (winding down, deadline too old: ${deadline}): "${title}"`);
          return false;
        }
      }

      // iati_planned items are always kept (forward-looking by definition)
      return true;
    });

    log.info(`Filtered ${opportunities.length} → ${filtered.length} pipeline signals`);
    return filtered;
  }
}
