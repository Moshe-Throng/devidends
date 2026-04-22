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
  const names = ["fekadu", "yixin", "samuel nadew", "yitna"];
  for (const n of names) {
    const pattern = "%" + n.split(/\s+/).join("%") + "%";
    const { data } = await sb
      .from("profiles")
      .select("id, name, is_recommender, claim_token, claimed_at, cv_score")
      .ilike("name", pattern);
    console.log(`\n${n} → ${pattern}:`);
    for (const p of data || []) {
      console.log(`  ${p.name}  rec=${p.is_recommender}  claim=${p.claim_token || "-"}  claimed=${p.claimed_at ? "YES" : "no"}  score=${p.cv_score ?? "-"}`);
    }
  }
})();
