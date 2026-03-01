import Anthropic from "@anthropic-ai/sdk";
import { createHash } from "crypto";
import { createClient } from "@supabase/supabase-js";
import type { CvScoreResult, OpportunityInput } from "./types/cv-score";
import { calculateCost, logUsage } from "./usage-tracker";

const MAX_CV_LENGTH = 25_000;

/* ─── Response cache (same CV+opportunity → same score) ── */

interface ScoreCacheEntry {
  result: CvScoreResult;
  cachedAt: number;
}

const scoreCache = new Map<string, ScoreCacheEntry>();
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
const MAX_CACHE_SIZE = 100;

function computeCacheKey(text: string, opportunity?: OpportunityInput): string {
  const seed = text + (opportunity ? JSON.stringify(opportunity) : "");
  return createHash("sha256").update(seed).digest("hex");
}

function getCached(key: string): CvScoreResult | null {
  const entry = scoreCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.cachedAt > CACHE_TTL_MS) {
    scoreCache.delete(key);
    return null;
  }
  return entry.result;
}

function setCache(key: string, result: CvScoreResult) {
  if (scoreCache.size >= MAX_CACHE_SIZE) {
    const oldest = scoreCache.keys().next().value;
    if (oldest) scoreCache.delete(oldest);
  }
  scoreCache.set(key, { result, cachedAt: Date.now() });
}

const BASE_SYSTEM_PROMPT = `You are Devidends's CV Scorer for international development consulting (GIZ, World Bank, EU, UNDP, AfDB projects in Africa).

Score this CV on a 0-100 scale across these 6 dimensions:

1. Structure & Format (15%): Standard sections present? Logical flow? Appropriate length (2-4 pages)? Clear headings?
2. Professional Summary (15%): Clear, compelling, sector-relevant? Keywords present? Tailored to development consulting?
3. Experience Relevance (25%): Donor project experience depth? Sector alignment? Quantified impact (budgets, beneficiaries, outcomes)?
4. Skills & Keywords (15%): Technical skills, methodologies (logframes, ToC, RBM), tools, donor-specific terminology?
5. Education & Certifications (10%): Relevant qualifications? Professional certifications? Languages (especially UN languages)?
6. Donor Readiness (20%): Would this pass initial screening for a GIZ/World Bank assignment? Formatted per donor standards? Results-oriented language?

CRITICAL RULES:
- Your scores and feedback MUST reference SPECIFIC content from the CV text provided
- Do NOT give generic advice — every gap and suggestion must point to something concrete in THIS CV
- If the CV mentions "managed a $2M WASH project for GIZ in Ethiopia", reference that specifically
- Scores must vary meaningfully between different CVs — do not default to 65/100
- Be honest: a weak CV should score below 40, an excellent one above 80`;

const OPPORTUNITY_ADDENDUM = `

OPPORTUNITY CONTEXT:
You are also scoring this CV against a SPECIFIC opportunity. Evaluate how well this candidate fits THIS role.

Opportunity details:
- Title: {title}
- Organization: {organization}
- Description: {description}

When scoring with an opportunity:
- Experience Relevance should heavily weight match to THIS opportunity's requirements
- Skills & Keywords should check for THIS opportunity's specific technical needs
- Suggestions should be targeted: "For this {organization} role, you should highlight..."
- Add an "opportunity_fit" section with: match_percentage (0-100), matching_strengths (what in the CV aligns), missing_requirements (what the opportunity needs that the CV lacks), recommendation (1-2 sentence verdict)`;

const JSON_SCHEMA = `
Return ONLY valid JSON matching this exact schema (no markdown, no explanation, just JSON):
{
  "overall_score": <number 0-100>,
  "dimensions": [
    {
      "name": "Structure & Format",
      "score": <number 0-100>,
      "weight": 15,
      "gaps": ["specific gap referencing CV content"],
      "suggestions": ["specific actionable suggestion"]
    },
    {
      "name": "Professional Summary",
      "score": <number 0-100>,
      "weight": 15,
      "gaps": [],
      "suggestions": []
    },
    {
      "name": "Experience Relevance",
      "score": <number 0-100>,
      "weight": 25,
      "gaps": [],
      "suggestions": []
    },
    {
      "name": "Skills & Keywords",
      "score": <number 0-100>,
      "weight": 15,
      "gaps": [],
      "suggestions": []
    },
    {
      "name": "Education & Certifications",
      "score": <number 0-100>,
      "weight": 10,
      "gaps": [],
      "suggestions": []
    },
    {
      "name": "Donor Readiness",
      "score": <number 0-100>,
      "weight": 20,
      "gaps": [],
      "suggestions": []
    }
  ],
  "top_3_improvements": ["improvement 1", "improvement 2", "improvement 3"],
  "donor_specific_tips": {
    "GIZ": "specific tip for GIZ formatting based on THIS CV",
    "World Bank": "specific tip for WB formatting based on THIS CV",
    "EU": "specific tip for EU formatting based on THIS CV"
  }OPPORTUNITY_FIT_PLACEHOLDER
}`;

