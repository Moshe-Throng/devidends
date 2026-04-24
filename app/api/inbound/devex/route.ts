import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { parseDevexEmail } from "@/lib/devex-parser";

/**
 * POST /api/inbound/devex
 *
 * Receiving endpoint for Resend Inbound. Configured in the Resend dashboard
 * to deliver mail addressed to devex@devidends.net.
 *
 * Resend POSTs a JSON payload with the parsed email. We extract the HTML
 * body, run it through our parser, persist each extracted opportunity to
 * devex_benchmark, and DM the admin with the count.
 *
 * Matching and reporting run in a separate cron (see /api/cron/devex-match).
 */

export const maxDuration = 60;

const ADMIN_TG = "297659579";

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

async function notifyAdmin(text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: ADMIN_TG,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });
  } catch {}
}

// Gmail forward verification: when Mussie sets up the filter, Gmail sends a
// confirmation email to devex@devidends.net with a verification link or code.
// We surface that to admin via TG so he can click it.
async function maybeSurfaceGmailVerification(from: string, subject: string, text: string, html: string) {
  const verifyFrom = /forwarding-noreply@google\.com|googlegroups\.com/i.test(from);
  const verifySubject = /gmail forwarding|confirmation code|verify/i.test(subject);
  if (!verifyFrom && !verifySubject) return false;

  const codeMatch = text.match(/\b(\d{6,12})\b/);
  const urlMatch = (text + html).match(/https:\/\/(?:mail-settings\.google|accounts\.google)[^\s<>"]+/);
  const code = codeMatch?.[1] || null;
  const url = urlMatch?.[0] || null;

  const lines = [
    `<b>📧 Gmail forwarding verification received</b>`,
    ``,
    `From: ${from}`,
    `Subject: ${subject}`,
  ];
  if (code) lines.push(``, `<b>Verification code:</b> <code>${code}</code>`);
  if (url) lines.push(``, `<b>Verification link:</b>`, url);
  if (!code && !url) {
    lines.push(``, `<i>Could not auto-extract code or link. Raw body preview:</i>`, text.slice(0, 600));
  }
  await notifyAdmin(lines.join("\n"));
  return true;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Resend inbound payload shape:
    //   { from, to, subject, html, text, headers, attachments, created_at, message_id, ... }
    const from: string = body.from || body.from_email || "";
    const to: string = Array.isArray(body.to) ? body.to.join(",") : body.to || "";
    const subject: string = body.subject || "";
    const html: string = body.html || "";
    const text: string = body.text || "";
    const messageId: string =
      body.message_id || body.id || body.envelope?.messageId || `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    // Gmail forwarding verification path — surface + short-circuit
    const isVerification = await maybeSurfaceGmailVerification(from, subject, text, html);
    if (isVerification) {
      return NextResponse.json({ ok: true, handled: "gmail_verification" });
    }

    // Only process alerts@devex.com
    if (!/alerts@devex\.com/i.test(from)) {
      console.log(`[inbound/devex] non-Devex inbound ignored: from=${from}`);
      return NextResponse.json({ ok: true, handled: "ignored_non_devex" });
    }

    const parsed = parseDevexEmail(subject, html);

    // Persist each entry
    const sb = getAdmin();
    let saved = 0;
    let skipped = 0;
    for (const e of parsed.entries) {
      // Dedup: skip if we already saved this URL from this exact email
      const { data: existing } = await sb
        .from("devex_benchmark")
        .select("id")
        .eq("inbound_email_id", messageId)
        .eq("url", e.url)
        .maybeSingle();
      if (existing) { skipped++; continue; }

      const { error } = await sb.from("devex_benchmark").insert({
        inbound_email_id: messageId,
        email_subject: subject.slice(0, 500),
        email_from: from.slice(0, 200),
        batch_date: parsed.batch_date,
        alert_type: parsed.alert_type,
        title: e.title,
        url: e.url,
        organization: e.organization,
        country: e.country,
        posted_date: e.posted_date,
        deadline: e.deadline,
        raw_snippet: e.raw_snippet,
      });
      if (!error) saved++;
    }

    const lines = [
      `<b>📥 Devex email parsed</b>`,
      ``,
      `Subject: ${subject}`,
      `Type: ${parsed.alert_type}`,
      `Batch: ${parsed.batch_date || "?"}`,
      `Entries extracted: <b>${parsed.entries.length}</b>`,
      `Saved: ${saved}${skipped ? ` (skipped ${skipped} dupes)` : ""}`,
    ].join("\n");
    await notifyAdmin(lines);

    return NextResponse.json({ ok: true, parsed: parsed.entries.length, saved });
  } catch (err: any) {
    console.error("[inbound/devex]", err);
    try {
      await notifyAdmin(`<b>⚠️ Devex inbound failed</b>\n\n${(err?.message || String(err)).slice(0, 500)}`);
    } catch {}
    return NextResponse.json({ error: err?.message || "Failed" }, { status: 500 });
  }
}

// Resend may send a GET-based verification ping when setting up the webhook
export async function GET() {
  return NextResponse.json({ ok: true, service: "devex-inbound" });
}
