/**
 * Generate the first 7 Co-Creator invite links and print them to the console
 * ready for copy-paste to WhatsApp/email.
 *
 * Usage: npx tsx scripts/co-creators-generate-invites.ts
 */

import * as fs from "fs";
import * as path from "path";

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

const PILOT_NAMES = ["Seble", "Petros", "Bezawit", "Edom", "Kedir", "Honey", "Bereket"];
const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://devidends.net";

async function main() {
  const { getAdmin, generateInviteToken, findProfileByName } = await import("../lib/co-creators");
  const sb = getAdmin();

  console.log(`\n═══════════════════════════════════════════════════════════`);
  console.log(`  Devidends Co-Creators — generating ${PILOT_NAMES.length} invites`);
  console.log(`═══════════════════════════════════════════════════════════\n`);

  const { data: existing } = await sb
    .from("co_creators")
    .select("member_number")
    .order("member_number", { ascending: false })
    .limit(1);
  let nextNum = (existing && existing[0]?.member_number) ? existing[0].member_number + 1 : 1;

  for (const firstName of PILOT_NAMES) {
    // Check if already exists (by first-name match on existing invites)
    const { data: prior } = await sb
      .from("co_creators")
      .select("id, name, invite_token, member_number, status")
      .ilike("name", `${firstName}%`)
      .limit(1)
      .maybeSingle();

    if (prior) {
      console.log(`  [${prior.member_number}] ${prior.name.padEnd(24)} ${prior.status.padEnd(10)} ${BASE_URL}/cc/${prior.invite_token}  (already exists)`);
      continue;
    }

    // Fuzzy-match against profiles table
    const matched = await findProfileByName(firstName);
    const fullName = matched?.name || firstName;

    let token = generateInviteToken();
    for (let i = 0; i < 3; i++) {
      const { data: clash } = await sb.from("co_creators").select("id").eq("invite_token", token).maybeSingle();
      if (!clash) break;
      token = generateInviteToken();
    }

    const { data: created, error } = await sb
      .from("co_creators")
      .insert({
        name: fullName,
        invite_token: token,
        member_number: nextNum,
        profile_id: matched?.id || null,
      })
      .select()
      .single();

    if (error) {
      console.log(`  [FAIL] ${firstName}: ${error.message}`);
      continue;
    }

    const matchNote = matched ? `matched → ${matched.name}` : "no profile match";
    console.log(`  [${nextNum}] ${fullName.padEnd(24)} token=${token}  (${matchNote})`);
    console.log(`       ${BASE_URL}/cc/${token}\n`);
    nextNum++;
  }

  console.log(`═══════════════════════════════════════════════════════════`);
  console.log(`  Done. Admin panel: ${BASE_URL}/admin/co-creators`);
  console.log(`═══════════════════════════════════════════════════════════\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
