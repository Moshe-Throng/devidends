import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * POST /api/for-firms/request
 *
 * Public endpoint — anyone can submit. Minimal trust required.
 * On submit:
 *   1. Insert into shortlist_requests table for tracking.
 *   2. DM Mussie (chat_id 297659579) via the bot with the full payload.
 *   3. Return 200 on success. Submitter gets a confirmation on the client.
 *
 * No Resend on v1 — DM lands in the admin's pocket immediately, which is
 * the only channel that matters for responding within 24h. Email
 * confirmation can come later.
 */

export const maxDuration = 30;

const ADMIN_TG_ID = "297659579";

type Payload = {
  firm_name?: string;
  contact_name?: string;
  contact_email?: string;
  contact_role?: string;
  role_description?: string;
  deadline?: string;
  source?: string;
};

function escHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function validate(p: Payload): string | null {
  if (!p.firm_name || p.firm_name.trim().length < 2) return "Firm name is required.";
  if (!p.contact_name || p.contact_name.trim().length < 2) return "Your name is required.";
  if (!p.contact_email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.contact_email)) return "Valid email is required.";
  if (!p.role_description || p.role_description.trim().length < 20)
    return "Please describe what you're sourcing for (at least 20 characters).";
  return null;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Payload;
    const err = validate(body);
    if (err) return NextResponse.json({ error: err }, { status: 400 });

    const payload = {
      firm_name: (body.firm_name || "").trim().slice(0, 200),
      contact_name: (body.contact_name || "").trim().slice(0, 200),
      contact_email: (body.contact_email || "").trim().slice(0, 200),
      contact_role: (body.contact_role || "").trim().slice(0, 200),
      role_description: (body.role_description || "").trim().slice(0, 8000),
      deadline: (body.deadline || "").trim().slice(0, 200),
      source: (body.source || "").trim().slice(0, 200),
      created_at: new Date().toISOString(),
    };

    // Best-effort persist. If the table doesn't exist yet, we still DM admin.
    try {
      const sb = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );
      await sb.from("shortlist_requests").insert(payload);
    } catch (e) {
      console.warn("[for-firms/request] insert skipped:", (e as Error).message);
    }

    // DM Mussie immediately with the request details
    const BOT = process.env.TELEGRAM_BOT_TOKEN;
    if (BOT) {
      const lines = [
        `<b>📥 New shortlist request</b>`,
        ``,
        `<b>Firm:</b> ${escHtml(payload.firm_name)}`,
        `<b>Contact:</b> ${escHtml(payload.contact_name)}${payload.contact_role ? ` (${escHtml(payload.contact_role)})` : ""}`,
        `<b>Email:</b> ${escHtml(payload.contact_email)}`,
        payload.deadline ? `<b>Deadline:</b> ${escHtml(payload.deadline)}` : null,
        payload.source ? `<b>Source:</b> ${escHtml(payload.source)}` : null,
        ``,
        `<b>Role description:</b>`,
        `<pre>${escHtml(payload.role_description).slice(0, 3500)}</pre>`,
      ]
        .filter(Boolean)
        .join("\n");
      try {
        await fetch(`https://api.telegram.org/bot${BOT}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: ADMIN_TG_ID,
            text: lines,
            parse_mode: "HTML",
            disable_web_page_preview: true,
          }),
        });
      } catch (e) {
        console.warn("[for-firms/request] tg dm failed:", (e as Error).message);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("[for-firms/request]", err);
    return NextResponse.json({ error: err?.message || "Failed to submit" }, { status: 500 });
  }
}
