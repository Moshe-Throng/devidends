import { NextRequest, NextResponse } from "next/server";
import { searchProfiles } from "@/lib/profile-search";
import { checkRateLimit, getClientIp } from "@/lib/rate-limiter";

const RATE_LIMIT = 30; // per hour
const RATE_WINDOW = 60 * 60 * 1000;

export async function GET(req: NextRequest) {
  try {
    const ip = getClientIp(req.headers);
    const rl = checkRateLimit(`profile-search:${ip}`, RATE_LIMIT, RATE_WINDOW);
    if (!rl.allowed) {
      return NextResponse.json(
        { success: false, error: "Rate limit exceeded. Try again later." },
        { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } }
      );
    }

    const { searchParams } = new URL(req.url);
    const query = searchParams.get("q");

    if (!query || query.trim().length < 2) {
      return NextResponse.json(
        { success: false, error: "Search query (q) required, minimum 2 characters." },
        { status: 400 }
      );
    }

    const sectors = searchParams.get("sector")?.split(",").filter(Boolean);
    const donors = searchParams.get("donor")?.split(",").filter(Boolean);
    const minExp = searchParams.get("min_experience")
      ? parseInt(searchParams.get("min_experience")!, 10)
      : undefined;
    const profileType = searchParams.get("type") || undefined;
    const limit = Math.min(
      parseInt(searchParams.get("limit") || "50", 10),
      100
    );

    const results = await searchProfiles({
      query: query.trim(),
      sectors,
      donors,
      min_experience: minExp,
      profile_type: profileType,
      limit,
    });

    return NextResponse.json({
      success: true,
      count: results.length,
      results,
    });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Search failed";
    console.error("Profile search error:", message);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
