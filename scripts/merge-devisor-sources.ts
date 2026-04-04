/**
 * merge-devisor-sources.ts
 *
 * Merges Python scraper output (from .tmp/devisor_*.json) with
 * the TS crawl engine output (from test-output/_all_normalized.json).
 *
 * Usage: npx tsx scripts/merge-devisor-sources.ts
 *
 * Reads:
 *   - test-output/_all_normalized.json (TS crawl engine output)
 *   - ../.tmp/devisor_*.json (Python scraper outputs from tools/)
 *
 * Writes:
 *   - test-output/_all_normalized.json (merged, deduped, normalized)
 */

import * as fs from "fs";
import * as path from "path";
import { normalizeAll } from "./crawl-engine/normalize";
import { deduplicate } from "./crawl-engine/dedup";
import type { RawOpportunity } from "./crawl-engine/types";

const PROJECT_ROOT = path.join(__dirname, "..");
const PARENT_ROOT = path.join(PROJECT_ROOT, "..");
const TMP_DIR = path.join(PARENT_ROOT, ".tmp");
const TS_OUTPUT = path.join(PROJECT_ROOT, "test-output", "_all_normalized.json");

function loadJsonFile(filePath: string): any[] {
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const data = JSON.parse(raw);
    // Handle various formats: array, {opportunities: [...]}, {entries: [...]}, etc.
    if (Array.isArray(data)) return data;
    if (data.opportunities && Array.isArray(data.opportunities)) return data.opportunities;
    if (data.entries && Array.isArray(data.entries)) return data.entries;
    if (data.items && Array.isArray(data.items)) return data.items;
    if (data.results && Array.isArray(data.results)) return data.results;
    return [];
  } catch (err) {
    console.warn(`[merge] Could not load ${filePath}: ${(err as Error).message}`);
    return [];
  }
}

async function main() {
  console.log("[merge] Merging Devisor sources into crawl engine output...");

  // 1. Load TS crawl engine output
  let tsOpps: RawOpportunity[] = [];
  if (fs.existsSync(TS_OUTPUT)) {
    tsOpps = loadJsonFile(TS_OUTPUT);
    console.log(`[merge] TS crawl engine: ${tsOpps.length} opportunities`);
  } else {
    console.log("[merge] No TS crawl engine output found, starting from empty");
  }

  // 2. Load all Python devisor scraper outputs
  const devisorFiles: string[] = [];
  if (fs.existsSync(TMP_DIR)) {
    const files = fs.readdirSync(TMP_DIR).filter(
      (f) => f.startsWith("devisor_") && f.endsWith(".json")
    );
    devisorFiles.push(...files.map((f) => path.join(TMP_DIR, f)));
  }

  let pythonOpps: RawOpportunity[] = [];
  for (const file of devisorFiles) {
    const items = loadJsonFile(file);
    console.log(`[merge] ${path.basename(file)}: ${items.length} items`);
    pythonOpps.push(...items);
  }

  if (pythonOpps.length === 0 && tsOpps.length === 0) {
    console.log("[merge] No data from any source. Nothing to merge.");
    return;
  }

  // 3. Tag source IDs for dedup priority
  // Python devisor sources get priority 15 (between org sites at 10 and aggregators at 40)
  for (const opp of pythonOpps) {
    (opp as any)._sourceId = `devisor-${opp.source_domain || "python"}`;
  }

  // 4. Merge all
  const all = [...tsOpps, ...pythonOpps];
  console.log(`[merge] Total before dedup: ${all.length}`);

  // 5. Build priority map
  const priorityMap = new Map<string, number>();
  // TS sources keep their existing priorities
  const seenSources = new Set<string>();
  for (const opp of tsOpps) {
    const sid = (opp as any)._sourceId || opp.source_domain;
    if (!seenSources.has(sid)) {
      priorityMap.set(sid, 30); // default for TS sources
      seenSources.add(sid);
    }
  }
  // Python devisor sources
  for (const opp of pythonOpps) {
    const sid = (opp as any)._sourceId;
    if (sid && !priorityMap.has(sid)) {
      priorityMap.set(sid, 15);
    }
  }

  // 6. Deduplicate
  const { deduped, stats } = deduplicate(all, priorityMap);
  console.log(
    `[merge] Dedup: ${stats.totalIn} → ${stats.totalOut} ` +
      `(url: ${stats.urlDupes}, title: ${stats.titleDupes}, donorRef: ${stats.donorRefDupes})`
  );

  // 7. Normalize
  const normalized = normalizeAll(deduped);

  // 8. Write merged output
  const outputDir = path.dirname(TS_OUTPUT);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  fs.writeFileSync(TS_OUTPUT, JSON.stringify(normalized, null, 2), "utf-8");
  console.log(`[merge] Wrote ${normalized.length} opportunities to ${TS_OUTPUT}`);

  // 9. Summary
  const byType = normalized.reduce(
    (acc, o) => {
      const t = o.content_type || "unknown";
      acc[t] = (acc[t] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );
  console.log("[merge] By type:", JSON.stringify(byType));

  const bySignal = normalized.reduce(
    (acc, o) => {
      const s = (o.raw_fields?.signal_type as string) || "none";
      if (s !== "none") acc[s] = (acc[s] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );
  if (Object.keys(bySignal).length > 0) {
    console.log("[merge] Devisor signals:", JSON.stringify(bySignal));
  }
}

main().catch((err) => {
  console.error("[merge] Fatal error:", err);
  process.exit(1);
});
