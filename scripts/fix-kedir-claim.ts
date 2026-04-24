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
  const { data: k } = await sb.from("profiles").select("id, name, claimed_at").ilike("name", "%kedir%mussa%").maybeSingle();
  console.log("Before:", k);
  if (k && !k.claimed_at) {
    const { error } = await sb.from("profiles").update({ claimed_at: "2026-04-22T12:06:45.653Z" }).eq("id", k.id);
    if (error) console.log("ERR:", error.message);
    else console.log("✓ Kedir re-claimed");
  }
})();
