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

  const report = [
    `<b>📊 Devidends ${period} Report</b>`,
    `<i>${now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })} · ${now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })} UTC</i>`,
    ``,
    `<b>Database</b>`,
    `  Profiles: ${totalProfiles}`,
    `  Active opportunities: ${activeOpps}`,
    `  Subscribers: ${totalSubs}`,
    ``,
    `<b>Last 12 hours</b>`,
    `  New profiles: ${(newProfiles || []).length}`,
    `  Claims: ${(claims || []).length}`,
    `  Errors: ${(errors || []).length}`,
    `  Events: ${(events || []).length}`,
    ``,
    ...(newProfiles && newProfiles.length > 0 ? [`<b>New Profiles</b>`, newProfilesList, ``] : []),
    ...(claims && claims.length > 0 ? [`<b>Claims</b>`, claimsList, ``] : []),
    ...(Object.keys(eventCounts).length > 0 ? [`<b>Events</b>`, eventSummary, ``] : []),
    ...(errors && errors.length > 0 ? [`<b>⚠️ Errors</b>`, errorsList, ``] : []),
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
