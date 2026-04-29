/**
 * Field normalization — port of Python normalize_fields.py
 *
 * Adds three canonical fields to every opportunity:
 *   - sector_norm: canonical sector from taxonomy
 *   - work_type_norm: canonical work type
 *   - seniority: inferred seniority level
 */

import type { RawOpportunity, NormalizedOpportunity } from "./types";

// ── Sector keyword map ────────────────────────────────────────────────────────
// keyword (lowercase) → canonical sector. Order matters — first match wins.

const SECTOR_KEYWORDS: [string, string][] = [
  // Health
  ["health", "Health"],
  ["medical", "Health"],
  ["nutrition", "Health"],
  ["nurse", "Health"],
  ["doctor", "Health"],
  ["clinical", "Health"],
  ["epidemiol", "Health"],
  ["malaria", "Health"],
  ["hiv", "Health"],
  ["aids", "Health"],
  ["mental health", "Health"],
  ["ncdi", "Health"],
  ["pharmaceutical", "Health"],
  // Education
  ["education", "Education"],
  ["teacher", "Education"],
  ["school", "Education"],
  ["learning", "Education"],
  ["training", "Education"],
  ["capacity building", "Education"],
  // WASH
  ["wash", "WASH"],
  ["water", "WASH"],
  ["sanitation", "WASH"],
  ["hygiene", "WASH"],
  // Protection
  ["protection", "Protection & Human Rights"],
  ["human rights", "Protection & Human Rights"],
  ["child protection", "Protection & Human Rights"],
  ["gbv", "Protection & Human Rights"],
  ["gender-based violence", "Protection & Human Rights"],
  ["safeguarding", "Protection & Human Rights"],
  ["refugee", "Protection & Human Rights"],
  ["displacement", "Protection & Human Rights"],
  // Food Security
  ["food security", "Food Security & Livelihoods"],
  ["livelihood", "Food Security & Livelihoods"],
  ["agriculture", "Food Security & Livelihoods"],
  ["food", "Food Security & Livelihoods"],
  ["famine", "Food Security & Livelihoods"],
  ["cash transfer", "Food Security & Livelihoods"],
  // M&E
  ["monitoring", "M&E"],
  ["evaluation", "M&E"],
  ["m&e", "M&E"],
  ["meal", "M&E"],
  ["data management", "M&E"],
  ["research", "M&E"],
  // Admin & Finance
  ["finance", "Admin & Finance"],
  ["accounting", "Admin & Finance"],
  ["admin", "Admin & Finance"],
  ["administration", "Admin & Finance"],
  ["compliance", "Admin & Finance"],
  ["audit", "Admin & Finance"],
  ["procurement", "Admin & Finance"],
  ["grants management", "Admin & Finance"],
  // HR
  ["human resources", "HR"],
  ["recruitment", "HR"],
  ["staffing", "HR"],
  // Communications
  ["communications", "Communications"],
  ["media", "Communications"],
  ["journalism", "Communications"],
  ["public relations", "Communications"],
  ["advocacy", "Communications"],
  ["social media", "Communications"],
  ["reporting", "Communications"],
  // Logistics
  ["logistics", "Logistics & Supply Chain"],
  ["supply chain", "Logistics & Supply Chain"],
  ["warehouse", "Logistics & Supply Chain"],
  ["fleet", "Logistics & Supply Chain"],
  // IT
  ["information technology", "IT & Technology"],
  ["software", "IT & Technology"],
  ["digital", "IT & Technology"],
  ["ict", "IT & Technology"],
  ["it support", "IT & Technology"],
  ["data analyst", "IT & Technology"],
  ["developer", "IT & Technology"],
  ["engineering", "IT & Technology"],
  // Gender
  ["gender", "Gender"],
  ["women", "Gender"],
  // Environment
  ["environment", "Environment"],
  ["climate", "Environment"],
  ["natural resources", "Environment"],
  ["conservation", "Environment"],
  ["energy", "Environment"],
  // Legal
  ["legal", "Legal"],
  ["law", "Legal"],
  // Economic (new sector for tenders/consulting)
  ["economic", "Economic Development"],
  ["investment", "Economic Development"],
  ["trade", "Economic Development"],
  ["private sector", "Economic Development"],
  ["market systems", "Economic Development"],
  ["business environment", "Economic Development"],
  ["enterprise", "Economic Development"],
  ["value chain", "Economic Development"],
  ["sme", "Economic Development"],
  // Governance (critical for bid intelligence)
  ["governance", "Governance"],
  ["public sector", "Governance"],
  ["institutional", "Governance"],
  ["decentrali", "Governance"],
  ["public financial management", "Governance"],
  ["pfm", "Governance"],
  ["anti-corruption", "Governance"],
  ["rule of law", "Governance"],
  ["justice", "Governance"],
  ["civil society", "Governance"],
  ["accountability", "Governance"],
  // Infrastructure
  ["infrastructure", "Infrastructure"],
  ["transport", "Infrastructure"],
  ["road", "Infrastructure"],
  ["construction", "Infrastructure"],
  ["urban", "Infrastructure"],
  // Program Management (broad catch — low priority)
  ["program", "Program/Project Management"],
  ["project", "Program/Project Management"],
  ["coordinator", "Program/Project Management"],
  ["officer", "Program/Project Management"],
  ["management", "Program/Project Management"],
  ["country director", "Program/Project Management"],
  ["field operations", "Program/Project Management"],
];

