import { NextRequest, NextResponse } from "next/server";
import { extractProfileFromCV } from "@/lib/extract-profile";
import { createSupabaseServer } from "@/lib/supabase-server";

// Simple in-memory rate limiter (per user, resets on deploy)
const rateLimiter = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 10; // max requests per window
const RATE_WINDOW = 60 * 60 * 1000; // 1 hour

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const entry = rateLimiter.get(userId);
  if (!entry || now > entry.resetAt) {
    rateLimiter.set(userId, { count: 1, resetAt: now + RATE_WINDOW });
    return true;
  }
  if (entry.count >= RATE_LIMIT) return false;
  entry.count++;
  return true;
}

/**
 * POST /api/profile/extract
 * Body: { cv_text: string }
 * Returns extracted profile fields from CV text using Claude.
 * Requires authentication (calls paid Claude API).
 */
export async function POST(request: NextRequest) {
  try {
    // Auth check — this endpoint calls Claude API (cost)
    const supabase = await createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    // Rate limit per user
    if (!checkRateLimit(user.id)) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Try again later." },
        { status: 429 }
      );
    }

    const body = await request.json();
    const cvText = body.cv_text;

    if (!cvText || typeof cvText !== "string" || cvText.length < 50) {
      return NextResponse.json(
        { error: "CV text is required (minimum 50 characters)" },
        { status: 400 }
      );
    }

    const extracted = await extractProfileFromCV(cvText);

    return NextResponse.json({ success: true, data: extracted });
  } catch (error) {
    console.error("[profile/extract] Error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to extract profile",
      },
      { status: 500 }
    );
  }
}
