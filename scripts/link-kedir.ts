/**
 * Link "Kedir M" on Telegram to the "Kedir Mussa" profile and mark claimed.
 *
 *  1. Find the "Kedir Mussa" main profile (the one with CV / sectors).
 *  2. Find the TG-created bare profile (name like "Kedir" with a telegram_id
 *     but no cv_text).
 *  3. Move telegram_id onto the main profile, set claimed_at=now.
 *  4. Delete the bare TG stub (duplicate).
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

  // Find all profiles containing "kedir"
  const { data: candidates } = await sb
    .from("profiles")
    .select("id, name, telegram_id, claimed_at, cv_text, source, created_at")
    .ilike("name", "%kedir%");

  console.log("Kedir candidates:");
  for (const p of candidates || []) {
    console.log(`  ${p.id}  name='${p.name}'  tg=${p.telegram_id || "-"}  claimed=${p.claimed_at || "-"}  hasCv=${!!p.cv_text}  source=${p.source}`);
  }

  const main = (candidates || []).find((p) => (p.name || "").toLowerCase().includes("mussa")) ||
               (candidates || []).find((p) => !!p.cv_text);
  const stub = (candidates || []).find((p) => p.id !== main?.id && !p.cv_text && p.telegram_id);

  if (!main) {
    console.error("No main 'Kedir Mussa' profile with CV found. Aborting.");
    process.exit(1);
  }
  console.log(`\nMain profile: ${main.id} (${main.name})`);
  console.log(`Stub profile: ${stub ? `${stub.id} (${stub.name}, tg=${stub.telegram_id})` : "none"}`);

  const tgId = stub?.telegram_id || main.telegram_id;
  if (!tgId) {
    console.error("Could not find a telegram_id to link. Aborting.");
    process.exit(1);
  }

  // Link main to telegram + mark claimed
  const { error: updErr } = await sb
    .from("profiles")
    .update({
      telegram_id: tgId,
      claimed_at: main.claimed_at || new Date().toISOString(),
    })
    .eq("id", main.id);
  if (updErr) {
    console.error("Failed to update main:", updErr);
    process.exit(1);
  }
  console.log(`\n✓ Linked main profile to tg=${tgId}, marked claimed.`);

  // Delete stub (duplicate)
  if (stub) {
    const { error: delErr } = await sb.from("profiles").delete().eq("id", stub.id);
    if (delErr) console.warn("Failed to delete stub:", delErr);
    else console.log(`✓ Deleted stub profile ${stub.id}`);
  }

  // Verify
  const { data: final } = await sb
    .from("profiles")
    .select("id, name, telegram_id, claimed_at, cv_score, is_recommender")
    .eq("id", main.id)
    .single();
  console.log(`\nFinal state:`);
  console.log(JSON.stringify(final, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
