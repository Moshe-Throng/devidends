/**
 * Deduplication module for the crawl engine.
 *
 * Two-level dedup:
 *   1. Exact source_url match
 *   2. Title+org similarity (first 60 chars of title + first 20 of org)
 *
 * When duplicates found, keeps the source with lower priority number (preferred).
 */

import type { RawOpportunity, SourceConfig } from "./types";

interface DedupStats {
  totalIn: number;
  totalOut: number;
  urlDupes: number;
  titleDupes: number;
  donorRefDupes: number;
}

/**
 * Build a dedup key from title + organization.
 * Matches the Python aggregate_jobs.py logic.
 */
function titleKey(opp: RawOpportunity): string {
  const title = (opp.title || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
  const org = (opp.organization || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 20);
  return `${title}|${org}`;
}

/**
 * Deduplicate opportunities using source_url (primary) and title+org (secondary).
 *
 * @param opportunities - All raw opportunities from all sources
 * @param sourcePriorities - Map of sourceId → priority number (lower = preferred)
 */
export function deduplicate(
  opportunities: (RawOpportunity & { _sourceId?: string })[],
  sourcePriorities: Map<string, number>
): { deduped: RawOpportunity[]; stats: DedupStats } {
  const byUrl = new Map<string, RawOpportunity & { _sourceId?: string }>();
  const byTitle = new Map<string, RawOpportunity & { _sourceId?: string }>();
  const byDonorRef = new Map<string, RawOpportunity & { _sourceId?: string }>();
  let urlDupes = 0;
  let titleDupes = 0;
  let donorRefDupes = 0;

  const getPriority = (opp: RawOpportunity & { _sourceId?: string }) =>
    sourcePriorities.get(opp._sourceId || "") ?? 99;

  for (const opp of opportunities) {
    const url = opp.source_url;
    const tKey = titleKey(opp);

    // Level 1: Exact URL match
    if (byUrl.has(url)) {
      const existing = byUrl.get(url)!;
      if (getPriority(opp) < getPriority(existing)) {
        byUrl.set(url, opp);
        // Also update title map
        byTitle.set(titleKey(existing), opp);
      }
      urlDupes++;
      continue;
    }

    // Level 2: Title+org similarity
    if (byTitle.has(tKey)) {
      const existing = byTitle.get(tKey)!;
      if (getPriority(opp) < getPriority(existing)) {
        // Replace in both maps
        byUrl.delete(existing.source_url);
        byUrl.set(url, opp);
        byTitle.set(tKey, opp);
      }
      titleDupes++;
      continue;
    }

    // Level 3: Donor reference dedup (for pipeline/tender signals from overlapping sources)
    const donorRef = opp.raw_fields?.donor_ref as string | undefined;
    if (donorRef && byDonorRef.has(donorRef)) {
      const existing = byDonorRef.get(donorRef)!;
      if (getPriority(opp) < getPriority(existing)) {
        byUrl.delete(existing.source_url);
        byUrl.set(url, opp);
        byTitle.set(titleKey(existing), opp);
        byDonorRef.set(donorRef, opp);
      }
      donorRefDupes++;
      continue;
    }

    byUrl.set(url, opp);
    byTitle.set(tKey, opp);
    if (donorRef) byDonorRef.set(donorRef, opp);
  }

  // Collect unique results from URL map (canonical)
  const deduped = [...byUrl.values()].map((opp) => {
    // Remove internal _sourceId field
    const { _sourceId, ...clean } = opp as RawOpportunity & {
      _sourceId?: string;
    };
    return clean;
  });

  return {
    deduped,
    stats: {
      totalIn: opportunities.length,
      totalOut: deduped.length,
      urlDupes,
      titleDupes,
      donorRefDupes,
    },
  };
}
