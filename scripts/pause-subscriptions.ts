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

const ALLOWLIST_NAME_PATTERNS = [
  "mussie",
  "petros",
  "yonus",
  "bezawit liro",
];

async function main() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Find allowlist profiles by fuzzy name match
  const { data: profiles } = await sb
    .from("profiles")
    .select("id, name, telegram_id, email");

  const matched: { name: string; tg: string | null; email: string | null }[] = [];
  for (const p of profiles || []) {
    const nm = (p.name || "").toLowerCase();
    if (ALLOWLIST_NAME_PATTERNS.some((pat) => nm.includes(pat))) {
      matched.push({ name: p.name, tg: p.telegram_id, email: p.email });
    }
  }

  console.log(`Allowlist matches (${matched.length}):`);
  for (const m of matched) {
    console.log(`  - ${m.name}  tg=${m.tg || "-"}  email=${m.email || "-"}`);
  }

  const allowTgIds = matched.map((m) => m.tg).filter(Boolean) as string[];
  const allowEmails = matched.map((m) => m.email).filter(Boolean) as string[];

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

  // 2. Re-activate allowlist rows (match by telegram_id OR email)
  let reactivated = 0;
  if (allowTgIds.length > 0) {
    const { data, error } = await sb
      .from("subscriptions")
      .update({ is_active: true })
      .in("telegram_id", allowTgIds)
      .select("id");
    if (!error && data) reactivated += data.length;
  }
  if (allowEmails.length > 0) {
    const { data, error } = await sb
      .from("subscriptions")
      .update({ is_active: true })
      .in("email", allowEmails)
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
    allowlist_names: matched.map((m) => m.name),
  }, null, 2));
  console.log(`\nWrote marker: ${markerPath}`);
  console.log(`\nNOTE: Copy this file to the VPS project root so companion-engine picks it up.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
