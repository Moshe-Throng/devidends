import Anthropic from "@anthropic-ai/sdk";
import { createHash } from "crypto";
import { calculateCost, logUsage } from "./usage-tracker";

/* ─── Types ──────────────────────────────────────────────────── */

export interface ExtractedProfile {
  name: string;
  headline: string | null;
  sectors: string[];
  donors: string[];
  countries: string[];
  skills: string[];
  qualifications: string | null;
  years_of_experience: number | null;
  profile_type: "Expert" | "Senior" | "Mid-level" | "Junior" | "Entry" | null;
}

/* ─── Cache (same pattern as cv-scorer.ts) ───────────────────── */

interface CacheEntry {
  result: ExtractedProfile;
  cachedAt: number;
}

const cache = new Map<string, CacheEntry>();
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes
const MAX_CACHE = 100;

function cacheKey(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 32);
}

function getCached(key: string): ExtractedProfile | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.cachedAt > CACHE_TTL) {
    cache.delete(key);
    return null;
  }
  return entry.result;
}

function setCache(key: string, result: ExtractedProfile) {
  if (cache.size >= MAX_CACHE) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  cache.set(key, { result, cachedAt: Date.now() });
}

/* ─── System prompt ──────────────────────────────────────────── */

const SYSTEM_PROMPT = `You are a profile extractor for international development consulting professionals.
Given CV text, extract structured profile data. Return ONLY valid JSON, no markdown or backticks.

Standard sectors (use ONLY these):
- Humanitarian Aid, Global Health, Finance & Banking, Project Management
- Innovation & ICT, Agriculture, Economic Development, Gender & Social Inclusion
- Environment & Natural Resources, Education, WASH, Governance
- Media & Communications, Research, Legal, Energy

Known donors/organizations (extract if mentioned):
- GIZ, World Bank, EU, UNDP, USAID, AfDB, UNICEF, DFID/FCDO, KfW, SIDA
- WHO, FAO, UNHCR, WFP, ILO, ADB, JICA, NORAD, DANIDA, BMZ
- Gates Foundation, Mastercard Foundation, Rockefeller Foundation

Profile type rules:
- Expert: 15+ years of experience
- Senior: 10-14 years
- Mid-level: 5-9 years
- Junior: 2-4 years
- Entry: 0-1 years

Output JSON schema:
{
  "name": "Full Name",
  "headline": "Professional headline, e.g. 'Senior M&E Specialist | GIZ & World Bank'",
  "sectors": ["Sector1", "Sector2"],
  "donors": ["GIZ", "World Bank"],
  "countries": ["Ethiopia", "Kenya"],
  "skills": ["Monitoring & Evaluation", "Project Management"],
  "qualifications": "Highest degree and field, e.g. 'MA in Development Studies, Addis Ababa University'",
  "years_of_experience": 12,
  "profile_type": "Senior"
}

Rules:
- Map sectors to the standard list above (fuzzy match is OK)
- Only extract donors from the known list
- Extract ALL countries mentioned in work experience
- Calculate years from earliest employment to present
- Return empty arrays [] for missing fields, null for missing scalars
- Never fabricate data not present in the CV`;

/* ─── Main extraction function ───────────────────────────────── */

/**
 * Extract structured profile fields from CV text using Claude.
 * Server-side only (uses ANTHROPIC_API_KEY).
 */
export async function extractProfileFromCV(
  cvText: string
): Promise<ExtractedProfile> {
  const key = cacheKey(cvText);
  const cached = getCached(key);
  if (cached) return cached;

  const client = new Anthropic();

  // Haiku 4.5 for profile extraction — simpler structured extraction task
  const modelId = "claude-haiku-4-5-20251001";
  const response = await client.messages.create({
    model: modelId,
    max_tokens: 1500,
    system: [
      {
        type: "text" as const,
        text: SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" as const },
      },
    ],
    messages: [
      {
        role: "user",
        content: `Extract profile data from this CV:\n\n${cvText.slice(0, 60000)}`,
      },
    ],
  });

  // Track usage including prompt cache hits
  const usage = response.usage as unknown as Record<string, number>;
  const input_tokens = usage.input_tokens || 0;
  const output_tokens = usage.output_tokens || 0;
  const cacheRead = usage.cache_read_input_tokens || 0;
  logUsage({
    model: modelId,
    feature: "profile_extract",
    input_tokens,
    output_tokens,
    cost_usd: calculateCost(modelId, input_tokens, output_tokens),
    cached: cacheRead > 0,
  });

  const raw =
    response.content[0].type === "text" ? response.content[0].text : "";

  // Strip any markdown code fences
  const cleaned = raw.replace(/```json?\s*/gi, "").replace(/```/g, "").trim();

  let parsed: ExtractedProfile;
  try {
    const json = JSON.parse(cleaned);
    parsed = {
      name: typeof json.name === "string" ? json.name : "Unknown",
      headline: typeof json.headline === "string" ? json.headline : null,
      sectors: Array.isArray(json.sectors) ? json.sectors : [],
      donors: Array.isArray(json.donors) ? json.donors : [],
      countries: Array.isArray(json.countries) ? json.countries : [],
      skills: Array.isArray(json.skills) ? json.skills : [],
      qualifications:
        typeof json.qualifications === "string" ? json.qualifications : null,
      years_of_experience:
        typeof json.years_of_experience === "number"
          ? json.years_of_experience
          : null,
      profile_type: isValidProfileType(json.profile_type)
        ? json.profile_type
        : null,
    };
  } catch {
    throw new Error("Failed to parse profile extraction response as JSON");
  }

  setCache(key, parsed);
  return parsed;
}

function isValidProfileType(
  val: unknown
): val is ExtractedProfile["profile_type"] {
  return (
    typeof val === "string" &&
    ["Expert", "Senior", "Mid-level", "Junior", "Entry"].includes(val)
  );
}
