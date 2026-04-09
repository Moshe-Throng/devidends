import { NextRequest, NextResponse, after } from "next/server";
import { getTelegramBot } from "@/lib/telegram";
import { handleUpdate } from "@/lib/telegram-handlers";
import { logException } from "@/lib/logger";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: true });
  }

  // Check if this is a long-running operation:
  // - CV ingest from group (up to 60s for extraction)
  // - Free-text in private chat (2-4s for Haiku response)
  const msg = body?.message;
  const isGroupDoc = msg?.document &&
    String(msg.chat?.id) === process.env.TELEGRAM_INGEST_GROUP_ID;
  const isPrivateText = msg?.text && !msg.text.startsWith("/") &&
    msg.chat?.type === "private" && !msg.reply_to_message;

  if (isGroupDoc || isPrivateText) {
    // Use after() to process AFTER returning 200 to Telegram
    // This keeps the function alive for up to maxDuration
    after(async () => {
      try {
        const bot = getTelegramBot();
        await handleUpdate(bot, body);
      } catch (err) {
        logException("telegram-webhook-async", err);
      }
    });
    return NextResponse.json({ ok: true });
  }

  // Regular messages (commands, callbacks) — process inline (fast)
  try {
    const bot = getTelegramBot();
    await handleUpdate(bot, body);
  } catch (err) {
    logException("telegram-webhook", err);
  }
  return NextResponse.json({ ok: true });
}
