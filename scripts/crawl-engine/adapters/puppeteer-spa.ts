/**
 * Puppeteer SPA Adapter — JS-rendered pages
 *
 * Used for:
 *   - UNJobs (unjobs.org) — Cloudflare-protected, pagination
 *   - UN Careers (careers.un.org) — Angular SPA
 *   - African Union (jobs.au.int) — SAP SuccessFactors
 */

import type { CrawlAdapter, SourceConfig, RawOpportunity } from "../types";
import { getBrowser, createStealthPage } from "../utils/browser";
import { sleep, fetchWithRetry, stripHtml, randomUserAgent } from "../utils/http";
import { createLogger } from "../utils/logger";

interface PuppeteerConfig {
  url: string;
  orgName: string;
  sourceDomain: string;
  defaultCountry?: string;

  // Extraction mode
  mode: "unjobs" | "uncareers" | "au" | "generic";

  // Pagination
  maxPages?: number;
  pageDelay?: number; // ms between pages

  // Generic mode selectors
  jobSelector?: string;
  titleSelector?: string;
  linkSelector?: string;
  orgSelector?: string;
  deadlineSelector?: string;

  // Scroll-to-load
  scrollCount?: number;
  scrollDelay?: number;
}

// Known UN org names for UNJobs extraction
const UN_ORGS = [
  "UNDP", "UNICEF", "WHO", "WFP", "UNHCR", "UNOPS", "FAO",
  "IOM", "OCHA", "UNFPA", "UNESCO", "ILO", "UNIDO", "UNEP",
  "UN Women", "IFAD", "UNAIDS", "UNECA", "AU", "UNRWA",
  "IAEA", "ITU", "WIPO", "WMO", "UNCTAD", "UNODC", "UNITAR",
  "OHCHR",
];

function extractOrgFromText(text: string): string {
  for (const org of UN_ORGS) {
    if (text.includes(org)) return org;
  }
  return "";
}

export class PuppeteerSpaAdapter implements CrawlAdapter {
  name = "puppeteer-spa";

  async crawl(source: SourceConfig): Promise<RawOpportunity[]> {
    const log = createLogger(source.id);
    const cfg = source.config as PuppeteerConfig;

    const browser = await getBrowser();

    switch (cfg.mode) {
      case "unjobs":
        return this.crawlUnjobs(browser, source, cfg, log);
      case "uncareers":
        return this.crawlUncareers(browser, source, cfg, log);
      case "au":
        return this.crawlAu(browser, source, cfg, log);
      default:
        return this.crawlGeneric(browser, source, cfg, log);
    }
  }

