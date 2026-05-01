/**
 * Publish crawled opportunities from _all_normalized.json to Supabase.
 * Called after crawl engine completes.
 *
 * Usage: npx tsx scripts/publish-to-supabase.ts
 *
 * Strategy: upsert by source_url (dedup), format descriptions with Claude Haiku,
 * deactivate expired listings.
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

/* ── Description formatter (Claude Haiku) ── */

const FORMAT_SYSTEM = `You restructure job and opportunity descriptions into clean, scannable markdown. Output is rendered to job-seekers reading on Telegram and on a mobile web app, so a wall-of-text input becomes a poor user experience and must be sectioned.

REQUIRED structure — produce these sections in this order, omitting any section the source genuinely has no content for:

## About the role
A 2-3 sentence summary of the position and the hiring organisation's context. Pull it from the source's opening paragraph or the role overview if there is one.

## Responsibilities
- Bullet points, one per responsibility
- Use the exact phrasing from the source where possible
- Group related duties into single bullets rather than fragmenting

## Qualifications
- Bullet points covering education, experience, skills, languages
- Distinguish 'Required' from 'Preferred' as sub-headings only if the source does
- Quantitative requirements (e.g. years of experience, degree level) must survive verbatim

## How to apply
A short paragraph or single bullet covering deadline, application method, contact, and links if any.

RULES:
- Keep ALL factual content. Never add, remove, infer, or rephrase substantive information. The output is a structural rewrite, not editorial.
- If the source already has these exact sections in this order with bullets, return the input unchanged.
- If the source is genuinely too short for sections (under ~150 characters of useful body), return it unchanged.
- Use - for bullets. Do not use bold inside bullets unless the source had bold.
- Output ONLY the formatted markdown, with no preamble or commentary.`;

