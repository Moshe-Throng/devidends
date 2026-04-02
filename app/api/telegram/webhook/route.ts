import { NextRequest, NextResponse } from "next/server";
import { getTelegramBot } from "@/lib/telegram";
import { handleUpdate } from "@/lib/telegram-handlers";
import { logException } from "@/lib/logger";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const bot = getTelegramBot();
    await handleUpdate(bot, body);
    return NextResponse.json({ ok: true });
  } catch (err) {
    logException("telegram-webhook", err, { update_id: "unknown" });
    // Always return 200 to prevent Telegram from retrying failed updates
    return NextResponse.json({ ok: true });
  }
}
