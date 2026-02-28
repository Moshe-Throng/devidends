import { NextRequest, NextResponse } from "next/server";
import { getTelegramBot } from "@/lib/telegram";
import { handleUpdate } from "@/lib/telegram-handlers";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const bot = getTelegramBot();
    await handleUpdate(bot, body);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[telegram-webhook] Error:", err);
    // Always return 200 to prevent Telegram from retrying failed updates
    return NextResponse.json({ ok: true });
  }
}
