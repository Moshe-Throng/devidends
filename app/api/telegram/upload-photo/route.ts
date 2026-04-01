import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * Upload a profile photo via Telegram.
 * Receives base64 image + initData, sends to Telegram bot as a document
 * to get a persistent file_id, then saves to profile.
 */
export async function POST(req: NextRequest) {
  try {
    const { initData, imageBase64 } = await req.json();

    if (!initData || !imageBase64) {
      return NextResponse.json({ error: "Missing initData or imageBase64" }, { status: 400 });
    }

    const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    if (!BOT_TOKEN) {
      return NextResponse.json({ error: "Bot not configured" }, { status: 500 });
    }

    // Verify initData
    const { verifyInitData } = await import("@/lib/telegram-auth");
    const verified = verifyInitData(initData, BOT_TOKEN);
    if (!verified) {
      return NextResponse.json({ error: "Invalid initData" }, { status: 401 });
    }

    const telegramId = String(verified.user.id);

    // Convert base64 to buffer
    const imageBuffer = Buffer.from(imageBase64, "base64");

    // Send photo to the bot's own chat (to itself) to get a file_id
    // We use sendPhoto to our own "saved messages" by sending to the user
    const formData = new FormData();
    formData.append("chat_id", telegramId);
    formData.append("photo", new Blob([imageBuffer], { type: "image/jpeg" }), "profile.jpg");
    formData.append("disable_notification", "true");

    const tgRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`, {
      method: "POST",
      body: formData,
    });

    const tgData = await tgRes.json();
    if (!tgData.ok) {
      console.error("[upload-photo] Telegram error:", tgData);
      return NextResponse.json({ error: "Failed to upload photo to Telegram" }, { status: 500 });
    }

    // Extract file_id from the largest photo size
    const photos = tgData.result.photo;
    const fileId = photos[photos.length - 1].file_id;

    // Delete the sent message to keep chat clean
    try {
      await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/deleteMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: telegramId, message_id: tgData.result.message_id }),
      });
    } catch {
      // Not critical
    }

    // Save file_id to profile
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    await supabase
      .from("profiles")
      .update({ photo_file_id: fileId })
      .eq("telegram_id", telegramId);

    return NextResponse.json({ success: true, photo_file_id: fileId });
  } catch (err) {
    console.error("[upload-photo] Error:", err);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
