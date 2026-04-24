/**
 * The previous backfill used co_creators.status='joined' as the signal —
 * but send-cards-proper.ts was setting that on INSERT (when a card is
 * generated for someone), not when they actually joined via /cc/welcome.
 * So 46 people got falsely claimed.
 *
 * The REAL joiners are those with a co_creator_interactions row where
 * interaction_type='accepted_invite'. Keep those. Roll back the rest.
 * Keep Yonus (activity-based claim is legitimate).
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

(async () => {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  // 1. Build set of REAL cc joiners: profiles whose co_creator has
  //    accepted_invite interaction
  const { data: ccs } = await sb.from("co_creators").select("id, profile_id");
  const ccToProfile = new Map((ccs || []).map((c: any) => [c.id, c.profile_id]));

  const { data: accepts } = await sb
    .from("co_creator_interactions")
    .select("co_creator_id")
    .eq("interaction_type", "accepted_invite");
  const realJoinerProfileIds = new Set<string>();
  for (const a of accepts || []) {
    const pid = ccToProfile.get((a as any).co_creator_id);
    if (pid) realJoinerProfileIds.add(pid);
  }
  console.log(`Real cc-welcome joiners: ${realJoinerProfileIds.size}`);

  // 2. Preserve Yonus manually
  const { data: yonus } = await sb.from("profiles").select("id").ilike("name", "%yonus%fantahun%").maybeSingle();
  if (yonus) realJoinerProfileIds.add(yonus.id);

  // 3. Also preserve anyone who has telegram_id AND claimed via mini-app flow.
  //    Those already had proper claimed_at; they don't need rollback.
  //    Find them by looking at claim_completed events.
  const { data: claimEvents } = await sb
    .from("events")
    .select("telegram_id")
    .eq("event", "claim_completed")
    .not("telegram_id", "is", null);
  const tgsWithClaim = new Set((claimEvents || []).map((e: any) => String(e.telegram_id)));
  console.log(`Mini-app claim_completed events: ${tgsWithClaim.size} unique tg_ids`);

  const { data: allClaimed } = await sb
    .from("profiles")
    .select("id, name, telegram_id, claimed_at")
    .not("claimed_at", "is", null);

  for (const p of allClaimed || []) {
    if (p.telegram_id && tgsWithClaim.has(String(p.telegram_id))) {
      realJoinerProfileIds.add(p.id);
    }
  }

  // 4. Roll back false claims: clear claimed_at for anyone currently claimed
  //    who isn't in realJoinerProfileIds
  let rolled = 0;
  for (const p of allClaimed || []) {
    if (!realJoinerProfileIds.has(p.id)) {
      const { error } = await sb.from("profiles").update({ claimed_at: null }).eq("id", p.id);
      if (!error) {
        console.log(`  ✗ Rolled back: ${p.name}`);
        rolled++;
      }
    }
  }

  console.log(`\nRolled back ${rolled} false claims.`);

  // Also: fix the co_creators.status for anyone not actually joined
  // (set status back to 'invited' for non-real-joiners)
  let ccRolled = 0;
  for (const cc of ccs || []) {
    if (!realJoinerProfileIds.has((cc as any).profile_id)) {
      const { error } = await sb.from("co_creators").update({ status: "invited", joined_at: null }).eq("id", (cc as any).id).eq("status", "joined");
      if (!error) ccRolled++;
    }
  }
  console.log(`Rolled back ${ccRolled} co_creators.status from 'joined' to 'invited'`);

  // Final count
  const { count: unclaimed } = await sb
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("is_recommender", true)
    .is("claimed_at", null);
  const { count: claimedReal } = await sb
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("is_recommender", true)
    .not("claimed_at", "is", null);
  console.log(`\nCorrect state:`);
  console.log(`  Claimed recommenders:   ${claimedReal}`);
  console.log(`  Unclaimed recommenders: ${unclaimed}`);
})();
