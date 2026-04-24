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

  // Check if the table exists and how many rows
  const { count, error } = await sb
    .from("devex_benchmark")
    .select("id", { count: "exact", head: true });

  if (error) {
    console.log(`❌ Table check: ${error.message}`);
    if (/does not exist/i.test(error.message) || error.code === "PGRST205") {
      console.log("\nYou need to run the SQL from scripts/sql/devex-benchmark.sql first.");
    }
    return;
  }

  console.log(`✓ devex_benchmark total rows: ${count}`);

  // Per-email breakdown
  const { data: byEmail } = await sb
    .from("devex_benchmark")
    .select("email_subject, inbound_email_id, batch_date, alert_type, email_received_at")
    .order("email_received_at", { ascending: false });

  const byId: Record<string, { subject: string; batch: string | null; type: string; count: number; received: string }> = {};
  for (const r of byEmail || []) {
    const key = r.inbound_email_id as string;
    if (!byId[key]) {
      byId[key] = {
        subject: r.email_subject || "(no subject)",
        batch: r.batch_date,
        type: r.alert_type || "?",
        count: 0,
        received: r.email_received_at?.slice(0, 19).replace("T", " ") || "",
      };
    }
    byId[key].count++;
  }

  console.log(`\nUnique emails processed: ${Object.keys(byId).length}\n`);
  for (const [id, info] of Object.entries(byId).slice(0, 20)) {
    console.log(`  [${info.received}]  ${info.type.padEnd(20)}  ${info.count.toString().padStart(3)} entries  ${info.subject.slice(0, 60)}`);
  }

  // Sample entries
  const { data: sample } = await sb
    .from("devex_benchmark")
    .select("title, url, organization, country, alert_type, matched_opportunity_id, match_method")
    .order("created_at", { ascending: false })
    .limit(8);
  console.log(`\nSample entries (newest 8):`);
  for (const s of sample || []) {
    const match = s.matched_opportunity_id ? "✓" : s.match_method ? "○" : "·";
    console.log(`  ${match} [${s.alert_type}] ${(s.title || "").slice(0, 70)}`);
    console.log(`        ${s.organization || "?"} · ${s.country || "?"}`);
    console.log(`        ${s.url}`);
  }
})();
