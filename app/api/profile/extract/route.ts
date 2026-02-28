import { NextRequest, NextResponse } from "next/server";
import { extractProfileFromCV } from "@/lib/extract-profile";

/**
 * POST /api/profile/extract
 * Body: { cv_text: string }
 * Returns extracted profile fields from CV text using Claude.
 */
export async function POST(request: NextRequest) {
  try {
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