export function normalizeSector(
  categories: string[],
  title: string,
  description: string
): string {
  // Priority: categories + title → description (avoids org-name false matches)
  const primary = [...(categories || []), title || ""].join(" ").toLowerCase();
  for (const [keyword, sector] of SECTOR_KEYWORDS) {
    if (primary.includes(keyword)) return sector;
  }

  // Description fallback — only first 300 chars
  const descText = (description || "").slice(0, 300).toLowerCase();
  for (const [keyword, sector] of SECTOR_KEYWORDS) {
    if (descText.includes(keyword)) return sector;
  }

  return "Other";
}

// ── Work type keyword map ─────────────────────────────────────────────────────

const WORK_TYPE_KEYWORDS: [string, string][] = [
  ["full-time", "Full-time"],
  ["full time", "Full-time"],
  ["permanent", "Full-time"],
  ["part-time", "Part-time"],
  ["part time", "Part-time"],
  ["consultanc", "Consultancy"],
  ["consultant", "Consultancy"],
  ["contract", "Contract"],
  ["fixed-term", "Contract"],
  ["fixed term", "Contract"],
  ["internship", "Internship"],
  ["intern", "Internship"],
  ["volunteer", "Volunteer"],
  ["fellowship", "Internship"],
];

export function normalizeWorkType(workType: string): string {
  if (!workType) return "Full-time";
  const wt = workType.trim().toLowerCase();
  for (const [keyword, canonical] of WORK_TYPE_KEYWORDS) {
    if (wt.includes(keyword)) return canonical;
  }
  if (wt === "job" || wt === "jobs" || wt === "") return "Full-time";
  return "Full-time";
}

// ── Seniority inference ───────────────────────────────────────────────────────

const TITLE_DIRECTOR =
  /\b(country director|executive director|chief|ceo|coo|cfo|deputy director|regional director|national director|programme director|head of)\b/i;
const TITLE_MANAGER =
  /\b(manager|team leader|head|supervisor|chief of party)\b/i;
const TITLE_SENIOR =
  /\b(senior|principal|lead |advisor|adviser|specialist)\b/i;
const TITLE_MID =
  /\b(officer|associate|analyst|engineer|technician|accountant)\b/i;
const TITLE_JUNIOR =
  /\b(assistant|junior|intern|fellow|trainee|volunteer)\b/i;

