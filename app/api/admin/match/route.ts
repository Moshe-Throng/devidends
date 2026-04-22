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
    const { tor_text, max_results = 10, min_score = 40 } = await req.json();

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

    // Step 2b: Score each profile against the CV.
    // ZONED scoring: hits in headline/summary count 3x more than hits in cv_text.
    // This gives the signal differentiation the previous flat scoring was missing.
    // Normalized to 0-100: sector(15) + terms-zoned(50) + country(10) + years(10)
    //   + language(5) + donor(5) + seniority(5). Total = 100.
    const reqSectors = (reqs.sectors || []).map((s: string) => s.toLowerCase());
    const reqSkills = (reqs.required_skills || []).map((s: string) => s.toLowerCase());
    const reqCountries = (reqs.required_countries || []).map((s: string) => s.toLowerCase());
    const reqLangs = (reqs.required_languages || []).map((s: string) => s.toLowerCase());
    const reqYears = reqs.required_experience_years || 0;
    const keyTerms = (reqs.key_terms || []).map((t: string) => t.toLowerCase());

    // Two zones: "main" = high-signal (headline/title/summary/key_quals) and
    // "body" = everything else (cv_text, employment descriptions, education).
    // A hit in the main zone is much stronger evidence than a stray mention
    // in a long CV body.
    function mainBlob(p: any): string {
      const cv = p.cv_structured_data || {};
      return [
        p.headline,
        p.qualifications,
        cv.professional_summary,
        cv.key_qualifications,
        ...(p.sectors || []),
        ...(p.skills || []),
        ...(p.tags || []),
      ].filter(Boolean).join(" ").toLowerCase();
    }

    function bodyBlob(p: any): string {
      const cv = p.cv_structured_data || {};
      const emp = Array.isArray(cv.employment) ? cv.employment : [];
      const edu = Array.isArray(cv.education) ? cv.education : [];
      return [
        p.cv_text,
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
      const main = mainBlob(p);
      const body = bodyBlob(p);
      const pSectors = (p.sectors || []).map((s: string) => s.toLowerCase());
      const pCountries = (p.countries || []).map((s: string) => s.toLowerCase());
      const pLangs = (p.languages || []).map((s: string) => s.toLowerCase());
      const pDonors = (p.donors || []).map((s: string) => s.toLowerCase());

      // Sector match (0-15) — structured sectors first, then fallback to main+body
      const sectorStructOverlap = reqSectors.filter((s: string) =>
        pSectors.some((ps: string) => ps.includes(s) || s.includes(ps))
      ).length;
      const sectorBlobHits = reqSectors.filter((s: string) => main.includes(s) || body.includes(s)).length;
      const effectiveSector = Math.max(sectorStructOverlap, sectorBlobHits);
      const sectorScore = Math.min(15, (effectiveSector / Math.max(reqSectors.length, 1)) * 15);

      // ZONED terms match (0-50) — the big differentiator.
      // Each term scored independently. Hits in main zone weighted 3x.
      // This means "climate risk" in a headline counts 3x more than the same
      // phrase buried in a 20-page CV body.
      const combinedTerms = Array.from(new Set([...reqSkills, ...keyTerms]));
      let termCoveragePoints = 0;  // how many DIFFERENT terms hit (max 25)
      let termDensityPoints = 0;   // how many TOTAL occurrences (weighted, max 25)
      for (const t of combinedTerms) {
        const nMain = countMatches(main, t);
        const nBody = countMatches(body, t);
        if (nMain > 0 || nBody > 0) {
          // Coverage: per distinct term matched. Main-zone hits get bigger coverage weight.
          termCoveragePoints += nMain > 0 ? 1.5 : 0.6;
          // Density: weighted total matches, capped per term to prevent stuffing.
          const weightedDensity = Math.min(nMain, 5) * 1.0 + Math.min(nBody, 8) * 0.25;
          termDensityPoints += weightedDensity;
        }
      }
      // Normalize coverage: cap at 25. If N terms and full main coverage, termCoveragePoints = N*1.5
      const maxCoverage = Math.max(combinedTerms.length * 1.5, 1);
      const coverageScore = Math.min(25, (termCoveragePoints / maxCoverage) * 25);
      const densityScore = Math.min(25, termDensityPoints * 0.8);
      const termScore = coverageScore + densityScore;

      // Country match (0-10)
      const countryOverlap = reqCountries.filter((c: string) =>
        pCountries.some((pc: string) => pc.includes(c)) || main.includes(c) || body.includes(c)
      ).length;
      const countryScore = reqCountries.length > 0
        ? Math.min(10, (countryOverlap / reqCountries.length) * 10)
        : 5;

      // Years match (0-10)
      let yearsScore = 0;
      if (p.years_of_experience && reqYears > 0) {
        const ratio = p.years_of_experience / reqYears;
        yearsScore = ratio >= 1 ? 10 : Math.max(0, ratio * 10);
      } else if (p.years_of_experience && p.years_of_experience >= 10) {
        yearsScore = 7;
      }

      // Language match (0-5)
      const langOverlap = reqLangs.filter((l: string) =>
        pLangs.some((pl: string) => pl.includes(l)) || main.includes(l) || body.includes(l)
      ).length;
      const langScore = reqLangs.length > 0
        ? Math.min(5, (langOverlap / reqLangs.length) * 5)
        : 3;

      // Donor match bonus (0-5)
      let donorScore = 0;
      if (reqs.donor) {
        const dr = reqs.donor.toLowerCase();
        if (pDonors.some((d: string) => d.includes(dr)) || main.includes(dr) || body.includes(dr)) donorScore = 5;
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

    // Sort by match score
    scored.sort((a: any, b: any) => b.match_score - a.match_score);

    // Apply cutoff: drop anyone under min_score (default 40).
    const aboveCutoff = scored.filter((c: any) => c.match_score >= min_score);
    const topCandidates = aboveCutoff.slice(0, max_results);

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
          max_tokens: 1000,
          system: `You rank candidates against a specific ToR. Use the FULL 0-100 range. Do not compress scores into the 60-70 band. Calibrate:

- 90-100: textbook fit. Candidate's primary specialization matches the ToR's primary requirement. Would be an obvious first-pick in real evaluation.
- 75-89: strong fit with minor gaps (e.g. missing one secondary qualification).
- 60-74: adjacent expertise. Candidate has related experience but not the core specialization.
- 40-59: tangential. Some relevant work but would not be a credible lead for this role.
- 0-39: irrelevant or wrong field.

Be generous at the top end for genuine specialists. Be strict with adjacent candidates. The goal is to help the admin SEE differentiation, not rank everyone in the same band.

Return ONLY a JSON array: [{"index":0,"fit_score":92,"reason":"one sentence why, cite the specific match"}]. Index is 0-based matching the candidate list order.`,
          messages: [{ role: "user", content: `ToR:\n${tor_text.slice(0, 3000)}\n\nCandidates to rank:\n${candidateSummaries}` }],
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
