/**
 * PoC Scraper: UNJobs.org
 * Source: unjobs.org/duty_stations/ethiopia
 * Method: Puppeteer (real browser) to bypass anti-bot 403 on pagination
 * Expected: ~100+ jobs across 5 pages
 */
const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer");

const BASE_URL = "https://unjobs.org/duty_stations/ethiopia";
const MAX_PAGES = 5;
const NAV_DELAY_MS = 2500; // 2.5 seconds between page navigations

/**
 * Extract organization from surrounding text using known UN org names.
 */
function extractOrg(text, title) {
  const orgs = [
    "UNDP", "UNICEF", "WHO", "WFP", "UNHCR", "UNOPS", "FAO",
    "IOM", "OCHA", "UNFPA", "UNESCO", "ILO", "UNIDO", "UNEP",
    "UN Women", "IFAD", "UNAIDS", "UNECA", "AU", "UNRWA",
    "IAEA", "ITU", "WIPO", "WMO", "UNCTAD", "UNODC", "UNITAR",
    "OHCHR", "ECLAC", "ECA", "ESCAP", "ESCWA",
  ];
  for (const org of orgs) {
    if (text.includes(org) && !title.includes(org)) return org;
  }
  return "";
}

/**
 * Extract jobs from the current page using Puppeteer's page.evaluate().
 * UNJobs structure:
 *   <article>
 *     <div class="job">
 *       <a class="jtitle" href="/vacancies/...">Title</a><br>
 *       Organization Name<br>
 *       Updated: <time>...</time>
 *     </div>
 *     ...
 *   </article>
 */
async function extractJobsFromPage(page) {
  const rawJobs = await page.evaluate(() => {
    const results = [];
    const jobDivs = document.querySelectorAll("div.job");

    jobDivs.forEach((div) => {
      const link = div.querySelector("a.jtitle, a[href*='/vacancies/']");
      if (!link) return;

      const title = link.textContent.trim();
      const href = link.getAttribute("href") || "";
      if (!title || title.length <= 5) return;

      const fullLink = href.startsWith("http")
        ? href
        : `https://unjobs.org${href}`;

      // Extract organization: it's the text node right after the first <br> following the <a>
      let organization = "";
      const divHTML = div.innerHTML;
      // Pattern: ...jtitle">Title</a><br>Org Name<br>Updated:...
      const orgMatch = divHTML.match(/<\/a>\s*<br>\s*([^<]+)\s*<br>/);
      if (orgMatch) {
        organization = orgMatch[1].trim();
      }

      // Extract deadline from <time> element if present
      let deadline = null;
      const timeEl = div.querySelector("time");
      if (timeEl) {
        const dt = timeEl.getAttribute("datetime");
        if (dt) {
          deadline = dt;
        }
      }

      // Also grab full text for fallback org extraction
      const rowText = div.textContent || "";

      results.push({
        title,
        link: fullLink,
        organization,
        deadline,
        rowText,
      });
    });

    return results;
  });

  // Apply extractOrg as fallback if organization wasn't found from HTML structure
  const now = new Date().toISOString();
  return rawJobs.map((job) => ({
    title: job.title,
    description: "",
    deadline: job.deadline,
    organization: job.organization || extractOrg(job.rowText, job.title),
    country: "Ethiopia",
    source_url: job.link,
    source_domain: "unjobs.org",
    type: "job",
    scraped_at: now,
  }));
}

/**
 * Find the next page URL from pagination links on the current page.
 * UNJobs uses path-based pagination: /duty_stations/ethiopia/2, /3, etc.
 * "Next >" links have class="ts".
 */
async function findNextPageUrl(page) {
  const nextUrl = await page.evaluate(() => {
    // Strategy 1: Find "Next >" link — UNJobs uses text "Next >" with class "ts"
    for (const a of document.querySelectorAll("a")) {
      const text = a.textContent.trim();
      if (
        text.startsWith("Next") ||
        text === ">" ||
        text === ">>"
      ) {
        const href = a.getAttribute("href");
        if (href && href.includes("duty_stations")) {
          return href.startsWith("http")
            ? href
            : `https://unjobs.org${href}`;
        }
      }
    }

    // Strategy 2: Look for rel="next"
    const relNext = document.querySelector('a[rel="next"]');
    if (relNext) {
      const href = relNext.getAttribute("href");
      if (href) {
        return href.startsWith("http") ? href : `https://unjobs.org${href}`;
      }
    }

    // Strategy 3: Find path-based pagination links (/ethiopia/N) and pick next number
    const currentPath = window.location.pathname;
    const currentMatch = currentPath.match(/\/ethiopia\/(\d+)$/);
    const currentPage = currentMatch ? parseInt(currentMatch[1]) : 1;
    const nextPage = currentPage + 1;

    for (const a of document.querySelectorAll("a")) {
      const href = a.getAttribute("href") || "";
      if (href.includes(`/ethiopia/${nextPage}`)) {
        return href.startsWith("http") ? href : `https://unjobs.org${href}`;
      }
    }

    return null;
  });

  return nextUrl;
}

async function main() {
  let browser;
  try {
    console.log("UNJobs: Launching browser...");
    browser = await puppeteer.launch({
      headless: "new",
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-blink-features=AutomationControlled",
      ],
    });

    const page = await browser.newPage();

    // Set a realistic viewport and user agent
    await page.setViewport({ width: 1366, height: 768 });
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );

    // Remove webdriver flag to reduce detection
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, "webdriver", {
        get: () => undefined,
      });
    });

    let allJobs = [];
    let url = BASE_URL;
    let pageNum = 0;

    while (url && pageNum < MAX_PAGES) {
      pageNum++;
      console.log(`   Page ${pageNum}: Loading ${url}`);

      try {
        await page.goto(url, {
          waitUntil: "networkidle2",
          timeout: 30000,
        });

        // Wait a moment for any dynamic content to settle
        await new Promise((r) => setTimeout(r, 1000));

        const jobs = await extractJobsFromPage(page);
        allJobs.push(...jobs);
        console.log(`   Page ${pageNum}: Found ${jobs.length} jobs`);

        if (jobs.length === 0) {
          console.log("   No jobs found on this page, stopping pagination.");
          break;
        }

        // Try to find next page link
        const nextUrl = await findNextPageUrl(page);

        if (nextUrl && nextUrl !== url) {
          url = nextUrl;
          // Delay between page navigations to be polite
          console.log(
            `   Waiting ${NAV_DELAY_MS / 1000}s before next page...`
          );
          await new Promise((r) => setTimeout(r, NAV_DELAY_MS));
        } else {
          console.log("   No next page link found, stopping pagination.");
          break;
        }
      } catch (pageErr) {
        console.log(
          `   Page ${pageNum} failed: ${pageErr.message} -- stopping pagination`
        );
        break;
      }
    }

    // Deduplicate by source_url
    const seen = new Set();
    const unique = allJobs.filter((j) => {
      if (seen.has(j.source_url)) return false;
      seen.add(j.source_url);
      return true;
    });

    // Write output
    const outPath = path.join(__dirname, "../../test-output/unjobs.json");
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(unique, null, 2));
    console.log(
      `UNJobs: Found ${unique.length} unique opportunities across ${pageNum} pages`
    );
    if (unique.length > 0) {
      console.log(`   Sample: "${unique[0].title}"`);
      console.log(`   Sample org: "${unique[0].organization}"`);
    }
  } catch (err) {
    console.error(`UNJobs: ${err.message}`);
  } finally {
    if (browser) {
      await browser.close();
      console.log("UNJobs: Browser closed.");
    }
  }
}

main();
