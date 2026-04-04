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

const FORMAT_SYSTEM = `You format job/opportunity descriptions into clean, scannable markdown. Rules:
- Use ## for section headers (Responsibilities, Qualifications, About, How to Apply, etc.)
- Use - for bullet points
- Keep ALL factual content — never add, remove, or rephrase information
- If already well-formatted, return as-is
- If very short or just a title, return unchanged
- Output ONLY the formatted description, nothing else.`;

async function formatDescription(raw: string): Promise<string> {
  if (!raw || raw.length < 100) return raw; // Too short to format
  // Already formatted (has markdown)
  if ((raw.includes("##") || raw.includes("**")) && (raw.includes("- ") || raw.includes("• "))) {
    return raw;
  }

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
  const rows = opportunities.map((opp: any) => {
    const rf = opp.raw_fields || {};
    return {
      title: (opp.title || "").slice(0, 500),
      description: (opp.description || "").slice(0, 10000),
      deadline: parseDeadline(opp.deadline),
      organization: (opp.organization || "Unknown").slice(0, 200),
      country: (opp.country || "Ethiopia").slice(0, 100),
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

  // Format descriptions with Claude Haiku (only unformatted ones)
  console.log(`[publish] Formatting descriptions with Claude Haiku...`);
  let formatCount = 0;
  for (let i = 0; i < rows.length; i++) {
    const raw = rows[i].description;
    if (raw && raw.length >= 100) {
      const hasMarkdown = (raw.includes("##") || raw.includes("**")) && (raw.includes("- ") || raw.includes("• "));
      if (!hasMarkdown) {
        rows[i].description = await formatDescription(raw);
        formatCount++;
        // Rate limit: ~5 per second
        if (formatCount % 5 === 0) await new Promise(r => setTimeout(r, 1000));
      }
    }
  }
  console.log(`[publish] Formatted ${formatCount} descriptions`);

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
