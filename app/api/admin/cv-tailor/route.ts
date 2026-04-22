import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { isAdmin } from "@/lib/admin";

export const maxDuration = 120;

/**
 * POST /api/admin/cv-tailor
 *
 * Body: { profile_id, tor_text, target_role? }
 *
 * Returns a full CV rewrite tailored against the ToR, with strict semantic
 * preservation (no role upgrades, no invented content).
 *
 * Output:
 *   {
 *     profile_name,
 *     narrative_hook,
 *     professional_summary_tailored,
 *     key_qualifications: string[],
 *     experiences: [{
 *       idx,            // original employment array index, 0-based
 *       employer, dates, position,
 *       description_original,
 *       description_tailored,
 *       change_summary,  // 1-line explanation of what changed
 *       role_signal,     // one of: lead | support | contributor | unclear
 *     }],
 *     clarifying_questions: string[],   // specific things to ask the candidate to confirm
 *     enhancement_asks: string[],        // "do you have X?" style requests for missing material
 *     voice_notes
 *   }
 */

function getAdminSb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

async function requireAdmin() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll(); }, setAll() {} } }
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not authenticated", status: 401 };
  if (!isAdmin(user.id)) return { ok: false, error: "Admin only", status: 403 };
  return { ok: true, user };
}

