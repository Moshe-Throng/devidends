/**
 * For every recommender, show what happened today (claim, mini-app opens,
 * CV upload, etc.). Tied together by telegram_id and by claim_token metadata.
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

  const { data: recs } = await sb
    .from("profiles")
    .select("id, name, telegram_id, claim_token, claimed_at, email, cv_score")
    .eq("is_recommender", true);

  const { data: events } = await sb
    .from("events")
    .select("created_at, event, telegram_id, profile_id, metadata")
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: true });

  type Activity = { time: string; kind: string; detail: string };
  const perRec: Record<string, Activity[]> = {};

  for (const e of events || []) {
    // Match by telegram_id
    const recByTg = (recs || []).find((r: any) => r.telegram_id && String(e.telegram_id) === String(r.telegram_id));
    // Match by profile_id
    const recByProf = (recs || []).find((r: any) => e.profile_id && e.profile_id === r.id);
    // Match by claim_token in metadata (for claim_completed event)
    const meta = (e.metadata as any) || {};
    const recByToken = meta.token ? (recs || []).find((r: any) => r.claim_token === meta.token) : null;

    const match = recByToken || recByProf || recByTg;
    if (!match) continue;

    const time = e.created_at.slice(11, 19);
    let detail = "";
    if (e.event === "mini_app_opened") detail = meta.path || "";
    else if (e.event === "claim_completed") detail = `channel=${meta.channel || "-"}`;
    else if (e.event === "cv_ingested" || e.event === "cv_updated") detail = `score=${meta.score ?? "-"} src=${meta.source || "-"}`;
    else if (e.event === "bot_started") detail = meta.first_name || "";
    else detail = JSON.stringify(meta).slice(0, 80);

    if (!perRec[match.id]) perRec[match.id] = [];
    perRec[match.id].push({ time, kind: e.event, detail });
  }

  const active = (recs || [])
    .filter((r: any) => perRec[r.id])
    .sort((a: any, b: any) => (perRec[b.id]?.length || 0) - (perRec[a.id]?.length || 0));

  console.log(`\n═══ Recommender activity today (${sinceIso.slice(0,10)}) ═══`);
  console.log(`${active.length} of ${recs?.length || 0} recommenders had activity\n`);

  for (const r of active) {
    const tag = r.claimed_at ? "✓ claimed" : "○ unclaimed";
    const tg = r.telegram_id || "-";
    console.log(`\n${r.name}   [${tag}, tg=${tg}]`);
    for (const a of perRec[r.id]) {
      console.log(`  ${a.time}  ${a.kind.padEnd(18)}  ${a.detail}`);
    }
  }

  console.log(`\n─── Silent recommenders today (${(recs?.length || 0) - active.length}) ───`);
  console.log(`(not printed — no events in DB)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
