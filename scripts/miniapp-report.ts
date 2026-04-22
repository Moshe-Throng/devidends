/**
 * Mini-app activity report for today (UTC).
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

  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const sinceIso = start.toISOString();

  // All events today
  const { data: events } = await sb
    .from("events")
    .select("created_at, event, telegram_id, profile_id, metadata")
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: true });

  const rows = events || [];
  console.log(`\n═══ Activity today (since ${sinceIso.slice(0,16).replace("T"," ")} UTC) — ${rows.length} events ═══\n`);

  // Event counts
  const byEvent: Record<string, number> = {};
  for (const e of rows) byEvent[e.event] = (byEvent[e.event] || 0) + 1;
  console.log("Event breakdown:");
  for (const [k, v] of Object.entries(byEvent).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(v).padStart(4)}  ${k}`);
  }

  // Unique tg_ids touching the mini app
  const miniAppEvents = rows.filter((e: any) => e.event === "mini_app_opened");
  const uniqueTgs = new Set<string>();
  const pathCount: Record<string, number> = {};
  for (const e of miniAppEvents) {
    if (e.telegram_id) uniqueTgs.add(String(e.telegram_id));
    const p = (e.metadata as any)?.path || "(none)";
    pathCount[p] = (pathCount[p] || 0) + 1;
  }
  console.log(`\nMini-app opens: ${miniAppEvents.length} (${uniqueTgs.size} unique TG users)`);
  console.log("  Paths:");
  for (const [p, c] of Object.entries(pathCount).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${String(c).padStart(3)}  ${p}`);
  }

  // Resolve TG ids to names
  const tgIds = Array.from(uniqueTgs);
  const profById: Record<string, string> = {};
  if (tgIds.length > 0) {
    const { data: profs } = await sb
      .from("profiles")
      .select("telegram_id, name, claimed_at")
      .in("telegram_id", tgIds);
    for (const p of profs || []) profById[String(p.telegram_id)] = `${p.name}${p.claimed_at ? " (claimed)" : " (unclaimed)"}`;
  }
  console.log("\nUnique mini-app users today:");
  for (const tg of tgIds) {
    console.log(`  tg=${tg.padEnd(14)}  ${profById[tg] || "(no profile)"}`);
  }

  // Claims today
  const claims = rows.filter((e: any) => e.event === "claim_completed");
  console.log(`\nClaims completed today: ${claims.length}`);
  for (const c of claims) {
    const when = c.created_at.slice(11, 19);
    console.log(`  ${when}  tg=${c.telegram_id || "-"}  ${JSON.stringify(c.metadata).slice(0, 120)}`);
  }

  // CV ingested today
  const ingests = rows.filter((e: any) => e.event === "cv_ingested" || e.event === "cv_updated");
  console.log(`\nCVs ingested/updated today: ${ingests.length}`);
  for (const ig of ingests) {
    const when = ig.created_at.slice(11, 19);
    console.log(`  ${when}  ${ig.event.padEnd(12)}  ${JSON.stringify(ig.metadata).slice(0, 140)}`);
  }

  // bot_started today (new users)
  const starts = rows.filter((e: any) => e.event === "bot_started");
  console.log(`\nNew bot starts today: ${starts.length}`);
  for (const s of starts) {
    const when = s.created_at.slice(11, 19);
    const meta = (s.metadata as any) || {};
    console.log(`  ${when}  tg=${s.telegram_id || "-"}  ${meta.first_name || ""}${meta.username ? " @"+meta.username : ""}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
