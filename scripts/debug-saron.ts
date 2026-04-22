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

  // Both Saron profiles
  const { data: sarons } = await sb
    .from("profiles")
    .select("id, name, telegram_id, claim_token, claimed_at, source, cv_text, cv_score, email, is_recommender, created_at, updated_at")
    .ilike("name", "%saron%");
  console.log("Profiles matching 'saron':");
  for (const p of sarons || []) {
    const hasCv = !!p.cv_text;
    console.log(`  ${p.id}  name='${p.name}'  tg=${p.telegram_id||"-"}  claim=${p.claim_token||"-"}  claimed=${p.claimed_at?"YES":"no"}  cv=${hasCv}  score=${p.cv_score??"-"}  source=${p.source}  created=${p.created_at?.slice(0,10)}`);
  }

  // All events where telegram_id = 1722419375 (Saron's TG id from earlier report)
  const { data: events } = await sb
    .from("events")
    .select("created_at, event, telegram_id, profile_id, metadata")
    .or("telegram_id.eq.1722419375," + (sarons||[]).map((p:any)=>`profile_id.eq.${p.id}`).join(","))
    .order("created_at", { ascending: true });
  console.log("\nEvents tied to Saron's tg (1722419375) or any Saron profile_id:");
  for (const e of events || []) {
    console.log(`  ${e.created_at.slice(11, 19)}  ${e.event.padEnd(18)}  tg=${e.telegram_id||"-"}  pid=${e.profile_id||"-"}  ${JSON.stringify(e.metadata).slice(0,160)}`);
  }

  // Any profile with telegram_id=1722419375?
  const { data: byTg } = await sb.from("profiles").select("id, name, telegram_id, claim_token, claimed_at").eq("telegram_id", "1722419375");
  console.log("\nProfiles with telegram_id=1722419375:", byTg);
})();
