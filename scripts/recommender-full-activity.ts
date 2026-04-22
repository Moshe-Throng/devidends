/**
 * Full platform activity report for ALL recommenders.
 *
 * Pulls from every log surface we have:
 *   - events                  (trackEvent)
 *   - co_creator_interactions (per-recommender interactions)
 *   - drip_messages           (AI companion proactive messages)
 *   - subscriptions           (brief delivery state)
 *
 * Matched to recommenders by telegram_id, profile_id, claim_token, email.
 *
 * Usage: npx tsx scripts/recommender-full-activity.ts [--days 30] [--active]
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

type Rec = {
  id: string;
  name: string;
  telegram_id: string | null;
  email: string | null;
  claim_token: string | null;
  claimed_at: string | null;
  cv_score: number | null;
};

async function main() {
  const args = process.argv.slice(2);
  const days = args.includes("--days") ? parseInt(args[args.indexOf("--days") + 1] || "30", 10) : 30;
  const onlyActive = args.includes("--active");

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  const sinceIso = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const { data: recs } = await sb
    .from("profiles")
    .select("id, name, telegram_id, email, claim_token, claimed_at, cv_score")
    .eq("is_recommender", true);

  const recList = (recs || []) as Rec[];
  const byId = new Map<string, Rec>(recList.map((r) => [r.id, r]));
  const byTg = new Map<string, Rec>(recList.filter((r) => r.telegram_id).map((r) => [String(r.telegram_id), r]));
  const byEmail = new Map<string, Rec>(recList.filter((r) => r.email).map((r) => [r.email!.toLowerCase(), r]));
  const byToken = new Map<string, Rec>(recList.filter((r) => r.claim_token).map((r) => [r.claim_token!, r]));

  type Hit = { t: string; kind: string; detail: string };
  const perRec: Record<string, Hit[]> = {};
  const add = (r: Rec, h: Hit) => {
    if (!perRec[r.id]) perRec[r.id] = [];
    perRec[r.id].push(h);
  };

  // 1. events
  const { data: events } = await sb
    .from("events")
    .select("created_at, event, telegram_id, profile_id, metadata")
    .gte("created_at", sinceIso);
  for (const e of events || []) {
    const meta = (e.metadata as any) || {};
    let rec: Rec | undefined =
      (e.profile_id && byId.get(e.profile_id)) ||
      (e.telegram_id && byTg.get(String(e.telegram_id))) ||
      (meta.token && byToken.get(meta.token)) ||
      undefined;
    if (!rec) continue;
    let detail = "";
    if (e.event === "mini_app_opened") detail = meta.path || "";
    else if (e.event === "claim_completed") detail = `channel=${meta.channel || "-"}`;
    else if (e.event === "cv_ingested" || e.event === "cv_updated") detail = `score=${meta.score ?? "-"} src=${meta.source || "-"}`;
    else if (e.event === "bot_started") detail = `${meta.first_name || ""}${meta.username ? " @" + meta.username : ""}`;
    else if (e.event === "digest_sent") detail = `jobs=${meta.jobs_count ?? "-"}`;
    else if (e.event === "companion_reply" || e.event === "companion_proactive") detail = `trigger=${meta.trigger || "-"}`;
    else if (e.event === "opportunity_viewed") detail = meta.title?.slice(0, 60) || "";
    else if (e.event === "cv_scored") detail = `score=${meta.score ?? "-"}`;
    else if (e.event === "referral_shared") detail = meta.via || "";
    else detail = JSON.stringify(meta).slice(0, 80);
    add(rec, { t: e.created_at.slice(0, 16).replace("T", " "), kind: e.event, detail });
  }

  // 2. co_creator_interactions (by profile_id via co_creators)
  const { data: ccs } = await sb.from("co_creators").select("id, profile_id");
  const ccIdToProfId = new Map<string, string>((ccs || []).map((c: any) => [c.id, c.profile_id]));
  const { data: ccis } = await sb
    .from("co_creator_interactions")
    .select("created_at, co_creator_id, direction, interaction_type, channel, content, metadata")
    .gte("created_at", sinceIso);
  for (const i of ccis || []) {
    const profId = ccIdToProfId.get((i as any).co_creator_id);
    if (!profId) continue;
    const rec = byId.get(profId);
    if (!rec) continue;
    add(rec, {
      t: i.created_at.slice(0, 16).replace("T", " "),
      kind: `cc_${(i as any).direction || "?"}_${(i as any).interaction_type || "?"}`,
      detail: ((i as any).content || "").slice(0, 100),
    });
  }

  // 3. drip_messages (AI companion)
  const { data: drips } = await sb
    .from("drip_messages")
    .select("sent_at, telegram_id, profile_id, message_type, trigger_type")
    .gte("sent_at", sinceIso);
  for (const d of drips || []) {
    const rec = (d.profile_id && byId.get(d.profile_id)) || (d.telegram_id && byTg.get(String(d.telegram_id))) || undefined;
    if (!rec) continue;
    add(rec, {
      t: (d as any).sent_at?.slice(0, 16).replace("T", " ") || "",
      kind: `drip_${(d as any).message_type || "?"}`,
      detail: `trigger=${(d as any).trigger_type || "-"}`,
    });
  }

  // 4. subscriptions (state, not event — just note the current state)
  const { data: subs } = await sb.from("subscriptions").select("telegram_id, email, channel, is_active, created_at");
  const subByTg = new Map<string, any>();
  const subByEmail = new Map<string, any>();
  for (const s of subs || []) {
    if (s.telegram_id) subByTg.set(String(s.telegram_id), s);
    if (s.email) subByEmail.set((s.email as string).toLowerCase(), s);
  }

  // Sort each recommender's hits chronologically
  for (const recId in perRec) perRec[recId].sort((a, b) => a.t.localeCompare(b.t));

  // Totals
  const totalWithAnyActivity = Object.keys(perRec).length;
  console.log(`\n╔════════════════════════════════════════════════════════════╗`);
  console.log(`║  Recommender activity report  (window = ${days}d, as of ${new Date().toISOString().slice(0, 10)})  ║`);
  console.log(`╚════════════════════════════════════════════════════════════╝`);
  console.log(`Total recommenders: ${recList.length}`);
  console.log(`  with any activity: ${totalWithAnyActivity}`);
  console.log(`  silent:            ${recList.length - totalWithAnyActivity}\n`);

  const active = recList.filter((r) => perRec[r.id]).sort((a, b) => (perRec[b.id]?.length || 0) - (perRec[a.id]?.length || 0));
  const silent = recList.filter((r) => !perRec[r.id]);

  for (const r of active) {
    const tag = r.claimed_at ? "✓ claimed" : "○ unclaimed";
    const tgTag = r.telegram_id ? `tg=${r.telegram_id}` : "no-tg";
    const sub = (r.telegram_id && subByTg.get(String(r.telegram_id))) || (r.email && subByEmail.get(r.email.toLowerCase()));
    const subTag = sub ? (sub.is_active ? `sub:${sub.channel}` : "sub:paused") : "no-sub";
    console.log(`\n┌─ ${r.name}  [${tag}, ${tgTag}, ${subTag}]  (${perRec[r.id].length} events)`);
    // Count events by kind
    const kinds: Record<string, number> = {};
    for (const h of perRec[r.id]) kinds[h.kind] = (kinds[h.kind] || 0) + 1;
    const kindLine = Object.entries(kinds)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `${k}×${v}`)
      .join(" · ");
    console.log(`│  ${kindLine}`);
    console.log(`│`);
    for (const h of perRec[r.id].slice(-8)) {
      console.log(`│  ${h.t}  ${h.kind.padEnd(22)}  ${h.detail}`);
    }
    console.log(`└─`);
  }

  if (!onlyActive) {
    console.log(`\n── Silent recommenders (${silent.length}) ──`);
    for (const r of silent) {
      const sub = (r.telegram_id && subByTg.get(String(r.telegram_id))) || (r.email && subByEmail.get((r.email || "").toLowerCase()));
      const subTag = sub ? (sub.is_active ? `sub:${sub.channel}` : "sub:paused") : "no-sub";
      const status = r.claimed_at ? "claimed" : "unclaimed";
      console.log(`  ${r.name.padEnd(32)}  ${status.padEnd(9)}  tg=${(r.telegram_id || "-").padEnd(14)}  ${subTag}`);
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
