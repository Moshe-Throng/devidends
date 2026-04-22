/**
 * Send activation emails to people in test-output/activation-list.csv.
 * Each gets a personal-feeling email with their unique Telegram deep link.
 *
 * Usage:
 *   npx tsx scripts/activation-send-email.ts                       (dry run — first 3 only, prints output)
 *   npx tsx scripts/activation-send-email.ts --tier 1_recommender  (limit by tier)
 *   npx tsx scripts/activation-send-email.ts --limit 5 --apply     (send first 5 for real)
 *   npx tsx scripts/activation-send-email.ts --apply               (send everyone in the CSV)
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
    const k = t.slice(0, idx).trim(), v = t.slice(idx + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[k]) process.env[k] = v;
  }
}

const APPLY = process.argv.includes("--apply");
const TIER_IDX = process.argv.indexOf("--tier");
const TIER = TIER_IDX >= 0 ? process.argv[TIER_IDX + 1] : null;
const LIMIT_IDX = process.argv.indexOf("--limit");
const LIMIT = LIMIT_IDX >= 0 ? parseInt(process.argv[LIMIT_IDX + 1] || "0", 10) : 0;

interface Row {
  tier: string; name: string; email: string; phone: string;
  telegram_id: string; is_recommender: string; profile_type: string;
  cv_score: string; top_sector: string; claim_link: string; web_link: string;
}

function parseCsv(p: string): Row[] {
  const text = fs.readFileSync(p, "utf-8").trim();
  const lines = text.split("\n");
  const headers = lines[0].split(",");
  const rows: Row[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    const cells: string[] = [];
    let cur = "", inQ = false;
    for (let j = 0; j < line.length; j++) {
      const c = line[j];
      if (c === '"') { if (inQ && line[j + 1] === '"') { cur += '"'; j++; } else inQ = !inQ; }
      else if (c === "," && !inQ) { cells.push(cur); cur = ""; }
      else cur += c;
    }
    cells.push(cur);
    const r: any = {};
    headers.forEach((h, idx) => r[h] = cells[idx] || "");
    rows.push(r as Row);
  }
  return rows;
}

function emailHtml(r: Row): { subject: string; html: string } {
  const firstName = (r.name || "Friend").split(/\s+/)[0];
  const isCC = r.is_recommender === "Y";
  const scoreLine = r.cv_score
    ? `Your CV is in the pool, scored <b>${r.cv_score}/100</b>.`
    : `Your CV is in the pool.`;

  const ccLine = isCC
    ? `<p style="font-size:14px;color:#444;line-height:1.6;">As a Co-Creator, you also have your own dashboard tracking the people you've recommended and the unlocks you've earned.</p>`
    : "";

  const subject = isCC
    ? `${firstName}, open your Devidends dashboard`
    : `${firstName}, your Devidends profile is ready`;

  const html = `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:540px;margin:0 auto;padding:32px 20px;color:#212121;">
  <div style="margin-bottom:28px;">
    <span style="font-size:20px;font-weight:800;letter-spacing:-0.4px;">
      <span style="color:#27ABD2;">Dev</span><span style="color:#212121;">idends</span>
    </span>
  </div>

  <h1 style="font-size:22px;font-weight:700;margin:0 0 12px;">Hi ${firstName},</h1>

  <p style="font-size:15px;line-height:1.65;color:#333;margin:0 0 14px;">
    ${scoreLine} We've been quietly building Ethiopia's most curated
    development-sector consultant network — you're already part of it.
  </p>

  <p style="font-size:15px;line-height:1.65;color:#333;margin:0 0 22px;">
    Tap below to open your profile on Telegram. The bot will pair you
    in one tap, then you'll see your matched opportunities, your CV
    score detail, and the mini-app dashboard.
  </p>

  <a href="${r.claim_link}" style="display:inline-block;background:#229ED9;color:#fff;font-size:15px;font-weight:700;text-decoration:none;padding:13px 30px;border-radius:8px;margin-bottom:8px;">
    Open @Devidends_Bot →
  </a>

  <p style="font-size:12px;color:#888;margin:6px 0 24px;">No password. Tap and you're in.</p>

  ${ccLine}

  <p style="font-size:14px;color:#444;line-height:1.65;margin:18px 0 0;">
    Prefer the web? <a href="${r.web_link}" style="color:#27ABD2;">Claim on devidends.net</a>.
  </p>

  <hr style="border:none;border-top:1px solid #eee;margin:28px 0;">

  <p style="font-size:12px;color:#999;line-height:1.6;">
    You're receiving this because your profile is in the Devidends
    consulting network. If this isn't you, ignore this email — the
    link only opens for the bot once.
  </p>
</div>
`.trim();

  return { subject, html };
}

(async () => {
  const csvPath = path.join(__dirname, "..", "test-output", "activation-list.csv");
  if (!fs.existsSync(csvPath)) {
    console.error("CSV not found. Run scripts/activation-prepare.ts --apply first.");
    process.exit(1);
  }
  let rows = parseCsv(csvPath).filter((r) => r.email);
  if (TIER) rows = rows.filter((r) => r.tier === TIER);
  if (LIMIT > 0) rows = rows.slice(0, LIMIT);

  console.log(`\n═══════════════════════════════════════════════════════════`);
  console.log(`  Activation Email Send ${APPLY ? "(APPLY)" : "(DRY RUN)"}`);
  console.log(`═══════════════════════════════════════════════════════════\n`);
  console.log(`Recipients: ${rows.length}`);
  if (TIER) console.log(`Tier filter: ${TIER}`);

  if (!APPLY) {
    console.log(`\nFirst 3 sample subjects:`);
    for (const r of rows.slice(0, 3)) {
      const { subject } = emailHtml(r);
      console.log(`  ${r.email.padEnd(36)} → ${subject}`);
    }
    console.log(`\nRe-run with --apply to send.`);
    return;
  }

  const { Resend } = await import("resend");
  const resend = new Resend(process.env.RESEND_API_KEY!);

  let ok = 0, failed = 0;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const { subject, html } = emailHtml(r);
    const prefix = `[${i + 1}/${rows.length}]`;
    try {
      const res = await resend.emails.send({
        from: "Devidends <hello@devidends.net>",
        to: r.email,
        subject,
        html,
        replyTo: "mussietsegg@gmail.com",
      });
      if ((res as any).error) {
        console.log(`${prefix} ✗ ${r.email.padEnd(36)} ${(res as any).error.message}`);
        failed++;
      } else {
        console.log(`${prefix} ✓ ${r.email.padEnd(36)} ${(res as any).data?.id?.slice(0, 8) || ""}`);
        ok++;
      }
    } catch (e: any) {
      console.log(`${prefix} ✗ ${r.email.padEnd(36)} ${e.message?.slice(0, 60)}`);
      failed++;
    }
    // Resend free tier is ~10 req/sec; pace at 200ms between sends = 5/sec
    await new Promise((r) => setTimeout(r, 250));
  }

  console.log(`\n═══════════════════════════════════════════════════════════`);
  console.log(`  Sent: ${ok}  ·  Failed: ${failed}`);
  console.log(`═══════════════════════════════════════════════════════════\n`);
})().catch((e) => { console.error(e); process.exit(1); });
