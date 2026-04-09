import { NextRequest, NextResponse } from "next/server";
import { generateCvDocx } from "@/lib/cv-docx-generator";
import { checkRateLimit, getClientIp } from "@/lib/rate-limiter";
import type { StructuredCvData, GenerateDocxError, CvTemplate } from "@/lib/types/cv-data";

const RATE_LIMIT = 30; // per hour (no AI cost, pure code)
const RATE_WINDOW = 60 * 60 * 1000;

function errorJson(message: string, status = 400) {
  const body: GenerateDocxError = { success: false, error: message };
  return NextResponse.json(body, { status });
}

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req.headers);
    const rl = checkRateLimit(`cv-generate:${ip}`, RATE_LIMIT, RATE_WINDOW);
    if (!rl.allowed) {
      return NextResponse.json(
        { success: false, error: "Rate limit exceeded. Try again later." },
        {
          status: 429,
          headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) },
        }
      );
    }

    const body = await req.json();
    const cvData = body.cv_data as StructuredCvData | undefined;
    const template = (body.template as CvTemplate) || "wb-standard";

    if (!cvData || !cvData.personal) {
      return errorJson("Missing cv_data with personal information.");
    }

    if (!cvData.personal.full_name) {
      return errorJson("Full name is required.");
    }

    const validTemplates: CvTemplate[] = ["wb-standard", "europass", "au-standard", "un-php", "generic-professional", "modern-executive"];
    if (!validTemplates.includes(template)) {
      return errorJson(`Invalid template. Choose from: ${validTemplates.join(", ")}`);
    }

    // Referral gating: au-standard, wb-standard, un-php, modern-executive require 3 referrals
    const gatedTemplates: CvTemplate[] = ["au-standard", "wb-standard", "un-php", "modern-executive"];
    if (gatedTemplates.includes(template)) {
      const telegramId = body.telegram_id as string | undefined;
      if (telegramId) {
        const { createClient } = await import("@supabase/supabase-js");
        const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
        const { data: profile } = await sb
          .from("profiles")
          .select("referral_count")
          .eq("telegram_id", telegramId)
          .maybeSingle();
        if (!profile || (profile.referral_count || 0) < 3) {
          return errorJson("This template requires 3 referrals to unlock. Share Devidends with colleagues to access it.", 403);
        }
      }
    }

    // For Modern Executive: fetch profile photo from Telegram if available
    let photoBuffer: Buffer | undefined;
    if (template === "modern-executive" && body.photo_file_id) {
      try {
        const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
        if (BOT_TOKEN) {
          const metaRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${encodeURIComponent(body.photo_file_id)}`);
          const meta = await metaRes.json();
          if (meta.ok && meta.result?.file_path) {
            const imgRes = await fetch(`https://api.telegram.org/file/bot${BOT_TOKEN}/${meta.result.file_path}`);
            if (imgRes.ok) {
              photoBuffer = Buffer.from(await imgRes.arrayBuffer());
            }
          }
        }
      } catch {
        // Photo fetch failed — continue without photo
      }
    }

    const { buffer, filename } = await generateCvDocx(cvData, template, photoBuffer);
    const base64 = buffer.toString("base64");

    return NextResponse.json({
      success: true,
      filename,
      docx_base64: base64,
    });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Unknown generation error";
    console.error("DOCX generation error:", message);
    return errorJson(message, 500);
  }
}
