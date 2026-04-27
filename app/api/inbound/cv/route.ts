import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * POST /api/inbound/cv
 *
 * Inbound CV ingest for recommenders who don't use Telegram. Configured in
 * the Resend dashboard to deliver mail addressed to cv@devidends.net.
 *
 * Flow:
 *   1. Recommender (known by email) sends a CV to cv@devidends.net.
 *   2. Resend POSTs the parsed message here, including base64 attachments.
 *   3. We pick the first PDF/DOCX attachment, run it through the same
 *      Claude ingest pipeline as the Telegram drop, create or update the
 *      subject profile, and write an attribution row.
 *   4. We reply to the sender (via Resend) with a summary + the subject's
 *      claim link to forward.
 *
 * If the sender isn't on a recommender profile, we politely decline and
 * point them at the universal claim flow so they can claim first.
 */

export const maxDuration = 60;

const ADMIN_TG = "297659579";
const SITE_URL = "https://www.devidends.net";

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
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

async function sendReply(opts: {
  to: string;
  subject: string;
  html: string;
  inReplyTo?: string;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("[inbound/cv] RESEND_API_KEY missing — skipping reply");
    return;
  }
  try {
    const headers: Record<string, string> = opts.inReplyTo
      ? { "In-Reply-To": opts.inReplyTo, "References": opts.inReplyTo }
      : {};
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from: "Devidends Team <cv@devidends.net>",
        to: opts.to,
        subject: opts.subject,
        html: opts.html,
        headers,
      }),
    });
  } catch (e) {
    console.warn("[inbound/cv] reply send failed:", (e as Error).message);
  }
}

const escHtml = (s: string) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function emailFooter() {
  return `
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;" />
    <p style="font-size:12px;color:#6b7280;line-height:1.5;">
      Devidends — the development consulting network for the Horn of Africa.<br/>
      You're receiving this because you sent a message to <b>cv@devidends.net</b>. Reply to this email to reach the team.
    </p>
  `;
}

/**
 * Attachment shape across the inbound parsers we accept:
 *   - Resend: { filename, content_type, content (base64) }
 *   - CloudMailin: { file_name, content_type, content (base64), size, disposition }
 *   - Postmark/Mailgun-ish variants
 * We accept any of the field aliases.
 */
interface InboundAttachment {
  filename?: string;
  file_name?: string;
  content_type?: string;
  contentType?: string;
  content?: string;
  contentBytes?: string;
  size?: number;
  disposition?: string;
}

function pickCvAttachment(arr: InboundAttachment[]): {
  buffer: Buffer;
  filename: string;
} | null {
  for (const a of arr || []) {
    const filename = a.filename || a.file_name || "";
    const fn = filename.toLowerCase();
    const ct = (a.content_type || a.contentType || "").toLowerCase();
    const isCv =
      /\.(pdf|docx|doc)$/.test(fn) ||
      ct.includes("pdf") ||
      ct.includes("officedocument") ||
      ct.includes("msword");
    if (!isCv) continue;
    const b64 = a.content || a.contentBytes;
    if (!b64) continue;
    try {
      return { buffer: Buffer.from(b64, "base64"), filename: filename || "cv.pdf" };
    } catch {
      continue;
    }
  }
  return null;
}

function extractSenderEmail(from: string): string | null {
  const m = from.match(/<([^>]+)>/);
  if (m) return m[1].trim().toLowerCase();
  if (from.includes("@")) return from.trim().toLowerCase();
  return null;
}

