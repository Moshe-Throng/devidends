/**
 * Backfill profiles.claimed_at for anyone whose co_creators.status = 'joined'
 * but who hasn't been marked claimed. These people already explicitly joined
 * via /cc/welcome — they should be considered claimed.
 *
 * Also manually set Yonus Fantahun as claimed since his bot activity
 * (subscription since March, CV contributions) is proof of commitment
 * even without going through either formal flow.
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

  // 1. Find all co_creators with status='joined' whose profile isn't claimed
  const { data: joined } = await sb
    .from("co_creators")
    .select("id, profile_id, name, status, joined_at")
    .eq("status", "joined")
    .not("profile_id", "is", null);
  console.log(`Found ${(joined || []).length} co_creators with status='joined'`);

  let backfilled = 0;
  for (const cc of joined || []) {
    const { data: prof } = await sb
      .from("profiles")
      .select("id, name, claimed_at")
      .eq("id", cc.profile_id)
      .maybeSingle();
    if (!prof) continue;
    if (prof.claimed_at) continue;
    const when = cc.joined_at || new Date().toISOString();
    const { error } = await sb.from("profiles").update({ claimed_at: when }).eq("id", prof.id);
    if (error) { console.log(`  ✗ ${prof.name}: ${error.message}`); continue; }
    console.log(`  ✓ ${prof.name}  claimed_at=${when.slice(0, 10)}`);
    backfilled++;
  }

  // 2. Special case: Yonus
  const { data: yonus } = await sb
    .from("profiles")
    .select("id, name, claimed_at")
    .ilike("name", "%yonus%fantahun%")
    .maybeSingle();
  if (yonus && !yonus.claimed_at) {
    await sb.from("profiles").update({ claimed_at: "2026-03-01T00:00:00Z" }).eq("id", yonus.id);
    console.log(`  ✓ Yonus Fantahun manually marked claimed (activity-based)`);
    backfilled++;
  }

  console.log(`\nBackfilled ${backfilled} profiles.`);

  // 3. Show updated unclaimed-recommender count
  const { count } = await sb
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("is_recommender", true)
    .is("claimed_at", null);
  console.log(`Unclaimed recommenders now: ${count}`);
})();
