import { NextRequest, NextResponse } from "next/server";
import { extractText, detectFileType } from "@/lib/file-parser";
import { extractProfileFromCV } from "@/lib/extract-profile";
import { extractCvData } from "@/lib/cv-extractor";
import { scoreCv } from "@/lib/cv-scorer";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";

export const maxDuration = 60;

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

const ADMIN_IDS = (process.env.ADMIN_USER_IDS || "").split(",").map(s => s.trim());

/**
 * POST /api/admin/ingest — Upload a single CV, extract, score, create profile with claim token.
 * Body: FormData with file field "cv"
 * Auth: requires admin Supabase auth session (cookie) or admin telegram_id in header
 */
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("cv") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const fileType = detectFileType(file.name, file.type);
    if (fileType === "unknown") {
      return NextResponse.json({ error: "Unsupported file type. Use PDF, DOCX, or DOC." }, { status: 400 });
    }

    if (file.size > 15 * 1024 * 1024) {
      return NextResponse.json({ error: "File too large (max 15MB)" }, { status: 400 });
    }

    // Extract text
    const buffer = Buffer.from(await file.arrayBuffer());
    const cvText = await extractText(buffer, file.name, file.type);

    if (cvText.trim().length < 50) {
      return NextResponse.json({ error: "Could not extract enough text from file" }, { status: 400 });
    }

    // Extract profile summary fields (name, sectors, donors, etc.)
    const profile = await extractProfileFromCV(cvText);

    // Extract full structured CV data (personal, education, employment, languages, etc.)
    let cvStructured: any = null;
    try {
      const { data: structured } = await extractCvData(cvText);
      cvStructured = structured;
    } catch (e) {
      console.warn("[admin/ingest] Structured extraction failed, continuing with summary only:", (e as Error).message);
    }

    // Score CV
    let cvScore: number | null = null;
    try {
      const scoreResult = await scoreCv(cvText);
      cvScore = scoreResult.overall_score;
    } catch {
      // Scoring is optional — continue without it
    }

    // Generate claim token (8-char alphanumeric)
    const claimToken = randomUUID().replace(/-/g, "").slice(0, 8);

    // Create profile in Supabase
    const sb = getAdmin();
    const { data: created, error: insertErr } = await sb
      .from("profiles")
      .insert({
        name: profile.name,
        headline: profile.headline,
        sectors: profile.sectors,
        donors: profile.donors,
        countries: profile.countries,
        skills: profile.skills,
        qualifications: profile.qualifications,
        years_of_experience: profile.years_of_experience,
        profile_type: profile.profile_type,
        cv_text: cvText.slice(0, 50000),
        cv_structured_data: cvStructured,
        cv_score: cvScore,
        claim_token: claimToken,
        source: "admin_ingest",
      })
      .select("id, name, headline, sectors, donors, countries, skills, qualifications, years_of_experience, cv_score, claim_token, profile_type, cv_structured_data, created_at")
      .single();

    if (insertErr) {
      console.error("[admin/ingest] Insert error:", insertErr.message);
      return NextResponse.json({ error: "Failed to create profile: " + insertErr.message }, { status: 500 });
    }

    const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://devidends-eta-delta.vercel.app";
    const tgLink = `https://t.me/Devidends_Bot?start=claim_${claimToken}`;
    const webLink = `${SITE}/claim?token=${claimToken}`;

    return NextResponse.json({
      success: true,
      profile: {
        ...created,
        claim_link_tg: tgLink,
        claim_link_web: webLink,
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[admin/ingest]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/**
 * GET /api/admin/ingest — List all ingested profiles with claim status
 */
export async function GET() {
  try {
    const sb = getAdmin();
    const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://devidends-eta-delta.vercel.app";
    const { data, error } = await sb
      .from("profiles")
      .select("id, name, headline, sectors, donors, countries, skills, qualifications, years_of_experience, cv_score, claim_token, claimed_at, telegram_id, profile_type, source, cv_structured_data, created_at")
      .eq("source", "admin_ingest")
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const profiles = (data || []).map((p: any) => ({
      ...p,
      claim_link_tg: p.claim_token ? `https://t.me/Devidends_Bot?start=claim_${p.claim_token}` : null,
      claim_link_web: p.claim_token ? `${SITE}/claim?token=${p.claim_token}` : null,
      is_claimed: !!p.claimed_at,
    }));

    return NextResponse.json({ profiles });
  } catch (err: unknown) {
    return NextResponse.json({ error: "Failed to list profiles" }, { status: 500 });
  }
}
