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
  const { data } = await sb
    .from("profiles")
    .select("id, name, claim_token, claimed_at, telegram_id, email, is_recommender, cv_score, headline")
    .ilike("name", "%fekadu nigussie%");
  console.log(`Fekadu Nigussie matches (${(data || []).length}):`);
  for (const p of data || []) {
    console.log(`  ${p.id}  ${p.name}`);
    console.log(`    email=${p.email}  tg=${p.telegram_id || "-"}  claimed=${p.claimed_at ? "YES @ " + p.claimed_at : "no"}`);
    console.log(`    claim_token=${p.claim_token || "MISSING"}  score=${p.cv_score}`);
    console.log(`    claim link=https://t.me/Devidends_Bot?start=claim_${p.claim_token || "NONE"}`);
  }
})();
