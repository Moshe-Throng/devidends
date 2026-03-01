/**
 * CV section suggestion generator using Claude Haiku 4.5.
 * Generates inline improvement suggestions for each CV section.
 */

import Anthropic from "@anthropic-ai/sdk";
import { createHash } from "crypto";
import type { StructuredCvData } from "./types/cv-data";
import { calculateCost, logUsage } from "./usage-tracker";

/* ─── Types ───────────────────────────────────────────────── */

export interface CvSuggestion {
  section: string; // "summary" | "experience_0" | "skills" | etc.
  field?: string; // optional sub-field like "description_of_duties"
  text: string; // the original text being commented on
  suggestion: string; // the suggestion/comment
  suggested_edit?: string; // optional rewritten text
  priority: "high" | "medium" | "low";
}

export interface SuggestionsResult {
  suggestions: CvSuggestion[];
  overall_notes: string;
}

/* ─── Cache ───────────────────────────────────────────────── */

interface SuggestionCacheEntry {
  result: SuggestionsResult;
  cachedAt: number;
}

const cache = new Map<string, SuggestionCacheEntry>();
const CACHE_TTL = 30 * 60 * 1000; // 30 min
const MAX_CACHE = 50;

function cacheKey(data: StructuredCvData, context?: string): string {
  const seed = JSON.stringify(data) + (context || "");
  return createHash("sha256").update(seed).digest("hex");
}

function getCached(key: string): SuggestionsResult | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.cachedAt > CACHE_TTL) {
    cache.delete(key);
    return null;
  }
  return entry.result;
}

function setCache(key: string, result: SuggestionsResult) {
  if (cache.size >= MAX_CACHE) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  cache.set(key, { result, cachedAt: Date.now() });
}

/* ─── Prompt ──────────────────────────────────────────────── */

const SYSTEM_PROMPT = `You are an expert CV reviewer for international development consulting (World Bank, GIZ, EU, UNDP, AfDB projects in Africa).

Analyze the CV data and generate specific, actionable improvement suggestions for each section.

Guidelines:
- Focus on what would make this CV stronger for donor-funded project proposals
- Point to specific text that can be improved — don't give generic advice
- Suggest quantifying achievements (budgets managed, beneficiaries reached, team sizes)
- Flag missing donor-specific language (logframes, Theory of Change, RBM, M&E)
- Suggest better action verbs and results-oriented phrasing
- Keep suggestions concise (1-2 sentences each)
- Generate 3-8 suggestions total (not too many, not too few)
- Priority: "high" = would significantly improve the CV, "medium" = nice improvement, "low" = polish

Return JSON with this exact schema:
{
  "suggestions": [
    {
      "section": "summary | experience_N | education_N | skills | certifications | languages",
      "field": "optional sub-field name",
      "text": "the exact text being referenced",
      "suggestion": "what to improve and why",
      "suggested_edit": "optional rewritten text",
      "priority": "high | medium | low"
    }
  ],
  "overall_notes": "1-2 sentence overall assessment"
}`;

/* ─── Generator ───────────────────────────────────────────── */

export async function generateSuggestions(
  cvData: StructuredCvData,
  opportunityContext?: { title: string; organization: string; description: string }
): Promise<SuggestionsResult> {
  const key = cacheKey(cvData, opportunityContext ? JSON.stringify(opportunityContext) : undefined);
  const cached = getCached(key);
  if (cached) return cached;

  const client = new Anthropic();
  const modelId = "claude-haiku-4-5-20251001";

  // Build CV text for analysis
  const cvSummary = [
    `Name: ${cvData.personal.full_name}`,
    `Summary: ${cvData.professional_summary}`,
    `Key Qualifications: ${cvData.key_qualifications}`,
    "",
    "EXPERIENCE:",
    ...cvData.employment.map(
      (e, i) =>
        `[experience_${i}] ${e.position} at ${e.employer} (${e.from_date}–${e.to_date}, ${e.country})\n  Duties: ${e.description_of_duties}`
    ),
    "",
    "EDUCATION:",
    ...cvData.education.map(
      (e, i) =>
        `[education_${i}] ${e.degree} in ${e.field_of_study}, ${e.institution} (${e.year_graduated})`
    ),
    "",
    "LANGUAGES:",
    ...cvData.languages.map(
      (l) => `${l.language}: R=${l.reading}, W=${l.writing}, S=${l.speaking}`
    ),
    "",
    `CERTIFICATIONS: ${cvData.certifications.join("; ") || "None listed"}`,
    `COUNTRIES: ${cvData.countries_of_experience.join(", ") || "None listed"}`,
  ].join("\n");

  let userPrompt = `Review this CV and generate improvement suggestions:\n\n${cvSummary}`;

  if (opportunityContext) {
    userPrompt += `\n\n--- TARGET OPPORTUNITY ---\nTitle: ${opportunityContext.title}\nOrganization: ${opportunityContext.organization}\nDescription: ${opportunityContext.description.slice(0, 2000)}`;
  }

  const response = await client.messages.create({
    model: modelId,
    max_tokens: 2000,
    system: [
      {
        type: "text" as const,
        text: SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" as const },
      },
    ],
    messages: [{ role: "user", content: userPrompt }],
  });

  // Track usage
  const usage = response.usage as unknown as Record<string, number>;
  const input_tokens = usage.input_tokens || 0;
  const output_tokens = usage.output_tokens || 0;
  const cacheRead = usage.cache_read_input_tokens || 0;
  logUsage({
    model: modelId,
    feature: "cv_suggestions",
    input_tokens,
    output_tokens,
    cost_usd: calculateCost(modelId, input_tokens, output_tokens),
    cached: cacheRead > 0,
  });

  // Parse response
  const text =
    response.content[0].type === "text" ? response.content[0].text : "";

  // Extract JSON from response (handle markdown code blocks)
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return {
      suggestions: [],
      overall_notes: "Could not generate suggestions. Please try again.",
    };
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]) as SuggestionsResult;

    // Validate structure
    if (!Array.isArray(parsed.suggestions)) {
      parsed.suggestions = [];
    }

    parsed.suggestions = parsed.suggestions
      .filter(
        (s) =>
          s.section &&
          s.suggestion &&
          typeof s.suggestion === "string"
      )
      .slice(0, 10); // Cap at 10

    const result: SuggestionsResult = {
      suggestions: parsed.suggestions,
      overall_notes: parsed.overall_notes || "",
    };

    setCache(key, result);
    return result;
  } catch {
    return {
      suggestions: [],
      overall_notes: "Could not parse suggestions. Please try again.",
    };
  }
}
