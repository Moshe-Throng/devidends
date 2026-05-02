/**
 * LinkedIn Guest Adapter — Public job-search endpoint, no auth required.
 *
 * Uses the same JSON-less HTML fragment endpoint that LinkedIn renders for
 * logged-out visitors:
 *
 *   GET https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search
 *       ?keywords=...&geoId=...&f_TPR=r86400&start=N
 *
 * Each call returns a fragment of <li>.base-card</li> elements (25 per page).
 * Each card carries the listing's title, organization, location, posted date
 * and a `data-entity-urn` that contains the LinkedIn job ID. The full
 * description for a single job lives at:
 *
 *   GET https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/<jobId>
 *
 * That endpoint also requires no auth and returns an HTML fragment whose
 * `.show-more-less-html__markup` block holds the description body.
 *
 * Best-practice notes drilled into the adapter:
 *   - The card endpoint refuses requests without a browser-shaped UA. We
 *     use the project's randomUserAgent() helper.
 *   - LinkedIn returns 429 if pages are pulled faster than ~1/sec. The
 *     adapter sleeps `pageDelay` between page fetches and `detailDelay`
 *     between job detail fetches.
 *   - Detail fetches are capped (`maxDetails`) so a single run cannot blow
 *     out the cron envelope. The publish-time enrichment pass picks up
 *     anything we skipped here.
 *   - Geo and time filters are passed through config so a single source
 *     entry can target Ethiopia (geoId 102639813) and "past 24h" (f_TPR
 *     r86400) for the daily run, with a wider slow-rolling sweep added
 *     later if needed.
 */

import type { CrawlAdapter, SourceConfig, RawOpportunity } from "../types";
import { fetchWithRetry, stripHtml, sleep, randomUserAgent } from "../utils/http";
import { createLogger } from "../utils/logger";

interface LinkedInGuestConfig {
  keywords?: string;            // e.g. "consultant", "manager"
  location?: string;            // human-readable, e.g. "Ethiopia"
  geoId?: string;               // LinkedIn geo id; 102639813 = Ethiopia
  timePosted?: "r86400" | "r604800" | "r2592000"; // 1d / 7d / 30d
  experienceLevels?: string[];  // "1".."6"
  jobTypes?: string[];          // F P C T V I
  remoteFilter?: string;        // 1 onsite, 2 remote, 3 hybrid
  maxPages?: number;            // pagination cap (default 4 → ~100 cards)
  pageSize?: number;            // 25 is LinkedIn's default
  pageDelay?: number;           // ms between page fetches
  fetchDetails?: boolean;       // pull full descriptions per card
  detailDelay?: number;         // ms between detail fetches
  maxDetails?: number;          // cap detail fetches per run
  // Relevance gate — LinkedIn's location filter is permissive and routinely
  // returns global noise (UK NHS, Alberta health, Dutch HBO, etc.) tagged
  // to Ethiopia for visibility. Off by default for portability; on for our
  // Ethiopia source.
  requireEthiopiaMention?: boolean;
}

const ETHIOPIA_RE =
  /\b(ethiopia|ethiopian|addis\s*ababa|addis|oromia|amhara|tigray|sidama|gambella|afar|harari|dire\s*dawa|south\s*west\s*ethiopia|bahir\s*dar|hawassa|mekelle|jimma|adama|arba\s*minch|au[-\s]cdc|africa\s+cdc|liway|pepfar\s+ethiopia|usaid\s+ethiopia|abh\s+partners|inkomoko|odixcity|snv\s+ethiopia)\b/i;

// Orgs that LinkedIn keeps returning under Ethiopia despite being clearly
// based elsewhere. We drop on the org alone — a UK NHS trust isn't going
// to randomly post an Ethiopia role even if LinkedIn says so.
const NON_ETHIOPIA_ORG_RE =
  /\b(nhs\s+(scotland|ayrshire|wales|england|tayside|lothian|grampian)|alberta\s+health\s+services|bupa\s+uk|livewest|places\s+for\s+people|zorgnet|leger\s+des\s+heils|guardian\s+jobs|toloka|merixstudio|d\.light\s+india|hire\s+hangar|talentworld|jti)\b/i;

