/**
 * Create subscription rows for Petros and Bezawit (allowlisted but no sub row).
 */

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

async function main() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const targets = [
    { email: "petrosyigzaw@gmail.com", telegram_id: "1384820361", channel: "both", name: "Petros Mulugeta" },
    { email: "bezawitedilu@gmail.com", telegram_id: null, channel: "email", name: "Bezawit Liro" },
  ];

  for (const t of targets) {
    // Check if already exists
    let q = sb.from("subscriptions").select("id");
    if (t.email) q = q.eq("email", t.email);
    const { data: existing } = await q;
    if (existing && existing.length > 0) {
      console.log(`${t.name}: already has ${existing.length} row(s) — ensuring active`);
      await sb.from("subscriptions").update({ is_active: true }).eq("email", t.email!);
      continue;
    }

    const { error } = await sb.from("subscriptions").insert({
      email: t.email,
      telegram_id: t.telegram_id,
      channel: t.channel,
      sectors_filter: [],
      country_filter: ["Ethiopia"],
      is_active: true,
    });
    if (error) console.error(`${t.name}: insert failed`, error);
    else console.log(`${t.name}: created (channel=${t.channel})`);
  }

  const { data: finalActive } = await sb
    .from("subscriptions")
    .select("email, telegram_id, channel")
    .eq("is_active", true);
  console.log(`\nFinal active subscriptions (${finalActive?.length || 0}):`);
  for (const r of finalActive || []) {
    console.log(`  - email=${r.email || "-"}  tg=${r.telegram_id || "-"}  channel=${r.channel}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
