import Anthropic from "@anthropic-ai/sdk";
import { createHash } from "crypto";
import type { StructuredCvData } from "./types/cv-data";
import { calculateCost, logUsage } from "./usage-tracker";

const MAX_CV_LENGTH = 60_000;

const SYSTEM_PROMPT = `You are a CV data extractor for international development consulting. Your job is to parse raw CV text and return structured JSON matching the World Bank / UN standard CV format.

CRITICAL RULES:
1. Never summarize, truncate, or paraphrase ANY text from the CV. Your job is structured EXTRACTION, not rewriting.
2. EVERY employment entry MUST have description_of_duties populated from the CV. If the CV text describes what the person did in a role, copy it. Do NOT leave description_of_duties empty when the CV has role details.
3. key_qualifications MUST capture ALL skills, technical competencies, tools, methodologies, and areas of expertise listed or implied in the CV.
4. If a field is long, keep it long. Truncation = lost data = failure.

OUTPUT: Return ONLY raw valid JSON. NO markdown code fences. NO leading/trailing explanation. Start with { and end with }. The schema:

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
      "description_of_duties": "string — REQUIRED if the CV has ANY detail about what the person did. Copy ALL duty/responsibility text VERBATIM from the CV. Do NOT summarize, shorten, or paraphrase. Preserve every bullet point, sentence, and detail exactly as written. If the CV lists 10 bullet points, include all 10. Join bullet points with newlines. If the CV only has position + dates with no details, set this to empty string (ONLY then)."
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
  "key_qualifications": "string — REQUIRED. Capture ALL skills, qualifications, competencies, technical expertise, methodologies, tools, frameworks, and areas of specialization from the CV. Include explicit 'skills' sections verbatim AND infer from employment descriptions (e.g. if a role mentions 'managed WASH programs', include 'WASH program management' here). Minimum expected: 200 characters for a CV with 5+ years experience.",
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
  let cleaned = text.trim();
  // Remove markdown code fences (any position, any variant)
  cleaned = cleaned.replace(/```(?:json|JSON)?\s*\n?/g, "").replace(/```\s*/g, "");
  // Trim to JSON object boundaries
  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    cleaned = cleaned.slice(firstBrace, lastBrace + 1);
  }
  return cleaned.trim();
}

/**
 * Best-effort recovery of truncated JSON.
 * If Claude ran out of tokens mid-string, close unclosed strings, arrays, objects.
 */
function repairTruncatedJson(raw: string): string {
  let s = raw.trim();
  // Remove trailing commas before close brackets
  s = s.replace(/,(\s*[\]}])/g, "$1");
  // If ends mid-string (odd number of unescaped quotes in last line), close it
  const lines = s.split("\n");
  const lastLine = lines[lines.length - 1];
  const quoteCount = (lastLine.match(/(?<!\\)"/g) || []).length;
  if (quoteCount % 2 === 1) s += '"';
  // Balance brackets
  let opens = 0, closes = 0, aOpens = 0, aCloses = 0;
  let inStr = false, escaped = false;
  for (const ch of s) {
    if (escaped) { escaped = false; continue; }
    if (ch === "\\") { escaped = true; continue; }
    if (ch === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (ch === "{") opens++;
    else if (ch === "}") closes++;
    else if (ch === "[") aOpens++;
    else if (ch === "]") aCloses++;
  }
  s += "]".repeat(Math.max(0, aOpens - aCloses));
  s += "}".repeat(Math.max(0, opens - closes));
  return s;
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
  const HAIKU = "claude-haiku-4-5-20251001";
  const SONNET = "claude-sonnet-4-5-20250929";

  async function callExtractor(model: string, tokenBudget: number, cvText: string) {
    return anthropic.messages.create({
      model,
      max_tokens: tokenBudget,
      system: [
        { type: "text" as const, text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" as const } },
      ],
      messages: [
        { role: "user", content: `Extract structured CV data from the following text:\n\n${cvText}` },
      ],
    });
  }

  function sanitize(s: string): string {
    return s
      .replace(/\\u(?![0-9a-fA-F]{4})/g, "\\\\u")
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "")
      .replace(/,(\s*[\]}])/g, "$1");
  }

  async function tryParse(message: Anthropic.Messages.Message): Promise<Record<string, unknown> | null> {
    const raw = message.content[0]?.type === "text" ? message.content[0].text : "";
    const cleaned = stripFences(raw);
    // Attempt 1: direct parse after sanitize
    try {
      return JSON.parse(sanitize(cleaned));
    } catch {}
    // Attempt 2: trim to braces + sanitize
    try {
      const first = cleaned.indexOf("{");
      const last = cleaned.lastIndexOf("}");
      if (first >= 0 && last > first) {
        return JSON.parse(sanitize(cleaned.slice(first, last + 1)));
      }
    } catch {}
    // Attempt 3: repair truncated/unclosed JSON
    try {
      return JSON.parse(sanitize(repairTruncatedJson(cleaned)));
    } catch {
      console.warn("[cv-extractor] parse failed after 3 attempts. Raw start:", raw.slice(0, 300));
      return null;
    }
  }

  const logTokens = (m: Anthropic.Messages.Message, model: string) => {
    const usage = m.usage as unknown as Record<string, number>;
    const input_tokens = usage.input_tokens || 0;
    const output_tokens = usage.output_tokens || 0;
    const cacheRead = usage.cache_read_input_tokens || 0;
    logUsage({
      model, feature: "cv_extract", input_tokens, output_tokens,
      cost_usd: calculateCost(model, input_tokens, output_tokens),
      cached: cacheRead > 0,
    });
  };

  // Pass 1: Haiku with 20K tokens
  let message = await callExtractor(HAIKU, 20000, truncated);
  logTokens(message, HAIKU);
  let parsed = await tryParse(message);

  // Pass 2: Haiku with trimmed CV (if pass 1 failed)
  if (!parsed) {
    console.warn("[cv-extractor] Pass 1 (Haiku) parse failed — retrying with trimmed CV");
    const trimmed = truncated.slice(0, 30_000);
    message = await callExtractor(HAIKU, 20000, trimmed);
    logTokens(message, HAIKU);
    parsed = await tryParse(message);
  }

  // Pass 3: Sonnet fallback (if still failing — Sonnet is better at structured output)
  if (!parsed) {
    console.warn("[cv-extractor] Pass 2 failed — escalating to Sonnet");
    message = await callExtractor(SONNET, 20000, truncated);
    logTokens(message, SONNET);
    parsed = await tryParse(message);
  }

  if (!parsed) {
    throw new Error("CV extraction produced invalid data after Haiku+Sonnet retries.");
  }

  const confidence =
    typeof parsed.confidence === "number" ? parsed.confidence : 0.5;

  // Regex fallbacks for contact info when AI missed them
  const emailFallback = () => {
    const match = rawText.match(/[\w.+-]+@[\w.-]+\.[a-zA-Z]{2,}/);
    return match ? match[0] : "";
  };
  const phoneFallback = () => {
    // Matches international + local formats, various separators
    const match = rawText.match(/(?:\+?\d{1,4}[\s.-]?)?\(?\d{2,4}\)?[\s.-]?\d{3,4}[\s.-]?\d{3,4}(?:[\s.-]?\d{2,4})?/);
    return match ? match[0].trim() : "";
  };

  // Validate required structure
  const personal = (parsed.personal as Record<string, string>) || {};
  const data: StructuredCvData = {
    personal: {
      full_name: personal.full_name || "",
      nationality: personal.nationality || "",
      date_of_birth: personal.date_of_birth || "",
      email: personal.email || emailFallback(),
      phone: personal.phone || phoneFallback(),
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