// Non-English title hints — if the title is dominated by non-English
// characters or known stop-words from other languages, drop it.
const NON_ENGLISH_TITLE_RE =
  /\b(persoonlijk|begeleider|maatschappelijke|opvang|odborn|sprzedawca|sprzedawczyni|zaměstnanec|kraj|prodava|mitarbeiter|einrichtungsleitung|recruiting\s+\|\s+personal)\b/i;

const SEARCH_URL =
  "https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search";
const JOB_DETAIL_URL =
  "https://www.linkedin.com/jobs-guest/jobs/api/jobPosting";

function liHeaders(): Record<string, string> {
  return {
    "User-Agent": randomUserAgent(),
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    Referer: "https://www.linkedin.com/jobs/search/",
  };
}

function buildSearchUrl(cfg: LinkedInGuestConfig, start: number): string {
  const p = new URLSearchParams();
  if (cfg.keywords) p.set("keywords", cfg.keywords);
  if (cfg.location) p.set("location", cfg.location);
  if (cfg.geoId) p.set("geoId", cfg.geoId);
  if (cfg.timePosted) p.set("f_TPR", cfg.timePosted);
  if (cfg.experienceLevels?.length) p.set("f_E", cfg.experienceLevels.join(","));
  if (cfg.jobTypes?.length) p.set("f_JT", cfg.jobTypes.join(","));
  if (cfg.remoteFilter) p.set("f_WT", cfg.remoteFilter);
  p.set("start", String(start));
  p.set("position", "1");
  p.set("pageNum", "0");
  return `${SEARCH_URL}?${p.toString()}`;
}

function extractJobId(urn: string | undefined): string | null {
  if (!urn) return null;
  // Format: urn:li:jobPosting:1234567890
  const m = urn.match(/(\d{6,})/);
  return m ? m[1] : null;
}

export class LinkedInGuestAdapter implements CrawlAdapter {
  name = "linkedin-guest";

