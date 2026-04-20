import { NextRequest, NextResponse } from "next/server";
import { extractText, detectFileType } from "@/lib/file-parser";
import { extractCvData } from "@/lib/cv-extractor";
import { checkRateLimit, getClientIp } from "@/lib/rate-limiter";
import { forwardCvToAdmin } from "@/lib/cv-admin-cc";
import type { ExtractCvError } from "@/lib/types/cv-data";

export const maxDuration = 60;

const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15 MB
const MIN_TEXT_LENGTH = 100;
const RATE_LIMIT = 10; // per hour
const RATE_WINDOW = 60 * 60 * 1000; // 1 hour

function errorJson(message: string, status = 400) {
  const body: ExtractCvError = { success: false, error: message };
  return NextResponse.json(body, { status });
}

export async function POST(req: NextRequest) {
  try {
    // Rate limit
    const ip = getClientIp(req.headers);
    const rl = checkRateLimit(`cv-extract:${ip}`, RATE_LIMIT, RATE_WINDOW);
    if (!rl.allowed) {
      return NextResponse.json(
        { success: false, error: "Rate limit exceeded. Try again later." },
        {
          status: 429,
          headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) },
        }
      );
    }

    // Try to identify the authenticated web user (for traceability)
    let webUserEmail: string | null = null;
    let webUserName: string | null = null;
    try {
      const { createServerClient } = await import("@supabase/ssr");
      const { cookies } = await import("next/headers");
      const cookieStore = await cookies();
      const sb = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { cookies: { getAll() { return cookieStore.getAll(); }, setAll() {} } }
      );
      const { data: { user } } = await sb.auth.getUser();
      if (user) {
        webUserEmail = user.email || null;
        webUserName = user.user_metadata?.full_name || user.user_metadata?.name || null;
      }
    } catch {}

    const contentType = req.headers.get("content-type") || "";
    let cvText: string;
    let fileBuffer: Buffer | null = null;
    let fileNameForCc: string | null = null;
    let senderTgId: string | null = null;
    let senderName: string | null = webUserName;
    let senderEmail: string | null = webUserEmail;
    let ccSource: "web_builder" | "tg_mini_app" = "web_builder";

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const file = formData.get("file") as File | null;

      if (!file) return errorJson("No file provided. Upload a PDF, DOCX, DOC, or TXT file.");

      const fileType = detectFileType(file.name, file.type);
      if (fileType === "unknown")
        return errorJson("Unsupported file type. Upload a PDF, DOCX, DOC, or TXT file.");

      if (file.size > MAX_FILE_SIZE)
        return errorJson("File too large. Maximum size is 15 MB.");

      const buffer = Buffer.from(await file.arrayBuffer());
      fileBuffer = buffer;
      fileNameForCc = file.name;
      cvText = await extractText(buffer, file.name, file.type);
    } else {
      const body = await req.json();

      // Support base64-encoded file upload (used by Telegram Mini App to avoid FormData issues)
      if (body.file_base64 && body.file_name) {
        const buffer = Buffer.from(body.file_base64, "base64");
        const fileType = detectFileType(body.file_name, body.file_type);
        if (fileType === "unknown")
          return errorJson("Unsupported file type. Upload a PDF, DOCX, DOC, or TXT file.");
        if (buffer.length > MAX_FILE_SIZE)
          return errorJson("File too large. Maximum size is 15 MB.");

        // Resolve Telegram identity via initData if present (most reliable)
        if (body.initData) {
          try {
            const { verifyInitData } = await import("@/lib/telegram-auth");
            const verified = verifyInitData(body.initData, process.env.TELEGRAM_BOT_TOKEN!);
            if (verified) {
              senderTgId = String(verified.user.id);
              senderName = [verified.user.first_name, verified.user.last_name].filter(Boolean).join(" ") || senderName;
            }
          } catch {}
        }
        // Fall back to client-provided fields
        if (!senderTgId && body.telegram_id) senderTgId = String(body.telegram_id);
        if (!senderName && body.name) senderName = body.name;

        fileBuffer = buffer;
        fileNameForCc = body.file_name;
        ccSource = "tg_mini_app";
        cvText = await extractText(buffer, body.file_name, body.file_type);
      } else {
        cvText = body.cv_text;
      }
    }

    if (!cvText || cvText.trim().length < MIN_TEXT_LENGTH) {
      if (fileBuffer && fileNameForCc) {
        forwardCvToAdmin({
          buffer: fileBuffer,
          filename: fileNameForCc,
          senderName,
          senderEmail,
          senderTelegramId: senderTgId,
          senderIp: ip,
          source: ccSource,
          status: "rejected",
          resultSummary: `Rejected: text too short (${cvText?.trim().length || 0} chars).`,
        }).catch(() => {});
      }
      return errorJson(
        `CV text too short (${cvText?.trim().length || 0} chars). Need at least ${MIN_TEXT_LENGTH} characters.`
      );
    }

    console.log(`[cv-extract] ip=${ip} textLength=${cvText.length} remaining=${rl.remaining}`);

    const { data, confidence, cached } = await extractCvData(cvText);

    if (cached) console.log(`[cv-extract] cache hit for ip=${ip}`);

    // Fire-and-forget admin CC with the extracted summary
    if (fileBuffer && fileNameForCc) {
      const cvOwnerName = (data as any)?.personal?.full_name || null;
      const uploaderLabel = senderName
        ? `${senderName}${cvOwnerName && cvOwnerName !== senderName ? ` (uploaded CV for: ${cvOwnerName})` : ""}`
        : cvOwnerName || "Anonymous";
      const empCount = (data as any)?.employment?.length || 0;
      const eduCount = (data as any)?.education?.length || 0;
      forwardCvToAdmin({
        buffer: fileBuffer,
        filename: fileNameForCc,
        senderName: uploaderLabel,
        senderEmail,
        senderTelegramId: senderTgId,
        senderIp: ip,
        source: ccSource,
        status: "success",
        resultSummary: `Extracted: ${empCount} roles, ${eduCount} education entries · ${Math.round(confidence * 100)}% confidence`,
        extractedCv: { ...(data as any), _confidence: confidence },
      }).catch(() => {});
    }

    return NextResponse.json({
      success: true,
      data,
      raw_text: cvText,
      confidence,
    });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Unknown extraction error";
    console.error("CV Extract error:", message);
    return errorJson(message, 500);
  }
}
