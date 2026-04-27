/**
 * IMAP CV poller — runs from cron on the VPS, polls cv@devidends.net,
 * processes unread mail, POSTs each one to /api/inbound/cv (CloudMailin
 * shape), marks as read on success, leaves unread on failure so the
 * next run retries.
 *
 * Why this lives here instead of a third-party inbound parser:
 *   - Free, no monthly cap, no spam-budget exposure.
 *   - Hostinger hosts the mailbox already.
 *   - Same /api/inbound/cv route accepts the payload.
 *
 * Required env vars (in .env.local on the VPS):
 *   IMAP_HOST        e.g. imap.hostinger.com
 *   IMAP_PORT        e.g. 993
 *   IMAP_USER        cv@devidends.net
 *   IMAP_PASSWORD    the mailbox password
 *   INBOUND_CV_URL   https://www.devidends.net/api/inbound/cv (default)
 *   INBOUND_CV_SECRET (optional shared secret if we tighten the route later)
 *
 * Run:
 *   cd /root/devidends-crawler && npx tsx scripts/imap-cv-poller.ts
 *
 * VPS cron (every 5 minutes):
 *   *​/5 * * * * cd /root/devidends-crawler && npx tsx scripts/imap-cv-poller.ts >> /root/devidends-imap.log 2>&1
 */
import { ImapFlow } from "imapflow";
import { simpleParser, ParsedMail, AddressObject } from "mailparser";
import { config } from "dotenv";
config({ path: ".env.local" });

const HOST = process.env.IMAP_HOST || "imap.hostinger.com";
const PORT = Number(process.env.IMAP_PORT || 993);
const USER = process.env.IMAP_USER || "cv@devidends.net";
const PASS = process.env.IMAP_PASSWORD || "";
const INBOUND_URL = process.env.INBOUND_CV_URL || "https://www.devidends.net/api/inbound/cv";
const ADMIN_TG = "297659579";

if (!PASS) {
  console.error("[imap-cv] IMAP_PASSWORD not set — aborting");
  process.exit(1);
}

interface CloudMailinAttachment {
  filename: string;
  content_type: string;
  content: string; // base64
  size: number;
  disposition: string;
}

function addressToString(a: AddressObject | AddressObject[] | undefined): string {
  if (!a) return "";
  if (Array.isArray(a)) return a.map((x) => x.text || "").filter(Boolean).join(", ");
  return a.text || "";
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

function buildPayload(parsed: ParsedMail): {
  body: any;
  hasCv: boolean;
} {
  const fromText = addressToString(parsed.from);
  const toText = addressToString(parsed.to);
  const subject = parsed.subject || "";
  const messageId = parsed.messageId || "";

  const attachments: CloudMailinAttachment[] = (parsed.attachments || [])
    .filter((a) => a.content && a.filename)
    .map((a) => ({
      filename: a.filename || "attachment",
      content_type: a.contentType || "application/octet-stream",
      content: (a.content as Buffer).toString("base64"),
      size: (a.content as Buffer).length,
      disposition: a.contentDisposition || "attachment",
    }));

  const hasCv = attachments.some((a) => {
    const fn = a.filename.toLowerCase();
    const ct = a.content_type.toLowerCase();
    return /\.(pdf|docx|doc)$/.test(fn) || ct.includes("pdf") || ct.includes("officedocument") || ct.includes("msword");
  });

  // CloudMailin-shaped JSON. The /api/inbound/cv route already accepts
  // both Resend-flat and CloudMailin-nested envelopes.
  const body = {
    envelope: {
      to: toText,
      from: fromText,
    },
    headers: {
      From: fromText,
      To: toText,
      Subject: subject,
      "Message-ID": messageId,
    },
    from: fromText,
    to: toText,
    subject,
    plain: parsed.text || "",
    html: parsed.html || "",
    attachments,
    message_id: messageId,
  };

  return { body, hasCv };
}

async function processOne(client: ImapFlow, uid: number): Promise<{
  ok: boolean;
  detail: string;
  hasCv: boolean;
}> {
  const { content } = await client.download(String(uid), undefined, { uid: true });
  if (!content) return { ok: false, detail: "no body", hasCv: false };
  const parsed = await simpleParser(content);
  const { body, hasCv } = buildPayload(parsed);

  const fromText = addressToString(parsed.from);
  const subject = parsed.subject || "";

  try {
    const res = await fetch(INBOUND_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      return { ok: false, detail: `webhook ${res.status}`, hasCv };
    }
    const json = await res.json().catch(() => ({}));
    return {
      ok: true,
      detail: `from=${fromText} subject="${subject.slice(0, 60)}" handled=${json.handled || json.action || "ok"}`,
      hasCv,
    };
  } catch (e) {
    return { ok: false, detail: `webhook error: ${(e as Error).message}`, hasCv };
  }
}

(async () => {
  const client = new ImapFlow({
    host: HOST,
    port: PORT,
    secure: PORT === 993,
    auth: { user: USER, pass: PASS },
    logger: false,
  });

  let processed = 0;
  let errored = 0;
  let cvCount = 0;
  const failures: string[] = [];
  const successes: string[] = [];

  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    try {
      // Search for unseen messages.
      const uids = await client.search({ seen: false }, { uid: true });
      if (!uids || uids.length === 0) {
        console.log("[imap-cv] no new messages");
        return;
      }
      console.log(`[imap-cv] processing ${uids.length} new messages`);

      for (const uid of uids) {
        const result = await processOne(client, uid as number);
        if (result.ok) {
          processed++;
          if (result.hasCv) cvCount++;
          successes.push(result.detail);
          // Mark as seen so we don't reprocess.
          await client.messageFlagsAdd(String(uid), ["\\Seen"], { uid: true });
        } else {
          errored++;
          failures.push(`uid=${uid}: ${result.detail}`);
          // Leave unseen so the next poll retries.
        }
      }
    } finally {
      lock.release();
    }
  } catch (e) {
    console.error("[imap-cv] fatal:", (e as Error).message);
    await notifyAdmin(`<b>⚠️ IMAP poller fatal</b>\n\n${(e as Error).message.slice(0, 400)}`);
    process.exit(1);
  } finally {
    await client.logout().catch(() => {});
  }

  console.log(`[imap-cv] done: processed=${processed} (${cvCount} with CV), errored=${errored}`);
  if (errored > 0) {
    await notifyAdmin(
      `<b>⚠️ IMAP poller errors</b>\n\nProcessed: ${processed} (${cvCount} CV)\nErrored: ${errored}\n\n${failures.slice(0, 3).join("\n").slice(0, 800)}`,
    );
  }
})();
