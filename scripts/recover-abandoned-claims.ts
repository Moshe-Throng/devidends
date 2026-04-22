/**
 * Recover abandoned claim attempts.
 *
 * Finds users who opened /tg-app/claim but never fired claim_completed
 * (either today or ever). For each, resolves a target profile + drafts a
 * short DM that directs them back to the claim deep link.
 *
 * ADMIN-APPROVAL GATE: default mode is PREVIEW. To actually send, pass
 * `--send` (sends to all listed) or `--send <firstName>` (sends to the
 * matching one only). Don't send without the flag.
 *
 * Usage:
 *   npx tsx scripts/recover-abandoned-claims.ts                   # preview
 *   npx tsx scripts/recover-abandoned-claims.ts --send             # send all
 *   npx tsx scripts/recover-abandoned-claims.ts --send Saron       # send one
 *   npx tsx scripts/recover-abandoned-claims.ts --days 3           # look back 3 days
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

function parseArgs() {
  const args = process.argv.slice(2);
  const sendIdx = args.indexOf("--send");
  const daysIdx = args.indexOf("--days");
  const send = sendIdx >= 0;
  const sendFilter = send && args[sendIdx + 1] && !args[sendIdx + 1].startsWith("--") ? args[sendIdx + 1] : null;
  const days = daysIdx >= 0 && args[daysIdx + 1] ? parseInt(args[daysIdx + 1], 10) : 7;
  return { send, sendFilter, days };
}

function buildDm(firstName: string, claimToken: string) {
  const link = `https://t.me/Devidends_Bot?start=claim_${claimToken}`;
  const text = [
    `Hi ${firstName} 👋  Welcome to <b>Devidends</b>.`,
    ``,
    `We noticed you opened your profile earlier but didn't finish the 60-second setup. Tap the button below and pick your sectors + how you want to receive briefs (Telegram, email, or both).`,
    ``,
    `Once done you'll get:`,
    `  • Daily opportunity briefs tuned to your sectors`,
    `  • The full intel feed (jobs, consultancies, tenders — filtered for Ethiopia & Horn of Africa)`,
    `  • Your own share link to bring peers into the network`,
    ``,
    `Any issue, just reply here.`,
    ``,
    `— Devidends Team`,
  ].join("\n");
  const reply_markup = {
    inline_keyboard: [[{ text: "✅ Finish setup", url: link }]],
  };
  return { text, link, reply_markup };
}

async function main() {
  const { send, sendFilter, days } = parseArgs();
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  // 1. All tg_ids that opened /tg-app/claim in the window
  const { data: opens } = await sb
    .from("events")
    .select("telegram_id, created_at, metadata")
    .eq("event", "mini_app_opened")
    .gte("created_at", since)
    .not("telegram_id", "is", null);
  const openerSet = new Set<string>();
  const openedAt: Record<string, string> = {};
  for (const e of opens || []) {
    const meta = (e.metadata as any) || {};
    if (meta.path === "/tg-app/claim") {
      const tg = String(e.telegram_id);
      openerSet.add(tg);
      if (!openedAt[tg] || e.created_at > openedAt[tg]) openedAt[tg] = e.created_at;
    }
  }

  // 2. Remove anyone who has claim_completed in the window
  const { data: done } = await sb
    .from("events")
    .select("telegram_id")
    .eq("event", "claim_completed")
    .gte("created_at", since)
    .not("telegram_id", "is", null);
  for (const e of done || []) openerSet.delete(String(e.telegram_id));

  if (openerSet.size === 0) {
    console.log(`No abandoned claims in the last ${days} day(s).`);
    return;
  }

  // 3. Map each tg_id to a profile with a claim_token
  const tgIds = Array.from(openerSet);
  const { data: profsByTg } = await sb
    .from("profiles")
    .select("id, name, telegram_id, claim_token, claimed_at, email, cv_score, is_recommender")
    .in("telegram_id", tgIds);

  type Target = { tg: string; profile: any; firstName: string; reason: string };
  const targets: Target[] = [];

  for (const tg of tgIds) {
    const matches = (profsByTg || []).filter((p: any) => String(p.telegram_id) === tg);
    if (matches.length === 0) {
      console.log(`[skip] tg=${tg} — no matching profile`);
      continue;
    }
    // Pick the best profile (with claim_token + not claimed + most CV)
    const ranked = matches.sort((a: any, b: any) => {
      if (!!a.claim_token !== !!b.claim_token) return a.claim_token ? -1 : 1;
      if (!!a.claimed_at !== !!b.claimed_at) return a.claimed_at ? 1 : -1;
      return (b.cv_score ?? -1) - (a.cv_score ?? -1);
    });
    const prof = ranked[0] as any;
    if (!prof.claim_token) {
      console.log(`[skip] ${prof.name} tg=${tg} — no claim_token (can't build link)`);
      continue;
    }
    if (prof.claimed_at) {
      console.log(`[skip] ${prof.name} tg=${tg} — already claimed at ${prof.claimed_at}`);
      continue;
    }
    const firstName = (prof.name || "friend").split(/\s+/)[0];
    targets.push({
      tg,
      profile: prof,
      firstName,
      reason: `opened /tg-app/claim at ${openedAt[tg].slice(11, 16)} UTC, no claim_completed`,
    });
  }

  console.log(`\n═══ Abandoned claims recoverable: ${targets.length} (window = ${days}d) ═══\n`);

  const filtered = sendFilter
    ? targets.filter((t) => t.firstName.toLowerCase() === sendFilter.toLowerCase() || t.profile.name.toLowerCase().includes(sendFilter.toLowerCase()))
    : targets;

  if (sendFilter && filtered.length === 0) {
    console.log(`--send ${sendFilter} matched no one in the recoverable list.`);
    return;
  }

  for (const t of filtered) {
    const dm = buildDm(t.firstName, t.profile.claim_token);
    console.log(`── ${t.profile.name} (tg=${t.tg}, ${t.reason}) ──`);
    console.log(dm.text.replace(/<b>/g, "").replace(/<\/b>/g, ""));
    console.log("");
  }

  if (!send) {
    console.log("── PREVIEW ONLY. Pass --send to deliver. Pass --send <FirstName> to target one. ──");
    return;
  }

  // 4. SEND
  const BOT = process.env.TELEGRAM_BOT_TOKEN!;
  let sent = 0, failed = 0;
  for (const t of filtered) {
    const { text, reply_markup } = buildDm(t.firstName, t.profile.claim_token);
    try {
      const res = await fetch(`https://api.telegram.org/bot${BOT}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: t.tg,
          text,
          parse_mode: "HTML",
          disable_web_page_preview: true,
          reply_markup,
        }),
      });
      const d = await res.json();
      if (d.ok) {
        sent++;
        console.log(`✓ sent to ${t.profile.name} (tg=${t.tg})`);
      } else {
        failed++;
        console.log(`✗ ${t.profile.name}: ${d.description}`);
      }
    } catch (e: any) {
      failed++;
      console.log(`✗ ${t.profile.name}: ${e.message}`);
    }
    await new Promise((r) => setTimeout(r, 600));
  }
  console.log(`\nDone. Sent: ${sent}, Failed: ${failed}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
