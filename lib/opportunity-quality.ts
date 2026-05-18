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

// ── Development-sector relevance ───────────────────────────────
// Devidends's value prop is donor / development consulting. Sales
// clerks, hotel cashiers, drivers, FMCG ops, generic marketing
// agencies and crypto miners do not belong in the feed even if
// they happen to be Ethiopia-tagged.
//
// Strategy: a title denylist + an org denylist with a strict
// "dev keep" allowlist override (donor names + dev role keywords).
// If anything in the title or organization screams development,
// it passes regardless of denylist hits.

const DEV_KEEP_RE =
  /\b(giz|world\s+bank|usaid|fcdo|dfid|undp|unicef|unfpa|unhcr|fao|wfp\b|who\b|ilo\b|undss|iom\b|unops|unesco|un\s*women|unaids|unhabitat|un[-\s]habitat|afdb|kfw|sida|norad|danida|gavi|gates\s+foundation|mastercard\s+foundation|rockefeller|bmgf|drc\b|nrc\b|irc\b|save\s+the\s+children|oxfam|care\s+international|mercy\s+corps|pact\b|chemonics|\bdai\b|\babt\b|tetra\s+tech|palladium|crown\s+agents|adam\s+smith|coffey|sos\s+children'?s?\s+village|world\s+vision|plan\s+international|acted\b|actionaid|action\s+aid|helpage|concern\s+worldwide|christian\s+aid|cesvi|coopi|cordaid|catholic\s+relief|caritas|adra\b|samaritan'?s?\s+purse|tearfund|trocaire|danchurchaid|finn\s+church\s+aid|ngo\s+forum|inkomoko|abh\s+partners|m&e|monitoring\s+and\s+evaluation|meal\b|wash\s+(officer|coordinator|advisor|manager|specialist)|gender\s+(officer|advisor|specialist|coordinator)|protection\s+(officer|advisor|coordinator|cluster|team\s+leader)|nutrition\s+(officer|specialist|coordinator)|child\s+protection|gbv\b|(?:international|national|technical|m&e|wash|gender|education|health|nutrition|protection|child\s+protection|policy|programme|program|humanitarian|emergency|food\s+security|livelihoods?|monitoring|evaluation|research|capacity|safety|safeguarding|gis|donor|individual|external|short[-\s]term)\s+consultant|consultancy|expression\s+of\s+interest|terms\s+of\s+reference|tor\b|reoi\b|rfp\b|advisor|adviser|sector\s+lead|programme\s+(officer|manager|coordinator|specialist|associate|cashier|driver|assistant)|program\s+(officer|manager|coordinator|specialist|associate|cashier|driver|assistant)|country\s+representative|head\s+of\s+(programmes?|programs?|operations?)|chief\s+of\s+party|deputy\s+(country\s+director|chief\s+of\s+party)|technical\s+(officer|specialist|advisor|lead)|policy\s+(officer|advisor|specialist|analyst)|research(er)?|evaluation\s+specialist|grant(s)?\s+(officer|manager|coordinator)|emergency\s+(officer|coordinator|response|cashier|driver)|humanitarian\s+(officer|advisor|coordinator|cashier|driver)|livelihoods?\s+(officer|advisor)|rural\s+development|public\s+health|epidemiolog|capacity\s+building|project\s+(cashier|driver|assistant|officer))\b/i;

const NON_DEV_TITLE_RE =
  /\b(sales\s+(assistant|representative|associate|clerk|executive|consultant|development\s+representative|specialist|operative)|sales\s+manager|head\s+of\s+sales|account\s+(manager|executive)|key\s+account|appointment\s+setter|brand\s+ambassador|territory\s+(retention\s+)?manager|product\s+demonstrator|merchandiser|cashier|waiter|waitress|barista|cook(?!\s*county)|chef|bartender|housekeeping|room\s+attendant|food\s+and\s+beverage|hotel\s+(dining|cashier|operations|manager)|driver(?!\s*(safety|behavior))|chauffeur|porter|cleaner|janitor|security\s+(guard|officer)(?!\s*(programme|programs?|advisor))|mechanic|electrician|welder|plumber|carpenter|fitter|machinist|machine\s+operator|hvac\b|wastewater|treatment\s+plant\s+operator|printing\s+press|receptionist|telemarketer|customer\s+service\s+(representative|agent)|call\s+center|chat\s+support|telephone\s+operator|graphic\s+designer|copywriter|content\s+writer|video\s+editor|social\s+media\s+(buyer|specialist|intern)(?!\s+(advocacy|campaign))|seo\s+(executive|specialist|manager)|search\s+engine\s+optimization|meta\s+ads|media\s+buyer|qualified\s+consultants?\b|talent\s+acquisition|recruiter\s*(?!.*(emergency|humanitarian|donor))|data\s+abstractor|legal\s+counsel\s+(remote|full[-\s]time)?$|veterinary\s+medicine$|software\s+engineer\s+(?!.*\b(donor|m&e|health|wash|education|gender|governance|humanitarian|programme|program|policy|gis))|branch\s+(business\s+)?manager|teller\b|real\s+estate|tax\s+consultant|investment\s+consultant|wealth\s+(management|consultant)|insurance\s+consultant|recruitment\s+consultant)/i;

