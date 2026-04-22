import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { isAdmin } from "@/lib/admin";

export const maxDuration = 60;

/**
 * POST /api/admin/cv-tailor
 *
 * Body: { profile_id: string, tor_text: string, target_role?: string }
 *
 * Returns:
 *   {
 *     key_qualifications: string[],        // rewritten bullets (8-10)
 *     narrative_hook: string,               // one-sentence pitch
 *     top_experiences_to_highlight: [{ employer, position, reason }],
 *     voice_notes: string                   // short note on detected voice
 *   }
 *
 * Admin-only. Uses Claude Sonnet with a humanization-first system prompt.
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
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll() {},
      },
    }
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not authenticated", status: 401 };
  if (!isAdmin(user.id)) return { ok: false, error: "Admin only", status: 403 };
  return { ok: true, user };
}

const SYSTEM_PROMPT = `You are tailoring a development consultant's CV against a specific Terms of Reference (ToR) for a donor-funded bid (EU/AFD/World Bank/UN/etc.). Your output becomes text the consultant pastes into their CV before submission.

CRITICAL VOICE RULES. Read the candidate's own CV text first. Match their existing writing voice. Do NOT introduce any of these AI tells:
- Em dashes. Use commas, periods, or parentheses.
- "Stands as", "serves as", "represents", "functions as", "is a testament to". Use "is" or "has".
- "Pivotal", "crucial", "vibrant", "showcase", "underscore", "tapestry", "landscape" (abstract), "key" as puffery adjective.
- "In the heart of", "nestled", "boasts".
- "Highlighting", "emphasizing", "reflecting", "contributing to" tacked on at sentence ends.
- Negative parallelisms ("Not only X but Y", "It's not just X, it's Y").
- Rule of three forced triads.
- "Let me help you", "I hope this helps", any chatbot pleasantries.

Write like a real consultant writing their own CV: short direct sentences, specific project names, specific institutions, specific years. First person when the candidate uses it. Numbers and quantified results where available. Concrete, dry, professional.

Your job:
1. Read the ToR. Identify the 6-10 requirements/keywords that determine shortlisting.
2. Read the candidate's CV (both structured data and free text). Note their actual experience that maps to those requirements, and their writing voice.
3. Rewrite the Key Qualifications bullets (aim for 8-10 bullets) so every bullet hammers at least one ToR requirement using the candidate's actual experience, in their voice.
4. Identify the top 3 experiences from their CV that should be promoted/elaborated in the assignment table against this ToR, and write ONE sentence per experience explaining why it matters for THIS bid.
5. Write a one-sentence "narrative hook" the candidate could open a cover letter with, specific to this bid.
6. In voice_notes, write 1-2 sentences describing the candidate's natural writing voice so the admin can sanity-check your output.

Output strictly as JSON matching this schema (no markdown, no preamble, no trailing text):

{
  "key_qualifications": ["bullet 1", "bullet 2", ...],
  "narrative_hook": "one sentence",
  "top_experiences_to_highlight": [
    { "employer": "...", "position": "...", "reason": "one sentence" }
  ],
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
      employment: cv.employment,
      languages: cv.languages,
      certifications: cv.certifications,
    }, null, 2);

    // Truncate CV text to stay within budget
    const cvText = (profile.cv_text || "").slice(0, 20000);
    const tor = tor_text.slice(0, 15000);

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const userContent = `TARGET ROLE: ${target_role || "(not specified, infer from ToR)"}

=== TERMS OF REFERENCE (ToR) ===

${tor}

=== CANDIDATE CV, STRUCTURED DATA ===

${cvContext}

=== CANDIDATE CV, RAW TEXT (for voice matching) ===

${cvText}

Produce the tailored output as JSON only.`;

    const resp = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4000,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userContent }],
    });

    const textBlock = resp.content.find((b: any) => b.type === "text") as any;
    const raw = textBlock?.text || "";

    // Extract JSON (tolerate fence wrappers)
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
        raw: raw.slice(0, 1500),
      }, { status: 500 });
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
