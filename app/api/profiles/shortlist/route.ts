import { NextRequest, NextResponse } from "next/server";
import { shortlistProfiles } from "@/lib/profile-search";
import { checkRateLimit, getClientIp } from "@/lib/rate-limiter";
import { createSupabaseServer } from "@/lib/supabase-server";

const RATE_LIMIT = 10; // per hour (heavier operation)
const RATE_WINDOW = 60 * 60 * 1000;

export async function POST(req: NextRequest) {
  try {
    // Require authentication for shortlisting
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

    const rl = checkRateLimit(
      `shortlist:${user.id}`,
      RATE_LIMIT,
      RATE_WINDOW
    );
    if (!rl.allowed) {
      return NextResponse.json(
        { success: false, error: "Rate limit exceeded. Try again later." },
        { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } }
      );
    }

    const body = await req.json();
    const { description, required_skills, preferred_sectors, preferred_donors, min_experience, limit } = body;

    if (!description || typeof description !== "string" || description.trim().length < 20) {
      return NextResponse.json(
        { success: false, error: "Description required (minimum 20 characters)." },
        { status: 400 }
      );
    }

    const results = await shortlistProfiles({
      description: description.trim(),
      required_skills: Array.isArray(required_skills) ? required_skills : undefined,
      preferred_sectors: Array.isArray(preferred_sectors) ? preferred_sectors : undefined,
      preferred_donors: Array.isArray(preferred_donors) ? preferred_donors : undefined,
      min_experience: typeof min_experience === "number" ? min_experience : undefined,
      limit: Math.min(limit || 20, 50),
    });

    return NextResponse.json({
      success: true,
      count: results.length,
      results,
    });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Shortlisting failed";
    console.error("Shortlist error:", message);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
