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

    const validTemplates: CvTemplate[] = ["wb-standard", "europass", "au-standard", "un-php", "generic-professional"];
    if (!validTemplates.includes(template)) {
      return errorJson(`Invalid template. Choose from: ${validTemplates.join(", ")}`);
    }

    const { buffer, filename } = await generateCvDocx(cvData, template);
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
