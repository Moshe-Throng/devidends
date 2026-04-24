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
  const { count: before } = await sb.from("devex_benchmark").select("id", { count: "exact", head: true });
  console.log("Before cleanup:", before, "rows");

  // Delete debug rows and test row
  const { error: e1 } = await sb.from("devex_benchmark").delete().like("alert_type", "%DEBUG_EMPTY%");
  if (e1) console.log("Debug delete error:", e1.message);
  const { error: e2 } = await sb.from("devex_benchmark").delete().eq("url", "https://www.devex.com/jobs/test-role-12345");
  if (e2) console.log("Test delete error:", e2.message);

  const { count: after } = await sb.from("devex_benchmark").select("id", { count: "exact", head: true });
  console.log("After cleanup:", after, "rows");
})();