const OPPORTUNITY_FIT_JSON = `,
  "opportunity_fit": {
    "match_percentage": <number 0-100>,
    "matching_strengths": ["strength 1 from CV that matches this role"],
    "missing_requirements": ["requirement from the opportunity not found in CV"],
    "recommendation": "1-2 sentence verdict on fit"
  }`;

function buildSystemPrompt(opportunity?: OpportunityInput): string {
  let prompt = BASE_SYSTEM_PROMPT;

  if (opportunity) {
    prompt += OPPORTUNITY_ADDENDUM
      .replace("{title}", opportunity.title)
      .replace("{organization}", opportunity.organization)
      .replace("{description}", opportunity.description || "Not provided")
      .replace("{organization}", opportunity.organization);
  }

  const schema = JSON_SCHEMA.replace(
    "OPPORTUNITY_FIT_PLACEHOLDER",
    opportunity ? OPPORTUNITY_FIT_JSON : ""
  );

  prompt += "\n" + schema;
  return prompt;
}

/**
 * Check Supabase cv_scores for an existing score with the same CV text hash.
 * Persists across cold starts — saves AI calls for re-scored CVs.
 */
async function getPersistedScore(cvHash: string): Promise<CvScoreResult | null> {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    const { data } = await supabase
      .from("cv_scores")
      .select("overall_score, dimensions, improvements, donor_tips")
      .eq("cv_hash", cvHash)
      .order("scored_at", { ascending: false })
      .limit(1)
      .single();

    if (!data || !data.dimensions) return null;

    return {
      overall_score: data.overall_score,
      dimensions: data.dimensions as CvScoreResult["dimensions"],
      top_3_improvements: (data.improvements || []) as string[],
      donor_specific_tips: (data.donor_tips || {}) as Record<string, string>,
    };
  } catch {
    // If cv_hash column doesn't exist yet or query fails, skip gracefully
    return null;
  }
}

export async function scoreCv(
  cvText: string,
  opportunity?: OpportunityInput
): Promise<CvScoreResult> {
  const truncatedText = cvText.slice(0, MAX_CV_LENGTH);

  // Layer 1: In-memory cache (fast, survives within same warm function)
  const cacheKey = computeCacheKey(truncatedText, opportunity);
  const cached = getCached(cacheKey);
  if (cached) return cached;

  // Layer 2: Persistent dedup via Supabase (survives cold starts)
  // Only for generic scoring (no opportunity) — opportunity-specific scores are unique
  if (!opportunity) {
    const persisted = await getPersistedScore(cacheKey);
    if (persisted) {
      setCache(cacheKey, persisted); // Warm the in-memory cache too
      console.log("[cv-score] Persistent cache hit — skipped AI call");
      return persisted;
    }
  }

  const anthropic = new Anthropic();
  const systemPrompt = buildSystemPrompt(opportunity);

  let userMessage = `Here is the CV to score:\n\n${truncatedText}`;
  if (opportunity) {
    userMessage += `\n\n---\nScore this CV against the opportunity: "${opportunity.title}" at ${opportunity.organization}`;
  }

  const modelId = "claude-sonnet-4-20250514";
  const message = await anthropic.messages.create({
    model: modelId,
    max_tokens: 2500,
    // Structured system block with cache_control enables prompt caching.
    // The system prompt (~2000 tokens) is identical across calls —
    // cached reads cost 90% less on input tokens.
    system: [
      {
        type: "text" as const,
        text: systemPrompt,
        cache_control: { type: "ephemeral" as const },
      },
    ],
    messages: [{ role: "user", content: userMessage }],
  });

  // Track usage including prompt cache hits
  const usage = message.usage as unknown as Record<string, number>;
  const input_tokens = usage.input_tokens || 0;
  const output_tokens = usage.output_tokens || 0;
  const cacheRead = usage.cache_read_input_tokens || 0;
  logUsage({
    model: modelId,
    feature: "cv_score",
    input_tokens,
    output_tokens,
    cost_usd: calculateCost(modelId, input_tokens, output_tokens),
    cached: cacheRead > 0,
  });

  const responseText = message.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("");

  // Strip markdown code fences if present
  const jsonStr = responseText
    .replace(/^```json?\n?/m, "")
    .replace(/\n?```$/m, "")
    .trim();

  const parsed = JSON.parse(jsonStr) as CvScoreResult;

  if (
    typeof parsed.overall_score !== "number" ||
    !Array.isArray(parsed.dimensions) ||
    parsed.dimensions.length !== 6
  ) {
    throw new Error("Invalid score response structure from AI");
  }

  // Cache the result
  setCache(cacheKey, parsed);

  return parsed;
}
