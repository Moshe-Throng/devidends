// No Node.js crypto — edge-compatible hash
import type { SampleOpportunity } from "./types/cv-score";

/* ─── Raw opportunity shape (before quality processing) ── */

export interface RawOpportunity {
  title: string;
  organization: string;
  description: string;
  deadline: string | null;
  country: string;
  source_url: string;
  source_domain: string;
  type: string;
  sectors?: string[];
  experience_level?: string | null;
}

/* ─── Hard Filter Config ─────────────────────────────────── */

const EXCLUDED_SOURCES = [
  "oracle",
  "estm.fa.em2.oraclecloud.com",
];

const SPAM_TITLE_PATTERNS = [
  /^about\b/i,
  /^governance$/i,
  /^directorate$/i,
  /what we do/i,
  /^norcap$/i,
  /^home$/i,
  /^contact/i,
  /^careers?$/i,
  /^faq/i,
  /our (team|story|mission|vision)/i,
  /^(leadership|accountability|programme implementation)/i,
  /^(economic empowerment|ending violence|peace and security)/i,
  /^(humanitarian action|governance and national)/i,
  /^guiding documents$/i,
];

// Sources that pre-filter to Ethiopia at scrape time (countryFilter param,
// Ethiopia-only career pages, etc.). These are trusted — every result they
// return is genuinely Ethiopia-related, even if the title doesn't mention
// it. Anything NOT on this list goes through the universal corpus check.
const PRE_FILTERED_ETHIOPIA_SOURCES = [
  "reliefweb.int",
  "worldbank.org",
  "careers.un.org",
  "afdb.org",
  "workable.com",
  "unicef.org",
  "linkedin.com", // LinkedIn adapter has its own corpus relevance filter
];

// Strict Ethiopia / Horn-of-Africa regex — same vocabulary as
// scripts/crawl-engine/normalize.ts so the API filter and the crawler
// filter stay aligned. Adds Ethiopian-program shorthands that appear
// on legitimate roles even when the literal "Ethiopia" word doesn't.
const ETHIOPIA_CORPUS_RE =
  /\b(ethiopia|ethiopian|addis\s*ababa|addis|oromia|amhara|tigray|sidama|gambella|afar|harari|dire\s*dawa|south\s*west\s*ethiopia|bahir\s*dar|hawassa|mekelle|jimma|adama|arba\s*minch|gondar|gonder|nazret|nazareth|semera|jijiga|au[-\s]cdc|africa\s+cdc|liway|pepfar\s+ethiopia|usaid\s+ethiopia|abh\s+partners|inkomoko|odixcity|snv\s+ethiopia|horn\s+of\s+africa|greater\s+horn)\b/i;

function isEthiopiaRelevant(opp: RawOpportunity): boolean {
  // Pre-filtered source → trust the upstream filter
  if (PRE_FILTERED_ETHIOPIA_SOURCES.includes(opp.source_domain)) return true;
  // Universal corpus check — title + organization + country + first 2k of
  // description. Misses are rare; the few legitimate Ethiopia roles whose
  // adapter strips location context get reactivated by the cleanup script.
  const corpus = `${opp.title || ""} ${opp.organization || ""} ${opp.country || ""} ${(opp.description || "").slice(0, 2000)}`;
  return ETHIOPIA_CORPUS_RE.test(corpus);
}

/* ─── Seniority Extraction ────────────────────────────────── */

const SENIORITY_RULES: [RegExp, string][] = [
  [/\b(director|head of|chief|principal)\b/i, "Director"],
  [/\bsenior\b/i, "Senior"],
  [/\b(mid[- ]?level|intermediate)\b/i, "Mid-level"],
  [/\bjunior\b/i, "Junior"],
  [/\b(entry[- ]?level|intern(ship)?|trainee|graduate)\b/i, "Entry"],
];

function extractSeniority(title: string): string | null {
  for (const [pattern, level] of SENIORITY_RULES) {
    if (pattern.test(title)) return level;
  }
  return null;
}

/* ─── Experience Years Extraction ─────────────────────────── */

const EXP_REGEX = /(\d+)\+?\s*(?:years?|yrs?)\s*(?:of\s+)?(?:experience|exp)?/i;

function extractExperienceYears(text: string): number | null {
  const match = text.match(EXP_REGEX);
  if (!match) return null;
  const years = parseInt(match[1], 10);
  return years > 0 && years <= 50 ? years : null;
}

/* ─── Type Classification ─────────────────────────────────── */

function classifyType(title: string, existingType: string): string {
  const t = title.toLowerCase();
  if (/\bintern(ship)?\b/.test(t)) return "internship";
  if (/\bgrant\b/.test(t)) return "grant";
  if (/\b(tender|procurement|bid|rfb|rfp|rfq)\b/.test(t)) return "tender";
  if (/\b(consult(ant|ing|ancy)|advisory)\b/.test(t)) return "consulting";
  return existingType || "job";
}

/* ─── Quality Scoring ─────────────────────────────────────── */

