/**
 * One-off email nudge to subscribers with empty sector filters asking them
 * to refine preferences. Sends once per subscriber, then records the send
 * so it won't double-send if re-run.
 *
 * Usage: npx tsx scripts/refine-preferences-email.ts
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

const SENT_LOG = path.join(__dirname, "..", "test-output", "_refine_prefs_sent.json");

function loadSent(): Set<string> {
  try {
    if (fs.existsSync(SENT_LOG)) {
      return new Set(JSON.parse(fs.readFileSync(SENT_LOG, "utf-8")));
    }
  } catch {}
  return new Set();
}

function saveSent(emails: Set<string>) {
  fs.mkdirSync(path.dirname(SENT_LOG), { recursive: true });
  fs.writeFileSync(SENT_LOG, JSON.stringify([...emails]));
}

function buildEmail(email: string): string {
  const preheader = "You're getting every opportunity — want only the ones in your field?";
  const subscribeUrl = `https://devidends.net/subscribe?email=${encodeURIComponent(email)}`;

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Refine your Devidends preferences</title>
</head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:'Helvetica Neue',Arial,sans-serif;color:#212121;">
<div style="display:none;max-height:0;overflow:hidden;">${preheader}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f5f5f5;padding:32px 16px;">
  <tr><td align="center">
    <table role="presentation" width="560" cellspacing="0" cellpadding="0" style="background:#ffffff;border-radius:8px;overflow:hidden;max-width:560px;">
      <tr><td style="background:#27ABD2;padding:24px 32px;">
        <h1 style="margin:0;font-size:22px;color:#ffffff;font-weight:700;letter-spacing:-0.2px;">Dev<span style="color:#212121;">idends</span></h1>
      </td></tr>
      <tr><td style="padding:32px;">
        <h2 style="margin:0 0 16px;font-size:20px;color:#212121;">Make your daily digest more useful</h2>
        <p style="margin:0 0 16px;font-size:15px;line-height:1.55;color:#333;">
          Right now you're getting <strong>every</strong> opportunity we aggregate — that's often 30+ jobs per day across every sector.
        </p>
        <p style="margin:0 0 16px;font-size:15px;line-height:1.55;color:#333;">
          If you tell us which sectors you work in, we'll only send what matches. Most subscribers cut their daily email by 70%+ this way.
        </p>
        <p style="margin:24px 0 32px;">
          <a href="${subscribeUrl}" style="display:inline-block;padding:12px 24px;background:#27ABD2;color:#ffffff;text-decoration:none;font-weight:600;border-radius:6px;font-size:15px;">Refine my preferences →</a>
        </p>
        <p style="margin:0 0 8px;font-size:13px;line-height:1.5;color:#666;">
          Takes 30 seconds. You can add sectors like WASH, M&amp;E, Global Health, Governance, etc.
        </p>
        <p style="margin:24px 0 0;font-size:13px;line-height:1.5;color:#999;border-top:1px solid #eee;padding-top:16px;">
          Not interested? Just ignore this — nothing changes, you'll keep getting the full daily brief.
        </p>
      </td></tr>
      <tr><td style="background:#f5f5f5;padding:16px 32px;text-align:center;font-size:12px;color:#999;">
        Devidends · <a href="https://devidends.net" style="color:#27ABD2;text-decoration:none;">devidends.net</a>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

async function main() {
  const { createClient } = await import("@supabase/supabase-js");
  const { Resend } = await import("resend");

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  const resend = new Resend(process.env.RESEND_API_KEY!);

  const sent = loadSent();

  const { data: subs, error } = await sb
    .from("subscriptions")
    .select("email, sectors_filter")
    .eq("is_active", true)
    .not("email", "is", null);

  if (error) throw new Error(error.message);

  const targets = (subs || [])
    .filter((s: any) => s.email && (!s.sectors_filter || s.sectors_filter.length === 0))
    .map((s: any) => s.email.toLowerCase())
    .filter((e: string) => !sent.has(e));

  const unique = [...new Set(targets)];
  console.log(`Found ${unique.length} subscribers to nudge (already sent to ${sent.size}).`);

  let ok = 0, failed = 0;
  for (const email of unique) {
    try {
      const r = await resend.emails.send({
        from: "Devidends <alerts@devidends.net>",
        to: email,
        subject: "Get a shorter, more useful Devidends digest 🎯",
        html: buildEmail(email),
      });
      if (r.error) {
        console.error(`[fail] ${email}:`, r.error.message);
        failed++;
      } else {
        console.log(`[sent] ${email} → ${r.data?.id}`);
        sent.add(email);
        ok++;
      }
      await new Promise((r) => setTimeout(r, 250));
    } catch (err: any) {
      console.error(`[error] ${email}:`, err.message);
      failed++;
    }
  }

  saveSent(sent);
  console.log(`\nDone: ${ok} sent, ${failed} failed. Log: ${SENT_LOG}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
