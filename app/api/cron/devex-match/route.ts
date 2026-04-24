import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * GET /api/cron/devex-match
 *
 * Runs on a daily cron (or manual trigger). For every unmatched row in
 * devex_benchmark, tries to match it against opportunities using:
 *   1. Exact URL (unlikely — Devex hides real source URLs behind their own)
 *   2. Fuzzy title + organization match
 *   3. Title-only fallback with a high threshold
 *
 * Tags match_method + match_confidence + matched_opportunity_id.
 * Extracts miss_domain from resolved_url for unmatched rows.
 *
 * Posts a daily coverage summary to admin Telegram on completion.
 */

export const maxDuration = 120;

const ADMIN_TG = "297659579";

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

function normalizeTitle(s: string): string {
  return (s || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\b(consultant|individual|senior|junior|expert|specialist|officer|advisor|manager|lead|international|national)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function titleSimilarity(a: string, b: string): number {
  const na = new Set(normalizeTitle(a).split(" ").filter((w) => w.length >= 3));
  const nb = new Set(normalizeTitle(b).split(" ").filter((w) => w.length >= 3));
  if (na.size === 0 || nb.size === 0) return 0;
  let inter = 0;
  for (const w of na) if (nb.has(w)) inter++;
  return inter / Math.min(na.size, nb.size);
}

function extractDomain(url: string): string | null {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

async function notifyAdmin(text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: ADMIN_TG, text, parse_mode: "HTML", disable_web_page_preview: true }),
    });
  } catch {}
}

export async function GET(_req: NextRequest) {
  const sb = getAdmin();

  // Fetch unmatched rows (no matched_opportunity_id + no match_method yet)
  const { data: rows } = await sb
    .from("devex_benchmark")
    .select("id, title, url, organization, country, posted_date, batch_date, alert_type")
    .is("matched_opportunity_id", null)
    .is("match_method", null)
    .limit(500);

  if (!rows || rows.length === 0) {
    return NextResponse.json({ ok: true, processed: 0, note: "nothing to match" });
  }

  // Load a recent opportunities slice (4 weeks window — enough for fuzzy matching)
  const since = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000).toISOString();
  const { data: opps } = await sb
    .from("opportunities")
    .select("id, title, organization, country, source_url, source_domain, scraped_at")
    .gte("scraped_at", since)
    .limit(5000);
  const oppList = opps || [];

  let matched = 0;
  let unmatched = 0;

  for (const r of rows) {
    const urlDomain = extractDomain(r.url || "") || null;
    // 1. Exact URL match
    let match: any = null;
    let method: string | null = null;
    let conf = 0;

    if (r.url) {
      const found = oppList.find((o: any) => (o.source_url || "").toLowerCase() === (r.url || "").toLowerCase());
      if (found) { match = found; method = "exact_url"; conf = 1.0; }
    }

    // 2. Fuzzy title + organization
    if (!match && r.title) {
      let best: any = null;
      let bestScore = 0;
      for (const o of oppList) {
        const tSim = titleSimilarity(r.title, o.title || "");
        if (tSim < 0.5) continue;
        let score = tSim;
        // Organization bonus if both present and aligned
        if (r.organization && o.organization) {
          const oSim = titleSimilarity(r.organization, o.organization);
          score = score * 0.7 + oSim * 0.3;
        }
        if (score > bestScore) { bestScore = score; best = o; }
      }
      if (best && bestScore >= 0.6) {
        match = best;
        method = bestScore >= 0.8 ? "fuzzy_title" : "title_weak";
        conf = bestScore;
      }
    }

    if (match) {
      await sb
        .from("devex_benchmark")
        .update({
          matched_opportunity_id: match.id,
          match_method: method,
          match_confidence: conf,
          matched_at: new Date().toISOString(),
        })
        .eq("id", r.id);
      matched++;
    } else {
      await sb
        .from("devex_benchmark")
        .update({
          match_method: "none",
          miss_domain: urlDomain,
          matched_at: new Date().toISOString(),
        })
        .eq("id", r.id);
      unmatched++;
    }
  }

  // Coverage summary for most recent batch_date
  const { data: summary } = await sb
    .from("devex_coverage_daily")
    .select("*")
    .order("batch_date", { ascending: false })
    .limit(7);

  const lines = [
    `<b>📊 Devex match run complete</b>`,
    ``,
    `Processed this run: ${rows.length}`,
    `  Matched: <b>${matched}</b>`,
    `  Missed:  <b>${unmatched}</b>`,
    ``,
    `<b>7-day coverage:</b>`,
    ...(summary || []).map((s: any) => `  ${s.batch_date} · ${s.alert_type} · ${s.matched}/${s.total_entries} (${Math.round((s.coverage_pct || 0) * 100)}%)`),
  ];

  // Top miss domains
  const { data: misses } = await sb
    .from("devex_miss_domains")
    .select("*")
    .order("miss_count", { ascending: false })
    .limit(8);
  if (misses && misses.length > 0) {
    lines.push(``, `<b>Top miss domains</b> (crawler backlog):`);
    for (const m of misses) lines.push(`  ${m.miss_count}× ${m.miss_domain}`);
  }

  await notifyAdmin(lines.join("\n"));

  return NextResponse.json({ ok: true, processed: rows.length, matched, unmatched });
}
