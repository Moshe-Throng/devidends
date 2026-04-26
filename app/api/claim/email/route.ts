import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * POST /api/claim/email
 * Body: { token, email }
 *
 * Used by the universal /claim/<token> landing page when a user picks the
 * "email instead of Telegram" path. Generates a Supabase magic link bound
 * to the email and sends it through Resend. The magic link redirects to
 * /claim/<token>/finalize, which links the auth user to the profile and
 * marks claimed.
 *
 * Safety:
 *   - Profile must have a claim_token.
 *   - If profile.email is already set and doesn't match, reject (prevents
 *     mailing magic links to arbitrary addresses on someone else's profile).
 *   - Already-claimed profiles still get a magic link — clicking it just
 *     signs them into the hub without re-claiming.
 */

export const maxDuration = 30;

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

function siteUrl() {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.SITE_URL ||
    "https://devidends.net"
  );
}

export async function POST(req: NextRequest) {
  try {
    const { token, email } = await req.json();
    if (!token || !email) {
      return NextResponse.json({ error: "token and email required" }, { status: 400 });
    }
    const cleanEmail = String(email).trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return NextResponse.json({ error: "valid email required" }, { status: 400 });
    }

    const sb = getAdmin();

    const { data: profile } = await sb
      .from("profiles")
      .select("id, name, email, is_recommender")
      .eq("claim_token", token)
      .maybeSingle();

    if (!profile) {
      return NextResponse.json({ error: "Invalid or expired claim link" }, { status: 404 });
    }

    if (profile.email && profile.email.toLowerCase() !== cleanEmail) {
      return NextResponse.json(
        {
          error:
            "This profile is registered to a different email. Contact us at contact@devidends.net if this is yours.",
        },
        { status: 403 },
      );
    }

    if (!profile.email) {
      await sb.from("profiles").update({ email: cleanEmail }).eq("id", profile.id);
    }

    // Generate magic link. The redirect lands on /claim/<token>/finalize, which
    // looks up the just-authenticated user, calls /api/claim/web internally to
    // attach user_id + claimed_at, then bounces to /tg-app.
    const redirectTo = `${siteUrl()}/claim/${encodeURIComponent(token)}/finalize`;
    const { data: linkData, error: linkErr } = await sb.auth.admin.generateLink({
      type: "magiclink",
      email: cleanEmail,
      options: { redirectTo },
    });
    if (linkErr || !linkData?.properties?.action_link) {
      console.error("[claim/email] generateLink:", linkErr);
      return NextResponse.json(
        { error: "Could not generate sign-in link. Please try again or use Telegram." },
        { status: 500 },
      );
    }

    const actionLink = linkData.properties.action_link as string;

    const resendKey = process.env.RESEND_API_KEY;
    if (!resendKey) {
      console.error("[claim/email] RESEND_API_KEY missing");
      return NextResponse.json({ error: "Email service unavailable" }, { status: 500 });
    }

    const isRecommender = !!profile.is_recommender;
    const firstName = (profile.name || "").split(/\s+/)[0] || "there";

    const subject = isRecommender
      ? `${firstName}, your Devidends Co-Creator profile`
      : `${firstName}, your Devidends profile is ready`;

    const html = isRecommender
      ? recommenderEmailHtml(firstName, actionLink)
      : expertEmailHtml(firstName, actionLink);

    const sendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Devidends Team <hello@devidends.net>",
        to: cleanEmail,
        subject,
        html,
      }),
    });
    if (!sendRes.ok) {
      const body = await sendRes.text();
      console.error("[claim/email] resend:", sendRes.status, body.slice(0, 300));
      return NextResponse.json({ error: "Couldn't send the email. Please try again." }, { status: 502 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[claim/email] fatal:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

// ── Email templates ─────────────────────────────────────────────────────────

function shellEmailHtml(headline: string, body: string, ctaLink: string, ctaLabel: string) {
  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#f5f7fa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#212121;">
<div style="max-width:560px;margin:0 auto;padding:32px 24px;">
  <div style="text-align:center;margin-bottom:24px;font-size:22px;font-weight:800;letter-spacing:-0.5px;">
    <span style="color:#27ABD2;">Dev</span><span style="color:#212121;">idends</span>
  </div>
  <div style="background:#ffffff;border-radius:14px;padding:28px;border:1px solid #e5e7eb;">
    <h1 style="margin:0 0 12px 0;font-size:22px;line-height:1.3;color:#1F3A5F;">${headline}</h1>
    ${body}
    <div style="text-align:center;margin:28px 0 8px 0;">
      <a href="${ctaLink}" style="display:inline-block;padding:14px 32px;background:#27ABD2;color:#ffffff;font-weight:700;border-radius:10px;text-decoration:none;font-size:15px;">${ctaLabel}</a>
    </div>
    <p style="font-size:12px;color:#6b7280;text-align:center;margin:16px 0 0 0;">
      Link expires in 10 minutes. If you didn&rsquo;t request this, ignore the email — no account is created.
    </p>
  </div>
  <p style="text-align:center;font-size:12px;color:#9ca3af;margin-top:18px;">
    — The Devidends Team · <a href="https://devidends.net" style="color:#9ca3af;">devidends.net</a>
  </p>
</div>
</body></html>`;
}

function recommenderEmailHtml(firstName: string, link: string) {
  const body = `
    <p style="margin:0 0 14px 0;color:#374151;line-height:1.55;font-size:15px;">Hi ${firstName},</p>
    <p style="margin:0 0 14px 0;color:#374151;line-height:1.55;font-size:15px;">
      You&rsquo;re in the Devidends <b>Co-Creator circle</b> — the senior Ethiopian
      consultants the network is built around. Tap below to enter the Hub:
    </p>
    <ul style="margin:0 0 14px 18px;padding:0;color:#374151;font-size:14px;line-height:1.8;">
      <li>Your referrals + intros + the network you&rsquo;ve built</li>
      <li>Drop CVs anytime — they get ingested under your name</li>
      <li>Live opportunities matched to your profile</li>
      <li>Attribution credit on every assignment that lands</li>
    </ul>`;
  return shellEmailHtml("You&rsquo;re in our Co-Creator circle.", body, link, "Open the Dev Hub");
}

function expertEmailHtml(firstName: string, link: string) {
  const body = `
    <p style="margin:0 0 14px 0;color:#374151;line-height:1.55;font-size:15px;">Hi ${firstName},</p>
    <p style="margin:0 0 14px 0;color:#374151;line-height:1.55;font-size:15px;">
      Your professional profile is on Devidends — the AI intel platform for the
      development consulting market in Ethiopia and the Horn. Tap below to enter:
    </p>
    <ul style="margin:0 0 14px 18px;padding:0;color:#374151;font-size:14px;line-height:1.8;">
      <li>Daily intel — jobs, consultancies, tenders matched to your profile</li>
      <li>Live CV scoring against GIZ, FCDO, World Bank and EU standards</li>
      <li>CV tailoring + donor-format templates on demand</li>
      <li>Be recommended into live opportunities by the network</li>
    </ul>`;
  return shellEmailHtml("Your Devidends profile is ready.", body, link, "Open the Dev Hub");
}
