import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyInitData } from "@/lib/telegram-auth";
import { getOrCreateTelegramProfile } from "@/lib/telegram-auth";

/**
 * POST /api/auth/telegram-web
 *
 * Accepts Telegram Mini App initData (sent by TelegramAutoAuth on the web).
 * Verifies it server-side, creates/finds a Supabase auth user for the Telegram user,
 * and returns a magic-link token the client can use to establish a real Supabase session.
 *
 * Body: { initData: string }  — raw URLSearchParams string from window.Telegram.WebApp.initData
 */
export async function POST(req: NextRequest) {
  try {
    const { initData } = await req.json();
    if (!initData || typeof initData !== "string") {
      return NextResponse.json({ error: "initData required" }, { status: 400 });
    }

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
      return NextResponse.json({ error: "Bot not configured" }, { status: 500 });
    }

    // Verify initData using Mini App HMAC method
    const verified = verifyInitData(initData, botToken);
    if (!verified) {
      return NextResponse.json({ error: "Invalid or expired Telegram data" }, { status: 401 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { user: tgUser } = verified;
    const telegramId = String(tgUser.id);
    const syntheticEmail = `tg_${telegramId}@users.devidends.app`;

    // Ensure profile exists
    await getOrCreateTelegramProfile(tgUser);

    // Find or create Supabase auth user
    const { data: listData } = await supabase.auth.admin.listUsers({ perPage: 1000 });
    const existingUser = listData?.users?.find((u) => u.email === syntheticEmail);

    let supabaseUserId: string;

    if (existingUser) {
      supabaseUserId = existingUser.id;
    } else {
      const fullName = [tgUser.first_name, tgUser.last_name].filter(Boolean).join(" ");
      const { data: created, error: createErr } = await supabase.auth.admin.createUser({
        email: syntheticEmail,
        email_confirm: true,
        user_metadata: {
          telegram_id: telegramId,
          name: fullName,
          username: tgUser.username,
        },
      });
      if (createErr || !created.user) {
        return NextResponse.json({ error: "Failed to create user" }, { status: 500 });
      }
      supabaseUserId = created.user.id;
    }

    // Link Supabase user ID to profile
    await supabase
      .from("profiles")
      .update({ user_id: supabaseUserId })
      .eq("telegram_id", telegramId)
      .is("user_id", null);

    // Generate a one-time magic link token
    const { data: linkData, error: linkErr } = await supabase.auth.admin.generateLink({
      type: "magiclink",
      email: syntheticEmail,
    });

    if (linkErr || !linkData?.properties?.hashed_token) {
      return NextResponse.json({ error: "Failed to generate session token" }, { status: 500 });
    }

    return NextResponse.json({
      token_hash: linkData.properties.hashed_token,
      email: syntheticEmail,
      profile: { telegram_id: telegramId },
    });
  } catch (err) {
    console.error("[telegram-web auth]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
