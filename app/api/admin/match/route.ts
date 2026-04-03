import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import { logException, trackEvent } from "@/lib/logger";

export const maxDuration = 60;

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * POST /api/admin/match
 * Body: { tor_text: string, max_results?: number }
 *
 * Step 1: Extract requirements from ToR using Claude
 * Step 2: Filter experts from DB by sector/keyword overlap
 * Step 3: AI-rank top candidates against the ToR
 */
export async function POST(req: NextRequest) {
  try {
    const { tor_text, max_results = 10 } = await req.json();

    if (!tor_text || tor_text.length < 50) {
      return NextResponse.json({ error: "ToR text too short (min 50 chars)" }, { status: 400 });
    }

    const anthropic = new Anthropic();
    const sb = getAdmin();

    // Step 1: Extract requirements from the ToR
    const extractMsg = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 500,
      system: `Extract key requirements from this Terms of Reference / Job Description. Return ONLY JSON:
{"title":"role title","sectors":["sector1"],"required_skills":["skill1"],"required_experience_years":10,"required_countries":["country1"],"required_education":"Masters","required_languages":["English"],"donor":"GIZ","key_terms":["term1","term2"]}
Use standard sectors: Humanitarian Aid, Global Health, Finance & Banking, Project Management, Innovation & ICT, Agriculture, Economic Development, Gender & Social Inclusion, Environment & Natural Resources, Education, WASH, Governance, Media & Communications, Research, Legal, Energy.`,
      messages: [{ role: "user", content: tor_text.slice(0, 8000) }],
    });

    const rawReqs = extractMsg.content[0].type === "text" ? extractMsg.content[0].text : "";
    let reqs: any;
    try {
      const cleaned = rawReqs.replace(/```json?\s*/gi, "").replace(/```/g, "").trim();
      const firstBrace = cleaned.indexOf("{");
      const lastBrace = cleaned.lastIndexOf("}");
      reqs = JSON.parse(cleaned.slice(firstBrace, lastBrace + 1));
    } catch {
      return NextResponse.json({ error: "Could not parse ToR requirements" }, { status: 500 });
    }

    // Step 2: Get all profiles with CV data
    const { data: allProfiles, error: dbErr } = await sb
      .from("profiles")
      .select("id, name, headline, sectors, donors, countries, skills, qualifications, years_of_experience, cv_score, profile_type, education_level, languages, nationality, tags, cv_structured_data, email, phone")
      .not("cv_text", "is", null)
      .order("cv_score", { ascending: false });

    if (dbErr || !allProfiles) {
      return NextResponse.json({ error: "Failed to fetch profiles" }, { status: 500 });
    }

    // Step 2b: Score each profile locally (fast keyword matching)
    const reqSectors = (reqs.sectors || []).map((s: string) => s.toLowerCase());
    const reqSkills = (reqs.required_skills || []).map((s: string) => s.toLowerCase());
    const reqCountries = (reqs.required_countries || []).map((s: string) => s.toLowerCase());
    const reqLangs = (reqs.required_languages || []).map((s: string) => s.toLowerCase());
    const reqYears = reqs.required_experience_years || 0;
    const keyTerms = (reqs.key_terms || []).map((t: string) => t.toLowerCase());

    const scored = allProfiles.map((p: any) => {
      let score = 0;
      const pSectors = (p.sectors || []).map((s: string) => s.toLowerCase());
      const pSkills = (p.skills || []).map((s: string) => s.toLowerCase());
      const pCountries = (p.countries || []).map((s: string) => s.toLowerCase());
      const pLangs = (p.languages || []).map((s: string) => s.toLowerCase());
      const pDonors = (p.donors || []).map((s: string) => s.toLowerCase());

      // Sector match (0-30)
      const sectorOverlap = reqSectors.filter((s: string) => pSectors.some((ps: string) => ps.includes(s) || s.includes(ps))).length;
      score += Math.min(30, (sectorOverlap / Math.max(reqSectors.length, 1)) * 30);

      // Skills match (0-25)
      const allText = [p.qualifications, p.headline, ...(p.skills || [])].filter(Boolean).join(" ").toLowerCase();
      const skillHits = reqSkills.filter((s: string) => allText.includes(s)).length;
      score += Math.min(25, (skillHits / Math.max(reqSkills.length, 1)) * 25);

      // Country match (0-10)
      const countryOverlap = reqCountries.filter((c: string) => pCountries.some((pc: string) => pc.includes(c))).length;
      score += Math.min(10, (countryOverlap / Math.max(reqCountries.length, 1)) * 10);

      // Years match (0-15)
      if (p.years_of_experience && reqYears > 0) {
        const ratio = Math.min(p.years_of_experience / reqYears, 1.5);
        score += Math.min(15, ratio * 10);
      }

      // Language match (0-10)
      const langOverlap = reqLangs.filter((l: string) => pLangs.some((pl: string) => pl.includes(l))).length;
      score += Math.min(10, (langOverlap / Math.max(reqLangs.length, 1)) * 10);

      // Donor match bonus (0-5)
      if (reqs.donor && pDonors.some((d: string) => d.includes(reqs.donor.toLowerCase()))) {
        score += 5;
      }

      // Key terms in CV (0-5)
      const cvText = [p.qualifications, p.headline, ...(p.skills || []), ...(p.sectors || [])].join(" ").toLowerCase();
      const termHits = keyTerms.filter((t: string) => cvText.includes(t)).length;
      score += Math.min(5, (termHits / Math.max(keyTerms.length, 1)) * 5);

      return { ...p, match_score: Math.round(score) };
    });

    // Sort by match score, take top N
    scored.sort((a: any, b: any) => b.match_score - a.match_score);
    const topCandidates = scored.slice(0, max_results);

    // Step 3: AI-rank top candidates (optional, only if we have enough)
    let aiRanked = topCandidates;
    if (topCandidates.length >= 2 && topCandidates[0].match_score > 10) {
      try {
        const candidateSummaries = topCandidates.map((c: any, i: number) => {
          const emp = (c.cv_structured_data?.employment || []).slice(0, 3).map((e: any) =>
            `${e.position} at ${e.employer} (${e.from_date}–${e.to_date})`
          ).join("; ");
          return `#${i + 1} ${c.name}: ${c.years_of_experience || "?"}yr exp, sectors: ${(c.sectors || []).join(", ")}, donors: ${(c.donors || []).join(", ")}, education: ${c.education_level || "?"}, recent roles: ${emp || "N/A"}`;
        }).join("\n");

        const rankMsg = await anthropic.messages.create({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 400,
          system: `You rank candidates against a job/ToR. Return ONLY a JSON array of objects: [{"index":0,"fit_score":85,"reason":"2-sentence why"}]. Index is 0-based matching the candidate list. fit_score is 0-100.`,
          messages: [{ role: "user", content: `ToR: ${tor_text.slice(0, 3000)}\n\nCandidates:\n${candidateSummaries}` }],
        });

        const rankRaw = rankMsg.content[0].type === "text" ? rankMsg.content[0].text : "";
        const cleaned = rankRaw.replace(/```json?\s*/gi, "").replace(/```/g, "").trim();
        const firstBracket = cleaned.indexOf("[");
        const lastBracket = cleaned.lastIndexOf("]");
        if (firstBracket >= 0 && lastBracket > firstBracket) {
          const rankings = JSON.parse(cleaned.slice(firstBracket, lastBracket + 1));
          for (const r of rankings) {
            if (typeof r.index === "number" && r.index < aiRanked.length) {
              aiRanked[r.index].ai_fit_score = r.fit_score;
              aiRanked[r.index].ai_reason = r.reason;
            }
          }
          // Re-sort by AI score
          aiRanked.sort((a: any, b: any) => (b.ai_fit_score || b.match_score) - (a.ai_fit_score || a.match_score));
        }
      } catch (e) {
        // AI ranking failed, fall back to keyword ranking
        console.warn("[match] AI ranking failed:", (e as Error).message);
      }
    }

    // Clean output (don't send full cv_structured_data to client)
    const results = aiRanked.map((c: any) => ({
      id: c.id,
      name: c.name,
      headline: c.headline,
      sectors: c.sectors,
      donors: c.donors,
      countries: c.countries,
      years_of_experience: c.years_of_experience,
      cv_score: c.cv_score,
      profile_type: c.profile_type,
      education_level: c.education_level,
      languages: c.languages,
      nationality: c.nationality,
      email: c.email,
      phone: c.phone,
      tags: c.tags,
      match_score: c.match_score,
      ai_fit_score: c.ai_fit_score || null,
      ai_reason: c.ai_reason || null,
      recent_roles: (c.cv_structured_data?.employment || []).slice(0, 3).map((e: any) => ({
        position: e.position,
        employer: e.employer,
        from_date: e.from_date,
        to_date: e.to_date,
        country: e.country,
      })),
    }));

    trackEvent({ event: "expert_match", metadata: { title: reqs.title, candidates: results.length, top_score: results[0]?.ai_fit_score || results[0]?.match_score } });

    return NextResponse.json({
      success: true,
      requirements: reqs,
      results,
      total_experts: allProfiles.length,
    });
  } catch (err: unknown) {
    logException("admin/match", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Matching failed" }, { status: 500 });
  }
}
