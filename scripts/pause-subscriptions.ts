/**
 * Pause ALL subscriptions (is_active=false) except an allowlist.
 * Also writes an allowlist env flag file that companion-engine + other
 * outbound paths read to halt proactive messaging.
 *
 * Allowlist: Mussie Tsegaye, Petros, Yonus, Bezawit Liro.
 *
 * Reversible: run `scripts/resume-subscriptions.ts` when ready.
 *
 * Usage: npx tsx scripts/pause-subscriptions.ts
 */

import * as fs from "fs";
import * as path from "path";
import { createClient } from "@supabase/supabase-js";

// Load env
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

// Exact email match — avoids false positives like "Mussie Haile" vs "Mussie Tsegaye"
const ALLOWLIST_EMAILS = [
  "mussietsegg@gmail.com",
  "petrosyigzaw@gmail.com",
  "bezawitedilu@gmail.com",
  "yonusfantahun@gmail.com",
];
const ALLOWLIST_TG_IDS = [
  "297659579",  // Mussie Tsegaye
  "1384820361", // Petros
  "5443365731", // Yonus
];

async function main() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const allowTgIds = ALLOWLIST_TG_IDS;
  const allowEmails = ALLOWLIST_EMAILS;
  console.log(`Allowlist (explicit):`);
  console.log(`  tg_ids: ${allowTgIds.join(", ")}`);
  console.log(`  emails: ${allowEmails.join(", ")}`);

  // 1. Deactivate ALL subscriptions
  const { count: beforeCount } = await sb
    .from("subscriptions")
    .select("id", { count: "exact", head: true })
    .eq("is_active", true);
  console.log(`\nActive subscriptions before: ${beforeCount}`);

  const { error: offErr } = await sb
    .from("subscriptions")
    .update({ is_active: false })
    .eq("is_active", true);
  if (offErr) {
    console.error("Failed to deactivate:", offErr);
    process.exit(1);
  }

  // 2. Re-activate allowlist rows (match by telegram_id OR email, case-insensitive on email)
  let reactivated = 0;
  if (allowTgIds.length > 0) {
    const { data, error } = await sb
      .from("subscriptions")
      .update({ is_active: true })
      .in("telegram_id", allowTgIds)
      .select("id");
    if (!error && data) reactivated += data.length;
  }
  for (const em of allowEmails) {
    const { data, error } = await sb
      .from("subscriptions")
      .update({ is_active: true })
      .ilike("email", em)
      .select("id");
    if (!error && data) reactivated += data.length;
  }

  const { count: afterCount } = await sb
    .from("subscriptions")
    .select("id", { count: "exact", head: true })
    .eq("is_active", true);

  console.log(`Allowlist rows reactivated: ${reactivated}`);
  console.log(`Active subscriptions after:  ${afterCount}`);

  // 3. Write allowlist marker for companion-engine (checked at runtime)
  const markerPath = path.join(__dirname, "..", ".broadcast-allowlist.json");
  fs.writeFileSync(markerPath, JSON.stringify({
    paused_at: new Date().toISOString(),
    allowlist_tg_ids: allowTgIds,
    allowlist_emails: allowEmails,
  }, null, 2));
  console.log(`\nWrote marker: ${markerPath}`);
  console.log(`\nNOTE: Copy this file to the VPS project root so companion-engine picks it up.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
