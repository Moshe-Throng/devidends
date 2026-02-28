import { NextRequest, NextResponse } from "next/server";
import { fillCvTemplate } from "@/lib/cv-template-filler";
import { checkRateLimit, getClientIp } from "@/lib/rate-limiter";
import type { StructuredCvData, GenerateDocxError } from "@/lib/types/cv-data";

const RATE_LIMIT = 30; // per hour (no AI cost, pure code)
const RATE_WINDOW = 60 * 60 * 1000;

function errorJson(message: string, status = 400) {
  const body: GenerateDocxError = { success: false, error: message };
  return NextResponse.json(body, { status });
}

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req.headers);
    const rl = checkRateLimit(`cv-fill:${ip}`, RATE_LIMIT, RATE_WINDOW);
    if (!rl.allowed) {
      return NextResponse.json(
        { success: false, error: "Rate limit exceeded. Try again later." },
        {
          status: 429,
          headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) },
        }
      );
    }

    const formData = await req.formData();

    const templateFile = formData.get("template") as File | null;
    const cvDataRaw = formData.get("cv_data") as string | null;

    if (!templateFile) {
      return errorJson("Missing template DOCX file.");
    }

    if (!cvDataRaw) {
      return errorJson("Missing cv_data JSON.");
    }

    let cvData: StructuredCvData;
    try {
      cvData = JSON.parse(cvDataRaw) as StructuredCvData;
    } catch {
      return errorJson("Invalid cv_data JSON.");
    }

    if (!cvData.personal?.full_name) {
      return errorJson("Full name is required in cv_data.");
    }

    const templateBuffer = Buffer.from(await templateFile.arrayBuffer());
    const filledBuffer = fillCvTemplate(templateBuffer, cvData);
    const base64 = filledBuffer.toString("base64");

    const safeName = cvData.personal.full_name
      .replace(/[^a-zA-Z0-9 ]/g, "")
      .replace(/\s+/g, "_")
      .slice(0, 40);

    return NextResponse.json({
      success: true,
      filename: `CV_${safeName}_Filled.docx`,
      docx_base64: base64,
    });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Unknown template fill error";
    console.error("Template fill error:", message);
    return errorJson(message, 500);
  }
}
