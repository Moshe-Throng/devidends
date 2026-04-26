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
const RAW_ARGS = process.argv.slice(2);

// --from "<name>" or --from=<name> sets the forwarder credited on the link.
// If omitted, default to Mussie Tsegaye (the admin running the script).
let forwarderName = "Mussie Tsegaye";
const NAMES: string[] = [];
for (let i = 0; i < RAW_ARGS.length; i++) {
  const a = RAW_ARGS[i];
  if (a === "--from") {
    forwarderName = RAW_ARGS[++i] || forwarderName;
  } else if (a.startsWith("--from=")) {
    forwarderName = a.slice("--from=".length);
  } else {
    NAMES.push(a);
  }
}

if (NAMES.length === 0) {
  console.error('Usage: npx tsx scripts/send-cards-proper.ts [--from "Recommender Name"] "Subject 1" "Subject 2"');
  process.exit(1);
}

async function main() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Resolve the forwarder's claim_token so we can stamp it onto every card
  // link as ?start=claim_<subjectToken>_by_<forwarderToken>. When the
  // recipient clicks, the bot credits the forwarder with the attribution.
  let forwarderToken: string | null = null;
  let forwarderResolvedName: string | null = null;
  {
    const fparts = forwarderName.toLowerCase().split(/\s+/).filter(Boolean);
    const fpattern = "%" + fparts.join("%") + "%";
    const { data: fprof } = await sb
      .from("profiles")
      .select("id, name, claim_token")
      .ilike("name", fpattern)
      .order("cv_score", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();
    if (fprof?.claim_token) {
      forwarderToken = fprof.claim_token;
      forwarderResolvedName = fprof.name;
      console.log(`Forwarder credited on every card: ${fprof.name} (token=${fprof.claim_token})`);
    } else {
      console.log(`⚠ Forwarder "${forwarderName}" not found — links will be sent without forwarder attribution.`);
    }
  }

  for (const fullName of NAMES) {
    const parts = fullName.toLowerCase().split(/\s+/).filter(Boolean);
    const pattern = "%" + parts.join("%") + "%";

    const { data: profList } = await sb
      .from("profiles")
      .select("id, name, claim_token, claimed_at, sectors, years_of_experience, email, is_recommender, cv_score, cv_text, updated_at")
      .ilike("name", pattern);

    if (!profList || profList.length === 0) {
      console.log(`[skip] ${fullName}: no profile match`);
      continue;
    }

    // When multiple profiles match (duplicates), pick the best one so we
    // don't link a weaker/older record. Rank:
    //   1. already claimed beats unclaimed  (don't send a second card to someone already claimed)
    //   2. has CV text
    //   3. higher cv_score
    //   4. more recently updated
    const ranked = [...profList].sort((a: any, b: any) => {
      if (!!a.claimed_at !== !!b.claimed_at) return a.claimed_at ? -1 : 1;
      const ax = a.cv_text ? 1 : 0, bx = b.cv_text ? 1 : 0;
      if (ax !== bx) return bx - ax;
      const sa = a.cv_score ?? -1, sb = b.cv_score ?? -1;
      if (sa !== sb) return sb - sa;
      return (b.updated_at || "").localeCompare(a.updated_at || "");
    });
    let prof = ranked[0] as any;
    if (profList.length > 1) {
      const others = ranked.slice(1).map((p: any) => `${p.name}[score=${p.cv_score ?? "-"}]`).join(", ");
      console.log(`  ↳ ${profList.length} matches, picked ${prof.name} (score=${prof.cv_score ?? "-"}). Duplicates present: ${others}`);
    }
    if (prof.claimed_at) {
      console.log(`[skip] ${prof.name}: already claimed at ${prof.claimed_at} — not sending another card`);
      continue;
    }

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
        .not("member_number", "is", null)
        .order("member_number", { ascending: false })
        .limit(1)
        .maybeSingle();
      // Retry on member_number unique-constraint collisions (stale max in a
      // loop). Re-fetch max fresh and bump up to 5 times.
      let inserted: any = null;
      let lastErr: any = null;
      for (let attempt = 0; attempt < 5 && !inserted; attempt++) {
        const { data: freshMax } = await sb
          .from("co_creators")
          .select("member_number")
          .not("member_number", "is", null)
          .order("member_number", { ascending: false })
          .limit(1)
          .maybeSingle();
        const next = ((freshMax as any)?.member_number || 0) + 1 + attempt;
        const token = crypto.randomBytes(4).toString("hex");
        const r = await sb
          .from("co_creators")
          .insert({
            name: prof.name,
            email: prof.email || null,
            invite_token: token,
            member_number: next,
            profile_id: prof.id,
            status: "invited",
          })
          .select("invite_token, member_number")
          .single();
        if (r.data) {
          inserted = r.data;
          console.log(`+ cc #${next} ${prof.name}`);
          break;
        }
        lastErr = r.error;
        if (!r.error?.message?.includes("member_number")) break;
      }
      if (!inserted) {
        const { data: existing } = await sb
          .from("co_creators")
          .select("invite_token, member_number")
          .eq("profile_id", prof.id)
          .maybeSingle();
        if (existing) {
          ccRow = existing as any;
          console.log(`  cc already existed for ${prof.name}`);
        } else {
          console.log(`[skip] ${prof.name}: co_creator insert failed: ${lastErr?.message || "unknown"}`);
          continue;
        }
      } else {
        ccRow = inserted;
      }
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
    // Append _by_<forwarderToken> when we have one, so the bot can credit
    // the forwarder's recommendation in attributions.
    const subjectToken = prof.claim_token;
    const fwdSuffix = forwarderToken && forwarderToken !== subjectToken ? `_by_${forwarderToken}` : "";
    const claimLink = `https://t.me/Devidends_Bot?start=claim_${subjectToken}${fwdSuffix}`;
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
        reply_markup: {
          inline_keyboard: [[
            { text: "✅ Claim your profile", url: claimLink },
          ]],
        },
      }),
    });
    const data = await res.json();
    if (data.ok) console.log(`✓ ${prof.name} card sent`);
    else console.log(`✗ ${prof.name} failed: ${data.description}`);

    await new Promise((r) => setTimeout(r, 600));
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
