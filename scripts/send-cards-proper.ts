/**
 * Send Co-Creator cards the way we did for the others: sendPhoto with the
 * per-person OG image + a personalized caption. Same structure used for
 * Tebibu, Addisu, Abeba, Tsion Lemawossen, Israel, etc.
 *
 * Usage: npx tsx scripts/send-cards-proper.ts "Saron Berhane" "Daruselam Mohammed"
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

const CHAT = "297659579";
const BOT = process.env.TELEGRAM_BOT_TOKEN!;
const NAMES = process.argv.slice(2);

if (NAMES.length === 0) {
  console.error("Usage: npx tsx scripts/send-cards-proper.ts \"Saron Berhane\" \"Daruselam Mohammed\"");
  process.exit(1);
}

async function main() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  for (const fullName of NAMES) {
    const parts = fullName.toLowerCase().split(/\s+/).filter(Boolean);
    const pattern = "%" + parts.join("%") + "%";

    const { data: profList } = await sb
      .from("profiles")
      .select("id, name, claim_token, claimed_at, sectors, years_of_experience, email, is_recommender")
      .ilike("name", pattern);

    if (!profList || profList.length === 0) {
      console.log(`[skip] ${fullName}: no profile match`);
      continue;
    }
    let prof = profList[0];

    // Promote to recommender if not already
    if (!prof.is_recommender) {
      await sb.from("profiles").update({ is_recommender: true }).eq("id", prof.id);
      prof.is_recommender = true;
    }

    // Ensure claim_token
    if (!prof.claim_token) {
      const t = crypto.randomBytes(4).toString("hex");
      await sb.from("profiles").update({ claim_token: t }).eq("id", prof.id);
      prof.claim_token = t;
    }

    // Ensure co_creator row with invite_token + member_number
    let ccRow = (await sb.from("co_creators").select("invite_token, member_number").eq("profile_id", prof.id).maybeSingle()).data as any;
    if (!ccRow?.invite_token) {
      const { data: max } = await sb
        .from("co_creators")
        .select("member_number")
        .order("member_number", { ascending: false })
        .limit(1)
        .maybeSingle();
      const next = ((max as any)?.member_number || 0) + 1;
      const token = crypto.randomBytes(4).toString("hex");
      const { data: inserted } = await sb
        .from("co_creators")
        .insert({
          name: prof.name,
          email: prof.email || null,
          invite_token: token,
          member_number: next,
          profile_id: prof.id,
          status: "joined",
          joined_at: new Date().toISOString(),
        })
        .select("invite_token, member_number")
        .single();
      ccRow = inserted as any;
      console.log(`+ cc #${next} ${prof.name}`);
    }

    // Count people they've already brought in (fuzzy recommended_by match)
    const { data: allRecBy } = await sb
      .from("profiles")
      .select("recommended_by")
      .not("recommended_by", "is", null);
    const count = (allRecBy || []).filter((r: any) => {
      const rb = (r.recommended_by || "").toLowerCase();
      if (!rb.includes(parts[0])) return false;
      if (parts.length === 1) return true;
      return parts.slice(1).some((p) => p.length >= 3 && rb.includes(p));
    }).length;

    const firstName = prof.name.split(/\s+/)[0];
    const yrs = prof.years_of_experience ? `${prof.years_of_experience} years` : "";
    const sectors = (prof.sectors || []).slice(0, 4).join(" · ") || "sectors on your profile";
    const claimLink = `https://t.me/Devidends_Bot?start=claim_${prof.claim_token}`;
    const og = `https://devidends.net/api/og/co-creator/${ccRow.invite_token}`;

    const caption = [
      `🌟 <b>${firstName} — the network is ready for you.</b>`,
      ``,
      `You're part of the Devidends Co-Creator circle — senior Ethiopian`,
      `consultants whose vouch we trust.`,
      ``,
      `<b>A few things waiting:</b>`,
      `  • <b>${count}</b> people you've already brought in, tracked on your dashboard`,
      `  • Sectors: ${sectors}`,
      yrs ? `  • Briefs filtered to your ${yrs} of experience` : null,
      `  • Services unlocked at your tier`,
      ``,
      `👉 Tap to claim + pick your channel (Telegram or email):`,
      claimLink,
      ``,
      `— Mussie`,
    ].filter(Boolean).join("\n");

    const res = await fetch(`https://api.telegram.org/bot${BOT}/sendPhoto`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: CHAT,
        photo: og,
        caption,
        parse_mode: "HTML",
      }),
    });
    const data = await res.json();
    if (data.ok) console.log(`✓ ${prof.name} card sent`);
    else console.log(`✗ ${prof.name} failed: ${data.description}`);

    await new Promise((r) => setTimeout(r, 600));
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
