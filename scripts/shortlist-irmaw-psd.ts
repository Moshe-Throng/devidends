/**
 * Shortlist candidates for the IRMAW PSD Expert slot, excluding Mussie.
 *
 * The ToR bar: BA+5 OR MA+3, with private sector depth, women SME focus,
 * market linkage, capacity building, Ethiopia-Djibouti corridor relevance.
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
  nationality: string | null;
};

// Primary-signal keywords (big weight)
const TIER_A = [
  "private sector development",
  "PSD",
  "women entrepreneurs",
  "women-led SME",
  "women SMEs",
  "MSME",
  "cross-border trade",
  "cross border trade",
  "women traders",
  "market linkage",
  "market access",
  "women in trade",
  "B2B",
  "value chain",
];

// Supporting keywords
const TIER_B = [
  "SME",
  "enterprise development",
  "capacity building",
  "training of trainers",
  "ToT",
  "business development",
  "market analysis",
  "e-commerce",
  "digital platform",
  "gender",
  "women",
  "MoTRI",
  "MoWSA",
  "Ethiopian Women Entrepreneurs",
  "Djibouti",
  "Dire Dawa",
  "trade facilitation",
  "public-private dialogue",
  "PPD",
  "chamber of commerce",
  "entrepreneurship",
  "trade regulation",
];

// Anti-signal: if only these, not a good fit
const NEG = ["pure research academic", "only humanitarian aid", "only governance"];

function mainBlob(p: Profile): string {
  const cv = p.cv_structured_data || {};
  return [
    p.headline,
    p.qualifications,
    cv.professional_summary,
    cv.key_qualifications,
    ...(p.sectors || []),
    ...(p.skills || []),
  ].filter(Boolean).join(" ").toLowerCase();
}

function bodyBlob(p: Profile): string {
  const cv = p.cv_structured_data || {};
  const emp = Array.isArray(cv.employment) ? cv.employment : [];
  return [
    p.cv_text,
    ...emp.map((e: any) => [e.employer, e.position, e.description_of_duties].filter(Boolean).join(" ")),
  ].filter(Boolean).join(" ").toLowerCase();
}

function countMatches(blob: string, term: string): number {
  if (!term) return 0;
  const escaped = term.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return (blob.match(new RegExp(escaped, "g")) || []).length;
}

type Hit = {
  p: Profile;
  score: number;
  matched_a: string[];
  matched_b: string[];
  women_signal: number;
  ethiopia_signal: boolean;
};

function scoreProfile(p: Profile): Hit {
  const main = mainBlob(p);
  const body = bodyBlob(p);
  const matched_a: string[] = [];
  const matched_b: string[] = [];
  let score = 0;

  for (const t of TIER_A) {
    const hMain = countMatches(main, t);
    const hBody = countMatches(body, t);
    if (hMain > 0) { matched_a.push(`${t}×${hMain}(title)`); score += hMain * 12; }
    if (hBody > 0) { if (hMain === 0) matched_a.push(`${t}×${hBody}(body)`); score += Math.min(hBody, 4) * 3; }
  }
  for (const t of TIER_B) {
    const hMain = countMatches(main, t);
    const hBody = countMatches(body, t);
    if (hMain > 0) { matched_b.push(`${t}×${hMain}(title)`); score += hMain * 4; }
    else if (hBody > 0) { matched_b.push(`${t}×${hBody}`); score += Math.min(hBody, 3) * 1; }
  }

  // Women/gender signal (important for this specific bid)
  const women_signal =
    countMatches(main, "women") +
    countMatches(main, "gender") +
    countMatches(body, "women entrepreneur") +
    countMatches(body, "women SME");
  score += Math.min(women_signal, 20) * 1.5;

  // Ethiopia signal (hard requirement)
  const ethiopia_signal =
    /ethiopia/i.test((p.nationality || "") + " " + (p.headline || "") + " " + (p.cv_text || "").slice(0, 2000));
  if (ethiopia_signal) score += 15;

  // CV quality
  if (p.cv_score) score += p.cv_score * 0.3;
  // Seniority — but ToR wants BA+5/MA+3, so not too senior is fine
  if (p.years_of_experience) {
    if (p.years_of_experience >= 5 && p.years_of_experience <= 25) score += 8;
    else if (p.years_of_experience > 25) score += 3; // overqualified risk
  }
  // Profile type
  if (p.profile_type === "Expert") score += 8;
  else if (p.profile_type === "Senior") score += 6;
  else if (p.profile_type === "Mid-level") score += 4;

  // Claimed recommenders (engaged, more likely to accept) get slight boost
  if (p.claimed_at) score += 4;

  return { p, score, matched_a, matched_b, women_signal, ethiopia_signal };
}

async function main() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  const { data: profs, error } = await sb
    .from("profiles")
    .select("id, name, headline, sectors, skills, qualifications, years_of_experience, cv_score, cv_text, cv_structured_data, profile_type, email, claimed_at, nationality")
    .not("cv_text", "is", null);
  if (error) { console.error("Query error:", error); process.exit(1); }
  const all = (profs || []) as Profile[];
  console.log(`Loaded ${all.length} profiles with cv_text`);

  // Exclude Mussie, filter to folks with at least 1 tier-A hit + Ethiopia
  const scored = all
    .map(scoreProfile)
    .filter((h) => !/mussie tsegaye/i.test(h.p.name))
    .filter((h) => h.matched_a.length >= 1)
    .filter((h) => h.ethiopia_signal)
    .sort((a, b) => b.score - a.score);

  console.log(`\n═══ IRMAW PSD Expert shortlist (excluding Mussie) ═══`);
  console.log(`Scanned ${all.length} profiles. ${scored.length} strong PSD matches with Ethiopia signal.\n`);

  for (const h of scored.slice(0, 10)) {
    const p = h.p;
    const claim = p.claimed_at ? "✓" : "○";
    console.log(`\n[${Math.round(h.score).toString().padStart(3)}]  ${claim} ${p.name}  (${p.profile_type || "-"}, ${p.years_of_experience || "?"}y, cv=${p.cv_score ?? "-"})`);
    if (p.headline) console.log(`     ${p.headline.slice(0, 100)}`);
    console.log(`     A: ${h.matched_a.slice(0, 6).join(", ")}`);
    if (h.matched_b.length > 0) console.log(`     B: ${h.matched_b.slice(0, 6).join(", ")}`);
    console.log(`     women_signal=${h.women_signal}  email=${p.email || "-"}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
