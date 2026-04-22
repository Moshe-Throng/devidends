#!/usr/bin/env npx tsx
/**
 * Devidends Crawl Engine — Orchestrator
 *
 * Loads sources from sources.json, runs adapters with concurrency control,
 * normalizes, deduplicates, and writes output to test-output/.
 *
 * Usage:
 *   npx tsx scripts/crawl-engine/engine.ts                  # Run all enabled sources
 *   npx tsx scripts/crawl-engine/engine.ts --only reliefweb,drc  # Run specific sources
 *   npx tsx scripts/crawl-engine/engine.ts --skip puppeteer      # Skip Puppeteer-based sources
 *   npx tsx scripts/crawl-engine/engine.ts --concurrency 3       # Set concurrency limit
 */

import fs from "fs";
import path from "path";

// Load .env.local for API keys (SAM_GOV_API_KEY, etc.)
const envPath = path.join(__dirname, "..", "..", ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const idx = t.indexOf("=");
    if (idx < 0) continue;
    const key = t.slice(0, idx).trim();
    const val = t.slice(idx + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = val;
  }
}
import type {
  SourceConfig,
  SourceResult,
  RawOpportunity,
  EngineSummary,
} from "./types";
import { getAdapterRegistry } from "./adapters/base";
import { normalizeAll, isRelevantForEthiopia } from "./normalize";
import { deduplicate } from "./dedup";
import { closeBrowser } from "./utils/browser";

// ── Parse CLI args ──────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const opts: {
    only: string[];
    skip: string[];
    concurrency: number;
    skipPuppeteer: boolean;
  } = {
    only: [],
    skip: [],
    concurrency: 5,
    skipPuppeteer: false,
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--only" && args[i + 1]) {
      opts.only = args[++i].split(",").map((s) => s.trim());
    } else if (args[i] === "--skip" && args[i + 1]) {
      opts.skip = args[++i].split(",").map((s) => s.trim());
    } else if (args[i] === "--concurrency" && args[i + 1]) {
      opts.concurrency = parseInt(args[++i], 10) || 5;
    } else if (args[i] === "--skip-puppeteer") {
      opts.skipPuppeteer = true;
    }
  }

  return opts;
}

// ── Concurrency limiter (simple, no extra deps beyond p-limit) ──────────────

async function withConcurrency<T>(
  tasks: (() => Promise<T>)[],
  limit: number
): Promise<T[]> {
  const pLimit = (await import("p-limit")).default;
  const limiter = pLimit(limit);
  return Promise.all(tasks.map((task) => limiter(task)));
}

// ── Main engine ─────────────────────────────────────────────────────────────

const PUPPETEER_ADAPTERS = new Set(["puppeteer-spa", "oracle-hcm"]);

