/**
 * Overall platform state report — what's in the DB right now.
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

  const { data: profs } = await sb
    .from("profiles")
    .select("id, name, source, created_at, claimed_at, telegram_id, email, user_id, cv_text, cv_score, is_recommender, profile_type");

  const all = profs || [];
  const claimed = all.filter((p: any) => p.claimed_at);
  const withCv = all.filter((p: any) => p.cv_text && p.cv_text.length > 0);
  const scored = all.filter((p: any) => typeof p.cv_score === "number");
  const recs = all.filter((p: any) => p.is_recommender);

  const today = new Date(); today.setUTCHours(0,0,0,0);
  const week = new Date(Date.now() - 7*24*60*60*1000);
  const claimedToday = claimed.filter((p: any) => new Date(p.claimed_at) >= today);
  const claimedWeek = claimed.filter((p: any) => new Date(p.claimed_at) >= week);
  const cvToday = all.filter((p: any) => p.cv_text && new Date(p.created_at) >= today);
  const cvWeek = all.filter((p: any) => p.cv_text && new Date(p.created_at) >= week);
  const createdToday = all.filter((p: any) => new Date(p.created_at) >= today);
  const createdWeek = all.filter((p: any) => new Date(p.created_at) >= week);

  console.log(`\n═══ DEVIDENDS STATE (as of ${new Date().toISOString().slice(0,16).replace("T"," ")} UTC) ═══\n`);

  console.log(`📋 Profiles — ${all.length} total`);
  console.log(`   ${withCv.length.toString().padStart(4)}  have CV text`);
  console.log(`   ${scored.length.toString().padStart(4)}  have a CV score`);
  console.log(`   ${recs.length.toString().padStart(4)}  are recommenders (is_recommender=true)`);
  console.log(`   ${claimed.length.toString().padStart(4)}  claimed (claimed_at set)`);
  console.log(`   ${(all.length - claimed.length).toString().padStart(4)}  unclaimed\n`);

  console.log(`⏱  Activity windows`);
  console.log(`   Today UTC:   +${createdToday.length} new, +${cvToday.length} with CV, +${claimedToday.length} claims`);
  console.log(`   Last 7d:     +${createdWeek.length} new, +${cvWeek.length} with CV, +${claimedWeek.length} claims\n`);

  console.log(`🔗 By source (top)`);
  const bySource: Record<string, number> = {};
  for (const p of all) bySource[p.source || "unknown"] = (bySource[p.source || "unknown"] || 0) + 1;
  for (const [s, n] of Object.entries(bySource).sort((a,b) => b[1]-a[1]).slice(0, 8)) {
    console.log(`   ${n.toString().padStart(4)}  ${s}`);
  }

  console.log(`\n📊 By profile_type`);
  const byType: Record<string, number> = {};
  for (const p of all) byType[p.profile_type || "(none)"] = (byType[p.profile_type || "(none)"] || 0) + 1;
  for (const [s, n] of Object.entries(byType).sort((a,b) => b[1]-a[1])) {
    console.log(`   ${n.toString().padStart(4)}  ${s}`);
  }

  console.log(`\n📬 Identity channels (among claimed)`);
  const claimedWithTg = claimed.filter((p: any) => p.telegram_id);
  const claimedWithEmail = claimed.filter((p: any) => p.email);
  const claimedWithUser = claimed.filter((p: any) => p.user_id);
  console.log(`   ${claimedWithTg.length.toString().padStart(4)}  have telegram_id`);
  console.log(`   ${claimedWithEmail.length.toString().padStart(4)}  have email`);
  console.log(`   ${claimedWithUser.length.toString().padStart(4)}  have Supabase auth user_id linked (web-sign-in ready)`);

  // Subscriptions
  const { data: subs } = await sb
    .from("subscriptions")
    .select("id, email, telegram_id, channel, is_active");
  const activeSubs = (subs || []).filter((s: any) => s.is_active);
  console.log(`\n📣 Subscriptions — ${(subs || []).length} total, ${activeSubs.length} active (briefs paused for the rest)`);

  // Opportunities + news
  const { count: oppCount } = await sb
    .from("opportunities")
    .select("id", { count: "exact", head: true })
    .eq("is_active", true);
  console.log(`\n💼 Active opportunities in DB: ${oppCount || 0}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
