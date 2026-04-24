import * as fs from "fs";
import * as path from "path";
import { parseDevexEmail } from "../lib/devex-parser";

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
  const { createClient } = await import("@supabase/supabase-js");
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data } = await sb
    .from("devex_benchmark")
    .select("email_subject, raw_snippet, alert_type")
    .like("alert_type", "%DEBUG_EMPTY%")
    .order("email_received_at", { ascending: false })
    .limit(5);

  for (const r of data || []) {
    const html = (r.raw_snippet as string) || "";
    const parsed = parseDevexEmail(r.email_subject as string, html);
    console.log(`\n═══ ${r.email_subject?.slice(0, 70)} ═══`);
    console.log(`Alert type: ${parsed.alert_type}  batch_date: ${parsed.batch_date}`);
    console.log(`Entries extracted: ${parsed.entries.length}`);
    for (const e of parsed.entries.slice(0, 5)) {
      console.log(`  - ${e.title.slice(0, 80)}`);
      console.log(`    ${e.url}`);
      console.log(`    org=${e.organization || "?"}  country=${e.country || "?"}`);
    }
  }
})();