  async crawl(source: SourceConfig): Promise<RawOpportunity[]> {
    const cheerio = require("cheerio");
    const log = createLogger(source.id);
    const cfg = (source.config as LinkedInGuestConfig) || {};

    const maxPages = cfg.maxPages ?? 4;
    const pageSize = cfg.pageSize ?? 25;
    const pageDelay = cfg.pageDelay ?? 1500;
    const detailDelay = cfg.detailDelay ?? 1500;

    log.info(
      `LinkedIn guest search: keywords="${cfg.keywords || ""}" geoId=${cfg.geoId || "-"} timePosted=${cfg.timePosted || "any"} maxPages=${maxPages}`,
    );

    const jobs: RawOpportunity[] = [];
    const seen = new Set<string>();

    for (let page = 0; page < maxPages; page++) {
      const start = page * pageSize;
      const url = buildSearchUrl(cfg, start);

      let html = "";
      try {
        const res = await fetchWithRetry(url, { headers: liHeaders() });
        if (!res.ok) {
          log.warn(`page ${page + 1}: HTTP ${res.status}, stopping`);
          break;
        }
        html = await res.text();
      } catch (err) {
        log.warn(`page ${page + 1}: fetch failed: ${(err as Error).message}`);
        break;
      }

      const $ = cheerio.load(html);
      const cards = $("li").toArray();
      if (cards.length === 0) {
        log.info(`page ${page + 1}: no cards (end of results)`);
        break;
      }

      let pageAdded = 0;
      for (const el of cards) {
        const $el = $(el);

        const title = $el
          .find("h3.base-search-card__title, .base-search-card__title")
          .text()
          .trim();
        if (!title || title.length < 5) continue;

        const organization = $el
          .find("h4.base-search-card__subtitle a, .base-search-card__subtitle")
          .first()
          .text()
          .trim() || "Unknown";

        const location = $el
          .find(".job-search-card__location")
          .text()
          .trim();

        const $link = $el.find("a.base-card__full-link, a.base-card__full-link--mobile, a[href*='/jobs/view/']").first();
        let link = ($link.attr("href") || "").trim();
        if (link && !link.startsWith("http")) link = `https://www.linkedin.com${link.startsWith("/") ? "" : "/"}${link}`;
        if (!link) continue;
        // Strip tracking/query params for stable dedup
        link = link.split("?")[0];

        if (seen.has(link)) continue;
        seen.add(link);

        const urn =
          $el.find("[data-entity-urn]").attr("data-entity-urn") ||
          $el.find(".base-card").attr("data-entity-urn");
        const jobId = extractJobId(urn);

        const datetime = $el
          .find("time.job-search-card__listdate, time.job-search-card__listdate--new, time")
          .attr("datetime");

        jobs.push({
          title: title.replace(/\s+/g, " ").slice(0, 300),
          organization: organization.slice(0, 200),
          description: "",
          deadline: null,
          published: datetime || null,
          country: cfg.location || "",
          city: location || null,
          source_url: link,
          source_domain: "linkedin.com",
          content_type: source.content_type,
          scraped_at: new Date().toISOString(),
          raw_fields: {
            li_job_id: jobId,
            location_raw: location,
          },
        });
        pageAdded++;
      }

      log.info(`page ${page + 1}: +${pageAdded} (total ${jobs.length})`);
      if (pageAdded === 0) break; // no new ids → stop paginating

      if (page < maxPages - 1) await sleep(pageDelay);
    }

    log.info(`Found ${jobs.length} listings (pre-detail)`);

    if (cfg.fetchDetails && jobs.length > 0) {
      const cap = Math.min(jobs.length, cfg.maxDetails ?? 50);
      log.info(`Fetching details for up to ${cap} jobs...`);

      let hits = 0;
      for (let i = 0; i < cap; i++) {
        const job = jobs[i];
        const jobId = (job.raw_fields as { li_job_id?: string } | undefined)?.li_job_id;
        if (!jobId) continue;

        try {
          const detailRes = await fetchWithRetry(
            `${JOB_DETAIL_URL}/${jobId}`,
            { headers: liHeaders() },
          );
          if (detailRes.ok) {
            const detailHtml = await detailRes.text();
            const $d = cheerio.load(detailHtml);
            const rawDesc = $d(".show-more-less-html__markup").html() || "";
            const desc = stripHtml(rawDesc).trim();
            if (desc && desc.length > 80) {
              job.description = desc.slice(0, 5000);
              hits++;
            }
          } else if (detailRes.status === 429) {
            log.warn(`detail ${i}: rate-limited (429), aborting detail pass`);
            break;
          }
        } catch {
          // skip — publish-time enrichment is the safety net
        }

        if (i < cap - 1) await sleep(detailDelay);
      }
      log.info(`Detail pass: enriched ${hits}/${cap}`);
    }

    // Relevance gate. We run this AFTER enrichment so we can scan the
    // full description text, not just the title. Three-stage:
    //   1. Drop obviously off-target orgs (UK NHS, Alberta Health, etc.)
    //   2. Drop non-English titles (Dutch, Czech, Polish, German)
    //   3. Require explicit Ethiopia mention in title or description
    // Anything that survives is at least claimed-Ethiopia + English + not
    // from a known foreign-only employer.
    if (cfg.requireEthiopiaMention) {
      const before = jobs.length;
      // Title that names a foreign nationality / language is a strong
      // negative signal even when the city says Ethiopia — the role is
      // for that nationality, not for an Ethiopian. e.g. "Czech Sales
      // Consultant", "Polish Speaking CSR", "German Translator".
      const FOREIGN_NATIONALITY_TITLE_RE =
        /\b(czech|polish|hungarian|romanian|slovak|bulgarian|croatian|serbian|slovenian|dutch|german|french|spanish|portuguese|italian|finnish|swedish|norwegian|danish|russian|ukrainian|turkish|arabic|chinese|japanese|korean|vietnamese|indonesian|malay)\s+(speaking|speaker|sales|customer|support|translator|interpreter|consultant|representative)\b/i;

      const filtered = jobs.filter((j) => {
        if (NON_ETHIOPIA_ORG_RE.test(j.organization)) return false;
        if (NON_ENGLISH_TITLE_RE.test(j.title)) return false;
        if (FOREIGN_NATIONALITY_TITLE_RE.test(j.title)) return false;
        // Org-name and city both contribute. LinkedIn's card-level city
        // field is reliable when the role really is Ethiopia (e.g.
        // "Addis Ababa, Ethiopia", "Dire Dawa, Ethiopia"). Haiku
        // sometimes strips the location out of restructured descriptions
        // so we cannot rely on description text alone.
        const corpus = `${j.title} ${j.organization} ${j.city ?? ""} ${j.description}`;
        return ETHIOPIA_RE.test(corpus);
      });
      log.info(`Relevance filter: kept ${filtered.length}/${before} (dropped ${before - filtered.length} off-target)`);
      return filtered;
    }

    return jobs;
  }
}