  /** UNJobs: pagination with path-based URLs */
  private async crawlUnjobs(
    browser: any,
    source: SourceConfig,
    cfg: PuppeteerConfig,
    log: any
  ): Promise<RawOpportunity[]> {
    const page = await createStealthPage(browser);
    const maxPages = cfg.maxPages || 5;
    const allJobs: RawOpportunity[] = [];
    let url = cfg.url;

    try {
      for (let pageNum = 1; pageNum <= maxPages && url; pageNum++) {
        log.info(`Page ${pageNum}: Loading ${url}`);

        await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });
        await sleep(1000);

        const rawJobs = await page.evaluate(() => {
          const results: any[] = [];
          document.querySelectorAll("div.job").forEach((div) => {
            const link = div.querySelector("a.jtitle, a[href*='/vacancies/']") as HTMLAnchorElement;
            if (!link) return;
            const title = link.textContent?.trim() || "";
            const href = link.getAttribute("href") || "";
            if (!title || title.length <= 5) return;

            const fullLink = href.startsWith("http") ? href : `https://unjobs.org${href}`;
            let organization = "";
            const orgMatch = div.innerHTML.match(/<\/a>\s*<br>\s*([^<]+)\s*<br>/);
            if (orgMatch) organization = orgMatch[1].trim();

            let deadline: string | null = null;
            const timeEl = div.querySelector("time");
            if (timeEl) deadline = timeEl.getAttribute("datetime") || null;

            results.push({ title, link: fullLink, organization, deadline, rowText: div.textContent || "" });
          });
          return results;
        });

        const jobs = rawJobs.map((job: any): RawOpportunity => ({
          title: job.title,
          organization: job.organization || extractOrgFromText(job.rowText),
          description: "",
          deadline: job.deadline,
          published: null,
          country: cfg.defaultCountry || "Ethiopia",
          city: null,
          source_url: job.link,
          source_domain: cfg.sourceDomain,
          content_type: source.content_type,
          scraped_at: new Date().toISOString(),
        }));

        allJobs.push(...jobs);
        log.info(`Page ${pageNum}: ${jobs.length} jobs`);

        if (jobs.length === 0) break;

        // Find next page URL
        const nextUrl = await page.evaluate(() => {
          for (const a of document.querySelectorAll("a")) {
            const text = a.textContent?.trim() || "";
            if (text.startsWith("Next") || text === ">" || text === ">>") {
              const href = a.getAttribute("href");
              if (href?.includes("duty_stations")) {
                return href.startsWith("http") ? href : `https://unjobs.org${href}`;
              }
            }
          }
          return null;
        });

        if (nextUrl && nextUrl !== url) {
          url = nextUrl;
          await sleep(cfg.pageDelay || 2500);
        } else {
          break;
        }
      }
    } finally {
      await page.close();
    }

    return allJobs;
  }

  /**
   * UN Careers: Direct REST API approach.
   *
   * careers.un.org is an Angular SPA — the HTML shell contains no job data.
   * The Angular app fetches jobs from an internal API at:
   *   POST /api/public/opening/jo/list/filteredV2/{lang}
   *
   * We call that API directly (no Puppeteer needed), filtering by duty station
   * codes for Ethiopia. This is faster and far more reliable than trying to
   * render the SPA and scrape the DOM.
   *
   * Duty station codes discovered from /api/site/jobOpening/joblocation:
   *   ADDISABABA, AWASA, DESE, DIREDAWA, JIJIGA, KEBRIDEHAR,
   *   MEKELLE, NAZARETHNAZRET, NEKEMTE, SEMERA
   */
  private async crawlUncareers(
    _browser: any,
    source: SourceConfig,
    cfg: PuppeteerConfig,
    log: any
  ): Promise<RawOpportunity[]> {
    const jobs: RawOpportunity[] = [];

    // All known Ethiopia duty station codes on careers.un.org
    const ethiopiaDutyStations = [
      "ADDISABABA", "AWASA", "DESE", "DIREDAWA", "JIJIGA",
      "KEBRIDEHAR", "MEKELLE", "NAZARETHNAZRET", "NEKEMTE", "SEMERA",
    ];

    const apiUrl = "https://careers.un.org/api/public/opening/jo/list/filteredV2/en";
    const maxPages = cfg.maxPages || 3;
    const itemsPerPage = 50;

    try {
      for (let page = 0; page < maxPages; page++) {
        const payload = {
          filterConfig: {
            aoe: [], aoi: [], el: [], ct: [],
            ds: ethiopiaDutyStations,
            jn: [], jf: [], jc: [], jle: [], dept: [], span: [],
          },
          pagination: {
            page,
            itemPerPage: itemsPerPage,
            sortBy: "startDate",
            sortDirection: -1,
          },
        };

        log.info(`Page ${page + 1}: Fetching from UN Careers API...`);

        const res = await fetchWithRetry(apiUrl, {
          method: "POST",
          headers: {
            "User-Agent": randomUserAgent(),
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          log.warn(`API returned status ${res.status}`);
          break;
        }

        const data = await res.json() as {
          status: number;
          data: {
            list: Array<{
              jobId: number;
              postingTitle: string;
              jobTitle: string;
              jobDescription?: string;
              dutyStation: Array<{ code: string; description: string }>;
              startDate: string;
              endDate: string;
              jobLevel?: string;
              categoryCode?: string;
              dept?: { code: string; name: string };
              jc?: { code: string; name: string };
              jl?: { code: string; name: string };
              jf?: { Code: string; Name: string };
              jn?: { code: string; name: string };
            }>;
            count: number;
          };
        };

        if (data.status !== 1 || !data.data?.list?.length) {
          log.info(`Page ${page + 1}: No more results`);
          break;
        }

        const pageJobs = data.data.list;
        log.info(`Page ${page + 1}: ${pageJobs.length} jobs (total available: ${data.data.count})`);

        for (const job of pageJobs) {
          const title = job.postingTitle || job.jobTitle || "";
          if (!title || title.length < 5) continue;

          // Extract city from first duty station description
          const dutyStations = job.dutyStation || [];
          const city = dutyStations.length > 0
            ? dutyStations.map(ds => ds.description).join(", ")
            : null;

          // Department name as organization (e.g. "Economic Commission for Africa")
          const department = job.dept?.name || "United Nations";

          // Extract a short description from the HTML job description
          let description = "";
          if (job.jobDescription) {
            description = stripHtml(job.jobDescription).slice(0, 500);
          }

          jobs.push({
            title,
            organization: department,
            description,
            deadline: job.endDate || null,
            published: job.startDate || null,
            country: cfg.defaultCountry || "Ethiopia",
            city,
            source_url: `https://careers.un.org/jobSearchDescription/${job.jobId}?language=en`,
            source_domain: cfg.sourceDomain,
            content_type: source.content_type,
            scraped_at: new Date().toISOString(),
            raw_fields: {
              jobLevel: job.jl?.name || job.jobLevel || "",
              categoryCode: job.categoryCode || "",
              jobCategory: job.jc?.name || "",
              jobFamily: job.jf?.Name || "",
              jobNetwork: job.jn?.name || "",
            },
          });
        }

        // Stop if we've fetched all available results
        if (jobs.length >= data.data.count || pageJobs.length < itemsPerPage) {
          break;
        }

        await sleep(cfg.pageDelay || 1000);
      }
    } catch (err: any) {
      log.error(`UN Careers API error: ${err.message}`);
    }

    log.info(`Total: ${jobs.length} Ethiopia jobs from UN Careers`);
    return jobs;
  }

  /** African Union: au.int careers + jobs.au.int sitemap */
  private async crawlAu(
    browser: any,
    source: SourceConfig,
    cfg: PuppeteerConfig,
    log: any
  ): Promise<RawOpportunity[]> {
    const cheerio = require("cheerio");
    const jobs: RawOpportunity[] = [];

    // Strategy 1: Scrape au.int/en/careers (HTML)
    log.info("Strategy 1: Fetching au.int/en/careers...");
    try {
      const res = await fetch("https://au.int/en/careers", {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
      });
      if (res.ok) {
        const html = await res.text();
        const $ = cheerio.load(html);
        $('a[href*="jobs.au.int/job/"]').each((_: number, el: any) => {
          const title = $(el).text().trim();
          const href = $(el).attr("href") || "";
          if (!title || title.length < 5) return;

          const $parent = $(el).closest("li");
          let deadline: string | null = null;
          let grade: string | null = null;
          $parent.find("li").each((_: number, li: any) => {
            const text = $(li).text().trim();
            if (text.startsWith("Closing Date:")) deadline = text.replace("Closing Date:", "").trim();
            if (text.startsWith("Grade:")) grade = text.replace("Grade:", "").trim();
          });

          jobs.push({
            title,
            organization: "African Union",
            description: "",
            deadline,
            published: null,
            country: "Ethiopia",
            city: "Addis Ababa",
            source_url: href,
            source_domain: "au.int",
            content_type: source.content_type,
            scraped_at: new Date().toISOString(),
            raw_fields: { grade: grade || "" },
          });
        });
        log.info(`Strategy 1: ${jobs.length} jobs from au.int/en/careers`);
      }
    } catch (err: any) {
      log.warn(`Strategy 1 failed: ${err.message}`);
    }

    // Strategy 2: Parse jobs.au.int/sitemap.xml + fetch individual pages for titles & descriptions
    log.info("Strategy 2: Fetching jobs.au.int/sitemap.xml...");
    try {
      const sitemapRes = await fetch("https://jobs.au.int/sitemap.xml");
      if (sitemapRes.ok) {
        const xml = await sitemapRes.text();
        const $xml = cheerio.load(xml, { xmlMode: true });
        const urls: string[] = [];
        $xml("url > loc").each((_: number, el: any) => {
          const loc = $xml(el).text().trim();
          if (loc.includes("/job/") && !loc.includes("-fr_FR")) urls.push(loc);
        });
        log.info(`  Sitemap: ${urls.length} job URLs`);

        const existingUrls = new Set(jobs.map((j) => j.source_url));
        let fetched = 0;
        for (const url of urls) {
          if (existingUrls.has(url)) continue;

          // Fetch the actual job page for real title + description
          let title = "";
          let description = "";
          let deadline: string | null = null;
          try {
            const pageRes = await fetch(url, {
              headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
            });
            if (pageRes.ok) {
              const pageHtml = await pageRes.text();
              const $page = cheerio.load(pageHtml);
              // Title from the page
              title = $page("h1.job-title, h1.au-body, .data-display-header-title h1, h2.title").first().text().trim()
                || $page("title").text().replace(/ \|.*$/, "").replace(/ - jobs\.au\.int.*$/i, "").trim();
              // Description from the job content
              description = $page(".jd-description, .job-description, .data-display-field, [class*='description']").text().trim().slice(0, 5000);
              // Deadline
              const deadlineText = $page(".closing-date, .job-deadline, [class*='deadline'], [class*='closing']").text().trim();
              if (deadlineText) {
                const dateMatch = deadlineText.match(/\d{1,2}[\s/-]\w+[\s/-]\d{4}|\d{4}-\d{2}-\d{2}/);
                if (dateMatch) deadline = dateMatch[0];
              }
              fetched++;
            }
          } catch {
            // Fall back to URL slug
          }

          // Fallback: extract from URL slug if page fetch failed
          if (!title) {
            const slugMatch = url.match(/\/job\/([^/]+)\/\d+/);
            if (!slugMatch) continue;
            title = decodeURIComponent(slugMatch[1]).replace(/-/g, " ")
              .replace(/^(Addis Ababa|Cairo|Accra|Nairobi|Lusaka|Johannesburg)\s+/i, "").trim();
          }

          if (!title || title.length < 5) continue;

          jobs.push({
            title: decodeURIComponent(title),
            organization: "African Union",
            description,
            deadline,
            published: null,
            country: "Ethiopia",
            city: "Addis Ababa",
            source_url: url,
            source_domain: "jobs.au.int",
            content_type: source.content_type,
            scraped_at: new Date().toISOString(),
          });

          // Rate limit: don't hammer AU server
          if (fetched % 5 === 0) await sleep(2000);
        }
        log.info(`After sitemap: ${jobs.length} total jobs (${fetched} pages fetched)`);
      }
    } catch (err: any) {
      log.warn(`Strategy 2 failed: ${err.message}`);
    }

    return jobs;
  }

  /** Generic: configurable selectors */
  private async crawlGeneric(
    browser: any,
    source: SourceConfig,
    cfg: PuppeteerConfig,
    log: any
  ): Promise<RawOpportunity[]> {
    const page = await createStealthPage(browser);
    const jobs: RawOpportunity[] = [];

    try {
      log.info(`Loading ${cfg.url}...`);
      await page.goto(cfg.url, { waitUntil: "networkidle2", timeout: 30000 });

      // Scroll to load more content
      if (cfg.scrollCount) {
        for (let i = 0; i < cfg.scrollCount; i++) {
          await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
          await sleep(cfg.scrollDelay || 1500);
        }
      }

      await sleep(2000);

      const selector = cfg.jobSelector || "a[href*='job'], a[href*='career'], a[href*='position']";
      const rawJobs = await page.evaluate(
        (sel: string, titleSel: string, orgSel: string, dlSel: string) => {
          const results: any[] = [];
          document.querySelectorAll(sel).forEach((el) => {
            const titleEl = titleSel ? el.querySelector(titleSel) : el;
            const title = titleEl?.textContent?.trim() || "";
            const href = (el as HTMLAnchorElement).href || el.querySelector("a")?.href || "";
            if (!title || title.length < 5) return;

            const org = orgSel ? (el.querySelector(orgSel)?.textContent?.trim() || "") : "";
            const deadline = dlSel ? (el.querySelector(dlSel)?.textContent?.trim() || null) : null;

            results.push({ title, link: href, organization: org, deadline });
          });
          return results;
        },
        selector,
        cfg.titleSelector || "",
        cfg.orgSelector || "",
        cfg.deadlineSelector || ""
      );

      for (const raw of rawJobs) {
        jobs.push({
          title: raw.title,
          organization: raw.organization || cfg.orgName,
          description: "",
          deadline: raw.deadline,
          published: null,
          country: cfg.defaultCountry || "Ethiopia",
          city: null,
          source_url: raw.link || cfg.url,
          source_domain: cfg.sourceDomain,
          content_type: source.content_type,
          scraped_at: new Date().toISOString(),
        });
      }

      log.info(`Found ${jobs.length} jobs`);
    } finally {
      await page.close();
    }

    return jobs;
  }
}
