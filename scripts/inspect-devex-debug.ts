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
    .from("devex_benchmark")
    .select("id, email_subject, alert_type, raw_snippet, email_received_at")
    .like("alert_type", "%DEBUG_EMPTY%")
    .order("email_received_at", { ascending: false })
    .limit(3);

  if (!data || data.length === 0) {
    console.log("No debug rows yet. Has the Apps Script re-run with the reprocessed email?");
    return;
  }

  for (const r of data) {
    console.log(`\n════ ${r.email_subject} ════`);
    console.log(`Received: ${r.email_received_at}`);
    console.log(`Alert type: ${r.alert_type}`);
    console.log(`\n--- raw_snippet (first 4000 chars) ---`);
    console.log((r.raw_snippet || "").slice(0, 4000));
    console.log(`\n--- links detected in snippet ---`);
    const hrefs = Array.from((r.raw_snippet || "").matchAll(/href=["']([^"']+)["']/gi)).slice(0, 30).map((m: any) => m[1]);
    for (const h of hrefs) console.log(`  ${h}`);
  }

  // Write full dump for detailed analysis
  const out = path.join(__dirname, "..", ".tmp", "devex-debug.html");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, (data[0].raw_snippet as string) || "");
  console.log(`\nFull raw_snippet written to: ${out}`);
})();