export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch (e) {
    // Bad payload — don't 5xx (CloudMailin would retry forever). Just ack.
    console.warn("[inbound/cv] malformed JSON body:", (e as Error).message);
    return NextResponse.json({ ok: true, handled: "parse_error" });
  }
  try {

    // Normalize across parser shapes (Resend, CloudMailin, Postmark, ...).
    // CloudMailin nests headers under `headers`, sender under `envelope.from`,
    // and lists attachments at the top level. Resend flattens everything.
    const env = body.envelope || {};
    const headers = body.headers || {};
    const fromRaw: string =
      body.from ||
      body.from_email ||
      env.from ||
      headers.From ||
      headers.from ||
      "";
    const subject: string = body.subject || headers.Subject || headers.subject || "";
    const messageId: string =
      body.message_id ||
      body.id ||
      headers["Message-ID"] ||
      headers["Message-Id"] ||
      "";
    const attachments: InboundAttachment[] = body.attachments || [];

    const senderEmail = extractSenderEmail(fromRaw);
    if (!senderEmail) {
      await notifyAdmin(`<b>⚠️ Inbound CV: missing sender</b>\n\nFrom: ${escHtml(fromRaw)}`);
      return NextResponse.json({ ok: true, handled: "no_sender" });
    }

    const sb = getAdmin();

    // 1. Look up the sender as a recommender. We only ingest CVs from
    //    known recommenders — otherwise anyone could spray the inbox.
    const { data: sender } = await sb
      .from("profiles")
      .select("id, name, email, is_recommender, claim_token")
      .ilike("email", senderEmail)
      .maybeSingle();

    if (!sender) {
      // Unknown sender — bounce politely with the claim landing pointer.
      await sendReply({
        to: senderEmail,
        subject: `Re: ${subject || "your message"}`,
        inReplyTo: messageId,
        html: `
          <p>Thanks for writing in.</p>
          <p>This inbox accepts CVs from recommenders we already know. Your email isn't on a recommender profile yet, so we couldn't process the attachment.</p>
          <p>If someone shared a Devidends claim link with you, open it from your phone and tap <b>Open in Telegram</b> or use the email magic-link option — that links your address to your profile in one step.</p>
          <p>Or write to <b>contact@devidends.net</b> and we'll set you up.</p>
          ${emailFooter()}
        `,
      });
      await notifyAdmin(
        `<b>📬 Inbound CV from unknown sender</b>\n\nFrom: ${escHtml(senderEmail)}\nSubject: ${escHtml(subject)}\n\nReplied with the claim-flow pointer.`,
      );
      return NextResponse.json({ ok: true, handled: "unknown_sender" });
    }

    if (!sender.is_recommender) {
      await sendReply({
        to: senderEmail,
        subject: `Re: ${subject || "your message"}`,
        inReplyTo: messageId,
        html: `
          <p>Hi ${escHtml((sender.name || "").split(/\s+/)[0] || "there")},</p>
          <p>You're on Devidends, but your profile isn't on the recommender track — so I can't ingest CVs in your name from this inbox.</p>
          <p>If you'd like to bring people into the network, reply to this email and we'll convert your profile.</p>
          ${emailFooter()}
        `,
      });
      return NextResponse.json({ ok: true, handled: "non_recommender" });
    }

    // 2. Pull the CV attachment.
    const cv = pickCvAttachment(attachments);
    if (!cv) {
      await sendReply({
        to: senderEmail,
        subject: `Re: ${subject || "your message"}`,
        inReplyTo: messageId,
        html: `
          <p>Hi ${escHtml((sender.name || "").split(/\s+/)[0] || "there")},</p>
          <p>I didn't see a CV attached (PDF or DOCX). If you meant to send one, reply to this email with it attached and I'll ingest under your name.</p>
          ${emailFooter()}
        `,
      });
      return NextResponse.json({ ok: true, handled: "no_attachment" });
    }

    // 3. Extract text → structured data via the same pipeline as Telegram.
    const { extractText } = await import("@/lib/file-parser");
    const cvText = await extractText(cv.buffer, cv.filename);
    if (!cvText || cvText.trim().length < 200) {
      await sendReply({
        to: senderEmail,
        subject: `Re: ${subject || "your message"}`,
        inReplyTo: messageId,
        html: `
          <p>Hi ${escHtml((sender.name || "").split(/\s+/)[0] || "there")},</p>
          <p>I couldn't extract enough text from <b>${escHtml(cv.filename)}</b> — the file may be a scanned image or password-protected. Could you re-send a text-based PDF or DOCX?</p>
          ${emailFooter()}
        `,
      });
      return NextResponse.json({ ok: true, handled: "extract_failed" });
    }

    const { extractCvData } = await import("@/lib/cv-extractor");
    const trimmedText = cvText.length > 30000
      ? cvText.slice(0, 30000) + "\n\n[... CV continues with additional consultancy assignments ...]"
      : cvText;
    const { data: cvStructured } = await extractCvData(trimmedText);

    const personal = cvStructured?.personal || {};
    const expertName = (personal.full_name || "").trim();
    const empCount = (cvStructured?.employment || []).length;
    const eduCount = (cvStructured?.education || []).length;
    if (!expertName || expertName.toLowerCase() === "unknown" || (empCount === 0 && eduCount === 0)) {
      await sendReply({
        to: senderEmail,
        subject: `Re: ${subject || "your message"}`,
        inReplyTo: messageId,
        html: `
          <p>Hi ${escHtml((sender.name || "").split(/\s+/)[0] || "there")},</p>
          <p>I read <b>${escHtml(cv.filename)}</b> but couldn't pull a clean structured profile out of it. The format may be unusual. No profile was created. Reply with a different version of the CV if you have one.</p>
          ${emailFooter()}
        `,
      });
      return NextResponse.json({ ok: true, handled: "extract_empty" });
    }

    // 4. Build profile data.
    const empDates = (cvStructured?.employment || [])
      .map((e: any) => e.from_date)
      .filter(Boolean)
      .sort();
    let yearsOfExperience: number | null = null;
    if (empDates.length > 0) {
      const earliest = new Date(empDates[0]).getFullYear();
      if (earliest > 1970) yearsOfExperience = new Date().getFullYear() - earliest;
    }
    const yrs = yearsOfExperience || 0;
    const profileType = yrs >= 15 ? "Expert" : yrs >= 10 ? "Senior" : yrs >= 5 ? "Mid-level" : yrs >= 2 ? "Junior" : "Entry";
    const languages = cvStructured?.languages?.map((l: any) => l.language).filter(Boolean) || [];
    const degrees = (cvStructured?.education || []).map((e: any) => e.degree || "");
    const eduLevel =
      degrees.some((d: string) => /PhD|Doctorate/i.test(d)) ? "PhD"
      : degrees.some((d: string) => /Master|MSc|MA|MBA|MPH|MPA/i.test(d)) ? "Masters"
      : degrees.some((d: string) => /Bachelor|BSc|BA|BEng|LLB/i.test(d)) ? "Bachelors"
      : null;
    const tags: string[] = ["email_inbound"];
    if (yrs >= 15) tags.push("expert");
    else if (yrs >= 10) tags.push("senior");
    if (languages.length >= 3) tags.push("multilingual");

    const { randomUUID } = await import("crypto");
    const claimToken = randomUUID().replace(/-/g, "").slice(0, 8);

    const profileData = {
      name: expertName,
      email: personal.email || null,
      phone: personal.phone || null,
      nationality: personal.nationality || null,
      city: personal.address || personal.country_of_residence || null,
      sectors: [] as string[],
      donors: [] as string[],
      countries: cvStructured?.countries_of_experience || [],
      skills: [] as string[],
      qualifications: cvStructured?.education?.[0]
        ? `${cvStructured.education[0].degree} in ${cvStructured.education[0].field_of_study}, ${cvStructured.education[0].institution}`
        : null,
      years_of_experience: yearsOfExperience,
      profile_type: profileType,
      cv_text: cvText.slice(0, 50000),
      cv_structured_data: cvStructured,
      languages,
      education_level: eduLevel,
      tags,
      recommended_by: sender.name || null,
      admin_notes: `Added by ${sender.name || senderEmail} via email`,
      source: "email_inbound" as const,
    };

    // 5. Dedup by email > exact name.
    let existing: { id: string; name: string; claim_token: string | null } | null = null;
    if (personal.email) {
      const { data } = await sb
        .from("profiles")
        .select("id, name, claim_token")
        .eq("email", personal.email)
        .limit(1)
        .maybeSingle();
      if (data) existing = data;
    }
    const nameLooksReal = expertName.length >= 4 && expertName.split(/\s+/).length >= 2;
    if (!existing && nameLooksReal) {
      const { data } = await sb
        .from("profiles")
        .select("id, name, claim_token")
        .ilike("name", expertName)
        .limit(1)
        .maybeSingle();
      if (data) existing = data;
    }

    let profileId: string | null = null;
    let isUpdate = false;
    let finalToken = claimToken;
    if (existing) {
      isUpdate = true;
      profileId = existing.id;
      finalToken = existing.claim_token || claimToken;
      await sb.from("profiles").update(profileData).eq("id", existing.id);
    } else {
      const { data: created, error } = await sb
        .from("profiles")
        .insert({ ...profileData, claim_token: claimToken })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      profileId = (created as any)?.id || null;
    }

    // 6. Attribution row (idempotent — one per (contributor, subject, type)).
    let attributionId: string | null = null;
    if (profileId) {
      const { data: existingAttr } = await sb
        .from("attributions")
        .select("id")
        .eq("contributor_profile_id", sender.id)
        .eq("subject_profile_id", profileId)
        .eq("attribution_type", "referral_member")
        .maybeSingle();
      if (existingAttr) {
        attributionId = (existingAttr as any).id;
      } else {
        const { data: created } = await sb
          .from("attributions")
          .insert({
            attribution_type: "referral_member",
            contributor_profile_id: sender.id,
            subject_profile_id: profileId,
            firm_name: "Devidends network",
            opportunity_title: `CV ingest by ${sender.name}`,
            stage: "introduced",
            occurred_at: new Date().toISOString().slice(0, 10),
            source_of_record: "email_inbound",
            confidence: "high",
            notes: `${sender.name} emailed this CV to cv@devidends.net on ${new Date().toISOString().slice(0, 10)}.`,
          })
          .select("id")
          .single();
        attributionId = (created as any)?.id || null;
      }
    }

    // 7. Reply to the recommender with the summary + claim link.
    const claimLink = `${SITE_URL}/claim/${finalToken}`;
    const sectorsPreview = (profileData.countries || []).slice(0, 3).join(" · ") || "sectors pending";
    const yrsStr = yearsOfExperience ? `${yearsOfExperience}y exp` : "years unclear";

    await sendReply({
      to: senderEmail,
      subject: `Re: ${subject || `CV ingest — ${expertName}`}`,
      inReplyTo: messageId,
      html: `
        <p>Hi ${escHtml((sender.name || "").split(/\s+/)[0] || "there")},</p>
        <p>${isUpdate ? "Updated" : "Added"} <b>${escHtml(expertName)}</b> to the network, tagged as recommended by you.</p>
        <ul style="line-height:1.7;">
          <li>${escHtml(yrsStr)} · ${escHtml(profileType)}</li>
          ${profileData.countries.length ? `<li>Countries: ${escHtml(sectorsPreview)}</li>` : ""}
          ${eduLevel ? `<li>Education: ${escHtml(eduLevel)}</li>` : ""}
        </ul>
        <p><b>Forward this claim link to ${escHtml(expertName.split(/\s+/)[0] || "them")}:</b></p>
        <p><a href="${claimLink}" style="display:inline-block;background:#27ABD2;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:bold;">${claimLink}</a></p>
        <p>When they tap it, they can claim via Telegram <i>or</i> via a one-click magic link to their email — same flow either way.</p>
        <p>Want to send another CV? Just reply to this email with the file attached.</p>
        ${emailFooter()}
      `,
    });

    await notifyAdmin(
      `<b>📥 CV ingested via email</b>\n\nFrom: ${escHtml(sender.name || senderEmail)}\nSubject CV: <b>${escHtml(expertName)}</b>\n${isUpdate ? "Updated" : "Created"} profile · attribution ${attributionId ? "logged" : "skipped"}.`,
    );

    return NextResponse.json({
      ok: true,
      action: isUpdate ? "updated" : "created",
      profile_id: profileId,
      claim_token: finalToken,
    });
  } catch (err: any) {
    console.error("[inbound/cv]", err);
    try {
      await notifyAdmin(`<b>⚠️ Inbound CV failed</b>\n\n${(err?.message || String(err)).slice(0, 500)}`);
    } catch {}
    return NextResponse.json({ error: err?.message || "Failed" }, { status: 500 });
  }
}

// Resend may send a GET-based verification ping when setting up the webhook.
export async function GET() {
  return NextResponse.json({ ok: true, service: "cv-inbound" });
}
