/**
 * Report: how many recommender profiles we sent cards for have actually
 * been claimed on the bot?
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

  // All recommenders (the population we've been sending cards for).
  const { data: recs } = await sb
    .from("profiles")
    .select("id, name, claim_token, claimed_at, telegram_id, email, created_at, source")
    .eq("is_recommender", true)
    .order("claimed_at", { ascending: false, nullsFirst: false });

  const total = recs?.length || 0;
  const claimed = (recs || []).filter((r: any) => r.claimed_at);
  const pending = (recs || []).filter((r: any) => !r.claimed_at);

  console.log(`\n═══════════════════════════════════════════════════════════`);
  console.log(`  Recommender claim report`);
  console.log(`═══════════════════════════════════════════════════════════\n`);
  console.log(`Total recommenders: ${total}`);
  console.log(`  Claimed on bot:   ${claimed.length}  (${total > 0 ? Math.round(claimed.length/total*100) : 0}%)`);
  console.log(`  Still pending:    ${pending.length}\n`);

  console.log(`─── Claimed (${claimed.length}) ───`);
  for (const r of claimed) {
    const when = r.claimed_at ? new Date(r.claimed_at).toISOString().slice(0, 16).replace("T", " ") : "-";
    console.log(`  ✓ ${r.name.padEnd(32)}  tg=${(r.telegram_id || "-").padEnd(12)}  @ ${when}`);
  }

  console.log(`\n─── Pending (${pending.length}) ───`);
  for (const r of pending) {
    const tok = r.claim_token ? `claim_${r.claim_token}` : "NO TOKEN";
    console.log(`  ○ ${r.name.padEnd(32)}  ${tok.padEnd(22)}  email=${r.email || "-"}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
