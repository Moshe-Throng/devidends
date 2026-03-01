import { createHash } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Profile, CvScore, ProfileEdit } from "./database.types";
import type { CvScoreResult, SampleOpportunity } from "./types/cv-score";

type AnySupabase = SupabaseClient<any, any, any>;

/* ═══════════════════════════════════════════════════════════════
   PROFILE CRUD
   ═══════════════════════════════════════════════════════════════ */

/** Fetch a profile by auth user ID */
export async function getProfile(
  supabase: AnySupabase,
  userId: string
): Promise<Profile | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("user_id", userId)
    .single();

  if (error || !data) return null;
  return data as Profile;
}

/** Fetch a profile by its own UUID (for public view) */
export async function getProfileById(
  supabase: AnySupabase,
  profileId: string
): Promise<Profile | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", profileId)
    .single();

  if (error || !data) return null;
  return data as Profile;
}

/** Create a new profile linked to an auth user */
export async function createProfile(
  supabase: AnySupabase,
  userId: string,
  data: Partial<Profile>
): Promise<Profile> {
  const profileScore = calculateProfileScore({ ...data, user_id: userId });

  const { data: profile, error } = await supabase
    .from("profiles")
    .insert({
      ...data,
      user_id: userId,
      profile_score_pct: profileScore,
      version: 1,
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to create profile: ${error.message}`);
  return profile as Profile;
}

/** Update an existing profile with version control */
export async function updateProfile(
  supabase: AnySupabase,
  userId: string,
  data: Partial<Profile>
): Promise<Profile> {
  // Fetch current profile to detect changes
  const current = await getProfile(supabase, userId);
  if (!current) throw new Error("Profile not found");

  // Detect which fields changed
  const changedFields: string[] = [];
  for (const key of Object.keys(data) as (keyof Profile)[]) {
    if (key === "id" || key === "user_id" || key === "created_at") continue;
    const oldVal = JSON.stringify(current[key]);
    const newVal = JSON.stringify(data[key]);
    if (oldVal !== newVal) changedFields.push(key);
  }

  const newVersion = (current.version || 1) + 1;
  const profileScore = calculateProfileScore({ ...current, ...data });

  // Save edit history snapshot
  if (changedFields.length > 0) {
    await saveProfileEdit(supabase, current.id, current.version, changedFields, {
      ...current,
    } as unknown as Record<string, unknown>);
  }

  const { data: profile, error } = await supabase
    .from("profiles")
    .update({
      ...data,
      version: newVersion,
      profile_score_pct: profileScore,
    })
    .eq("user_id", userId)
    .select()
    .single();

  if (error) throw new Error(`Failed to update profile: ${error.message}`);
  return profile as Profile;
}

/* ═══════════════════════════════════════════════════════════════
   STRUCTURED CV DATA (used by CV Builder)
   ═══════════════════════════════════════════════════════════════ */

/** Save structured CV data to the profile */
export async function saveCvStructuredData(
  supabase: AnySupabase,
  userId: string,
  cvData: Record<string, unknown>
): Promise<void> {
  const { error } = await supabase
    .from("profiles")
    .update({ cv_structured_data: cvData })
    .eq("user_id", userId);

  if (error) throw new Error(`Failed to save CV data: ${error.message}`);
}

/** Load structured CV data from the profile */
export async function getCvStructuredData(
  supabase: AnySupabase,
  userId: string
): Promise<Record<string, unknown> | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("cv_structured_data")
    .eq("user_id", userId)
    .single();

  if (error || !data) return null;
  return (data as { cv_structured_data: Record<string, unknown> | null }).cv_structured_data;
}

/* ═══════════════════════════════════════════════════════════════
   PROFILE SCORE CALCULATION (pure function)
   ═══════════════════════════════════════════════════════════════ */

/** Calculate profile completeness 0–100 based on field presence */
export function calculateProfileScore(profile: Partial<Profile>): number {
  let score = 0;

  if (profile.name && profile.name.trim()) score += 10;
  if (profile.headline && profile.headline.trim()) score += 10;
  if (profile.cv_url || profile.cv_text) score += 10;
  if (profile.cv_score != null && profile.cv_score > 0) score += 5;
  if (profile.sectors && profile.sectors.length >= 1) score += 10;
  if (profile.donors && profile.donors.length >= 1) score += 10;
  if (profile.countries && profile.countries.length >= 1) score += 10;
  if (profile.skills && profile.skills.length >= 3) score += 10;
  if (profile.qualifications && profile.qualifications.trim()) score += 10;
  if (profile.years_of_experience != null && profile.years_of_experience > 0) score += 5;
  if (profile.linkedin_url && profile.linkedin_url.trim()) score += 5;
  if (
    (profile.phone && profile.phone.trim()) ||
    (profile.telegram_username && profile.telegram_username.trim())
  )
    score += 5;

  return Math.min(100, score);
}

/* ═══════════════════════════════════════════════════════════════
   CV SCORE HISTORY
   ═══════════════════════════════════════════════════════════════ */

/** Save a CV score to history */
export async function saveCvScore(
  supabase: AnySupabase,
  userId: string,
  profileId: string,
  scoreData: CvScoreResult,
  cvText?: string,
  fileName?: string
): Promise<void> {
  // Compute CV text hash for persistent score deduplication
  const cvHash = cvText
    ? createHash("sha256").update(cvText.slice(0, 25_000)).digest("hex")
    : null;

  const { error } = await supabase.from("cv_scores").insert({
    user_id: userId,
    profile_id: profileId,
    overall_score: scoreData.overall_score,
    dimensions: scoreData.dimensions,
    improvements: scoreData.top_3_improvements,
    donor_tips: scoreData.donor_specific_tips,
    cv_text: cvText || null,
    cv_hash: cvHash,
    file_name: fileName || null,
  });

  if (error) {
    console.error("Failed to save CV score:", error.message);
  }
}

/** Get past CV scores ordered by most recent first (excludes cv_text for performance) */
export async function getCvScoreHistory(
  supabase: AnySupabase,
  profileId: string
): Promise<CvScore[]> {
  const { data, error } = await supabase
    .from("cv_scores")
    .select(
      "id, profile_id, user_id, overall_score, dimensions, improvements, donor_tips, file_name, scored_at"
    )
    .eq("profile_id", profileId)
    .order("scored_at", { ascending: false });

  if (error || !data) return [];
  return data as CvScore[];
}

/** Get CV versions with text (for My CVs page) — only rows with non-null cv_text */
export async function getCvVersions(
  supabase: AnySupabase,
  profileId: string
): Promise<CvScore[]> {
  const { data, error } = await supabase
    .from("cv_scores")
    .select("*")
    .eq("profile_id", profileId)
    .not("cv_text", "is", null)
    .order("scored_at", { ascending: false });

  if (error || !data) return [];
  return data as CvScore[];
}

/* ═══════════════════════════════════════════════════════════════
   OPPORTUNITY MATCHING
   ═══════════════════════════════════════════════════════════════ */

/** Fetch opportunities matching a profile's sectors. Client-side only. */
export async function getMatchedOpportunities(
  profile: Profile,
  limit = 8
): Promise<SampleOpportunity[]> {
  try {
    const res = await fetch("/api/opportunities/sample?hideExpired=true&minQuality=40");
    if (!res.ok) return [];

    const json = await res.json();
    const opportunities: SampleOpportunity[] = json.opportunities || [];

    if (!profile.sectors || profile.sectors.length === 0) {
      // No sectors to match — return top quality opportunities
      return opportunities.slice(0, limit);
    }

    const profileSectors = new Set(
      profile.sectors.map((s) => s.toLowerCase())
    );

    // Score each opportunity by sector overlap
    const scored = opportunities.map((opp) => {
      let matchScore = 0;

      // Check title and organization against profile sectors
      const oppText = `${opp.title} ${opp.organization}`.toLowerCase();
      for (const sector of profileSectors) {
        if (oppText.includes(sector.split(" ")[0])) matchScore += 2;
      }

      // Check seniority match
      if (profile.profile_type && opp.seniority) {
        if (
          profile.profile_type.toLowerCase() === opp.seniority.toLowerCase()
        )
          matchScore += 1;
      }

      return { opp, matchScore };
    });

    // Sort by match score (desc), then quality_score (desc)
    scored.sort(
      (a, b) =>
        b.matchScore - a.matchScore || b.opp.quality_score - a.opp.quality_score
    );

    return scored.slice(0, limit).map((s) => s.opp);
  } catch {
    return [];
  }
}

/* ═══════════════════════════════════════════════════════════════
   VERSION CONTROL
   ═══════════════════════════════════════════════════════════════ */

/** Save a profile edit snapshot for version history */
async function saveProfileEdit(
  supabase: AnySupabase,
  profileId: string,
  version: number,
  changedFields: string[],
  snapshot: Record<string, unknown>
): Promise<void> {
  const { error } = await supabase.from("profile_edits").insert({
    profile_id: profileId,
    version,
    changed_fields: changedFields,
    snapshot,
  });

  if (error) {
    console.error("Failed to save profile edit:", error.message);
  }
}

/** Get edit history for a profile */
export async function getProfileEditHistory(
  supabase: AnySupabase,
  profileId: string
): Promise<ProfileEdit[]> {
  const { data, error } = await supabase
    .from("profile_edits")
    .select("*")
    .eq("profile_id", profileId)
    .order("edited_at", { ascending: false });

  if (error || !data) return [];
  return data as ProfileEdit[];
}
