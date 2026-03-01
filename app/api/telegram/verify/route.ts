import { NextRequest, NextResponse } from "next/server";
import { verifyInitData, getOrCreateTelegramProfile, updateTelegramProfile } from "@/lib/telegram-auth";

export async function POST(req: NextRequest) {
  try {
    const { initData, updateProfile } = await req.json();

    if (!initData || typeof initData !== "string") {
      return NextResponse.json(
        { error: "Missing initData" },
        { status: 400 }
      );
    }

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
      return NextResponse.json(
        { error: "Bot not configured" },
        { status: 500 }
      );
    }

    // Verify the initData signature
    const verified = verifyInitData(initData, botToken);
    if (!verified) {
      console.error("[telegram-verify] Hash verification failed for initData:", initData.slice(0, 100));
      return NextResponse.json(
        { error: "Invalid or expired initData" },
        { status: 401 }
      );
    }

    // Get or create profile for this Telegram user
    let profile;
    try {
      profile = await getOrCreateTelegramProfile(verified.user);

      // If updateProfile data is provided, update the profile
      if (updateProfile && profile) {
        profile = await updateTelegramProfile(String(verified.user.id), updateProfile);
      }
    } catch (profileErr) {
      const errMsg = profileErr instanceof Error ? profileErr.message : String(profileErr);
      console.error("[telegram-verify] Profile error:", errMsg);
      // Return user and the error reason so client can surface it
      return NextResponse.json({
        ok: true,
        user: verified.user,
        profile: null,
        profileError: errMsg,
      });
    }

    return NextResponse.json({
      ok: true,
      user: verified.user,
      profile,
    });
  } catch (err) {
    console.error("[telegram-verify] Error:", err);
    return NextResponse.json(
      { error: "Verification failed" },
      { status: 500 }
    );
  }
}
