/**
 * Core types for the Devidends Crawl Engine
 */

/** Content type: jobs, tenders/procurement, news, or pipeline signals */
export type ContentType = "job" | "tender" | "news" | "pipeline";

/** Every adapter produces an array of these */
export interface RawOpportunity {
  title: string;
  organization: string;
  description: string;
  deadline: string | null; // ISO date or date string
  published: string | null; // ISO date or date string
  country: string;
  city: string | null;
  source_url: string; // Unique key for dedup
  source_domain: string;
  content_type: ContentType;
  scraped_at: string; // ISO datetime

  // Adapter-specific extras (career_categories, themes, etc.)
  raw_fields?: Record<string, unknown>;
}

/** Devisor-specific fields stored in raw_fields by intelligence adapters */
export interface DevisorFields {
  budget_min?: number;
  budget_max?: number;
  procurement_method?: string;
  pipeline_stage?: "forecast" | "pipeline" | "published" | "awarded";
  donor_ref?: string;
  framework?: string;
  signal_type?: "iati_planned" | "iati_winding_down" | "donor_hiring" | "usaid_forecast" | "tender_published" | "tender_reoi";
  signal_confidence?: "high" | "medium" | "low";
}

/** Normalized opportunity (after normalize + dedup) */
export interface NormalizedOpportunity extends RawOpportunity {
  sector_norm: string;
  work_type_norm: string;
  seniority: string;
}

/** Source registry entry — one per scraping target */
export interface SourceConfig {
  id: string; // e.g. "fhi360", "reliefweb"
  name: string; // Display name: "FHI 360"
  adapter: string; // Adapter key: "workday", "api-rest", etc.
  content_type: ContentType;
  enabled: boolean;
  priority: number; // Lower = preferred in dedup (10=org site, 40=aggregator)
  config: Record<string, unknown>; // Adapter-specific settings
}

/** Adapter interface — each platform implements this */
export interface CrawlAdapter {
  name: string;
  crawl(source: SourceConfig): Promise<RawOpportunity[]>;
}

/** Result from running a single source */
export interface SourceResult {
  sourceId: string;
  sourceName: string;
  status: "ok" | "empty" | "error";
  count: number;
  error?: string;
  durationMs: number;
  opportunities: RawOpportunity[];
}

/** Summary of an engine run */
export interface EngineSummary {
  timestamp: string;
  results: Omit<SourceResult, "opportunities">[];
  totalRaw: number;
  totalDeduped: number;
  working: number;
  durationMs: number;
}