function parseYears(experience: string): number | null {
  if (!experience) return null;
  const m = experience.match(/(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

export function normalizeSeniority(title: string, experience: string): string {
  const t = title || "";
  // Title-based (highest priority — check all tiers before experience)
  if (TITLE_DIRECTOR.test(t)) return "Director";
  if (TITLE_MANAGER.test(t)) return "Manager";
  if (TITLE_SENIOR.test(t)) return "Senior";
  if (TITLE_MID.test(t)) return "Mid-level";
  if (TITLE_JUNIOR.test(t)) return "Junior";

  // Experience-based fallback
  const years = parseYears(experience || "");
  if (years !== null) {
    if (years >= 10) return "Director";
    if (years >= 7) return "Senior";
    if (years >= 5) return "Manager";
    if (years >= 3) return "Mid-level";
    if (years >= 1) return "Junior";
    return "Entry-level";
  }

  return "Mid-level"; // safe default
}

// ── Main normalizer ───────────────────────────────────────────────────────────

// ── Procurement method canonicalization ───────────────────────────────────────

const PROCUREMENT_METHODS: Record<string, string> = {
  qcbs: "QCBS",
  "quality and cost": "QCBS",
  qbs: "QBS",
  "quality based": "QBS",
  lcs: "LCS",
  "least cost": "LCS",
  ic: "IC",
  "individual consultant": "IC",
  "individual contractor": "IC",
  cqs: "CQS",
  "consultant qualification": "CQS",
  fbs: "FBS",
  "fixed budget": "FBS",
  rfp: "RFP",
  "request for proposal": "RFP",
  rfq: "RFQ",
  "request for quotation": "RFQ",
  itb: "ITB",
  "invitation to bid": "ITB",
  reoi: "REOI",
  "expression of interest": "REOI",
  "direct contracting": "Direct",
  shopping: "Shopping",
  "open procedure": "Open",
  "restricted procedure": "Restricted",
};

export function canonicalizeProcurementMethod(method: string | null | undefined): string | null {
  if (!method) return null;
  const lower = method.toLowerCase().trim();
  for (const [pattern, canonical] of Object.entries(PROCUREMENT_METHODS)) {
    if (lower.includes(pattern)) return canonical;
  }
  return method; // return as-is if no match
}

export function normalizeOpportunity(
  opp: RawOpportunity
): NormalizedOpportunity {
  const categories = (opp.raw_fields?.career_categories as string[]) || [];
  const workType =
    (opp.raw_fields?.work_type as string) || opp.content_type || "";
  const experience = (opp.raw_fields?.experience as string) || "";

  // Pipeline/tender items default to Consultancy work type
  const isPipelineOrTender = opp.content_type === "pipeline" || opp.content_type === "tender";
  const effectiveWorkType = isPipelineOrTender ? "Consultancy" : workType;

  // Canonicalize procurement method if present
  if (opp.raw_fields?.procurement_method) {
    opp.raw_fields.procurement_method = canonicalizeProcurementMethod(
      opp.raw_fields.procurement_method as string
    );
  }

  return {
    ...opp,
    sector_norm: normalizeSector(categories, opp.title, opp.description),
    work_type_norm: normalizeWorkType(effectiveWorkType),
    seniority: isPipelineOrTender ? "Senior" : normalizeSeniority(opp.title, experience),
  };
}

/**
 * Ethiopia-relevance filter — STRICT. The intel feed serves Ethiopian
 * development consultants, and the previous "errs on inclusion" rule
 * left ~60% of the channel digest as international noise. The new rule:
 * the job MUST mention Ethiopia, Addis Ababa, or the Horn of Africa
 * somewhere — country, city, title or description — otherwise it is
 * dropped. No fallback to "regional Africa", no fallback to HQ-cities,
 * no fallback to "international" titles. If a regional consultancy
 * legitimately covers Ethiopia, the description will say so.
 */
export function isRelevantForEthiopia(opp: RawOpportunity): boolean {
  const country = (opp.country || "").toLowerCase();
  const city = (opp.city || "").toLowerCase();
  const title = (opp.title || "").toLowerCase();
  const desc = (opp.description || "").slice(0, 3000).toLowerCase();
  const allText = `${country} ${city} ${title} ${desc}`;

  // Must explicitly name Ethiopia or its capital or the Horn of Africa
  // somewhere. Other Ethiopian cities (Dire Dawa, Mekelle, Hawassa,
  // Bahir Dar, Adama, Jimma, Gondar) also count.
  const ETHIOPIA_RE = /\b(ethiopia|ethiopian|addis\s*ababa|addis|dire\s*dawa|mekelle|hawassa|awassa|bahir\s*dar|bahirdar|adama|jimma|gondar|gonder|harar|nazret|nazareth|semera|jijiga|horn of africa|greater horn)\b/i;

  return ETHIOPIA_RE.test(allText);
}

export function normalizeAll(
  opps: RawOpportunity[]
): NormalizedOpportunity[] {
  return opps.map(normalizeOpportunity);
}
