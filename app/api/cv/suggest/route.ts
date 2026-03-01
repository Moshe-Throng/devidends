import { NextRequest, NextResponse } from "next/server";
import { generateSuggestions } from "@/lib/cv-suggestions";
import { checkRateLimit, getClientIp } from "@/lib/rate-limiter";
import { createSupabaseServer } from "@/lib/supabase-server";
import type { StructuredCvData } from "@/lib/types/cv-data";

const RATE_LIMIT = 5; // per hour per user
const RATE_WINDOW = 60 * 60 * 1000; // 1 hour

export async function POST(req: NextRequest) {
  try {
    // Require authentication (AI cost)
    const supabase = await createSupabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { success: false, error: "Authentication required" },
        { status: 401 }
      );
    }

    // Rate limit — 5 suggestion rounds per hour per user
    const rl = checkRateLimit(
      `cv-suggest:${user.id}`,
      RATE_LIMIT,
      RATE_WINDOW
    );
    if (!rl.allowed) {
      return NextResponse.json(
        {
          success: false,
          error:
            "You've reached your hourly limit for AI suggestions. Try again later.",
          remaining: 0,
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(
              Math.ceil((rl.resetAt - Date.now()) / 1000)
            ),
          },
        }
      );
    }

    const body = await req.json();
    const cvData = body.cv_data as StructuredCvData | undefined;
    const opportunity = body.opportunity as
      | { title: string; organization: string; description: string }
      | undefined;

    if (!cvData || !cvData.personal?.full_name) {
      return NextResponse.json(
        { success: false, error: "CV data with personal information required." },
        { status: 400 }
      );
    }

    const result = await generateSuggestions(cvData, opportunity);

    return NextResponse.json({
      success: true,
      data: result,
      remaining: rl.remaining,
    });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Unknown suggestion error";
    console.error("CV Suggest error:", message);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
