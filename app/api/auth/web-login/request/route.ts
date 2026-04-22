import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

/**
 * POST /api/auth/web-login/request
 *
 * Start a bot-based web login. Generates a one-time token and returns the
 * Telegram deep link the user taps to confirm their identity in the bot.
 *
 * Flow:
 *  1. Client POSTs here, gets { token, tg_url }.
 *  2. Client opens tg_url in a new tab (or the Telegram app on mobile).
 *  3. User lands on the bot, presses Start — bot handler looks up the token,
 *     resolves their canonical auth user, writes a magic-link token_hash
 *     back into login_tokens, and replies in chat.
 *  4. Client polls /api/auth/web-login/check?token=… until magic_token_hash
 *     is present, then calls supabase.auth.verifyOtp to establish a session.
 */
export async function POST(req: NextRequest) {
  try {
    const token = crypto.randomBytes(12).toString("base64url"); // 16 chars URL-safe
    const sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { error } = await sb.from("login_tokens").insert({ token });
    if (error) {
      console.error("[web-login/request] insert failed:", error);
      return NextResponse.json({ error: "Failed to start login" }, { status: 500 });
    }

    const tg_url = `https://t.me/Devidends_Bot?start=weblogin_${token}`;
    return NextResponse.json({ token, tg_url });
  } catch (err) {
    console.error("[web-login/request]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
