import { NextRequest, NextResponse } from "next/server";

/**
 * Telegram image proxy — converts file_id to image bytes.
 * Keeps bot token server-side. Caches aggressively.
 *
 * Usage: /api/img/{telegram_file_id}
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ fileId: string }> }
) {
  const { fileId } = await params;
  const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

  if (!BOT_TOKEN || !fileId) {
    return new NextResponse("Not found", { status: 404 });
  }

  try {
    // Step 1: get file path from Telegram
    const metaRes = await fetch(
      `https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${encodeURIComponent(fileId)}`
    );
    const meta = await metaRes.json();
    if (!meta.ok || !meta.result?.file_path) {
      return new NextResponse("File not found", { status: 404 });
    }

    // Step 2: fetch actual image bytes
    const fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${meta.result.file_path}`;
    const imgRes = await fetch(fileUrl);
    if (!imgRes.ok) {
      return new NextResponse("Failed to fetch image", { status: 502 });
    }

    const contentType = imgRes.headers.get("content-type") || "image/jpeg";
    const buffer = await imgRes.arrayBuffer();

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400, s-maxage=604800",
      },
    });
  } catch {
    return new NextResponse("Error", { status: 500 });
  }
}
