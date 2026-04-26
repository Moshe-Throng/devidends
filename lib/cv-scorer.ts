import Anthropic from "@anthropic-ai/sdk";
import { createHash } from "crypto";
import { createClient } from "@supabase/supabase-js";
import type { CvScoreResult, OpportunityInput } from "./types/cv-score";
import { calculateCost, logUsage } from "./usage-tracker";
import { logException } from "./logger";

const MAX_CV_LENGTH = 60_000;

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

const SYSTEM_PROMPT_GENERIC = `You are a CV scorer for international development consulting (GIZ, World Bank, EU, UNDP, AfDB). Score 0-100 across 6 dimensions. Be specific to THIS CV's content. Weak CVs score <40, strong >80. Never default to 65.

For EACH dimension, provide a one-sentence "rationale" grounded in concrete evidence from THIS CV (a section name, a project, a missing element, a number). The rationale must justify the score. Bad rationale: "needs work". Good rationale: "Professional summary lists three sectors but never names a donor or a quantified result, so it reads as generic."

Calibration anchors:
  90-100: textbook donor-grade CV — clear summary, quantified donor projects, sharp skills, strong education, donor-format ready
  75-89:  strong CV with one or two visible gaps (missing summary, no quantification, weak donor naming)
  60-74:  competent CV but generic — donor experience implied not named, structure ok, skills loose
  40-59:  underdeveloped — no summary, vague experience, no donors, length issues
  <40:    incomplete or off-sector

Return ONLY this JSON (no markdown):
{"overall_score":<0-100>,"dimensions":[{"name":"Structure","score":<0-100>,"rationale":"..."},{"name":"Summary","score":<0-100>,"rationale":"..."},{"name":"Experience","score":<0-100>,"rationale":"..."},{"name":"Skills","score":<0-100>,"rationale":"..."},{"name":"Education","score":<0-100>,"rationale":"..."},{"name":"Donor Readiness","score":<0-100>,"rationale":"..."}],"top_3_improvements":["specific improvement 1","specific improvement 2","specific improvement 3"]}`;

const SYSTEM_PROMPT_OPPORTUNITY = `You are scoring a candidate's CV AGAINST A SPECIFIC OPPORTUNITY (not in general). The job posting is provided in the user message.

Your job: judge how well THIS candidate fits THIS role. The 6 dimensions reflect fit, not generic CV quality:
- Structure: format/clarity that lets a hiring manager judge the candidate quickly for THIS role
- Summary: do the opening lines match what the role wants?
- Experience: directly relevant prior work for this role's responsibilities/sector/donor/country (heaviest weight in your judgment)
- Skills: required and preferred skills from the posting present in the CV?
- Education: meets the role's education bar?
- Donor Readiness: would this candidate pass screening for THIS posting's donor + role tier?

For EACH dimension, write a one-sentence "rationale" comparing THIS CV to THIS posting using concrete evidence (e.g. "8 years of WASH project leadership directly answers the role's WASH M&E focus" or "CV is heavy on M&E but the role asks for Procurement, no procurement projects listed"). The rationale must justify the score.

Score harshly when the candidate is mismatched (different sector, junior for senior role, wrong country experience, missing required skills). A strong generic CV that doesn't fit the role should score 40-55. A weak CV that perfectly fits should score 60-70. A strong fit scores 75+. Never default to 65.

top_3_improvements MUST be specific to closing the gap to THIS role (e.g., "Add quantified results from your WASH work to match the M&E officer requirements").

Return ONLY this JSON (no markdown):
{"overall_score":<0-100>,"dimensions":[{"name":"Structure","score":<0-100>,"rationale":"..."},{"name":"Summary","score":<0-100>,"rationale":"..."},{"name":"Experience","score":<0-100>,"rationale":"..."},{"name":"Skills","score":<0-100>,"rationale":"..."},{"name":"Education","score":<0-100>,"rationale":"..."},{"name":"Donor Readiness","score":<0-100>,"rationale":"..."}],"top_3_improvements":["fit-gap improvement 1","fit-gap improvement 2","fit-gap improvement 3"]}`;

function buildSystemPrompt(opportunity?: OpportunityInput): string {
  return opportunity ? SYSTEM_PROMPT_OPPORTUNITY : SYSTEM_PROMPT_GENERIC;
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

  let userMessage: string;
  if (opportunity) {
    // Put the opportunity FIRST so the model anchors on it before reading the CV.
    const desc = (opportunity.description || "").slice(0, 4000); // cap to keep prompt small
    userMessage = [
      `OPPORTUNITY:`,
      `Title: ${opportunity.title}`,
      `Organization: ${opportunity.organization}`,
      desc ? `\nDescription / Requirements:\n${desc}` : "",
      ``,
      `─────────────────`,
      ``,
      `CANDIDATE CV:`,
      ``,
      truncatedText,
      ``,
      `─────────────────`,
      `Now score this candidate's fit for the opportunity above.`,
    ].filter(Boolean).join("\n");
  } else {
    userMessage = `Here is the CV to score:\n\n${truncatedText}`;
  }

  const modelId = "claude-haiku-4-5-20251001";
  const message = await anthropic.messages.create({
    model: modelId,
    max_tokens: 2000,
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

  // Robust JSON extraction — handles code fences, leading text, trailing text, and truncation
  let jsonStr = responseText;

  // Strip markdown code fences (handles ```json ... ``` and truncated responses without closing fence)
  const fenceMatch = jsonStr.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
  if (fenceMatch) {
    jsonStr = fenceMatch[1];
  } else if (jsonStr.startsWith("```")) {
    // Truncated: opening fence but no closing fence
    jsonStr = jsonStr.replace(/^```(?:json)?\s*\n?/, "");
  }

  // Find the first { and last } to extract just the JSON object
  const firstBrace = jsonStr.indexOf("{");
  const lastBrace = jsonStr.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    jsonStr = jsonStr.slice(firstBrace, lastBrace + 1);
  }

  // Fix common AI JSON issues: trailing commas before } or ]
  jsonStr = jsonStr
    .replace(/,\s*}/g, "}")
    .replace(/,\s*]/g, "]")
    .trim();

  let parsed: CvScoreResult;
  try {
    parsed = JSON.parse(jsonStr) as CvScoreResult;
  } catch (e) {
    // Last resort: try to fix unterminated strings by closing them
    const fixedJson = jsonStr
      .replace(/:\s*"([^"]*?)$/gm, ': "$1"')  // close unterminated strings at line end
      .replace(/,\s*$/, "");  // remove trailing comma
    try {
      parsed = JSON.parse(fixedJson) as CvScoreResult;
    } catch {
      logException("cv-scorer", new Error("JSON parse failed"), { raw: responseText.slice(0, 500), extracted: jsonStr.slice(0, 300) });
      throw new Error("CV scoring returned invalid data — please try again");
    }
  }

  if (typeof parsed.overall_score !== "number" || !Array.isArray(parsed.dimensions)) {
    logException("cv-scorer", new Error("Invalid structure"), { parsed: JSON.stringify(parsed).slice(0, 300) });
    throw new Error("Invalid score response structure from AI");
  }

  // Cache the result
  setCache(cacheKey, parsed);

  return parsed;
}
