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

    // Step 2: Get all profiles with CV data (include cv_text for full-text scoring)
    const { data: allProfiles, error: dbErr } = await sb
      .from("profiles")
      .select("id, name, headline, sectors, donors, countries, skills, qualifications, years_of_experience, cv_score, profile_type, education_level, languages, nationality, tags, cv_structured_data, cv_text, email, phone")
      .not("cv_text", "is", null)
      .order("cv_score", { ascending: false });

    if (dbErr || !allProfiles) {
      return NextResponse.json({ error: "Failed to fetch profiles" }, { status: 500 });
    }

    // Step 2b: Score each profile against the FULL CV blob (not just structured fields).
    // Score is normalized to 0-100: sector(20) + skills+keyterms-in-blob(35) +
    //   country(10) + years(15) + language(10) + donor(5) + seniority(5)
    const reqSectors = (reqs.sectors || []).map((s: string) => s.toLowerCase());
    const reqSkills = (reqs.required_skills || []).map((s: string) => s.toLowerCase());
    const reqCountries = (reqs.required_countries || []).map((s: string) => s.toLowerCase());
    const reqLangs = (reqs.required_languages || []).map((s: string) => s.toLowerCase());
    const reqYears = reqs.required_experience_years || 0;
    const keyTerms = (reqs.key_terms || []).map((t: string) => t.toLowerCase());

    function fullBlob(p: any): string {
      const cv = p.cv_structured_data || {};
      const emp = Array.isArray(cv.employment) ? cv.employment : [];
      const edu = Array.isArray(cv.education) ? cv.education : [];
      return [
        p.name,
        p.headline,
        p.qualifications,
        p.nationality,
        ...(p.sectors || []),
        ...(p.skills || []),
        ...(p.countries || []),
        ...(p.donors || []),
        ...(p.languages || []),
        ...(p.tags || []),
        p.cv_text,
        cv.professional_summary,
        cv.key_qualifications,
        ...emp.map((e: any) => [e.employer, e.position, e.country, e.description_of_duties].filter(Boolean).join(" ")),
        ...edu.map((e: any) => [e.degree, e.field_of_study, e.institution].filter(Boolean).join(" ")),
      ].filter(Boolean).join(" ").toLowerCase();
    }

    function countMatches(blob: string, term: string): number {
      if (!term) return 0;
      const escaped = term.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return (blob.match(new RegExp(escaped, "g")) || []).length;
    }

    const scored = allProfiles.map((p: any) => {
      const blob = fullBlob(p);
      const pSectors = (p.sectors || []).map((s: string) => s.toLowerCase());
      const pCountries = (p.countries || []).map((s: string) => s.toLowerCase());
      const pLangs = (p.languages || []).map((s: string) => s.toLowerCase());
      const pDonors = (p.donors || []).map((s: string) => s.toLowerCase());

      // Sector match (0-20) — structured sectors first, then fallback to blob
      const sectorStructOverlap = reqSectors.filter((s: string) => pSectors.some((ps: string) => ps.includes(s) || s.includes(ps))).length;
      const sectorBlobHits = reqSectors.filter((s: string) => blob.includes(s)).length;
      const effectiveSector = Math.max(sectorStructOverlap, sectorBlobHits);
      const sectorScore = Math.min(20, (effectiveSector / Math.max(reqSectors.length, 1)) * 20);

      // Combined skills + key terms searched in FULL blob (0-35) — this is the
      // big change vs previous version, where a Zewdu-style climate CV wouldn't
      // match if his sectors array was sparse.
      const combinedTerms = Array.from(new Set([...reqSkills, ...keyTerms]));
      let termHitTotal = 0;
      let termsHit = 0;
      for (const t of combinedTerms) {
        const n = countMatches(blob, t);
        if (n > 0) { termsHit++; termHitTotal += Math.min(n, 5); }
      }
      const termScore = combinedTerms.length > 0
        ? Math.min(35, (termsHit / combinedTerms.length) * 25 + Math.min(termHitTotal, 20) * 0.5)
        : 0;

      // Country match (0-10)
      const countryOverlap = reqCountries.filter((c: string) => pCountries.some((pc: string) => pc.includes(c)) || blob.includes(c)).length;
      const countryScore = reqCountries.length > 0 ? Math.min(10, (countryOverlap / reqCountries.length) * 10) : 5;

      // Years match (0-15)
      let yearsScore = 0;
      if (p.years_of_experience && reqYears > 0) {
        const ratio = p.years_of_experience / reqYears;
        yearsScore = ratio >= 1 ? 15 : Math.max(0, ratio * 15);
      } else if (p.years_of_experience && p.years_of_experience >= 10) {
        yearsScore = 10;
      }

      // Language match (0-10)
      const langOverlap = reqLangs.filter((l: string) => pLangs.some((pl: string) => pl.includes(l)) || blob.includes(l)).length;
      const langScore = reqLangs.length > 0 ? Math.min(10, (langOverlap / reqLangs.length) * 10) : 5;

      // Donor match bonus (0-5)
      let donorScore = 0;
      if (reqs.donor) {
        const dr = reqs.donor.toLowerCase();
        if (pDonors.some((d: string) => d.includes(dr)) || blob.includes(dr)) donorScore = 5;
      }

      // Seniority boost (0-5)
      let seniorityScore = 0;
      if (p.profile_type === "Expert") seniorityScore = 5;
      else if (p.profile_type === "Senior") seniorityScore = 3;
      else if (p.profile_type === "Mid-level") seniorityScore = 1;

      const total = sectorScore + termScore + countryScore + yearsScore + langScore + donorScore + seniorityScore;

      return {
        ...p,
        match_score: Math.round(total),
        match_breakdown: {
          sector: Math.round(sectorScore),
          skills_and_terms: Math.round(termScore),
          country: Math.round(countryScore),
          years: Math.round(yearsScore),
          language: Math.round(langScore),
          donor: Math.round(donorScore),
          seniority: Math.round(seniorityScore),
        },
      };
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

    // Clean output (don't send full cv_structured_data or cv_text to client)
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
      match_score: c.match_score,          // 0-100 keyword-based score
      match_breakdown: c.match_breakdown,  // per-dimension breakdown
      ai_fit_score: c.ai_fit_score || null, // 0-100 AI final ranking on top N
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
