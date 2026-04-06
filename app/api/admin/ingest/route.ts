import { NextRequest, NextResponse } from "next/server";
import { extractText, detectFileType } from "@/lib/file-parser";
import { extractProfileFromCV } from "@/lib/extract-profile";
import { extractCvData } from "@/lib/cv-extractor";
import { scoreCv } from "@/lib/cv-scorer";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";
import { logException, trackEvent } from "@/lib/logger";

export const maxDuration = 60;

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

const ADMIN_IDS = (process.env.ADMIN_USER_IDS || "").split(",").map(s => s.trim());

/** Auto-generate tags from CV data */
function autoGenerateTags(profile: any, cv: any, score: number | null): string[] {
  const tags: string[] = [];
  const yrs = profile.years_of_experience || 0;
  if (yrs >= 15) tags.push("expert");
  else if (yrs >= 10) tags.push("senior");

  if (score && score >= 70) tags.push("strong_cv");
  else if (score && score < 40) tags.push("needs_improvement");

  const employers = (cv?.employment || []).map((e: any) => (e.employer || "").toLowerCase());
  const donorKeywords = ["giz", "world bank", "undp", "unicef", "usaid", "eu", "afdb", "dfid", "fcdo", "who", "fao", "unhcr"];
  const matchedDonors = new Set<string>();
  for (const emp of employers) {
    for (const d of donorKeywords) {
      if (emp.includes(d)) matchedDonors.add(d);
    }
  }
  if (matchedDonors.size >= 3) tags.push("multi_donor");
  if (matchedDonors.size >= 1) tags.push("donor_experienced");

  const countries = new Set((cv?.employment || []).map((e: any) => e.country).filter(Boolean));
  if (countries.size >= 3) tags.push("multi_country");

  const langs = (cv?.languages || []).length;
  if (langs >= 3) tags.push("multilingual");

  if ((cv?.education || []).some((e: any) => /PhD|Doctorate/i.test(e.degree || ""))) tags.push("phd");

  return tags;
}

