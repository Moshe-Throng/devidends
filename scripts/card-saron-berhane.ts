/**
 * Generate a claim card for Saron Berhane.
 *
 * Find-or-create her profile with is_recommender=true, mint a claim_token
 * if missing, and print: claim link + paste-ready share message.
 *
 * Usage: npx tsx scripts/card-saron-berhane.ts
 */

import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
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

const NAME = process.argv[2] || "Saron Berhane";

async function main() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Find by exact name first
  let { data: profile } = await sb
    .from("profiles")
    .select("id, name, claim_token, claimed_at, is_recommender, telegram_id, email")
    .ilike("name", NAME)
    .maybeSingle();

  if (!profile) {
    // Fuzzy search
    const parts = NAME.toLowerCase().split(/\s+/).filter(Boolean);
    const pattern = "%" + parts.join("%") + "%";
    const { data: candidates } = await sb
      .from("profiles")
      .select("id, name, claim_token, claimed_at, is_recommender, telegram_id, email")
      .ilike("name", pattern);
    if (candidates && candidates.length > 0) profile = candidates[0];
  }

  if (!profile) {
    // Create
    const claimToken = crypto.randomBytes(4).toString("hex");
    const { data: created, error } = await sb
      .from("profiles")
      .insert({
        name: NAME,
        is_recommender: true,
        profile_type: "Expert",
        claim_token: claimToken,
        source: "admin_card",
      })
      .select("id, name, claim_token")
      .single();
    if (error || !created) {
      console.error("Create failed:", error);
      process.exit(1);
    }
    profile = { ...created, claimed_at: null, is_recommender: true, telegram_id: null, email: null };
    console.log(`Created new profile id=${profile.id}`);
  }

  // Ensure is_recommender + claim_token
  const updates: any = {};
  if (!profile.is_recommender) updates.is_recommender = true;
  if (!profile.claim_token) updates.claim_token = crypto.randomBytes(4).toString("hex");
  if (Object.keys(updates).length > 0) {
    const { data: updated } = await sb
      .from("profiles")
      .update(updates)
      .eq("id", profile.id)
      .select("id, name, claim_token, claimed_at, is_recommender")
      .single();
    if (updated) profile = { ...profile, ...updated };
  }

  // Ensure co_creator row exists with invite_token
  const { data: ccRow } = await sb
    .from("co_creators")
    .select("id, invite_token")
    .eq("profile_id", profile.id)
    .maybeSingle();

  let inviteToken = ccRow?.invite_token as string | undefined;
  if (!ccRow) {
    inviteToken = crypto.randomBytes(4).toString("hex");
    const { error } = await sb.from("co_creators").insert({
      profile_id: profile.id,
      name: profile.name,
      invite_token: inviteToken,
      interests: [],
      ask_frequency: "weekly",
    });
    if (error) console.warn("co_creator insert warn:", error);
  } else if (!inviteToken) {
    inviteToken = crypto.randomBytes(4).toString("hex");
    await sb.from("co_creators").update({ invite_token: inviteToken }).eq("id", ccRow.id);
  }

  const claimLink = `https://t.me/Devidends_Bot?start=claim_${profile.claim_token}`;
  const shareLink = `https://t.me/Devidends_Bot?start=ref_${inviteToken}`;

  console.log(`\n${"=".repeat(60)}`);
  console.log(`Card: ${profile.name}`);
  console.log(`${"=".repeat(60)}`);
  console.log(`Profile:     ${profile.id}`);
  console.log(`Claimed:     ${profile.claimed_at ? "YES @ " + profile.claimed_at : "no"}`);
  console.log(`Recommender: ${profile.is_recommender ? "YES" : "no"}`);
  console.log(`\n— CLAIM LINK (send to Saron) —`);
  console.log(claimLink);
  console.log(`\n— PASTE-READY DM FOR SARON —`);
  console.log(`Hi Saron — I added your profile to Devidends, a curated Ethiopian development consulting network I'm building with Envest. Tap to claim it (2 minutes):\n\n${claimLink}\n\nYou'll get daily opportunity briefs and, as a recommender, your own share link to bring peers in.`);
  console.log(`\n— REF LINK (auto-generated for her to share once claimed) —`);
  console.log(shareLink);
  console.log(`${"=".repeat(60)}\n`);
}

main().catch((e) => { console.error(e); process.exit(1); });
