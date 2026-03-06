import { NextRequest, NextResponse } from "next/server";
import { generateCvDocx } from "@/lib/cv-docx-generator";
import type { StructuredCvData, CvTemplate } from "@/lib/types/cv-data";

/**
 * POST /api/cv/send-to-telegram
 *
 * Generates a DOCX and sends it directly to the user's Telegram chat
 * via Bot API sendDocument. This is the most reliable download approach
 * for Telegram mini apps (no Supabase Storage, no signed URL expiry issues).
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const cvData = body.cv_data as StructuredCvData | undefined;
    const template = (body.template as CvTemplate) || "wb-standard";
    const telegramUserId = body.telegram_user_id as number | string | undefined;

    if (!cvData?.personal?.full_name) {
      return NextResponse.json({ error: "Missing cv_data with full_name" }, { status: 400 });
    }
    if (!telegramUserId) {
      return NextResponse.json({ error: "Missing telegram_user_id" }, { status: 400 });
    }

    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
      return NextResponse.json({ error: "Bot not configured" }, { status: 500 });
    }

    // Generate DOCX
    const { buffer, filename } = await generateCvDocx(cvData, template);

    // Send via Telegram Bot API
    const form = new FormData();
    form.append("chat_id", String(telegramUserId));
    form.append(
      "caption",
      `Here's your CV (${filename.replace(/_/g, " ").replace(".docx", "")}). You can forward it or save it to your Files.`
    );
    form.append(
      "document",
      new Blob([new Uint8Array(buffer)], {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      }),
      filename
    );

    const tgRes = await fetch(`https://api.telegram.org/bot${token}/sendDocument`, {
      method: "POST",
      body: form,
    });

    const tgJson = await tgRes.json();
    if (!tgJson.ok) {
      console.error("[send-to-telegram] Telegram API error:", tgJson.description);
      return NextResponse.json(
        { error: tgJson.description || "Telegram delivery failed" },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true, filename });
  } catch (err) {
    console.error("[send-to-telegram]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
