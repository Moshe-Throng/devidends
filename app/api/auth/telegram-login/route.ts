import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

/**
 * POST /api/auth/telegram-login
 *
 * Handles Telegram Login Widget callbacks (web, NOT the mini app).
 * The widget sends { id, first_name, last_name, username, photo_url, auth_date, hash }
 * signed with HMAC-SHA-256 using sha256(bot_token) as the secret key.
 *
 * Flow:
 *  1. Verify the HMAC hash.
 *  2. Find or create a Supabase auth user keyed on `tg_<id>@users.devidends.app`
 *     (synthetic email — TG widget doesn't give us real emails).
 *  3. Link the auth user to any existing profile with that telegram_id.
 *  4. Return a one-time magic-link token the client exchanges for a session.
 *
 * Widget setup: in @BotFather, /setdomain → devidends.net (plus any preview
 * domains we want the widget to work on).
 */

interface TgAuthData {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
}

function verifyTelegramLoginPayload(data: Record<string, string>, botToken: string): boolean {
  const { hash, ...fields } = data;
  if (!hash) return false;
  // Data-check-string: fields sorted alphabetically by key, joined `key=value\n`
  const dataCheckString = Object.keys(fields)
    .sort()
    .map((k) => `${k}=${fields[k]}`)
    .join("\n");
  // Secret = SHA-256 of the bot token
  const secret = crypto.createHash("sha256").update(botToken).digest();
  const hmac = crypto.createHmac("sha256", secret).update(dataCheckString).digest("hex");
  return hmac === hash;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) return NextResponse.json({ error: "Bot not configured" }, { status: 500 });

    // The widget payload lands as a flat object — all values arrive as strings.
    const raw: Record<string, string> = {};
    for (const [k, v] of Object.entries(body)) raw[k] = String(v);

    if (!verifyTelegramLoginPayload(raw, botToken)) {
      return NextResponse.json({ error: "Invalid Telegram signature" }, { status: 401 });
    }

    const authDate = parseInt(raw.auth_date, 10);
    if (!authDate || Date.now() / 1000 - authDate > 24 * 60 * 60) {
      return NextResponse.json({ error: "Auth data older than 24h" }, { status: 401 });
    }

    const data = body as TgAuthData;
    const telegramId = String(data.id);
    const syntheticEmail = `tg_${telegramId}@users.devidends.app`;
    const fullName = [data.first_name, data.last_name].filter(Boolean).join(" ");

    const sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // CANONICAL-USER POLICY: if this Telegram ID is already tied to a profile
    // with a user_id, resolve the session to THAT auth user (usually their
    // real email account). Only fall back to the synthetic tg_<id>@... user
    // if no profile / no user_id is linked yet. This keeps /profile working
    // consistently whether they come in via Google, magic link, or TG.
    const { data: existingProfile } = await sb
      .from("profiles")
      .select("id, user_id, email, name")
      .eq("telegram_id", telegramId)
      .maybeSingle();

    const { data: list } = await sb.auth.admin.listUsers({ perPage: 1000 });
    let authUserId: string;
    let resolvedEmail: string;

    const canonicalUser = existingProfile?.user_id
      ? list?.users?.find((u: any) => u.id === existingProfile.user_id)
      : null;

    if (canonicalUser) {
      authUserId = canonicalUser.id;
      resolvedEmail = canonicalUser.email || syntheticEmail;
    } else {
      // No canonical user yet — use synthetic email flow
      const existing = list?.users?.find((u: any) => u.email === syntheticEmail);
      if (existing) {
        authUserId = existing.id;
      } else {
        const { data: created, error } = await sb.auth.admin.createUser({
          email: syntheticEmail,
          email_confirm: true,
          user_metadata: {
            telegram_id: telegramId,
            name: fullName,
            username: data.username,
            photo_url: data.photo_url,
          },
        });
        if (error || !created?.user) {
          console.error("[tg-login] create user failed:", error?.message);
          return NextResponse.json({ error: "Failed to create user" }, { status: 500 });
        }
        authUserId = created.user.id;
      }
      resolvedEmail = syntheticEmail;
    }

    // Link profile to this user_id (handles both "first link" and re-linking
    // after a profile that previously had no user_id)
    await sb
      .from("profiles")
      .update({ user_id: authUserId })
      .eq("telegram_id", telegramId)
      .is("user_id", null);

    // Generate a magic-link token the client will verify to get a session.
    // Always uses the resolved (canonical) email so the session lands on the
    // user's primary auth account.
    const { data: linkData, error: linkErr } = await sb.auth.admin.generateLink({
      type: "magiclink",
      email: resolvedEmail,
    });
    if (linkErr || !linkData?.properties?.hashed_token) {
      return NextResponse.json({ error: "Failed to generate session" }, { status: 500 });
    }

    return NextResponse.json({
      token_hash: linkData.properties.hashed_token,
      email: resolvedEmail,
      telegram_id: telegramId,
    });
  } catch (err) {
    console.error("[tg-login]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
