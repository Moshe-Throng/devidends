/**
 * Find profiles in the Devidends DB that qualify as Climate Risk experts.
 *
 * Scores on climate-risk-specific signals: climate risk assessment, climate
 * adaptation, climate vulnerability, DRR, climate finance, ESG, resilience,
 * green finance / GCF, NDC, TCFD, IPCC.
 *
 * Shows top picks with the exact keywords each matched on, so admin can
 * decide which ones are genuine climate risk experts vs adjacent.
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
};

// Keyword tiers. Hits in tier A are strongest signal; tier B supporting;
// tier C ambient environmental (penalty-free but not sufficient alone).
const TIER_A = [
  "climate risk",
  "climate risk assessment",
  "climate vulnerability",
  "climate adaptation",
  "climate resilience",
  "TCFD",
  "NDC",
  "nationally determined contribution",
  "IPCC",
  "physical climate risk",
  "transition risk",
];
const TIER_B = [
  "climate finance",
  "climate change",
  "disaster risk",
  "DRR",
  "disaster risk reduction",
  "green climate fund",
  "GCF",
  "adaptation fund",
  "ESG",
  "environmental and social safeguards",
  "E&S safeguards",
  "green finance",
  "resilience",
  "climate policy",
  "green economy",
  "low carbon",
  "carbon",
  "paris agreement",
];
const TIER_C = [
  "environment",
  "environmental",
  "sustainability",
  "forest",
  "natural resource",
  "agroforestry",
  "water resource",
  "biodiversity",
];

const NEG_ONLY = [
  // If someone only hits these, it's not climate risk
  "occupational safety",
  "OSH",
  "WASH",
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

function countMatches(blob: string, term: string): number {
  const lc = term.toLowerCase();
  const re = new RegExp(lc.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g");
  return (blob.match(re) || []).length;
}

type Hit = { profile: Profile; score: number; matched_a: string[]; matched_b: string[]; matched_c: string[] };

function scoreProfile(p: Profile): Hit {
  const blob = fullBlob(p);
  const a: string[] = [];
  const b: string[] = [];
  const c: string[] = [];
  let score = 0;
  for (const t of TIER_A) {
    const n = countMatches(blob, t);
    if (n > 0) { a.push(`${t}×${n}`); score += Math.min(n, 4) * 10; }
  }
  for (const t of TIER_B) {
    const n = countMatches(blob, t);
    if (n > 0) { b.push(`${t}×${n}`); score += Math.min(n, 4) * 4; }
  }
  for (const t of TIER_C) {
    const n = countMatches(blob, t);
    if (n > 0) { c.push(t); score += 1; }
  }
  // CV quality boost
  if (p.cv_score) score += p.cv_score * 0.25;
  // Seniority boost
  if (p.years_of_experience) score += Math.min(p.years_of_experience * 0.4, 8);
  // Profile type boost
  if (p.profile_type === "Expert") score += 10;
  else if (p.profile_type === "Senior") score += 5;
  return { profile: p, score, matched_a: a, matched_b: b, matched_c: c };
}

async function main() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: profs } = await sb
    .from("profiles")
    .select("id, name, headline, sectors, skills, qualifications, years_of_experience, cv_score, cv_text, cv_structured_data, profile_type, email, claimed_at");
  const all = (profs || []) as Profile[];

  const scored = all.map(scoreProfile).filter((h) => h.matched_a.length > 0 || h.matched_b.length >= 2);
  scored.sort((a, b) => b.score - a.score);

  console.log(`\n═══ Climate Risk Expert shortlist ═══`);
  console.log(`Scanned ${all.length} profiles. ${scored.length} matched meaningfully.\n`);

  console.log(`─── TIER 1: strong climate-risk signal (explicit tier A hits) ───`);
  const tier1 = scored.filter((h) => h.matched_a.length >= 1);
  for (const h of tier1.slice(0, 15)) {
    const p = h.profile;
    console.log(`\n  [${Math.round(h.score).toString().padStart(3)}]  ${p.name}  (${p.profile_type || "-"}, ${p.years_of_experience || "?"}y, cv=${p.cv_score ?? "-"})`);
    if (p.headline) console.log(`         ${p.headline.slice(0, 100)}`);
    console.log(`         A: ${h.matched_a.join(", ")}`);
    if (h.matched_b.length > 0) console.log(`         B: ${h.matched_b.slice(0, 6).join(", ")}`);
  }

  console.log(`\n\n─── TIER 2: climate-adjacent (strong tier B, no tier A) ───`);
  const tier2 = scored.filter((h) => h.matched_a.length === 0 && h.matched_b.length >= 2);
  for (const h of tier2.slice(0, 10)) {
    const p = h.profile;
    console.log(`\n  [${Math.round(h.score).toString().padStart(3)}]  ${p.name}  (${p.profile_type || "-"}, ${p.years_of_experience || "?"}y)`);
    if (p.headline) console.log(`         ${p.headline.slice(0, 100)}`);
    console.log(`         B: ${h.matched_b.slice(0, 8).join(", ")}`);
  }

  console.log(`\n\n═══════════════════════════════════════════════════════════`);
  console.log(`Total tier 1 (strong climate risk): ${tier1.length}`);
  console.log(`Total tier 2 (adjacent):            ${tier2.length}`);
  console.log(`═══════════════════════════════════════════════════════════`);
}

main().catch((e) => { console.error(e); process.exit(1); });
