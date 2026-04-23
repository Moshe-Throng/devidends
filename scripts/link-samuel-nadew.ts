/**
 * Link Samuel Nadew's canonical profile (source=admin_ingest, has CV) to
 * his Telegram identity tg=370470798 ("Sam" on mini app).
 * Deletes any bare TG stub created by him opening the bot.
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

const TG_ID = "370470798";

async function main() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: all } = await sb
    .from("profiles")
    .select("id, name, telegram_id, claim_token, claimed_at, cv_text, source, created_at")
    .or(`telegram_id.eq.${TG_ID},name.ilike.%nadew%`);

  console.log("Candidates:");
  for (const p of all || []) {
    console.log(`  ${p.id}  '${p.name}'  tg=${p.telegram_id || "-"}  hasCv=${!!p.cv_text}  source=${p.source}  claimed=${p.claimed_at ? "YES" : "no"}`);
  }

  const canonical = (all || []).find((p: any) => p.cv_text && /nadew/i.test(p.name));
  const stub = (all || []).find((p: any) => String(p.telegram_id) === TG_ID && p.id !== canonical?.id);

  if (!canonical) {
    console.error("No canonical Samuel Nadew profile with CV found.");
    process.exit(1);
  }
  console.log(`\nCanonical: ${canonical.id} (${canonical.name})`);
  console.log(`Stub: ${stub ? `${stub.id} (${stub.name})` : "none"}`);

  // Move tg_id onto canonical (don't mark claimed — let him go through the wizard if he wants)
  const { error } = await sb
    .from("profiles")
    .update({ telegram_id: TG_ID })
    .eq("id", canonical.id);
  if (error) {
    console.error("Failed to update canonical:", error);
    process.exit(1);
  }
  console.log(`✓ Linked canonical ${canonical.id} to tg=${TG_ID}`);

  // Delete stub
  if (stub) {
    const { error: delErr } = await sb.from("profiles").delete().eq("id", stub.id);
    if (delErr) console.warn("Stub delete failed:", delErr);
    else console.log(`✓ Deleted stub ${stub.id}`);
  }

  // Verify
  const { data: final } = await sb
    .from("profiles")
    .select("id, name, telegram_id, claim_token, claimed_at, cv_score")
    .eq("id", canonical.id)
    .single();
  console.log(`\nFinal state:`);
  console.log(JSON.stringify(final, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
