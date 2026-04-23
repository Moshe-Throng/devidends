/**
 * Bot + mini-app activity for the past 24 hours (rolling window).
 */

import * as fs from "fs";
import * as path from "path";
import { createClient } from "@supabase/supabase-js";

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
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: events } = await sb
    .from("events")
    .select("created_at, event, telegram_id, profile_id, metadata")
    .gte("created_at", since)
    .order("created_at", { ascending: true });
  const rows = events || [];

  console.log(`\n═══ 24h activity — since ${since.slice(0, 16).replace("T", " ")} UTC ═══`);
  console.log(`Total events: ${rows.length}\n`);

  const byEvent: Record<string, number> = {};
  for (const e of rows) byEvent[e.event] = (byEvent[e.event] || 0) + 1;
  console.log("Breakdown:");
  for (const [k, v] of Object.entries(byEvent).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(v).padStart(3)}  ${k}`);
  }

  // Mini-app opens
  const miniApp = rows.filter((e: any) => e.event === "mini_app_opened");
  const uniqueTgs = new Set<string>();
  const paths: Record<string, number> = {};
  for (const e of miniApp) {
    if (e.telegram_id) uniqueTgs.add(String(e.telegram_id));
    const p = (e.metadata as any)?.path || "(none)";
    paths[p] = (paths[p] || 0) + 1;
  }
  console.log(`\nMini-app: ${miniApp.length} opens from ${uniqueTgs.size} unique users`);
  for (const [p, c] of Object.entries(paths).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(c).padStart(3)}  ${p}`);
  }

  // Resolve tg_ids
  const tgIds = Array.from(uniqueTgs);
  const tgToName: Record<string, string> = {};
  if (tgIds.length > 0) {
    const { data: profs } = await sb
      .from("profiles")
      .select("telegram_id, name, claimed_at, is_recommender")
      .in("telegram_id", tgIds);
    for (const p of profs || []) {
      tgToName[String(p.telegram_id)] = `${p.name}${p.claimed_at ? " ✓" : " ○"}${p.is_recommender ? " [rec]" : ""}`;
    }
  }
  console.log(`\nUnique mini-app users (24h):`);
  for (const tg of tgIds) console.log(`  ${tg.padEnd(14)}  ${tgToName[tg] || "(no profile)"}`);

  // Claims
  const claims = rows.filter((e: any) => e.event === "claim_completed");
  console.log(`\nClaims completed (${claims.length}):`);
  for (const c of claims) {
    const when = c.created_at.slice(11, 19);
    const profile = tgToName[String(c.telegram_id)] || "(unresolved tg)";
    const meta = JSON.stringify(c.metadata).slice(0, 100);
    console.log(`  ${when}  tg=${c.telegram_id || "-"}  ${profile}  ${meta}`);
  }

  // CV ingests
  const ingests = rows.filter((e: any) => e.event === "cv_ingested" || e.event === "cv_updated");
  console.log(`\nCV ingests/updates (${ingests.length}):`);
  for (const ig of ingests) {
    const when = ig.created_at.slice(11, 19);
    const meta = ig.metadata as any;
    console.log(`  ${when}  ${ig.event.padEnd(12)}  ${meta?.name || "?"}  src=${meta?.source || "-"}  sender=${meta?.sender || "-"}  score=${meta?.score ?? "-"}`);
  }

  // Bot starts (new users)
  const starts = rows.filter((e: any) => e.event === "bot_started");
  console.log(`\nBot starts (${starts.length}):`);
  for (const s of starts) {
    const when = s.created_at.slice(11, 19);
    const meta = s.metadata as any;
    console.log(`  ${when}  tg=${s.telegram_id}  ${meta?.first_name || ""}${meta?.username ? " @" + meta.username : ""}`);
  }

  // Doc received events (diagnostic)
  const docs = rows.filter((e: any) => e.event === "doc_received");
  console.log(`\nDoc_received events (${docs.length}):`);
  for (const d of docs) {
    const when = d.created_at.slice(11, 19);
    const meta = d.metadata as any;
    console.log(`  ${when}  tg=${d.telegram_id}  file=${meta?.file_name || "?"}  group_match=${meta?.group_match}  topic_match=${meta?.topic_match}  chat_type=${meta?.chat_type}`);
  }

  // Attribution rows created in 24h
  const since24 = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: attrs } = await sb
    .from("attributions")
    .select("created_at, attribution_type, contributor_profile_id, firm_name, opportunity_title, stage")
    .gte("created_at", since24)
    .order("created_at", { ascending: true });
  console.log(`\nAttribution rows created (${(attrs || []).length}):`);
  for (const a of attrs || []) {
    console.log(`  ${a.created_at.slice(11, 19)}  ${a.attribution_type?.padEnd(20)}  ${a.firm_name}  ${a.opportunity_title?.slice(0, 60)}  [${a.stage}]`);
  }

  // Companion / drip messages sent
  const { data: drips } = await sb
    .from("drip_messages")
    .select("sent_at, telegram_id, message_type, trigger_type")
    .gte("sent_at", since24)
    .order("sent_at", { ascending: true });
  console.log(`\nDrip messages sent (${(drips || []).length}):`);
  for (const d of drips || []) {
    const meta = d as any;
    console.log(`  ${meta.sent_at?.slice(11, 19)}  tg=${d.telegram_id}  type=${d.message_type}  trigger=${d.trigger_type}`);
  }

  // Errors
  const { data: errs } = await sb
    .from("error_log")
    .select("created_at, context, message")
    .gte("created_at", since24)
    .order("created_at", { ascending: false })
    .limit(15);
  console.log(`\nErrors logged (${(errs || []).length}):`);
  for (const e of errs || []) {
    console.log(`  ${e.created_at.slice(11, 19)}  ${e.context}  ${(e.message || "").slice(0, 120)}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