function computeQualityScore(opp: RawOpportunity): number {
  let score = 0;
  if (opp.title) score += 20;
  if (opp.organization && opp.organization !== "Unknown") score += 10;
  if (opp.description && opp.description.trim().length > 0) score += 20;
  if (opp.deadline) score += 15;
  if (opp.country) score += 10;
  if (opp.source_url) score += 10;
  if (opp.title.length > 10) score += 5;
  if (opp.description && opp.description.trim().length > 50) score += 10;
  return score;
}

/* ─── Deduplication ───────────────────────────────────────── */

function normalizeForDedup(title: string): string {
  return title
    .toLowerCase()
    .replace(
      /\s*[-–—,]\s*(ethiopia|addis\s*ababa|remote|[a-z]+,\s*ethiopia).*$/i,
      ""
    )
    .replace(/\s+/g, " ")
    .trim();
}

function isDuplicate(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.includes(b) || b.includes(a)) return true;
  // Simple character-level similarity check
  if (Math.abs(a.length - b.length) > 5) return false;
  let matches = 0;
  const shorter = a.length <= b.length ? a : b;
  const longer = a.length > b.length ? a : b;
  for (let i = 0; i < shorter.length; i++) {
    if (shorter[i] === longer[i]) matches++;
  }
  return matches / longer.length > 0.85;
}

/* ─── ID Generation ───────────────────────────────────────── */

function generateId(title: string, org: string, source: string): string {
  const seed = `${title}::${org}::${source}`;
  let h1 = 0, h2 = 0;
  for (let i = 0; i < seed.length; i++) {
    h1 = ((h1 << 5) - h1 + seed.charCodeAt(i)) | 0;
    h2 = ((h2 << 7) + h2 + seed.charCodeAt(i)) | 0;
  }
  return ((h1 >>> 0).toString(16) + (h2 >>> 0).toString(16)).slice(0, 12);
}

/* ═══════════════════════════════════════════════════════════════
   MAIN: processOpportunities
   ═══════════════════════════════════════════════════════════════ */

export function processOpportunities(
  rawItems: RawOpportunity[]
): SampleOpportunity[] {
  const now = Date.now();

  /* ─── Step 1: Hard Filters ──────────────────────────── */
  const filtered = rawItems.filter((opp) => {
    // Exclude broken sources entirely
    if (EXCLUDED_SOURCES.includes(opp.source_domain)) return false;

    // Spam title check
    if (SPAM_TITLE_PATTERNS.some((p) => p.test(opp.title))) return false;

    // Title too short
    if (!opp.title || opp.title.length < 5) return false;

    // Universal Ethiopia relevance — drops global jobs that leak in from
    // any source not on the pre-filtered allowlist (CARE / GGGI /
    // MasterCard / Jobvite / Greenhouse / FHI Workday were all dumping
    // Burundi / Korea / Colombia / etc. into the feed).
    if (!isEthiopiaRelevant(opp)) return false;

    return true;
  });

  /* ─── Step 2: Enrich + Score ────────────────────────── */
  const enriched: SampleOpportunity[] = filtered.map((opp) => {
    const isExpired = opp.deadline
      ? new Date(opp.deadline).getTime() < now
      : false;

    const combinedText = `${opp.title} ${opp.description}`;

    return {
      id: generateId(opp.title, opp.organization, opp.source_domain),
      title: opp.title,
      organization: opp.organization,
      description: opp.description,
      deadline: opp.deadline,
      country: opp.country,
      source_url: opp.source_url,
      source_domain: opp.source_domain,
      type: opp.type,
      quality_score: computeQualityScore(opp),
      seniority: extractSeniority(opp.title),
      experience_years: extractExperienceYears(combinedText),
      is_expired: isExpired,
      classified_type: classifyType(opp.title, opp.type),
      sectors: Array.isArray(opp.sectors) ? opp.sectors : [],
      experience_level: opp.experience_level ?? null,
    };
  });

  /* ─── Step 3: Deduplication ─────────────────────────── */
  const seen = new Map<string, SampleOpportunity>();
  const deduped: SampleOpportunity[] = [];

  for (const opp of enriched) {
    const normTitle = normalizeForDedup(opp.title);
    const key = `${opp.organization.toLowerCase()}::${normTitle}`;

    let isDup = false;
    for (const [existingKey, existingOpp] of seen) {
      const existingOrg = existingKey.split("::")[0];
      const existingTitle = existingKey.split("::").slice(1).join("::");

      if (existingOrg === opp.organization.toLowerCase()) {
        if (isDuplicate(normTitle, existingTitle)) {
          // Keep the one with higher quality
          if (opp.quality_score > existingOpp.quality_score) {
            seen.set(existingKey, opp);
            const idx = deduped.indexOf(existingOpp);
            if (idx >= 0) deduped[idx] = opp;
          }
          isDup = true;
          break;
        }
      }
    }

    if (!isDup) {
      seen.set(key, opp);
      deduped.push(opp);
    }
  }

  /* ─── Step 4: Sort by deadline (soonest first) ──────── */
  deduped.sort((a, b) => {
    if (!a.deadline && !b.deadline) return 0;
    if (!a.deadline) return 1;
    if (!b.deadline) return -1;
    return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
  });

  return deduped;
}
