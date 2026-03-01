/**
 * Profile search using PostgreSQL Full-Text Search.
 * Uses Supabase RPC to call the search_profiles function.
 */

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getServiceClient() {
  return createClient(supabaseUrl, supabaseServiceKey);
}

/* ─── Types ───────────────────────────────────────────────── */

export interface SearchParams {
  query: string;
  sectors?: string[];
  donors?: string[];
  min_experience?: number;
  profile_type?: string;
  limit?: number;
}

export interface SearchResult {
  id: string;
  name: string;
  headline: string | null;
  email: string | null;
  sectors: string[];
  donors: string[];
  skills: string[];
  years_of_experience: number | null;
  profile_type: string | null;
  rank: number;
}

export interface ShortlistParams {
  description: string;
  required_skills?: string[];
  preferred_sectors?: string[];
  preferred_donors?: string[];
  min_experience?: number;
  limit?: number;
}

export interface ShortlistResult extends SearchResult {
  match_score: number; // 0-100 composite score
  match_reasons: string[];
}

/* ─── Skill normalization ─────────────────────────────────── */

const SKILL_ALIASES: Record<string, string> = {
  "m&e": "monitoring_evaluation",
  "mel": "monitoring_evaluation",
  "monitoring and evaluation": "monitoring_evaluation",
  "monitoring, evaluation and learning": "monitoring_evaluation",
  "project management": "project_management",
  "pm": "project_management",
  "pmp": "project_management",
  "financial management": "financial_management",
  "fm": "financial_management",
  "procurement": "procurement",
  "supply chain": "supply_chain",
  "scm": "supply_chain",
  "human resources": "human_resources",
  "hr": "human_resources",
  "hris": "human_resources",
  "gender": "gender_equality",
  "gender equality": "gender_equality",
  "gesi": "gender_equality",
  "wash": "wash",
  "water and sanitation": "wash",
  "climate change": "climate_change",
  "climate": "climate_change",
  "agriculture": "agriculture",
  "agri": "agriculture",
  "health": "health",
  "public health": "health",
  "education": "education",
  "governance": "governance",
  "good governance": "governance",
  "data analysis": "data_analysis",
  "data analytics": "data_analysis",
  "statistics": "data_analysis",
  "gis": "gis",
  "mapping": "gis",
  "communication": "communication",
  "communications": "communication",
  "comms": "communication",
};

export function normalizeSkill(skill: string): string {
  const lower = skill.toLowerCase().trim();
  return SKILL_ALIASES[lower] || lower.replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
}

export function normalizeSkills(skills: string[]): string[] {
  const normalized = new Set(skills.map(normalizeSkill).filter(Boolean));
  return Array.from(normalized);
}

/* ─── Search ──────────────────────────────────────────────── */

export async function searchProfiles(params: SearchParams): Promise<SearchResult[]> {
  const supabase = getServiceClient();

  const { data, error } = await supabase.rpc("search_profiles", {
    search_query: params.query,
    sector_filter: params.sectors || null,
    donor_filter: params.donors || null,
    min_experience: params.min_experience || null,
    type_filter: params.profile_type || null,
    result_limit: params.limit || 50,
  });

  if (error) {
    console.error("[profile-search] RPC error:", error.message);
    throw new Error(`Search failed: ${error.message}`);
  }

  return (data || []) as SearchResult[];
}

/* ─── Shortlisting (composite scoring) ────────────────────── */

function sectorOverlap(profileSectors: string[], torSectors: string[]): number {
  if (torSectors.length === 0) return 1;
  const profileSet = new Set(profileSectors.map((s) => s.toLowerCase()));
  const matches = torSectors.filter((s) => profileSet.has(s.toLowerCase()));
  return matches.length / torSectors.length;
}

function skillMatch(profileSkills: string[], requiredSkills: string[]): number {
  if (requiredSkills.length === 0) return 1;
  const normalizedProfile = new Set(normalizeSkills(profileSkills));
  const normalizedRequired = normalizeSkills(requiredSkills);
  const matches = normalizedRequired.filter((s) => normalizedProfile.has(s));
  return matches.length / normalizedRequired.length;
}

function experienceMatch(years: number | null, minYears: number | undefined): number {
  if (!minYears) return 1;
  if (!years) return 0;
  if (years >= minYears) return 1;
  return years / minYears; // partial credit
}

function donorMatch(profileDonors: string[], preferredDonors: string[]): number {
  if (preferredDonors.length === 0) return 1;
  const profileSet = new Set(profileDonors.map((d) => d.toLowerCase()));
  const matches = preferredDonors.filter((d) => profileSet.has(d.toLowerCase()));
  return matches.length / preferredDonors.length;
}

export async function shortlistProfiles(params: ShortlistParams): Promise<ShortlistResult[]> {
  // First, search using FTS with the description text
  const searchResults = await searchProfiles({
    query: params.description.slice(0, 500), // Use first 500 chars as search query
    sectors: params.preferred_sectors,
    donors: params.preferred_donors,
    min_experience: params.min_experience,
    limit: (params.limit || 20) * 3, // Fetch more for re-ranking
  });

  // Re-rank with composite scoring
  const scored: ShortlistResult[] = searchResults.map((profile) => {
    const sectorScore = sectorOverlap(profile.sectors, params.preferred_sectors || []) * 30;
    const skillScore = skillMatch(profile.skills, params.required_skills || []) * 30;
    const expScore = experienceMatch(profile.years_of_experience, params.min_experience) * 20;
    const donorScore = donorMatch(profile.donors, params.preferred_donors || []) * 10;
    const ftsScore = Math.min(profile.rank * 100, 10); // Cap FTS contribution at 10

    const total = Math.round(sectorScore + skillScore + expScore + donorScore + ftsScore);

    const reasons: string[] = [];
    if (sectorScore > 15) reasons.push("Strong sector alignment");
    if (skillScore > 15) reasons.push("Key skills match");
    if (expScore >= 20) reasons.push("Meets experience requirement");
    if (donorScore > 5) reasons.push("Donor experience match");
    if (ftsScore > 5) reasons.push("High relevance to description");

    return {
      ...profile,
      match_score: Math.min(total, 100),
      match_reasons: reasons,
    };
  });

  // Sort by match_score descending and return top N
  scored.sort((a, b) => b.match_score - a.match_score);
  return scored.slice(0, params.limit || 20);
}
