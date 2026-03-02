import { NextRequest, NextResponse } from "next/server";
import { extractText, detectFileType } from "@/lib/file-parser";
import { extractCvData } from "@/lib/cv-extractor";
import { checkRateLimit, getClientIp } from "@/lib/rate-limiter";
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

    const contentType = req.headers.get("content-type") || "";
    let cvText: string;

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
        cvText = await extractText(buffer, body.file_name, body.file_type);
      } else {
        cvText = body.cv_text;
      }
    }

    if (!cvText || cvText.trim().length < MIN_TEXT_LENGTH) {
      return errorJson(
        `CV text too short (${cvText?.trim().length || 0} chars). Need at least ${MIN_TEXT_LENGTH} characters.`
      );
    }

    console.log(`[cv-extract] ip=${ip} textLength=${cvText.length} remaining=${rl.remaining}`);

    const { data, confidence, cached } = await extractCvData(cvText);

    if (cached) console.log(`[cv-extract] cache hit for ip=${ip}`);

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
