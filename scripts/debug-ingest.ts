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
  const since = new Date(Date.now() - 30 * 60 * 1000).toISOString();

  const { data: events } = await sb
    .from("events")
    .select("created_at, event, telegram_id, metadata")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(20);
  console.log("─── events (last 30 min) ───");
  for (const e of events || []) {
    console.log(`  ${e.created_at.slice(11, 19)}  ${e.event.padEnd(22)}  tg=${(e.telegram_id || "-").padEnd(12)}  ${JSON.stringify(e.metadata).slice(0, 120)}`);
  }

  const { data: errs } = await sb
    .from("error_log")
    .select("created_at, context, message")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(10);
  console.log("\n─── error_log (last 30 min) ───");
  for (const er of errs || []) {
    console.log(`  ${er.created_at.slice(11, 19)}  ${er.context}  ${(er.message || "").slice(0, 200)}`);
  }
})();