const NON_DEV_ORG_RE =
  /\b(heineken|coca[-\s]?cola|pepsi|nestle|diageo|unilever|p\s*&\s*g|procter\s*&\s*gamble|safaricom|ethio\s*telecom|mtn\b|airtel|vodafone|orange\s+(ethiopia|telecom)|d\.light|kifiya|synax|comcore|odixcity|talentworld|hire\s*hangar|toloka|merixstudio|union\s+farms|huzzle|huzzle\.com|qodeyard|wing\s+legal|kinetic\s+business\s+solution|good\s+boi\s+marketing|flowmingo|topcast|sika\b|bitdeer|zte\b|hilton|marriott|sheraton|radisson|smollan|jti\b|guardian\s+jobs|alberta\s+health|nhs\b|bupa|livewest|kings\s+secure|rws\s+group|american\s+data\s+network|east\s+africa\s+gate|dhl\s+express|fedex|aramex|southern\s+ethiopia\s+peoples'?\s+democratic\s+movement|prosperity\s+party|tplf|girl\s+effect|dashen\s+bank|awash\s+bank|cbe\b|commercial\s+bank\s+of\s+ethiopia|abyssinia\s+bank|wegagen\s+bank|nib\s+international|enat\s+bank|hibret\s+bank|berhan\s+bank|cooperative\s+bank|zemen\s+bank|betahun|adika\s+pharma|bgi\s+ethiopia|moha\s+soft|raya\s+brewery|habesha\s+brewery|hagbes|ethiopian\s+airlines|keste\s+damena|prasino|etta\s+solutions|kebir\s+coffee|afro\s+investment|rammis\s+bank|shaza\s+oils|habesha\s+steel|new\s+leaf\s+medical|kabe\s+property|sololo\s+engineering|dema\s+hope|brightpath\s+consulting|serenade\s+venture|aah\s+consulting|foam\s+and\s+plastic|steel\s+mills?\s+plc|cement\s+(factory|plc|industries)|paper\s+mills?\s+plc|textile\s+(industries|plc)|leather\s+(plc|industries|tannery)|tannery\s+plc|brewery\s+plc|breweries\s+plc|distillery\s+plc|beverages?\s+plc|food\s+processing\s+(plc|industries)|oils?\s+and\s+(delecious\s+)?foods?|petroleum\s+(plc|industries)|mining\s+(plc|sh\.?\s*co\.?|company)|construction\s+materials|construction\s+plc|trading\s+(plc|sh\.?\s*co\.?|company\s+plc)|import\s+plc|export\s+plc|industrial\s+plc|industries\s+plc|holdings?\s+plc|property\s+management|estate\s+development|real\s+estate\s+(plc|investment|development)|venture\s+plc)\b/i;

function isDevelopmentSector(opp: RawOpportunity): boolean {
  const title = opp.title || "";
  const org = opp.organization || "";
  // Donor / dev keyword allowlist wins over any denylist hit. Protects
  // legitimate edge cases like "Sales Specialist at IFC" or "Driver
  // Safety Programme Coordinator".
  if (DEV_KEEP_RE.test(title) || DEV_KEEP_RE.test(org)) return true;
  if (NON_DEV_TITLE_RE.test(title)) return false;
  if (NON_DEV_ORG_RE.test(org)) return false;
  return true;
}

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

    // Development-sector relevance — drops sales / hospitality / FMCG /
    // industrial / generic-marketing roles that satisfy the Ethiopia
    // check but aren't donor / development consulting. Donor and
    // dev-keyword allowlist overrides this so legitimate edge cases
    // (e.g. Sales Specialist at IFC, Senior M&E Officer Sales) survive.
    if (!isDevelopmentSector(opp)) return false;

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
