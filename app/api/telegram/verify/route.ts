import { NextRequest, NextResponse } from "next/server";
import { verifyInitData, getOrCreateTelegramProfile } from "@/lib/telegram-auth";

export async function POST(req: NextRequest) {
  try {
    const { initData } = await req.json();

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
      return NextResponse.json(
        { error: "Invalid or expired initData" },
        { status: 401 }
      );
    }

    // Get or create profile for this Telegram user
    const profile = await getOrCreateTelegramProfile(verified.user);

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