async function runEngine() {
  const startTime = Date.now();
  const opts = parseArgs();

  console.log("=".repeat(60));
  console.log("  DEVIDENDS — Crawl Engine v2");
  console.log("  " + new Date().toISOString());
  console.log("=".repeat(60));
  console.log();

  // 1. Load source registry
  const sourcesPath = path.join(__dirname, "sources.json");
  const allSources: SourceConfig[] = JSON.parse(
    fs.readFileSync(sourcesPath, "utf-8")
  );

  // 2. Filter sources
  let sources = allSources.filter((s) => s.enabled);

  if (opts.only.length > 0) {
    sources = sources.filter((s) => opts.only.includes(s.id));
  }
  if (opts.skip.length > 0) {
    sources = sources.filter((s) => !opts.skip.includes(s.id));
  }
  if (opts.skipPuppeteer) {
    sources = sources.filter((s) => !PUPPETEER_ADAPTERS.has(s.adapter));
  }

  console.log(
    `  Sources: ${sources.length} enabled (${allSources.length} total)`
  );
  console.log(`  Concurrency: ${opts.concurrency}`);
  console.log();

  // 3. Load adapter registry
  const adapters = getAdapterRegistry();

  // 4. Build priority map for dedup
  const priorityMap = new Map<string, number>();
  for (const s of sources) {
    priorityMap.set(s.id, s.priority);
  }

  // 5. Run all sources with concurrency limit
  const tasks = sources.map((source) => async (): Promise<SourceResult> => {
    const adapter = adapters.get(source.adapter);
    if (!adapter) {
      console.error(`[${source.id}] Unknown adapter: ${source.adapter}`);
      return {
        sourceId: source.id,
        sourceName: source.name,
        status: "error",
        count: 0,
        error: `Unknown adapter: ${source.adapter}`,
        durationMs: 0,
        opportunities: [],
      };
    }

    const sourceStart = Date.now();

    try {
      // 3-minute timeout per source
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error("Source timeout (3 min)")),
          3 * 60 * 1000
        )
      );

      const opportunities = await Promise.race([
        adapter.crawl(source),
        timeoutPromise,
      ]);

      // Tag each opportunity with source ID for dedup
      for (const opp of opportunities) {
        (opp as any)._sourceId = source.id;
      }

      const durationMs = Date.now() - sourceStart;
      const status = opportunities.length > 0 ? "ok" : "empty";
      console.log(
        `  [${source.id}] ${status.toUpperCase()} — ${opportunities.length} results (${(durationMs / 1000).toFixed(1)}s)`
      );

      return {
        sourceId: source.id,
        sourceName: source.name,
        status,
        count: opportunities.length,
        durationMs,
        opportunities,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      const durationMs = Date.now() - sourceStart;
      console.error(
        `  [${source.id}] ERROR — ${message} (${(durationMs / 1000).toFixed(1)}s)`
      );

      return {
        sourceId: source.id,
        sourceName: source.name,
        status: "error",
        count: 0,
        error: message,
        durationMs,
        opportunities: [],
      };
    }
  });

  // Run non-Puppeteer sources first (they're fast), then Puppeteer sources
  const nonPuppeteerTasks: typeof tasks = [];
  const puppeteerTasks: typeof tasks = [];

  for (let i = 0; i < sources.length; i++) {
    if (PUPPETEER_ADAPTERS.has(sources[i].adapter)) {
      puppeteerTasks.push(tasks[i]);
    } else {
      nonPuppeteerTasks.push(tasks[i]);
    }
  }

  console.log(
    `  Running ${nonPuppeteerTasks.length} API/HTML sources (concurrency=${opts.concurrency})...`
  );
  const nonPuppeteerResults = await withConcurrency(
    nonPuppeteerTasks,
    opts.concurrency
  );

  console.log(
    `\n  Running ${puppeteerTasks.length} Puppeteer sources (concurrency=2)...`
  );
  const puppeteerResults = await withConcurrency(puppeteerTasks, 2);

  const results = [...nonPuppeteerResults, ...puppeteerResults];

  // 6. Close shared browser if it was used
  await closeBrowser();

  // 7. Collect all opportunities
  const allOpportunities = results.flatMap((r) => r.opportunities);
  console.log(`\n  Total raw opportunities: ${allOpportunities.length}`);

  // 8. Deduplicate
  const { deduped, stats: dedupStats } = deduplicate(
    allOpportunities,
    priorityMap
  );
  console.log(
    `  After dedup: ${deduped.length} (URL dupes: ${dedupStats.urlDupes}, title dupes: ${dedupStats.titleDupes})`
  );

  // 8b. Ethiopia-relevance filter — drop Seoul, Guatemala, Bangkok, etc.
  // Fixed 2026-04-22: GGGI feed + UNICEF Workday were dumping global
  // listings. Keep Ethiopia + Horn/East Africa + international/global/HQ.
  const beforeRelevance = deduped.length;
  const relevant = deduped.filter(isRelevantForEthiopia);
  const droppedByRelevance = beforeRelevance - relevant.length;
  if (droppedByRelevance > 0) {
    console.log(
      `  After Ethiopia relevance: ${relevant.length} (dropped ${droppedByRelevance} clearly out-of-region)`
    );
    // Sample a few dropped for logs so we can tune if it over-filters
    const dropped = deduped.filter((d) => !isRelevantForEthiopia(d)).slice(0, 5);
    for (const d of dropped) {
      console.log(`    × [${d.source_domain}] ${d.country || "—"} / ${d.city || "—"} · ${(d.title || "").slice(0, 60)}`);
    }
  }
  // Mutate 'deduped' to use relevant list from here on — all downstream
  // code reads from this variable.
  deduped.length = 0;
  deduped.push(...relevant);

  // 9. Normalize
  const normalized = normalizeAll(deduped);

  // 10. Write output files
  const outDir = path.join(__dirname, "../../test-output");
  fs.mkdirSync(outDir, { recursive: true });

  // Write per-source files (for backward compatibility with frontend API)
  const bySource = new Map<string, RawOpportunity[]>();
  for (const opp of deduped) {
    const key = opp.source_domain;
    if (!bySource.has(key)) bySource.set(key, []);
    bySource.get(key)!.push(opp);
  }

  // Group back into original source output files
  const sourceOutputMap: Record<string, string> = {
    "reliefweb.int": "reliefweb.json",
    "worldbank.org": "worldbank.json",
    "unjobs.org": "unjobs.json",
    "drc.ngo": "drc.json",
    "au.int": "au.json",
    "jobs.au.int": "au.json",
    "careers.un.org": "uncareers.json",
    "kifiya.com": "kifiya.com",
    "oraclecloud.com": "oracle.json",
  };

  // Write Workday orgs to workday.json
  const workdayDomains = new Set<string>();
  for (const source of sources) {
    if (source.adapter === "workday") {
      const baseUrl = (source.config as any).baseUrl || "";
      try {
        workdayDomains.add(new URL(baseUrl).hostname);
      } catch {}
    }
  }

  const workdayJobs: RawOpportunity[] = [];
  for (const [domain, opps] of bySource) {
    if (workdayDomains.has(domain)) {
      workdayJobs.push(...opps);
      continue;
    }
    const filename = sourceOutputMap[domain];
    if (filename) {
      const outPath = path.join(outDir, filename);
      // For worldbank, wrap in { opportunities: [] } format
      if (domain === "worldbank.org") {
        const existing = fs.existsSync(outPath)
          ? JSON.parse(fs.readFileSync(outPath, "utf-8"))
          : {};
        fs.writeFileSync(
          outPath,
          JSON.stringify(
            {
              ...existing,
              metadata: { scraped_at: new Date().toISOString(), count: opps.length },
              opportunities: opps,
            },
            null,
            2
          )
        );
      } else {
        fs.writeFileSync(outPath, JSON.stringify(opps, null, 2));
      }
    }
  }

  // Write workday combined
  if (workdayJobs.length > 0) {
    fs.writeFileSync(
      path.join(outDir, "workday.json"),
      JSON.stringify(workdayJobs, null, 2)
    );
  }

  // Write all new source results to individual files
  for (const result of results) {
    const source = sources.find((s) => s.id === result.sourceId);
    if (!source) continue;
    // Skip sources already covered by legacy output files
    const legacyAdapters = new Set(["reliefweb", "worldbank", "workday", "puppeteer-spa", "cheerio-html", "oracle-hcm"]);
    if (legacyAdapters.has(source.adapter) && ["reliefweb", "worldbank", "unjobs", "drc", "au", "fhi360", "unhcr-workday", "uncareers", "kifiya", "oracle-nrc"].includes(source.id)) {
      continue;
    }
    // Write new sources to their own files
    // Always write on success (even empty) so stale data doesn't persist.
    // Only skip if the source errored out — preserve last-known-good data in that case.
    if (result.status !== "error") {
      fs.writeFileSync(
        path.join(outDir, `${result.sourceId}.json`),
        JSON.stringify(result.opportunities, null, 2)
      );
    }
  }

  // Write combined normalized output
  fs.writeFileSync(
    path.join(outDir, "_all_normalized.json"),
    JSON.stringify(normalized, null, 2)
  );

  // 11. Write summary
  const summary: EngineSummary = {
    timestamp: new Date().toISOString(),
    results: results.map((r) => ({
      sourceId: r.sourceId,
      sourceName: r.sourceName,
      status: r.status,
      count: r.count,
      error: r.error,
      durationMs: r.durationMs,
    })),
    totalRaw: allOpportunities.length,
    totalDeduped: deduped.length,
    working: results.filter((r) => r.status === "ok").length,
    durationMs: Date.now() - startTime,
  };

  fs.writeFileSync(
    path.join(outDir, "_summary.json"),
    JSON.stringify(summary, null, 2)
  );

  // 12. Print summary
  console.log("\n" + "=".repeat(60));
  console.log("  SUMMARY");
  console.log("=".repeat(60));
  console.log();

  for (const r of results) {
    const icon =
      r.status === "ok" ? "OK" : r.status === "empty" ? "EMPTY" : "ERROR";
    const pad = r.sourceName.padEnd(40);
    console.log(
      `  ${pad} ${icon.padEnd(8)} ${String(r.count).padStart(4)} items  (${(r.durationMs / 1000).toFixed(1)}s)`
    );
  }

  console.log();
  console.log(
    `  Total: ${deduped.length} unique opportunities from ${summary.working}/${results.length} working sources`
  );
  console.log(
    `  Duration: ${(summary.durationMs / 1000).toFixed(1)}s`
  );
  console.log("=".repeat(60));
  console.log(`\n  Output: ${outDir}`);

  // ── Health check: fail loud if crawl is unhealthy ─────────────────────────
  // Skip health check for partial test runs (--only / --skip / single source)
  const isFullRun = opts.only.length === 0 && opts.skip.length === 0 && !opts.skipPuppeteer;
  if (!isFullRun) {
    console.log("\n  (Health check skipped: partial run)");
    return;
  }

  // A crawl is unhealthy if:
  //   (a) >30% of sources errored (hard failure), OR
  //   (b) total deduped items dropped >40% from yesterday, OR
  //   (c) fewer than 100 items total (should always have >200 on a healthy day)
  const errorCount = results.filter((r: any) => r.status === "error").length;
  const errorPct = results.length > 0 ? errorCount / results.length : 0;

  const prevTotalsPath = path.join(outDir, "_last_total.json");
  let prevTotal = 0;
  try {
    if (fs.existsSync(prevTotalsPath)) {
      prevTotal = JSON.parse(fs.readFileSync(prevTotalsPath, "utf-8")).total || 0;
    }
  } catch {}
  const dropPct = prevTotal > 0 ? (prevTotal - deduped.length) / prevTotal : 0;
  fs.writeFileSync(prevTotalsPath, JSON.stringify({ total: deduped.length, at: new Date().toISOString() }));

  const problems: string[] = [];
  if (errorPct > 0.3) problems.push(`${errorCount}/${results.length} sources errored (${Math.round(errorPct * 100)}%)`);
  if (dropPct > 0.4) problems.push(`item count dropped ${Math.round(dropPct * 100)}% (${prevTotal} → ${deduped.length})`);
  if (deduped.length < 100) problems.push(`only ${deduped.length} items — expected 200+`);

  const erroredSources = results.filter((r: any) => r.status === "error").map((r: any) => `${r.sourceName}: ${String(r.error || "").slice(0, 80)}`);

  if (problems.length > 0) {
    console.log();
    console.log("⚠️  HEALTH CHECK FAILED:");
    for (const p of problems) console.log(`    ${p}`);

    // Send Telegram admin alert
    await sendCrawlAlert({
      problems,
      erroredSources,
      totalItems: deduped.length,
      prevTotal,
      workingCount: summary.working,
      totalSources: results.length,
    });

    process.exit(2); // Distinct exit code: partial data, do NOT broadcast
  }
}

