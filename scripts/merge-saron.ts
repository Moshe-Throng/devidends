/**
 * Merge Saron's 3 profiles into one.
 *
 * Keep:   0b164f1c  (Saron Berhane, score 72, claim aab733b8)
 *          → rename to "Saron Berhane Habtom"
 *          → add telegram_id 1722419375
 *          → claimed_at = now
 * Delete: 2fa4fa7c  (bare TG stub with tg_id)
 *         aa0611dd  (Habtom, score 62, older CV)
 *
 * Before delete: re-point any foreign-key rows (co_creators, cv_scores,
 * events, co_creator_interactions) onto the canonical.
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

const CANONICAL = "0b164f1c-7b7b-442a-89f7-2c0dcc91a019"; // Saron Berhane (score 72)
const STUB_TG   = "2fa4fa7c-4606-4dca-afb0-480304260f76"; // Saron Berhane (bare, tg=1722419375)
const STUB_CV   = "aa0611dd-11d7-46e6-8cca-2a43d48382e4"; // Saron Berhane Habtom (score 62)

async function main() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // 1. Re-point co_creators rows to canonical
  for (const stubId of [STUB_TG, STUB_CV]) {
    const { data: cc } = await sb.from("co_creators").select("id, profile_id, invite_token").eq("profile_id", stubId);
    if (cc && cc.length > 0) {
      console.log(`Found ${cc.length} co_creator row(s) for stub ${stubId}:`, cc);
      // Check if canonical already has a co_creator row
      const { data: canonCc } = await sb.from("co_creators").select("id").eq("profile_id", CANONICAL).maybeSingle();
      if (canonCc) {
        // Canonical already has one — delete the stub's
        for (const row of cc) {
          await sb.from("co_creators").delete().eq("id", (row as any).id);
          console.log(`  deleted cc ${(row as any).id}`);
        }
      } else {
        // Re-point first one, delete rest
        await sb.from("co_creators").update({ profile_id: CANONICAL }).eq("id", (cc[0] as any).id);
        console.log(`  re-pointed cc ${(cc[0] as any).id} → ${CANONICAL}`);
        for (const row of cc.slice(1)) {
          await sb.from("co_creators").delete().eq("id", (row as any).id);
        }
      }
    }
  }

  // 2. Re-point cv_scores (best effort — table might not have profile_id FK)
  for (const stubId of [STUB_TG, STUB_CV]) {
    const { error } = await sb.from("cv_scores").update({ profile_id: CANONICAL }).eq("profile_id", stubId);
    if (error && !error.message.includes("does not exist")) {
      console.log(`cv_scores re-point skipped for ${stubId}: ${error.message}`);
    }
  }

  // 3. Re-point events
  for (const stubId of [STUB_TG, STUB_CV]) {
    const { error } = await sb.from("events").update({ profile_id: CANONICAL }).eq("profile_id", stubId);
    if (error) console.log(`events re-point ${stubId}: ${error.message}`);
  }

  // 4. Update canonical: name, telegram_id, claimed_at
  const { error: upErr } = await sb
    .from("profiles")
    .update({
      name: "Saron Berhane Habtom",
      telegram_id: "1722419375",
      claimed_at: new Date().toISOString(),
      source: "admin_ingest",
    })
    .eq("id", CANONICAL);
  if (upErr) {
    console.error("Failed to update canonical:", upErr);
    process.exit(1);
  }
  console.log(`✓ canonical ${CANONICAL} updated: name, tg=1722419375, claimed_at=now`);

  // 5. Delete stubs
  for (const stubId of [STUB_TG, STUB_CV]) {
    const { error } = await sb.from("profiles").delete().eq("id", stubId);
    if (error) console.error(`Delete ${stubId} failed:`, error);
    else console.log(`✓ deleted ${stubId}`);
  }

  // 6. Verify
  const { data: final } = await sb
    .from("profiles")
    .select("id, name, telegram_id, claim_token, claimed_at, cv_score, is_recommender")
    .eq("id", CANONICAL)
    .single();
  console.log("\nFinal canonical state:");
  console.log(JSON.stringify(final, null, 2));

  const { data: remaining } = await sb
    .from("profiles")
    .select("id, name, telegram_id, claim_token, claimed_at, cv_score")
    .ilike("name", "%saron%");
  console.log(`\nProfiles still matching 'saron' (should be 1):`);
  for (const p of remaining || []) console.log(`  ${p.id}  ${p.name}  tg=${p.telegram_id || "-"}  score=${p.cv_score ?? "-"}  claimed=${p.claimed_at ? "YES" : "no"}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