const SYSTEM_PROMPT = `You are tailoring a development consultant's CV against a specific Terms of Reference (ToR) for a donor-funded bid. Your output will be pasted directly into the candidate's CV before submission to a client.

SEMANTIC PRESERVATION is the most important rule. Violate this and the candidate gets disqualified or misrepresents themselves.

Never upgrade a role. Never claim responsibility the candidate did not have.
- If the original says "supported", "assisted", "contributed to", "participated in", do not write "led", "managed", "directed", "headed".
- If the assignment lists a separate Team Leader, Technical Lead, TTL, or supervisor who is NOT the candidate, the candidate is SUPPORT, not lead. Use "supported", "assisted", "contributed to".
- If the position title is "Consultant", "Specialist", "Advisor", "Expert", "Officer" under someone else, do not upgrade to "Lead", "Manager", "Director".
- Keep dates, employers, project names, donors, clients exactly as written. Do not change or invent them.
- Do not invent skills, certifications, languages, qualifications, clients, budgets, beneficiary numbers, or percentages. If a number is in the source, you can keep it. If it is not, do not make one up.
- If the ToR asks for experience the candidate lacks evidence for in the source CV, do NOT invent it. Instead add a clarifying_question or enhancement_ask.

WHAT YOU MAY DO:
- Rephrase descriptions to surface keywords from the ToR that the candidate actually has evidence for.
- Promote bullets that match ToR language to the top of each experience's description.
- Demote or cut bullets that are irrelevant to this ToR (but do not delete an entire experience).
- Normalize donor acronyms (e.g. "WBG" -> "World Bank Group") if the source supports it.
- Rewrite the professional summary and key qualifications to lead with ToR alignment, using only evidence from the candidate's own CV.
- Write a one-sentence narrative hook specific to this ToR.

VOICE RULES. Read the candidate's own CV text first and match their voice. Do NOT introduce:
- Em dashes. Use commas, periods, or parentheses.
- "Stands as", "serves as", "represents", "functions as", "is a testament to". Use "is" or "has".
- "Pivotal", "crucial", "vibrant", "showcase", "underscore", "tapestry", "landscape" (abstract), "key" as puffery adjective.
- "In the heart of", "nestled", "boasts".
- "Highlighting", "emphasizing", "reflecting", "contributing to" tacked on at sentence ends.
- Negative parallelisms ("Not only X but Y").
- Rule of three forced triads.
- Chatbot pleasantries.

Write like a consultant writing their own CV: short direct sentences, specific project names, specific institutions, specific years. First person where the candidate uses it, third-person-professional where they don't. Concrete and dry.

FOR EACH experience row, determine the candidate's role_signal:
- "lead" only if they are explicitly named as TL/lead/manager/director, OR no one else is named as more senior
- "support" if there is a separate Technical Lead, Team Leader, TTL, supervisor, or Programme Manager mentioned alongside them
- "contributor" if they are part of a team but role is unspecified
- "unclear" if you genuinely cannot tell

Use this signal to pick verbs: lead -> "led/managed/directed"; support -> "supported/advised/contributed to"; contributor -> "worked on/contributed to"; unclear -> "worked on".

CLARIFYING QUESTIONS: list 3-7 specific questions you want the candidate to confirm (e.g. "Confirm the beneficiary count on the Jobs Compact programme was 100,000", "Was your role on the X assignment team leader or technical advisor?"). Be specific to this CV and this ToR.

ENHANCEMENT ASKS: list 3-5 short requests for additional material that would strengthen this bid (e.g. "Two sentences on your engagement with the Ministry of Women and Social Affairs if any", "Examples of OSH programmes you have worked on"). Only ask for material that would help the ToR fit.

Output strictly as JSON (no markdown fences, no preamble, no trailing text). Do not include the experiences array index markers inside description text. Keep the schema exactly:

{
  "narrative_hook": "one sentence",
  "professional_summary_tailored": "2-4 sentences or null if the source has no summary",
  "key_qualifications": ["bullet 1", "bullet 2", ...],
  "experiences": [
    {
      "idx": 0,
      "employer": "...",
      "dates": "...",
      "position": "...",
      "description_original": "exactly what was in the source, for admin diff comparison",
      "description_tailored": "rewritten description with ToR alignment, preserving role signal",
      "change_summary": "one sentence describing what changed and why",
      "role_signal": "lead|support|contributor|unclear"
    }
  ],
  "clarifying_questions": ["..."],
  "enhancement_asks": ["..."],
  "voice_notes": "1-2 sentences"
}`;

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const { profile_id, tor_text, target_role } = await req.json();
    if (!profile_id || !tor_text) {
      return NextResponse.json({ error: "profile_id and tor_text required" }, { status: 400 });
    }

    const sb = getAdminSb();
    const { data: profile, error } = await sb
      .from("profiles")
      .select("id, name, headline, sectors, skills, qualifications, years_of_experience, cv_score, cv_text, cv_structured_data, profile_type")
      .eq("id", profile_id)
      .single();

    if (error || !profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }
    if (!profile.cv_text || profile.cv_text.length < 200) {
      return NextResponse.json({ error: "Profile has no CV text to work from" }, { status: 400 });
    }

    const cv = profile.cv_structured_data || {};
    const employment = Array.isArray(cv.employment) ? cv.employment : [];

    // Structure the employment with explicit indices so the model preserves order
    const employmentIndexed = employment.map((e: any, idx: number) => ({
      idx,
      employer: e.employer || null,
      position: e.position || null,
      country: e.country || null,
      from_date: e.from_date || null,
      to_date: e.to_date || null,
      description_of_duties: e.description_of_duties || "",
      reference_person: e.reference_person || null,
    }));

    const cvContext = JSON.stringify({
      name: profile.name,
      headline: profile.headline,
      sectors: profile.sectors,
      skills: profile.skills,
      qualifications: profile.qualifications,
      years_of_experience: profile.years_of_experience,
      profile_type: profile.profile_type,
      professional_summary: cv.professional_summary,
      key_qualifications: cv.key_qualifications,
      education: cv.education,
      employment: employmentIndexed,
      languages: cv.languages,
      certifications: cv.certifications,
    }, null, 2);

    const cvText = (profile.cv_text || "").slice(0, 30000);
    const tor = tor_text.slice(0, 20000);

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const userContent = `TARGET ROLE: ${target_role || "(not specified, infer from ToR)"}

=== TERMS OF REFERENCE (ToR) ===

${tor}

=== CANDIDATE CV, STRUCTURED DATA ===

${cvContext}

=== CANDIDATE CV, RAW TEXT (for voice matching and cross-check) ===

${cvText}

Produce the tailored JSON output. Preserve every employment entry by idx. Do NOT upgrade roles. If the source has a separate Team Leader or TTL, the candidate is support on that assignment.`;

    const resp = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 16000,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userContent }],
    });

    const textBlock = resp.content.find((b: any) => b.type === "text") as any;
    const raw = textBlock?.text || "";

    let jsonStr = raw.trim();
    const fence = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fence) jsonStr = fence[1].trim();
    const firstBrace = jsonStr.indexOf("{");
    const lastBrace = jsonStr.lastIndexOf("}");
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      jsonStr = jsonStr.slice(firstBrace, lastBrace + 1);
    }

    let parsed: any;
    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      return NextResponse.json({
        error: "Model returned non-JSON. Try again.",
        raw: raw.slice(0, 2000),
      }, { status: 500 });
    }

    // Validate: ensure every original employment idx is present in output
    const returnedIdxs = new Set((parsed.experiences || []).map((e: any) => e.idx));
    const missing = employmentIndexed.filter((e: any) => !returnedIdxs.has(e.idx)).map((e: any) => e.idx);
    if (missing.length > 0) {
      parsed._warnings = [`Missing experience indices: ${missing.join(", ")}. Re-run if critical.`];
    }

    return NextResponse.json({
      profile_name: profile.name,
      ...parsed,
    });
  } catch (err: any) {
    console.error("[cv-tailor]", err);
    return NextResponse.json({ error: err.message || "Failed to tailor" }, { status: 500 });
  }
}