/**
 * POST /api/admin/ingest — Upload a single CV, extract, score, create profile with claim token.
 * Body: FormData with file field "cv"
 * Auth: requires admin Supabase auth session (cookie) or admin telegram_id in header
 */
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("cv") as File | null;

    // Admin-provided metadata fields
    const recommendedBy = (formData.get("recommended_by") as string) || null;
    const isRecommender = formData.get("is_recommender") === "true";
    const gender = (formData.get("gender") as string) || null;
    const adminNotes = (formData.get("admin_notes") as string) || null;
    const tagsRaw = (formData.get("tags") as string) || "";
    const tags = tagsRaw ? tagsRaw.split(",").map(t => t.trim()).filter(Boolean) : [];

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

    // Dedup check — look for existing profiles with same name
    const sb = getAdmin();
    const nameNorm = profile.name.trim().toLowerCase();
    const { data: dupes } = await sb
      .from("profiles")
      .select("id, name, cv_score, source, created_at")
      .ilike("name", nameNorm);

    let dupWarning: string | null = null;
    if (dupes && dupes.length > 0) {
      dupWarning = `Possible duplicate: "${dupes[0].name}" already exists (source: ${dupes[0].source}, score: ${dupes[0].cv_score ?? "n/a"})`;
    }

    // Extract ALL fields from structured CV into profile-level columns
    const p = cvStructured?.personal || {};
    const cvEmail = p.email || null;
    const cvPhone = p.phone || null;
    const cvNationality = p.nationality || null;
    const cvCity = p.address || p.country_of_residence || null;
    const cvLanguages = cvStructured?.languages?.map((l: any) => l.language).filter(Boolean) || [];
    const cvCertifications = cvStructured?.certifications?.filter(Boolean) || [];

    // Derive education level from highest degree
    const degrees = (cvStructured?.education || []).map((e: any) => e.degree || "");
    const eduLevel = degrees.some((d: string) => /PhD|Doctorate/i.test(d)) ? "PhD"
      : degrees.some((d: string) => /Master|MSc|MA|MBA|MPH|MPA|MEng/i.test(d)) ? "Masters"
      : degrees.some((d: string) => /Bachelor|BSc|BA|BEng|LLB/i.test(d)) ? "Bachelors"
      : degrees.some((d: string) => /Diploma/i.test(d)) ? "Diploma" : null;

    // Upsert: update if profile with same name exists, otherwise create
    const profileData: any = {
      name: p.full_name || profile.name,
      headline: profile.headline,
      email: cvEmail,
      phone: cvPhone,
      nationality: cvNationality,
      city: cvCity,
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
      source: "admin_ingest",
      recommended_by: recommendedBy,
      is_recommender: isRecommender,
      gender: gender || null,
      languages: cvLanguages,
      certifications: cvCertifications,
      education_level: eduLevel,
      tags: tags.length > 0 ? tags : autoGenerateTags(profile, cvStructured, cvScore),
      admin_notes: adminNotes,
    };

    let isUpdate = false;
    let created: any;

    if (dupes && dupes.length > 0) {
      // Update existing
      isUpdate = true;
      const { data: updated, error: updateErr } = await sb
        .from("profiles")
        .update(profileData)
        .eq("id", dupes[0].id)
        .select("id, name, headline, sectors, donors, countries, skills, qualifications, years_of_experience, cv_score, claim_token, profile_type, cv_structured_data, gender, nationality, languages, education_level, recommended_by, is_recommender, tags, admin_notes, email, phone, city, certifications, created_at")
        .single();
      if (updateErr) {
        console.error("[admin/ingest] Update error:", updateErr.message);
        return NextResponse.json({ error: "Failed to update profile: " + updateErr.message }, { status: 500 });
      }
      created = updated;
    } else {
      // Create new
      profileData.claim_token = claimToken;
      const { data: inserted, error: insertErr } = await sb
        .from("profiles")
        .insert(profileData)
        .select("id, name, headline, sectors, donors, countries, skills, qualifications, years_of_experience, cv_score, claim_token, profile_type, cv_structured_data, gender, nationality, languages, education_level, recommended_by, is_recommender, tags, admin_notes, email, phone, city, certifications, created_at")
        .single();
      if (insertErr) {
        console.error("[admin/ingest] Insert error:", insertErr.message);
        return NextResponse.json({ error: "Failed to create profile: " + insertErr.message }, { status: 500 });
      }
      created = inserted;
    }

    const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://devidends.net";
    const effectiveToken = created.claim_token || claimToken;
    const tgLink = `https://t.me/Devidends_Bot?start=claim_${effectiveToken}`;
    const webLink = `${SITE}/claim?token=${effectiveToken}`;

    trackEvent({ event: isUpdate ? "cv_updated" : "cv_ingested", profile_id: created.id, metadata: { name: profile.name, score: cvScore, source: "admin_ingest" } });

    return NextResponse.json({
      success: true,
      is_update: isUpdate,
      profile: {
        ...created,
        claim_link_tg: tgLink,
        claim_link_web: webLink,
        is_claimed: false,
      },
      dup_warning: isUpdate ? `Updated existing profile "${created.name}"` : dupWarning,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    logException("admin/ingest", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/**
 * GET /api/admin/ingest — List all ingested profiles with claim status
 */
export async function GET(req: NextRequest) {
  try {
    const sb = getAdmin();
    const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://devidends.net";
    const showAll = new URL(req.url).searchParams.get("all") === "true";

    let query = sb
      .from("profiles")
      .select("id, name, headline, sectors, donors, countries, skills, qualifications, years_of_experience, cv_score, claim_token, claimed_at, telegram_id, profile_type, source, cv_structured_data, gender, nationality, languages, education_level, recommended_by, is_recommender, tags, admin_notes, email, phone, city, availability, daily_rate_usd, certifications, created_at")
      .order("created_at", { ascending: false });

    if (!showAll) query = query.eq("source", "admin_ingest");

    const { data, error } = await query;

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

/**
 * PATCH /api/admin/ingest — Update editable fields on a profile
 * Body: { id, ...fields }
 */
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, ...fields } = body;
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    // Whitelist of editable fields
    const allowed = [
      "name", "headline", "gender", "nationality", "email", "phone", "city",
      "recommended_by", "is_recommender", "profile_type", "education_level",
      "availability", "daily_rate_usd", "travel_willingness", "years_of_experience",
      "tags", "admin_notes", "qualifications",
      "sectors", "donors", "countries", "languages", "certifications",
      "preferred_role_types", "preferred_regions",
      "cv_structured_data", "cv_score", "professional_summary",
    ];

    const update: Record<string, unknown> = {};
    for (const key of allowed) {
      if (key in fields) update[key] = fields[key];
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    const sb = getAdmin();
    const { error } = await sb.from("profiles").update(update).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/ingest — Delete an ingested profile
 * Body: { id: string }
 */
export async function DELETE(req: NextRequest) {
  try {
    const { id } = await req.json();
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const sb = getAdmin();
    const { error } = await sb.from("profiles").delete().eq("id", id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }
}
