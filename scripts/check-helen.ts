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

  const { data: helens } = await sb
    .from("profiles")
    .select("id, name, telegram_id, claim_token, claimed_at, email, cv_score, is_recommender, created_at, updated_at")
    .ilike("name", "%helen%");
  console.log(`Helen profiles (${helens?.length || 0}):`);
  for (const h of helens || []) {
    console.log(`  ${h.id}  ${h.name}`);
    console.log(`    tg=${h.telegram_id||"-"}  claimed=${h.claimed_at?"YES @ "+h.claimed_at:"no"}  email=${h.email||"-"}  score=${h.cv_score??"-"}  updated=${h.updated_at?.slice(0,16)}`);
  }

  // Any events for Helen
  for (const h of helens || []) {
    const { data: events } = await sb
      .from("events")
      .select("created_at, event, telegram_id, metadata")
      .eq("profile_id", h.id)
      .order("created_at", { ascending: false })
      .limit(5);
    if (events && events.length) {
      console.log(`\nEvents for ${h.name}:`);
      for (const e of events) {
        console.log(`  ${e.created_at.slice(0, 16).replace("T", " ")}  ${e.event}  ${JSON.stringify(e.metadata).slice(0, 100)}`);
      }
    }
  }
})();
