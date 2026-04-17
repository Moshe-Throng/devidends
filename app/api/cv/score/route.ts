import { NextRequest, NextResponse } from "next/server";
import { extractText, detectFileType } from "@/lib/file-parser";
import { scoreCv } from "@/lib/cv-scorer";
import { checkRateLimit, getClientIp } from "@/lib/rate-limiter";
import { logException, trackEvent } from "@/lib/logger";
import { forwardCvToAdmin } from "@/lib/cv-admin-cc";
import type {
  OpportunityInput,
  ScoreResponse,
  ScoreErrorResponse,
} from "@/lib/types/cv-score";

export const maxDuration = 60;

const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15 MB
const MIN_TEXT_LENGTH = 100;
const RATE_LIMIT = 5; // per day per user
const RATE_WINDOW = 24 * 60 * 60 * 1000; // 24 hours

function errorJson(message: string, status = 400) {
  const body: ScoreErrorResponse = { success: false, error: message };
  return NextResponse.json(body, { status });
}

function parseOpportunity(raw: unknown): OpportunityInput | undefined {
  if (!raw) return undefined;

  let obj: Record<string, unknown>;
  if (typeof raw === "string") {
    try {
      obj = JSON.parse(raw);
    } catch {
      return undefined;
    }
  } else {
    obj = raw as Record<string, unknown>;
  }

  if (
    typeof obj.title !== "string" ||
    typeof obj.organization !== "string"
  ) {
    return undefined;
  }

  return {
    title: obj.title,
    organization: obj.organization,
    description: typeof obj.description === "string" ? obj.description : "",
    deadline: typeof obj.deadline === "string" ? obj.deadline : null,
    source_url: typeof obj.source_url === "string" ? obj.source_url : undefined,
  };
}

export async function POST(req: NextRequest) {
  try {
    // Rate limit — 5 scores per 24 hours
    const ip = getClientIp(req.headers);
    const rl = checkRateLimit(`cv-score:${ip}`, RATE_LIMIT, RATE_WINDOW);
    if (!rl.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: "You've reached your daily limit of 5 CV scores. Try again tomorrow.",
          scores_remaining: 0,
        },
        {
          status: 429,
          headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) },
        }
      );
    }

    // Try to identify authenticated user for traceability
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
    let opportunity: OpportunityInput | undefined;
    let fileBuffer: Buffer | null = null;
    let fileNameForCc: string | null = null;

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const file = formData.get("file") as File | null;

      if (!file) {
        return errorJson("No file provided. Upload a PDF or DOCX.");
      }

      const fileType = detectFileType(file.name, file.type);
      if (fileType === "unknown") {
        return errorJson("Unsupported file type. Upload a PDF, DOCX, or DOC file.");
      }

      if (file.size > MAX_FILE_SIZE) {
        return errorJson("File too large. Maximum size is 15 MB.");
      }

      const buffer = Buffer.from(await file.arrayBuffer());
      fileBuffer = buffer;
      fileNameForCc = file.name;
      cvText = await extractText(buffer, file.name, file.type);

      opportunity = parseOpportunity(formData.get("opportunity"));
    } else {
      const body = await req.json();
      cvText = body.cv_text;
      opportunity = parseOpportunity(body.opportunity);
    }

    if (!cvText || cvText.trim().length < MIN_TEXT_LENGTH) {
      if (fileBuffer && fileNameForCc) {
        forwardCvToAdmin({
          buffer: fileBuffer,
          filename: fileNameForCc,
          senderName: webUserName,
          senderEmail: webUserEmail,
          senderIp: ip,
          source: "web_score",
          status: "rejected",
          resultSummary: `Rejected: text too short (${cvText?.trim().length || 0} chars).`,
        }).catch(() => {});
      }
      return errorJson(
        `CV text too short (${cvText?.trim().length || 0} chars). Need at least ${MIN_TEXT_LENGTH} characters.`
      );
    }

    console.log(`[cv-score] ip=${ip} textLength=${cvText.length} remaining=${rl.remaining}`);

    const result = await scoreCv(cvText, opportunity);

    // Fire-and-forget admin CC — only when an actual file was uploaded
    // (skip for text-only scoring since the saved CV was already CC'd at build time)
    if (fileBuffer && fileNameForCc) {
      forwardCvToAdmin({
        buffer: fileBuffer,
        filename: fileNameForCc,
        senderName: webUserName,
        senderEmail: webUserEmail,
        senderIp: ip,
        source: "web_score",
        status: "success",
        resultSummary: `Scored: ${result.overall_score}/100${opportunity ? ` vs "${opportunity.title.slice(0, 60)}"` : ""}`,
      }).catch(() => {});
    }

    const response = {
      success: true as const,
      data: { ...result, cv_text: cvText },
      scores_remaining: rl.remaining,
    };

    trackEvent({ event: "cv_scored", metadata: { score: result.overall_score, ip } });
    return NextResponse.json(response);
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Unknown scoring error";
    logException("api/cv/score", err, { ip: getClientIp(req.headers) });
    return errorJson(message, 500);
  }
}
