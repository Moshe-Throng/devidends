/**
 * Admin activity report — sends a summary to admin Telegram every 12 hours.
 * Covers: new profiles, CV ingestions, errors, scoring, claims, crawl health.
 *
 * Usage: npx tsx scripts/admin-report.ts
 * Cron: 0 6,18 * * * (6 AM and 6 PM UTC = 9 AM and 9 PM EAT)
 */

import * as path from "path";
import * as fs from "fs";

// Load env
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
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  const now = new Date();
  const halfDayAgo = new Date(now.getTime() - 12 * 60 * 60 * 1000).toISOString();
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const period = now.getUTCHours() < 12 ? "Morning" : "Evening";

  // --- Gather stats ---

  // Total profiles
  const { count: totalProfiles } = await sb.from("profiles").select("*", { count: "exact", head: true });

  // New profiles in last 12h
  const { data: newProfiles } = await sb.from("profiles").select("name, source, cv_score").gte("created_at", halfDayAgo);

  // Active opportunities
  const { count: activeOpps } = await sb.from("opportunities").select("*", { count: "exact", head: true }).eq("is_active", true);

  // Errors in last 12h
  const { data: errors } = await (sb.from("error_log") as any).select("source, severity, message, created_at").gte("created_at", halfDayAgo).order("created_at", { ascending: false }).limit(10);

  // Events in last 12h
  const { data: events } = await (sb.from("events") as any).select("event, metadata, created_at").gte("created_at", halfDayAgo);

  // Claims in last 12h
  const { data: claims } = await sb.from("profiles").select("name, claimed_at").not("claimed_at", "is", null).gte("claimed_at", halfDayAgo);

  // Subscriptions
  const { count: totalSubs } = await sb.from("subscriptions").select("*", { count: "exact", head: true }).eq("is_active", true);

  // --- Build report ---

  const eventCounts: Record<string, number> = {};
  for (const e of (events || [])) {
    eventCounts[e.event] = (eventCounts[e.event] || 0) + 1;
  }

  const newProfilesList = (newProfiles || []).map(p =>
    `  · ${p.name} (${p.source}, score: ${p.cv_score ?? "—"})`
  ).join("\n") || "  None";

  const errorsList = (errors || []).slice(0, 5).map(e =>
    `  · [${e.severity}] ${e.source}: ${(e.message || "").slice(0, 80)}`
  ).join("\n") || "  None";

  const claimsList = (claims || []).map(c =>
    `  · ${c.name}`
  ).join("\n") || "  None";

  const eventSummary = Object.entries(eventCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `  · ${k}: ${v}`)
    .join("\n") || "  None";

  // --- Profile breakdown ---
  const { data: allProfiles } = await sb.from("profiles").select("profile_type, source, cv_score, claimed_at, cv_structured_data");
  const byType: Record<string, number> = {};
  const bySource: Record<string, number> = {};
  let withCv = 0, withScore = 0, totalClaimed = 0;
  const scores: number[] = [];
  for (const p of (allProfiles || [])) {
    byType[p.profile_type || "Unknown"] = (byType[p.profile_type || "Unknown"] || 0) + 1;
    bySource[p.source || "unknown"] = (bySource[p.source || "unknown"] || 0) + 1;
    if (p.cv_structured_data) withCv++;
    if (p.cv_score != null) { withScore++; scores.push(p.cv_score); }
    if (p.claimed_at) totalClaimed++;
  }
  const avgScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
  const topScore = scores.length > 0 ? Math.max(...scores) : 0;

  // --- Opportunity sources ---
  const { data: oppsByDomain } = await sb.from("opportunities").select("source_domain").eq("is_active", true);
  const domainCounts: Record<string, number> = {};
  for (const o of (oppsByDomain || [])) domainCounts[o.source_domain] = (domainCounts[o.source_domain] || 0) + 1;
  const topSources = Object.entries(domainCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);

  // --- Crawler health: description coverage ---
  const { data: allOpps } = await sb.from("opportunities").select("source_domain, description").eq("is_active", true);
  const crawlerHealth: { source: string; total: number; withDesc: number; empty: number }[] = [];
  const healthMap: Record<string, { total: number; withDesc: number }> = {};
  let totalEmpty = 0;
  for (const o of (allOpps || [])) {
    const src = o.source_domain || "unknown";
    if (!healthMap[src]) healthMap[src] = { total: 0, withDesc: 0 };
    healthMap[src].total++;
    const desc = (o.description || "").trim();
    if (desc.length >= 100) {
      healthMap[src].withDesc++;
    } else {
      totalEmpty++;
    }
  }
  for (const [src, h] of Object.entries(healthMap)) {
    crawlerHealth.push({ source: src, total: h.total, withDesc: h.withDesc, empty: h.total - h.withDesc });
  }
  crawlerHealth.sort((a, b) => b.empty - a.empty);
  const healthPct = (allOpps || []).length > 0
    ? Math.round(((allOpps!.length - totalEmpty) / allOpps!.length) * 100)
    : 0;

  // --- Build report ---
  const typeSummary = Object.entries(byType).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}: ${v}`).join(" · ");
  const sourceSummary = Object.entries(bySource).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}: ${v}`).join(" · ");

  const report = [
    `<b>📊 Devidends ${period} Report</b>`,
    `<i>${now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })} · ${now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })} UTC</i>`,
    ``,
    `<b>━━━ Database ━━━</b>`,
    `👤 Profiles: <b>${totalProfiles}</b> (${withCv} with CV, ${totalClaimed} claimed)`,
    `💼 Opportunities: <b>${activeOpps}</b> active`,
    `🔔 Subscribers: <b>${totalSubs}</b>`,
    ``,
    `<b>━━━ Profile Breakdown ━━━</b>`,
    `By type: ${typeSummary}`,
    `By source: ${sourceSummary}`,
    `Avg score: <b>${avgScore}/100</b> (best: ${topScore})`,
    ``,
    `<b>━━━ Top Sources ━━━</b>`,
    ...topSources.map(([d, c]) => `  ${d}: ${c}`),
    ``,
    `<b>━━━ Crawler Health ━━━</b>`,
    `Description coverage: <b>${healthPct}%</b> (${(allOpps || []).length - totalEmpty}/${(allOpps || []).length})`,
    ...(totalEmpty > 0 ? [
      `Missing descriptions:`,
      ...crawlerHealth.filter(h => h.empty > 0).slice(0, 6).map(h =>
        `  ${h.source}: ${h.empty}/${h.total} empty`
      ),
    ] : [`  All sources healthy ✓`]),
    ``,
    `<b>━━━ Last 12h Activity ━━━</b>`,
    `  New profiles: <b>${(newProfiles || []).length}</b>`,
    `  Claims: <b>${(claims || []).length}</b>`,
    `  Errors: <b>${(errors || []).length}</b>`,
    `  Events: <b>${(events || []).length}</b>`,
    ``,
    ...(newProfiles && newProfiles.length > 0 ? [
      `<b>New Profiles</b>`,
      newProfilesList,
      ``,
    ] : []),
    ...(claims && claims.length > 0 ? [`<b>Claims</b>`, claimsList, ``] : []),
    ...(Object.keys(eventCounts).length > 0 ? [`<b>Events</b>`, eventSummary, ``] : []),
    ...(errors && errors.length > 0 ? [`<b>⚠️ Errors</b>`, errorsList, ``] : []),
    `<i>Next report in 12 hours</i>`,
  ].join("\n");

  // --- Send to admin via Telegram ---

  const adminTgIds = (process.env.ADMIN_TELEGRAM_IDS || "297659579").split(",").map(s => s.trim());
  const botToken = process.env.TELEGRAM_BOT_TOKEN;

  if (!botToken) {
    console.log("No TELEGRAM_BOT_TOKEN, printing report:");
    console.log(report.replace(/<\/?[^>]+>/g, ""));
    return;
  }

  for (const tgId of adminTgIds) {
    try {
      await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: tgId,
          text: report,
          parse_mode: "HTML",
          disable_web_page_preview: true,
        }),
      });
      console.log(`[admin-report] Sent to ${tgId}`);
    } catch (err: any) {
      console.error(`[admin-report] Failed to send to ${tgId}:`, err.message);
    }
  }

  console.log("[admin-report] Done");
}

main().catch((err) => {
  console.error("[admin-report] Fatal:", err);
  process.exit(1);
});
