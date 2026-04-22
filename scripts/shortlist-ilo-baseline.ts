/**
 * Build a candidate shortlist for the ILO Sectoral Baseline Assessment bid
 * (SIRAYE / Coffee & Horticulture value chains, Ethiopia).
 *
 * For each role slot, scans the Devidends profiles DB using sector tags,
 * skill keywords, and full-text CV search. Ranks by relevance score +
 * CV quality score, returns top 5 per slot.
 */

import * as fs from "fs";
import * as path from "path";
import { createClient } from "@supabase/supabase-js";

const envPath = path.join(__dirname, "..", ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const idx = t.indexOf("=");
    if (idx < 0) continue;
    const key = t.slice(0, idx).trim();
    const val = t.slice(idx + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = val;
  }
}

type Profile = {
  id: string;
  name: string;
  headline: string | null;
  sectors: string[] | null;
  skills: string[] | null;
  qualifications: string | null;
  years_of_experience: number | null;
  cv_score: number | null;
  cv_text: string | null;
  cv_structured_data: any;
  profile_type: string | null;
  email: string | null;
  claimed_at: string | null;
  is_recommender: boolean;
};

type Slot = {
  name: string;
  keywords: string[];      // hit any of these -> score
  bonus: string[];         // extra weight
  required_any?: string[]; // must match at least one (strict)
};

const SLOTS: Slot[] = [
  {
    name: "Team Leader / Senior Labour Economist",
    keywords: ["labour", "labor", "employment", "ILO", "decent work", "economist", "labour market", "workforce", "economic development"],
    bonus: ["team leader", "senior", "15 years", "ILO", "World Bank", "programme director"],
  },
  {
    name: "OSH Expert (Occupational Safety & Health)",
    keywords: ["OSH", "occupational safety", "occupational health", "workplace safety", "health and safety", "factory safety", "workplace injury", "ergonomics"],
    bonus: ["certified", "NEBOSH", "IOSH", "inspector"],
  },
  {
    name: "Decent Work / Working Conditions Specialist",
    keywords: ["working conditions", "decent work", "labour rights", "labour standards", "workers rights", "ILO conventions", "freedom of association", "collective bargaining"],
    bonus: ["ILO", "labour inspection", "unions", "tripartite"],
  },
  {
    name: "Productivity / Enterprise Development Expert",
    keywords: ["productivity", "enterprise development", "SME", "MSME", "value chain", "SCORE", "lean", "kaizen", "industrial productivity", "operations"],
    bonus: ["SCORE", "productivity improvement", "factory", "manufacturing", "industrial cluster"],
  },
  {
    name: "Skills Gap / TVET Expert",
    keywords: ["skills", "TVET", "technical vocational", "training", "capacity building", "workforce development", "skills assessment", "apprenticeship", "curriculum"],
    bonus: ["TVET", "ATVET", "vocational", "workforce", "skills gap"],
  },
  {
    name: "Gender / Social Inclusion Expert",
    keywords: ["gender", "women", "GESI", "social inclusion", "gender equality", "women empowerment", "gender-based violence", "GBV"],
    bonus: ["gender expert", "gender specialist", "GESI", "gender mainstreaming"],
  },
  {
    name: "M&E / Survey Specialist",
    keywords: ["monitoring and evaluation", "M&E", "MEL", "baseline", "survey", "SPSS", "STATA", "Nvivo", "data analysis", "econometrics", "logical framework", "theory of change"],
    bonus: ["SPSS", "STATA", "baseline study", "impact evaluation", "randomized"],
  },
  {
    name: "Coffee Value Chain Expert",
    keywords: ["coffee", "coffee value chain", "specialty coffee", "cooperative", "coffee export", "coffee processing", "coffee farmer"],
    bonus: ["Sidamo", "Yirgacheffe", "Oromia coffee", "ECX", "cooperative union"],
  },
  {
    name: "Horticulture Value Chain Expert",
    keywords: ["horticulture", "floriculture", "cut flowers", "vegetable", "fruit", "roses", "greenhouse", "Sher Ethiopia", "fresh produce"],
    bonus: ["flower farm", "horticulture cluster", "export horticulture"],
  },
];

function fullBlob(p: Profile): string {
  const cv = (p as any).cv_structured_data || {};
  const emp = Array.isArray(cv.employment) ? cv.employment : [];
  const edu = Array.isArray(cv.education) ? cv.education : [];
  return [
    p.name, p.headline, p.qualifications,
    ...(p.sectors || []),
    ...(p.skills || []),
    p.cv_text,
    cv.professional_summary,
    cv.key_qualifications,
    ...emp.map((e: any) => [e.employer, e.position, e.description_of_duties].filter(Boolean).join(" ")),
    ...edu.map((e: any) => [e.degree, e.field_of_study].filter(Boolean).join(" ")),
  ].filter(Boolean).join(" ").toLowerCase();
}

function scoreProfile(p: Profile, slot: Slot, blob: string): number {
  let score = 0;
  for (const kw of slot.keywords) {
    const lc = kw.toLowerCase();
    const matches = (blob.match(new RegExp(lc.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || []).length;
    if (matches > 0) score += Math.min(matches * 2, 10); // cap to prevent keyword stuffing
  }
  for (const bonus of slot.bonus) {
    if (blob.includes(bonus.toLowerCase())) score += 5;
  }
  // Boost for CV quality score
  if (p.cv_score) score += p.cv_score * 0.3;
  // Boost for seniority
  if (p.years_of_experience) score += Math.min(p.years_of_experience * 0.5, 10);
  // Profile type boost
  if (p.profile_type === "Expert") score += 15;
  else if (p.profile_type === "Senior") score += 8;
  // Claimed profiles rank slightly higher (they're engaged)
  if (p.claimed_at) score += 3;
  return score;
}

async function main() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: profs } = await sb
    .from("profiles")
    .select("id, name, headline, sectors, skills, qualifications, years_of_experience, cv_score, cv_text, cv_structured_data, profile_type, email, claimed_at, is_recommender");
  const all = (profs || []) as Profile[];

  console.log(`\n═══ ILO Sectoral Baseline Assessment — Candidate Shortlist ═══`);
  console.log(`Scanned ${all.length} Devidends profiles against ${SLOTS.length} role slots\n`);

  for (const slot of SLOTS) {
    const scored = all
      .map((p) => ({ p, score: scoreProfile(p, slot, fullBlob(p)) }))
      .filter((x) => x.score >= 5)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    console.log(`\n── ${slot.name} ──`);
    if (scored.length === 0) {
      console.log(`  (no strong matches)`);
      continue;
    }
    for (const s of scored) {
      const yrs = s.p.years_of_experience ? `${s.p.years_of_experience}y` : "?y";
      const cv = s.p.cv_score ?? "-";
      const type = s.p.profile_type || "-";
      const claim = s.p.claimed_at ? "✓" : "○";
      console.log(`  [${Math.round(s.score).toString().padStart(3)}]  ${claim} ${s.p.name.padEnd(32)}  ${type.padEnd(7)} ${yrs.padStart(4)}  cv=${cv.toString().padStart(3)}  ${(s.p.headline || "").slice(0, 70)}`);
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
