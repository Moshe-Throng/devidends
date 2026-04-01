/**
 * Publish crawled opportunities from _all_normalized.json to Supabase.
 * Called after crawl engine completes.
 *
 * Usage: npx tsx scripts/publish-to-supabase.ts
 *
 * Strategy: upsert by source_url (dedup), mark stale listings as inactive.
 */

import * as fs from "fs";
import * as path from "path";

// Load env vars
const envPath = path.join(__dirname, "..", ".env.local");
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

async function main() {
  const { createClient } = await import("@supabase/supabase-js");

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Load normalized opportunities
  const normalizedPath = path.join(__dirname, "..", "test-output", "_all_normalized.json");
  if (!fs.existsSync(normalizedPath)) {
    console.log("[publish] No _all_normalized.json found. Run crawl engine first.");
    return;
  }

  const opportunities = JSON.parse(fs.readFileSync(normalizedPath, "utf-8")) as any[];
  console.log(`[publish] Loaded ${opportunities.length} opportunities from JSON`);

  if (opportunities.length === 0) {
    console.log("[publish] No opportunities to publish.");
    return;
  }

  // Sanitize deadline — only accept valid ISO dates
  function parseDeadline(raw: string | null | undefined): string | null {
    if (!raw) return null;
    // Strip timezone descriptions like "(New York time)"
    const cleaned = raw.replace(/\s*\([^)]*\)\s*/g, "").trim();
    const d = new Date(cleaned);
    if (isNaN(d.getTime())) return null;
    return d.toISOString();
  }

  // Map to Supabase schema
  const rows = opportunities.map((opp: any) => ({
    title: (opp.title || "").slice(0, 500),
    description: (opp.description || "").slice(0, 10000),
    deadline: parseDeadline(opp.deadline),
    organization: (opp.organization || "Unknown").slice(0, 200),
    country: (opp.country || "Ethiopia").slice(0, 100),
    source_url: (opp.source_url || opp.url || "").slice(0, 1000),
    source_domain: (opp.source_domain || "").slice(0, 200),
    type: opp.classified_type || opp.type || "job",
    experience_level: opp.seniority || null,
    sectors: opp.sectors || [],
    is_active: true,
    scraped_at: opp.scraped_at || new Date().toISOString(),
  })).filter((r: any) => r.source_url && r.title);

  console.log(`[publish] Publishing ${rows.length} valid opportunities to Supabase...`);

  // Upsert in batches of 50
  let inserted = 0, updated = 0, failed = 0;
  const batchSize = 50;

  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);

    const { error } = await supabase
      .from("opportunities")
      .upsert(batch, {
        onConflict: "source_url",
        ignoreDuplicates: false,
      });

    if (error) {
      console.error(`[publish] Batch ${Math.floor(i / batchSize) + 1} error:`, error.message);
      failed += batch.length;
    } else {
      inserted += batch.length;
    }
  }

  // Mark old listings as inactive (not seen in today's crawl)
  const activeUrls = new Set(rows.map((r: any) => r.source_url));
  const { data: existing } = await supabase
    .from("opportunities")
    .select("id, source_url")
    .eq("is_active", true);

  if (existing) {
    const staleIds = existing
      .filter((e: any) => !activeUrls.has(e.source_url))
      .map((e: any) => e.id);

    if (staleIds.length > 0) {
      await supabase
        .from("opportunities")
        .update({ is_active: false })
        .in("id", staleIds);
      console.log(`[publish] Marked ${staleIds.length} stale listings as inactive`);
    }
  }

  console.log(`[publish] Done: ${inserted} published, ${failed} failed`);
}

main().catch((err) => {
  console.error("[publish] Fatal error:", err);
  process.exit(1);
});