async function sendCrawlAlert(opts: {
  problems: string[];
  erroredSources: string[];
  totalItems: number;
  prevTotal: number;
  workingCount: number;
  totalSources: number;
}) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const adminIds = (process.env.ADMIN_TELEGRAM_IDS || "297659579").split(",").map(s => s.trim());
  if (!botToken) {
    console.warn("[alert] TELEGRAM_BOT_TOKEN not set — cannot send admin alert");
    return;
  }

  const text = [
    `<b>🚨 Crawl Engine Unhealthy</b>`,
    ``,
    `<b>Problems:</b>`,
    ...opts.problems.map(p => `  • ${p}`),
    ``,
    `<b>Stats:</b> ${opts.workingCount}/${opts.totalSources} sources working, ${opts.totalItems} items (yesterday: ${opts.prevTotal})`,
    ``,
    ...(opts.erroredSources.length > 0 ? [
      `<b>Errored sources:</b>`,
      ...opts.erroredSources.slice(0, 10).map(s => `  • ${s}`),
      ``,
    ] : []),
    `<i>Broadcast ABORTED. Fix the crawler before re-running.</i>`,
  ].join("\n");

  for (const tgId of adminIds) {
    try {
      await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: tgId, text, parse_mode: "HTML", disable_web_page_preview: true }),
      });
      console.log(`[alert] Sent to admin ${tgId}`);
    } catch (err: any) {
      console.error(`[alert] Failed to send to ${tgId}:`, err.message);
    }
  }
}

// ── Run ─────────────────────────────────────────────────────────────────────

runEngine()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error("Engine fatal error:", err);
    // Try to alert admin on fatal crash
    sendCrawlAlert({
      problems: [`Fatal crash: ${String(err).slice(0, 200)}`],
      erroredSources: [],
      totalItems: 0,
      prevTotal: 0,
      workingCount: 0,
      totalSources: 0,
    }).finally(() => process.exit(1));
  });