async function formatDescription(raw: string): Promise<string> {
  if (!raw || raw.length < 150) return raw; // Too short to benefit from structure
  try {
    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    const client = new Anthropic();
    const msg = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 3000,
      system: FORMAT_SYSTEM,
      messages: [{ role: "user", content: "Format this job description:\n\n" + raw.slice(0, 8000) }],
    });
    return (msg.content[0] as { text: string }).text || raw;
  } catch (err) {
    console.warn("[publish] Format failed, using raw description:", (err as Error).message?.slice(0, 80));
    return raw;
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
  let rows = opportunities.map((opp: any) => {
    const rf = opp.raw_fields || {};
    return {
      title: (opp.title || "").slice(0, 500),
      description: (opp.description || "").slice(0, 10000),
      deadline: parseDeadline(opp.deadline),
      organization: (opp.organization || "Unknown").slice(0, 200),
      // Do NOT default to "Ethiopia". The relevance filter relies on
      // honest empties to drop rows whose location couldn't be parsed.
      country: (opp.country || "").slice(0, 100),
      source_url: (opp.source_url || opp.url || "").slice(0, 1000),
      source_domain: (opp.source_domain || "").slice(0, 200),
      type: opp.classified_type || opp.content_type || opp.type || "job",
      experience_level: opp.seniority || null,
      sectors: opp.sectors || [],
      is_active: true,
      scraped_at: opp.scraped_at || new Date().toISOString(),
      // Devisor intelligence fields
      budget_min: rf.budget_min ?? null,
      budget_max: rf.budget_max ?? null,
      procurement_method: rf.procurement_method ?? null,
      pipeline_stage: rf.pipeline_stage ?? null,
      donor_ref: rf.donor_ref ?? null,
      framework: rf.framework ?? null,
      signal_type: rf.signal_type ?? null,
      signal_confidence: rf.signal_confidence ?? null,
    };
  }).filter((r: any) => r.source_url && r.title);

  // Pre-publish dedup: same title + same normalized org → keep the one with more description
  const ORG_ALIASES: Record<string, string> = {
    "pin": "people in need", "irc": "international rescue committee",
    "si": "solidarites international", "hi": "humanity & inclusion",
    "handicap international - humanity & inclusion": "humanity & inclusion",
    "drc": "danish refugee council", "danish refugee council (drc)": "danish refugee council",
    "nrc": "norwegian refugee council",
  };
  function normOrg(o: string) { const l = o.toLowerCase().trim(); return ORG_ALIASES[l] || l; }
  const titleMap = new Map<string, number>();
  const keepFlags = new Array(rows.length).fill(true);
  for (let i = 0; i < rows.length; i++) {
    const key = `${(rows[i].title || "").toLowerCase().trim()}|${normOrg(rows[i].organization || "")}`;
    if (titleMap.has(key)) {
      const prevIdx = titleMap.get(key)!;
      const prevLen = (rows[prevIdx].description || "").length;
      const curLen = (rows[i].description || "").length;
      if (curLen > prevLen) {
        keepFlags[prevIdx] = false;
        titleMap.set(key, i);
      } else {
        keepFlags[i] = false;
      }
    } else {
      titleMap.set(key, i);
    }
  }
  const beforeDedup = rows.length;
  rows = rows.filter((_: any, i: number) => keepFlags[i]);
  if (beforeDedup !== rows.length) {
    console.log(`[publish] Title-dedup: removed ${beforeDedup - rows.length} cross-source duplicates`);
  }

  // Enrichment pass — for rows whose description is empty or stub-ish
  // (< 400 chars catches GGGI's "Contract type: X" boilerplate too),
  // fetch the source URL via Cheerio first with a Puppeteer fallback
  // for the JS-rendered domains in lib/enrich-descriptions.ts. Cap is
  // 250 rows per run so we cover the long tail without blowing past
  // the cron envelope (~3 concurrent × 500ms ≈ 7 minutes wall time).
  const ENRICH_THRESHOLD = 400;
  const ENRICH_CAP = 250;
  const thinIdxs: number[] = [];
  for (let i = 0; i < rows.length; i++) {
    const len = (rows[i].description || "").length;
    if (len < ENRICH_THRESHOLD && rows[i].source_url) {
      thinIdxs.push(i);
      if (thinIdxs.length >= ENRICH_CAP) break;
    }
  }
  if (thinIdxs.length > 0) {
    console.log(`[publish] Enriching ${thinIdxs.length} thin/empty descriptions via lib/enrich-descriptions...`);
    try {
      const { enrichBatch } = await import("@/lib/enrich-descriptions");
      const items = thinIdxs.map((i) => ({
        source_url: rows[i].source_url,
        source_domain: rows[i].source_domain,
      }));
      const enriched = await enrichBatch(items, 3, 500, true);
      let hits = 0;
      for (const i of thinIdxs) {
        const got = enriched.get(rows[i].source_url);
        if (got && got.length > (rows[i].description || "").length) {
          rows[i].description = got.slice(0, 10000);
          hits++;
        }
      }
      console.log(`[publish] Enrichment recovered ${hits}/${thinIdxs.length} descriptions`);
    } catch (err) {
      console.warn(`[publish] Enrichment skipped:`, (err as Error).message?.slice(0, 200));
    }
  }

  // Structure-pass every substantial description with Haiku — the prompt
  // is idempotent so already-structured rows return unchanged. We removed
  // the prior "skip if has-markdown" gate because the detector misfired
  // on rows that had inline ** without proper sections, leaving wall-of-
  // text descriptions in the channel digest.
  console.log(`[publish] Structuring descriptions with Claude Haiku...`);
  let formatCount = 0;
  for (let i = 0; i < rows.length; i++) {
    const raw = rows[i].description;
    if (raw && raw.length >= 150) {
      rows[i].description = await formatDescription(raw);
      formatCount++;
      if (formatCount % 5 === 0) await new Promise(r => setTimeout(r, 1000));
    }
  }
  console.log(`[publish] Structured ${formatCount} descriptions`);

  // Quality gate: every row must have a structured OR substantial description.
  // Anything that didn't get sectioned by Haiku and is still under 300 chars
  // gets is_active=false at publish time so it won't appear in the digest,
  // the mini-app feed, or the public opportunity list. Title-only stubs and
  // "Visit the source link..." placeholders fall here. Mussie's bar:
  // "no job passes without a structured description."
  function isStructured(s: string): boolean {
    return /^## (About|Responsibilities|Qualifications|How to apply|How to Apply)/im.test(s) && /^- /m.test(s);
  }
  let demoted = 0;
  for (const r of rows) {
    const desc = r.description || "";
    const passes = isStructured(desc) || desc.length >= 300;
    if (!passes && r.is_active) {
      r.is_active = false;
      demoted++;
    }
  }
  if (demoted > 0) {
    console.log(`[publish] Demoted ${demoted} unstructured / stub-description rows to is_active=false`);
  }

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

  // Mark listings as inactive ONLY if their deadline has passed (not based on crawl presence).
  // This prevents wiping out jobs from scrapers that are temporarily broken.
  const now = new Date();
  const { data: withDeadlines } = await supabase
    .from("opportunities")
    .select("id, deadline")
    .eq("is_active", true)
    .not("deadline", "is", null);

  if (withDeadlines) {
    const expiredIds = withDeadlines
      .filter((e: any) => new Date(e.deadline) < now)
      .map((e: any) => e.id);

    if (expiredIds.length > 0) {
      // Batch deactivation in chunks (Supabase .in() has a limit)
      for (let i = 0; i < expiredIds.length; i += 100) {
        await supabase
          .from("opportunities")
          .update({ is_active: false })
          .in("id", expiredIds.slice(i, i + 100));
      }
      console.log(`[publish] Deactivated ${expiredIds.length} expired listings (past deadline)`);
    }
  }

  // Also deactivate very old listings with NO deadline (scraped > 60 days ago)
  const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000).toISOString();
  const { count: staleNoDeadline } = await supabase
    .from("opportunities")
    .update({ is_active: false })
    .eq("is_active", true)
    .is("deadline", null)
    .lt("scraped_at", sixtyDaysAgo);
  if (staleNoDeadline && staleNoDeadline > 0) {
    console.log(`[publish] Deactivated ${staleNoDeadline} stale listings (no deadline, >60 days old)`);
  }

  console.log(`[publish] Done: ${inserted} published, ${failed} failed`);
}

main().catch((err) => {
  console.error("[publish] Fatal error:", err);
  process.exit(1);
});
