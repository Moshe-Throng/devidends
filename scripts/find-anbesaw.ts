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
  const terms = ["anbesaw", "serebe", "anbesa", "anbisaw", "anbasa", "anbes", "sereb"];
  for (const n of terms) {
    const { data } = await sb.from("profiles").select("id, name, cv_score, is_recommender").ilike("name", "%" + n + "%");
    console.log(`'${n}' (${(data || []).length}): ${(data || []).map((d: any) => d.name).join(" | ") || "—"}`);
  }
  // Also search in cv_text
  for (const n of ["Anbesaw", "Serebe"]) {
    const { data } = await sb.from("profiles").select("id, name").ilike("cv_text", "%" + n + "%").limit(3);
    console.log(`cv_text '${n}' (${(data || []).length}): ${(data || []).map((d: any) => d.name).join(" | ")}`);
  }
})();
