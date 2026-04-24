import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { parseDevexEmail } from "@/lib/devex-parser";

/**
 * GET /api/cron/devex-poll
 *
 * Polls a dedicated Gmail mailbox via IMAP for newly-forwarded Devex
 * alert emails. Parses each one into opportunities, stores in
 * devex_benchmark.
 *
 * Env vars required:
 *   DEVEX_INBOX_EMAIL         e.g. devidends.devex.feed@gmail.com
 *   DEVEX_INBOX_APP_PASSWORD  Gmail App Password (16-char)
 *
 * Gmail IMAP defaults: imap.gmail.com:993 with TLS.
 *
 * Strategy:
 *   1. Connect via IMAP, open INBOX
 *   2. Search: messages from alerts@devex.com, received in last 3 days,
 *      and NOT flagged \Seen (so we don't re-process)
 *   3. For each: fetch full MIME, parse HTML, extract entries, save
 *   4. Mark as Seen so it won't be picked up again
 *   5. Log a summary to admin Telegram on completion
 *
 * Runs on a Vercel cron (see vercel.json) every 4 hours.
 */

export const maxDuration = 120;

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
      body: JSON.stringify({ chat_id: ADMIN_TG, text, parse_mode: "HTML", disable_web_page_preview: true }),
    });
  } catch {}
}

export async function GET(_req: NextRequest) {
  const email = process.env.DEVEX_INBOX_EMAIL;
  const pass = process.env.DEVEX_INBOX_APP_PASSWORD;
  if (!email || !pass) {
    return NextResponse.json({ error: "DEVEX_INBOX_EMAIL and DEVEX_INBOX_APP_PASSWORD env vars not set" }, { status: 500 });
  }

  const client = new ImapFlow({
    host: "imap.gmail.com",
    port: 993,
    secure: true,
    auth: { user: email, pass },
    logger: false,
  });

  let totalProcessed = 0;
  let totalEntries = 0;
  let errors = 0;
  const sb = getAdmin();

  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");

    try {
      // Search: Devex emails from last 3 days, unseen
      const since = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
      const uids = await client.search({
        from: "alerts@devex.com",
        since,
        seen: false,
      });

      if (!uids || uids.length === 0) {
        await client.logout();
        return NextResponse.json({ ok: true, polled: 0, note: "no new Devex emails" });
      }

      // Cap per-run to avoid timeout (IMAP + parsing is slow). The rest is
      // picked up on the next cron tick.
      const cappedUids = uids.slice(0, 30);

      for await (const msg of client.fetch(cappedUids, { source: true, envelope: true, uid: true })) {
        try {
          const raw = msg.source?.toString("utf-8") || "";
          if (!raw) continue;
          const parsed = await simpleParser(raw);
          const subject = parsed.subject || "";
          const html = (parsed.html as string) || parsed.textAsHtml || parsed.text || "";
          const messageId = parsed.messageId || `imap-uid-${msg.uid}`;

          const devex = parseDevexEmail(subject, html);

          // Persist entries; dedup by (inbound_email_id, url)
          let saved = 0;
          for (const e of devex.entries) {
            const { data: existing } = await sb
              .from("devex_benchmark")
              .select("id")
              .eq("inbound_email_id", messageId)
              .eq("url", e.url)
              .maybeSingle();
            if (existing) continue;
            const { error } = await sb.from("devex_benchmark").insert({
              inbound_email_id: messageId,
              email_subject: subject.slice(0, 500),
              email_from: (parsed.from?.text || "").slice(0, 200),
              batch_date: devex.batch_date,
              alert_type: devex.alert_type,
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

          totalEntries += saved;
          totalProcessed++;

          // Mark as Seen so we don't reprocess
          await client.messageFlagsAdd([msg.uid], ["\\Seen"], { uid: true });
        } catch (e) {
          errors++;
          console.error("[devex-poll] per-message error:", (e as Error).message);
        }
      }
    } finally {
      lock.release();
    }

    await client.logout();
  } catch (err: any) {
    console.error("[devex-poll] fatal:", err?.message);
    await notifyAdmin(`<b>⚠️ Devex IMAP poll failed</b>\n\n${(err?.message || String(err)).slice(0, 500)}`);
    return NextResponse.json({ error: err?.message || "IMAP failed" }, { status: 500 });
  }

  if (totalProcessed > 0 || errors > 0) {
    const lines = [
      `<b>📥 Devex poll</b>`,
      ``,
      `Emails processed: ${totalProcessed}`,
      `Entries saved: <b>${totalEntries}</b>`,
      errors > 0 ? `Errors: ${errors}` : null,
    ].filter(Boolean).join("\n");
    await notifyAdmin(lines);
  }

  return NextResponse.json({ ok: true, processed: totalProcessed, entries: totalEntries, errors });
}
