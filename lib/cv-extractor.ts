import Anthropic from "@anthropic-ai/sdk";
import { createHash } from "crypto";
import type { StructuredCvData } from "./types/cv-data";
import { calculateCost, logUsage } from "./usage-tracker";

const MAX_CV_LENGTH = 25_000;

const SYSTEM_PROMPT = `You are a CV data extractor for international development consulting. Your job is to parse raw CV text and return structured JSON matching the World Bank / UN standard CV format.

CRITICAL: Never summarize, truncate, or paraphrase ANY text from the CV. Your job is structured EXTRACTION, not rewriting. If text is long, keep it long. Every detail the user wrote matters.

Return ONLY valid JSON — no markdown fences, no explanation. The schema:

{
  "personal": {
    "full_name": "string",
    "nationality": "string",
    "date_of_birth": "string (ISO date or free text, empty if unknown)",
    "email": "string",
    "phone": "string",
    "address": "string",
    "country_of_residence": "string"
  },
  "professional_summary": "string — if the CV has an explicit summary/profile/objective section, copy it VERBATIM. If not, write a comprehensive one based on the full experience (at least 3-5 sentences).",
  "education": [
    {
      "id": "string (generate a short unique id)",
      "degree": "string (e.g. Master of Public Health)",
      "field_of_study": "string (e.g. Epidemiology)",
      "institution": "string",
      "country": "string",
      "year_graduated": number
    }
  ],
  "employment": [
    {
      "id": "string (generate a short unique id)",
      "from_date": "string (YYYY-MM format)",
      "to_date": "string (YYYY-MM or Present)",
      "employer": "string",
      "position": "string",
      "country": "string",
      "description_of_duties": "string — copy ALL duty/responsibility text VERBATIM from the CV. Do NOT summarize, shorten, or paraphrase. Preserve every bullet point, sentence, and detail exactly as written. If the CV lists 10 bullet points, include all 10. Join bullet points with newlines."
    }
  ],
  "languages": [
    {
      "id": "string",
      "language": "string",
      "reading": "Excellent|Good|Fair|None",
      "writing": "Excellent|Good|Fair|None",
      "speaking": "Excellent|Good|Fair|None"
    }
  ],
  "key_qualifications": "string — preserve ALL qualifications, skills, competency text, and technical expertise exactly as written in the CV. Do not summarize or condense.",
  "certifications": ["string — each certification, accreditation, or professional license listed in the CV. E.g. PRINCE2 Practitioner, PMP, CPA, etc."],
  "countries_of_experience": ["string"],
  "professional_associations": ["string"],
  "publications": ["string — include full citation text for each publication"],
  "confidence": number (0.0 to 1.0)
}

Rules:
- Extract ALL information present in the CV text. Every detail matters.
- For fields not found in the text, use empty strings or empty arrays. Never fabricate data.
- Infer countries_of_experience from employment countries and any mentions of country work.
- If the CV mentions a language but not proficiency, estimate based on context (native language = Excellent across all).
- confidence: How complete the extraction is. 0.9+ = rich structured CV. 0.5-0.8 = partial data. <0.5 = very sparse/garbled text.
- Sort employment by from_date descending (most recent first).
- Sort education by year_graduated descending.
- If certifications appear under a "Skills" or "Qualifications" heading mixed with other text, extract them into the certifications array separately.`;

function stripFences(text: string): string {
  return text
    .replace(/^```(?:json)?\s*\n?/i, "")
    .replace(/\n?```\s*$/i, "")
    .trim();
}

/* ─── Response cache (same file → same extraction) ─────── */

interface CacheEntry {
  data: StructuredCvData;
  confidence: number;
  cachedAt: number;
}

const responseCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
const MAX_CACHE_SIZE = 100;

function computeHash(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function getCached(hash: string): CacheEntry | null {
  const entry = responseCache.get(hash);
  if (!entry) return null;
  if (Date.now() - entry.cachedAt > CACHE_TTL_MS) {
    responseCache.delete(hash);
    return null;
  }
  return entry;
}

function setCache(hash: string, data: StructuredCvData, confidence: number) {
  // Evict oldest if at capacity
  if (responseCache.size >= MAX_CACHE_SIZE) {
    const oldest = responseCache.keys().next().value;
    if (oldest) responseCache.delete(oldest);
  }
  responseCache.set(hash, { data, confidence, cachedAt: Date.now() });
}

/* ─── Main extraction function ─────────────────────────── */

export async function extractCvData(
  rawText: string
): Promise<{ data: StructuredCvData; confidence: number; cached: boolean }> {
  const truncated = rawText.slice(0, MAX_CV_LENGTH);
  const hash = computeHash(truncated);

  // Check cache first
  const cached = getCached(hash);
  if (cached) {
    return { data: cached.data, confidence: cached.confidence, cached: true };
  }

  const anthropic = new Anthropic();

  // Haiku 4.5 for extraction (structured data parsing) — 73% cheaper than Sonnet
  const modelId = "claude-haiku-4-5-20251001";
  const message = await anthropic.messages.create({
    model: modelId,
    max_tokens: 6000,
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
        content: `Extract structured CV data from the following text:\n\n${truncated}`,
      },
    ],
  });

  // Track usage including prompt cache hits
  const usage = message.usage as unknown as Record<string, number>;
  const input_tokens = usage.input_tokens || 0;
  const output_tokens = usage.output_tokens || 0;
  const cacheRead = usage.cache_read_input_tokens || 0;
  logUsage({
    model: modelId,
    feature: "cv_extract",
    input_tokens,
    output_tokens,
    cost_usd: calculateCost(modelId, input_tokens, output_tokens),
    cached: cacheRead > 0,
  });

  const raw =
    message.content[0].type === "text" ? message.content[0].text : "";
  const cleaned = stripFences(raw);

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error("Failed to parse extraction response as JSON");
  }

  const confidence =
    typeof parsed.confidence === "number" ? parsed.confidence : 0.5;

  // Validate required structure
  const personal = (parsed.personal as Record<string, string>) || {};
  const data: StructuredCvData = {
    personal: {
      full_name: personal.full_name || "",
      nationality: personal.nationality || "",
      date_of_birth: personal.date_of_birth || "",
      email: personal.email || "",
      phone: personal.phone || "",
      address: personal.address || "",
      country_of_residence: personal.country_of_residence || "",
    },
    professional_summary:
      (parsed.professional_summary as string) || "",
    education: Array.isArray(parsed.education) ? parsed.education : [],
    employment: Array.isArray(parsed.employment) ? parsed.employment : [],
    languages: Array.isArray(parsed.languages) ? parsed.languages : [],
    key_qualifications:
      (parsed.key_qualifications as string) || "",
    certifications: Array.isArray(parsed.certifications)
      ? parsed.certifications
      : [],
    countries_of_experience: Array.isArray(parsed.countries_of_experience)
      ? parsed.countries_of_experience
      : [],
    professional_associations: Array.isArray(parsed.professional_associations)
      ? parsed.professional_associations
      : [],
    publications: Array.isArray(parsed.publications)
      ? parsed.publications
      : [],
  };

  // Cache the result
  setCache(hash, data, confidence);

  return { data, confidence, cached: false };
}
