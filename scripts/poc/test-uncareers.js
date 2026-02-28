/**
 * PoC Scraper: UN Careers
 * Source: careers.un.org (new portal, launched Nov 2023)
 * Method: Puppeteer — the portal is a JS-rendered SPA that returns 403 to plain HTTP requests
 * Expected: ~10-30 Ethiopia/Addis Ababa jobs
 *
 * URL strategy (tried in order):
 *   1. New portal: careers.un.org/jobopening with duty-station filter "ADDISABABA"
 *   2. Legacy search: careers.un.org/lbw/home.aspx with location=Ethiopia
 *   3. Country page: ethiopia.un.org/en/jobs (static, cheerio fallback)
 */

const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer");

// ── Configuration ──────────────────────────────────────────────────────────────

const PAGE_TIMEOUT = 60_000; // 60 s per navigation
const WAIT_TIMEOUT = 30_000; // 30 s for selectors / idle
const MAX_SCROLL_ATTEMPTS = 15; // scroll to load more results
const OUTPUT_PATH = path.join(__dirname, "../../test-output/uncareers.json");

// New portal: duty-station filter for Addis Ababa (Ethiopia)
const NEW_PORTAL_URL = buildNewPortalUrl(["ADDISABABA"]);

// Legacy portal
const LEGACY_URL =
  "https://careers.un.org/lbw/home.aspx?viewtype=SJ&vacancy=All&lang=en-US&d=Ethiopia&loc=Ethiopia";

// ── Helpers ────────────────────────────────────────────────────────────────────

function buildNewPortalUrl(dutyStations) {
  const data = {
    keyword: "",
    aoe: [],   // area of expertise
    aoi: [],   // area of interest
    el: [],    // education level
    ct: [],    // contract type
    ds: dutyStations,
    jn: [],    // job network
    jf: [],    // job family
    jc: [],    // job category
    jle: [],   // job level
    dept: [],  // department
    span: [],  // date span
  };
  return `https://careers.un.org/jobopening?language=en&data=${encodeURIComponent(JSON.stringify(data))}`;
}

function stamp() {
  return new Date().toISOString();
}

function makeJob(title, link, deadline, department, description) {
  return {
    title: (title || "").replace(/\s+/g, " ").trim(),
    description: (description || "").replace(/\s+/g, " ").trim(),
    deadline: deadline || null,
    organization: "United Nations",
    department: (department || "").replace(/\s+/g, " ").trim() || null,
    country: "Ethiopia",
    source_url: link || "https://careers.un.org",
    source_domain: "careers.un.org",
    type: "job",
    scraped_at: stamp(),
  };
}

// ── Strategy 1: New Careers Portal ─────────────────────────────────────────────

async function scrapeNewPortal(browser) {
  console.log("  [Strategy 1] New portal: careers.un.org/jobopening");
  console.log(`  URL: ${NEW_PORTAL_URL.slice(0, 120)}...`);

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
  );

  try {
    // Navigate and wait for network to settle
    await page.goto(NEW_PORTAL_URL, {
      waitUntil: "networkidle2",
      timeout: PAGE_TIMEOUT,
    });

    // Give the SPA extra time to hydrate
    await sleep(5000);

    // Debug: save a screenshot + HTML snapshot
    const debugDir = path.join(__dirname, "../../test-output");
    await page.screenshot({ path: path.join(debugDir, "uncareers_debug.png"), fullPage: false });

    // Try several possible selectors for job cards in the new portal
    const CARD_SELECTORS = [
      // Common SPA job-card patterns
      "[class*='job-card']",
      "[class*='job-opening']",
      "[class*='job-list'] [class*='item']",
      "[class*='vacancy']",
      "[class*='posting']",
      // Angular Material patterns
      "mat-card",
      "mat-list-item",
      // Generic card/row patterns
      ".card",
      "a[href*='jobSearchDescription']",
      "a[href*='jobdesc']",
      "a[href*='jid=']",
      // Table rows with links
      "table tbody tr",
      // New portal specific (discovered via research)
      "[class*='JobResult']",
      "[class*='job-result']",
      "[class*='search-result']",
      "[data-testid*='job']",
      ".job-item",
      ".job-row",
      // Broader fallbacks
      "article",
      ".list-group-item",
    ];

    // First, let's discover what's actually on the page
    const pageInfo = await page.evaluate(() => {
      const body = document.body;
      return {
        title: document.title,
        url: window.location.href,
        bodyTextLength: body?.innerText?.length || 0,
        bodyTextPreview: (body?.innerText || "").slice(0, 2000),
        allLinks: Array.from(document.querySelectorAll("a"))
          .map((a) => ({ text: a.textContent?.trim()?.slice(0, 100), href: a.href }))
          .filter((l) => l.text && l.text.length > 3)
          .slice(0, 100),
        // Collect all unique class names that might be job-related
        jobRelatedElements: (() => {
          const all = document.querySelectorAll("*");
          const classes = new Set();
          for (const el of all) {
            for (const cls of el.classList) {
              if (/job|vacanc|opening|posting|result|card|item|list/i.test(cls)) {
                classes.add(cls);
              }
            }
          }
          return Array.from(classes).slice(0, 50);
        })(),
      };
    });

    console.log(`  Page title: "${pageInfo.title}"`);
    console.log(`  Body text length: ${pageInfo.bodyTextLength} chars`);
    console.log(`  Job-related classes found: ${pageInfo.jobRelatedElements.join(", ") || "(none)"}`);
    console.log(`  Links on page: ${pageInfo.allLinks.length}`);

    // Save debug HTML
    const html = await page.content();
    fs.writeFileSync(path.join(debugDir, "uncareers_debug.html"), html);

    // Try each selector
    let matchedSelector = null;
    for (const sel of CARD_SELECTORS) {
      const count = await page.$$eval(sel, (els) => els.length).catch(() => 0);
      if (count > 0) {
        console.log(`  Selector "${sel}" matched ${count} elements`);
        if (count >= 2) {
          matchedSelector = sel;
          break;
        }
      }
    }

    // UN Careers Angular SPA: job cards are .card elements with text like:
    // "TITLE Job ID : XXXXX Job Network : ... Deadline : DATE View Job Description"
    const cardJobs = await page.evaluate(() => {
      const cards = document.querySelectorAll(".card");
      const results = [];

      for (const card of cards) {
        const text = (card.innerText || "").trim();
        // Skip cards that don't have "Job ID :" — those are filters/navigation
        if (!text.includes("Job ID :")) continue;

        // Extract title: everything before "Job ID :"
        const titleMatch = text.match(/^([\s\S]*?)Job ID\s*:/);
        const title = titleMatch ? titleMatch[1].replace(/\s+/g, " ").trim() : "";

        // Extract Job ID
        const idMatch = text.match(/Job ID\s*:\s*(\d+)/);
        const jobId = idMatch ? idMatch[1] : "";

        // Extract deadline
        const deadlineMatch = text.match(/Deadline\s*:\s*([A-Za-z]+\s+\d{1,2},?\s+\d{4})/);
        const deadline = deadlineMatch ? deadlineMatch[1].trim() : null;

        // Extract department
        const deptMatch = text.match(/Department\/Office\s*:\s*([^D]*?)(?:Date Posted|$)/);
        const department = deptMatch ? deptMatch[1].replace(/\s+/g, " ").trim() : null;

        // Extract duty station
        const stationMatch = text.match(/Duty Station\s*:\s*([^D]*?)(?:Department|$)/);
        const dutyStation = stationMatch ? stationMatch[1].replace(/\s+/g, " ").trim() : "";

        // Extract category and level
        const catMatch = text.match(/Category and Level\s*:\s*([^D]*?)(?:Duty Station|$)/);
        const category = catMatch ? catMatch[1].replace(/\s+/g, " ").trim() : "";

        if (title && title.length > 3 && jobId) {
          const link = `https://careers.un.org/jobSearchDescription/${jobId}?language=en`;
          results.push({ title, jobId, deadline, department, dutyStation, category, link });
        }
      }
      return results;
    });

    if (cardJobs.length > 0) {
      console.log(`  Found ${cardJobs.length} job cards with structured data`);
      return cardJobs.map((j) =>
        makeJob(j.title, j.link, j.deadline, j.department,
          `${j.category} | ${j.dutyStation}`)
      );
    }

    // Fallback: Look for links that point to job descriptions
    const jobLinks = pageInfo.allLinks.filter(
      (l) =>
        l.href &&
        (l.href.includes("jobSearchDescription") ||
          l.href.includes("jobdesc") ||
          l.href.includes("jid=") ||
          l.href.includes("/job/") ||
          l.href.includes("jobopening"))  &&
        l.text.length > 10
    );

    if (jobLinks.length > 0) {
      console.log(`  Found ${jobLinks.length} job description links`);
      return jobLinks.map((l) =>
        makeJob(l.text, l.href, null, null, "")
      );
    }

    // Strategy 1c: Try scrolling to trigger lazy loading
    console.log("  No cards found yet, trying infinite scroll...");
    for (let i = 0; i < MAX_SCROLL_ATTEMPTS; i++) {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await sleep(1500);
    }

    // Re-check after scrolling
    const postScrollLinks = await page.evaluate(() => {
      return Array.from(document.querySelectorAll("a"))
        .map((a) => ({ text: a.textContent?.trim()?.slice(0, 200), href: a.href }))
        .filter(
          (l) =>
            l.text &&
            l.text.length > 10 &&
            (l.href.includes("jobSearchDescription") ||
              l.href.includes("jobdesc") ||
              l.href.includes("jid=") ||
              l.href.includes("/job/"))
        );
    });

    if (postScrollLinks.length > 0) {
      console.log(`  Found ${postScrollLinks.length} job links after scrolling`);
      return postScrollLinks.map((l) =>
        makeJob(l.text, l.href, null, null, "")
      );
    }

    // Strategy 1d: Broad extraction — any meaningful links/text blocks
    console.log("  Attempting broad text extraction...");
    const broadJobs = await page.evaluate(() => {
      const results = [];
      // Look for any repeating structure that might be job listings
      const allElements = document.querySelectorAll(
        "div, li, tr, article, section"
      );
      for (const el of allElements) {
        const text = el.innerText?.trim() || "";
        const links = el.querySelectorAll("a");
        // A job listing likely has: a link with a title, and some text about deadline/dept
        if (
          links.length >= 1 &&
          text.length > 30 &&
          text.length < 1000 &&
          el.children.length >= 2
        ) {
          const link = links[0];
          const title = link.textContent?.trim();
          const href = link.href;
          // Check if this looks like a job entry (not navigation)
          if (
            title &&
            title.length > 10 &&
            title.length < 200 &&
            !title.match(/^(home|about|sign|log|menu|search|filter|sort|page|next|prev|back|contact|faq)/i)
          ) {
            // Try to find deadline text (dates in various formats)
            const dateMatch = text.match(
              /(\d{1,2}[\s\-\/]\w{3,9}[\s\-\/]\d{4}|\d{4}-\d{2}-\d{2}|\w{3,9}\s+\d{1,2},?\s+\d{4})/
            );
            const deadline = dateMatch ? dateMatch[1] : null;

            // Avoid duplicates
            if (!results.find((r) => r.title === title)) {
              results.push({ title, href, deadline, text: text.slice(0, 500) });
            }
          }
        }
      }
      return results;
    });

    if (broadJobs.length > 0) {
      console.log(`  Broad extraction found ${broadJobs.length} potential jobs`);
      return broadJobs.map((j) =>
        makeJob(j.title, j.href, j.deadline, null, j.text)
      );
    }

    console.log("  Strategy 1 yielded 0 results");
    return [];
  } catch (err) {
    console.log(`  Strategy 1 error: ${err.message}`);
    return [];
  } finally {
    await page.close();
  }
}

async function extractFromSelector(page, selector) {
  return page.$$eval(selector, (elements) => {
    return elements
      .map((el) => {
        const linkEl = el.tagName === "A" ? el : el.querySelector("a");
        const title = linkEl?.textContent?.trim() || el.querySelector("[class*='title'], h2, h3, h4, strong")?.textContent?.trim() || "";
        const href = linkEl?.href || "";
        // Look for date patterns
        const text = el.innerText || "";
        const dateMatch = text.match(
          /(\d{1,2}[\s\-\/]\w{3,9}[\s\-\/]\d{4}|\d{4}-\d{2}-\d{2}|\w{3,9}\s+\d{1,2},?\s+\d{4})/
        );
        const deadline = dateMatch ? dateMatch[1] : null;
        // Look for department/organization text
        const deptEl = el.querySelector("[class*='dept'], [class*='organ'], [class*='agency']");
        const department = deptEl?.textContent?.trim() || null;

        return { title, href, deadline, department, text: text.slice(0, 500) };
      })
      .filter((j) => j.title && j.title.length > 5);
  }).then((items) =>
    items.map((j) =>
      makeJob(j.title, j.href, j.deadline, j.department, j.text)
    )
  );
}

// ── Strategy 2: Legacy Portal ──────────────────────────────────────────────────

async function scrapeLegacyPortal(browser) {
  console.log("  [Strategy 2] Legacy portal: careers.un.org/lbw/home.aspx");

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
  );

  try {
    await page.goto(LEGACY_URL, {
      waitUntil: "networkidle2",
      timeout: PAGE_TIMEOUT,
    });

    await sleep(3000);

    // The legacy portal uses ASP.NET with table-based layouts
    const jobs = await page.evaluate(() => {
      const results = [];

      // Look for the results table
      const rows = document.querySelectorAll("table tr, .tblContainer tr");
      for (const row of rows) {
        const cells = row.querySelectorAll("td");
        const link = row.querySelector("a");
        if (!link || cells.length < 2) continue;

        const title = link.textContent?.trim();
        const href = link.href;
        if (!title || title.length < 10) continue;
        if (/^(sort|filter|page|next|prev)/i.test(title)) continue;

        // Try to extract deadline from cells
        let deadline = null;
        for (const cell of cells) {
          const text = cell.textContent?.trim() || "";
          const dateMatch = text.match(
            /(\d{1,2}[\s\-\/]\w{3,9}[\s\-\/]\d{4}|\d{4}-\d{2}-\d{2})/
          );
          if (dateMatch) {
            deadline = dateMatch[1];
            break;
          }
        }

        // Extract department if available
        const department = cells.length > 3 ? cells[3]?.textContent?.trim() : null;

        if (!results.find((r) => r.title === title)) {
          results.push({ title, href, deadline, department });
        }
      }

      // Also try generic link extraction for non-table layouts
      if (results.length === 0) {
        const allLinks = document.querySelectorAll("a");
        for (const a of allLinks) {
          const title = a.textContent?.trim();
          const href = a.href;
          if (
            title &&
            title.length > 15 &&
            title.length < 200 &&
            !title.match(/^(home|about|sign|log|menu|search|filter|sort|page|next|prev|back|contact|faq)/i) &&
            (href.includes("lbw") || href.includes("vacancy") || href.includes("jobDetail"))
          ) {
            if (!results.find((r) => r.title === title)) {
              results.push({ title, href, deadline: null, department: null });
            }
          }
        }
      }

      return results;
    });

    if (jobs.length > 0) {
      console.log(`  Legacy portal found ${jobs.length} jobs`);
      return jobs.map((j) =>
        makeJob(j.title, j.href, j.deadline, j.department, "")
      );
    }

    // Check if the legacy portal redirected to the new one
    const currentUrl = page.url();
    if (currentUrl.includes("jobopening")) {
      console.log("  Legacy portal redirected to new portal (already tried)");
    } else {
      console.log(`  Legacy portal at ${currentUrl} returned 0 jobs`);
    }

    return [];
  } catch (err) {
    console.log(`  Strategy 2 error: ${err.message}`);
    return [];
  } finally {
    await page.close();
  }
}

// ── Strategy 3: Intercept XHR/API calls ────────────────────────────────────────

async function scrapeViaApiIntercept(browser) {
  console.log("  [Strategy 3] Intercepting API calls from new portal...");

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
  );

  const capturedResponses = [];

  // Intercept all XHR/fetch responses that might contain job data
  page.on("response", async (response) => {
    const url = response.url();
    const contentType = response.headers()["content-type"] || "";
    if (
      contentType.includes("json") &&
      (url.includes("job") ||
        url.includes("search") ||
        url.includes("opening") ||
        url.includes("vacancy") ||
        url.includes("api"))
    ) {
      try {
        const json = await response.json();
        capturedResponses.push({ url, data: json });
      } catch {
        // Not valid JSON, skip
      }
    }
  });

  try {
    await page.goto(NEW_PORTAL_URL, {
      waitUntil: "networkidle2",
      timeout: PAGE_TIMEOUT,
    });
    await sleep(5000);

    console.log(`  Captured ${capturedResponses.length} JSON responses`);

    // Look through captured responses for job data
    for (const resp of capturedResponses) {
      console.log(`  API: ${resp.url.slice(0, 120)}`);
      const data = resp.data;

      // Try common API response shapes
      const jobArray =
        data?.jobs ||
        data?.results ||
        data?.items ||
        data?.jobOpenings ||
        data?.jobPostings ||
        data?.data?.jobs ||
        data?.data?.results ||
        data?.data?.items ||
        data?.d?.results ||
        data?.value ||
        (Array.isArray(data) ? data : null);

      if (Array.isArray(jobArray) && jobArray.length > 0) {
        console.log(`  Found ${jobArray.length} items in API response`);

        // Try to map the data
        const jobs = jobArray
          .map((item) => {
            const title =
              item.title ||
              item.Title ||
              item.name ||
              item.Name ||
              item.jobTitle ||
              item.JobTitle ||
              item.position ||
              item.Position ||
              "";

            const link =
              item.url ||
              item.Url ||
              item.link ||
              item.Link ||
              item.detailUrl ||
              item.jobUrl ||
              (item.id
                ? `https://careers.un.org/jobSearchDescription/${item.id}?language=en`
                : (item.Id
                    ? `https://careers.un.org/jobSearchDescription/${item.Id}?language=en`
                    : ""));

            const deadline =
              item.deadline ||
              item.Deadline ||
              item.closingDate ||
              item.ClosingDate ||
              item.endDate ||
              item.EndDate ||
              null;

            const department =
              item.department ||
              item.Department ||
              item.dept ||
              item.organization ||
              item.Organization ||
              item.agency ||
              null;

            const description =
              item.description ||
              item.Description ||
              item.summary ||
              item.Summary ||
              "";

            return { title, link, deadline, department, description };
          })
          .filter((j) => j.title && j.title.length > 3);

        if (jobs.length > 0) {
          return jobs.map((j) =>
            makeJob(j.title, j.link, j.deadline, j.department, j.description)
          );
        }
      }
    }

    // Save captured responses for debugging
    const debugPath = path.join(
      __dirname,
      "../../test-output/uncareers_api_debug.json"
    );
    fs.writeFileSync(
      debugPath,
      JSON.stringify(
        capturedResponses.map((r) => ({
          url: r.url,
          dataPreview: JSON.stringify(r.data).slice(0, 500),
        })),
        null,
        2
      )
    );
    console.log(`  API debug saved to ${debugPath}`);

    console.log("  Strategy 3 yielded 0 results");
    return [];
  } catch (err) {
    console.log(`  Strategy 3 error: ${err.message}`);
    return [];
  } finally {
    await page.close();
  }
}

// ── Strategy 4: ethiopia.un.org jobs page ──────────────────────────────────────

async function scrapeEthiopiaUNPage(browser) {
  console.log("  [Strategy 4] ethiopia.un.org/en/jobs");

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
  );

  try {
    await page.goto("https://ethiopia.un.org/en/jobs", {
      waitUntil: "networkidle2",
      timeout: PAGE_TIMEOUT,
    });

    await sleep(3000);

    const jobs = await page.evaluate(() => {
      const results = [];
      // Drupal / UN country pages typically use view rows
      const selectors = [
        ".views-row",
        ".view-content .item-list li",
        ".node--type-job",
        "article",
        ".field-content a",
        ".views-field-title a",
        "table tbody tr",
        ".card",
        "li a",
      ];

      for (const sel of selectors) {
        const elements = document.querySelectorAll(sel);
        if (elements.length < 2) continue;

        for (const el of elements) {
          const linkEl = el.tagName === "A" ? el : el.querySelector("a");
          if (!linkEl) continue;
          const title = linkEl.textContent?.trim();
          const href = linkEl.href;
          if (!title || title.length < 10 || title.length > 300) continue;
          if (/^(home|about|sign|log|menu|search|filter|sort)/i.test(title)) continue;

          const text = el.innerText || "";
          const dateMatch = text.match(
            /(\d{1,2}[\s\-\/]\w{3,9}[\s\-\/]\d{4}|\d{4}-\d{2}-\d{2}|\w{3,9}\s+\d{1,2},?\s+\d{4})/
          );

          if (!results.find((r) => r.title === title)) {
            results.push({
              title,
              href,
              deadline: dateMatch ? dateMatch[1] : null,
            });
          }
        }

        if (results.length >= 3) break; // found a good selector
      }

      return results;
    });

    if (jobs.length > 0) {
      console.log(`  ethiopia.un.org found ${jobs.length} jobs`);
      return jobs.map((j) =>
        makeJob(j.title, j.href, j.deadline, null, "")
      );
    }

    console.log("  Strategy 4 yielded 0 results");
    return [];
  } catch (err) {
    console.log(`  Strategy 4 error: ${err.message}`);
    return [];
  } finally {
    await page.close();
  }
}

// ── Utilities ──────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function dedup(jobs) {
  const seen = new Set();
  return jobs.filter((j) => {
    const key = j.title.toLowerCase().replace(/\s+/g, " ").trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Fetch full job description from the UN Careers job detail page.
 * The detail page URL format: https://careers.un.org/jobSearchDescription/{jobId}?language=en
 */
async function fetchJobDetails(browser, jobs) {
  if (jobs.length === 0) return jobs;

  console.log(`\n📄 Fetching detail pages for ${jobs.length} UN jobs...`);
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
  );

  for (let i = 0; i < jobs.length; i++) {
    const job = jobs[i];
    const url = job.source_url;

    // Only visit detail pages that are actual job description URLs
    if (!url || !url.includes("jobSearchDescription")) continue;

    console.log(`   [${i + 1}/${jobs.length}] ${job.title.slice(0, 60)}...`);

    try {
      await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });
      await sleep(3000);

      // Extract full description from the detail page
      const detail = await page.evaluate(() => {
        const result = { description: "", responsibilities: "", competencies: "", education: "", experience: "" };

        // UN Careers detail pages have sections with headings
        const body = document.body.innerText || "";

        // Try to find structured sections
        const sections = {
          "Org. Setting and Reporting": "",
          "Responsibilities": "",
          "Competencies": "",
          "Education": "",
          "Work Experience": "",
          "Languages": "",
          "Assessment": "",
          "Special Notice": "",
        };

        for (const [heading] of Object.entries(sections)) {
          const regex = new RegExp(`${heading}[\\s\\S]*?(?=(?:${Object.keys(sections).join("|")}|$))`, "i");
          const match = body.match(regex);
          if (match) {
            sections[heading] = match[0].replace(/\s+/g, " ").trim();
          }
        }

        // Build full description from available sections
        const parts = [];
        if (sections["Org. Setting and Reporting"]) parts.push(sections["Org. Setting and Reporting"]);
        if (sections["Responsibilities"]) parts.push(sections["Responsibilities"]);
        if (sections["Competencies"]) parts.push(sections["Competencies"]);
        if (sections["Education"]) parts.push(sections["Education"]);
        if (sections["Work Experience"]) parts.push(sections["Work Experience"]);
        if (sections["Languages"]) parts.push(sections["Languages"]);

        result.description = parts.join("\n\n");

        // If structured extraction didn't work well, use the full body text
        if (result.description.length < 200) {
          // Remove obvious navigation/header text
          let text = body;
          const contentStart = text.search(/(?:Org\.\s*Setting|Responsibilities|Job Opening|Posting Title)/i);
          if (contentStart > 0) text = text.slice(contentStart);

          const contentEnd = text.search(/(?:United Nations Considerations|No Fee|THE UNITED NATIONS DOES NOT)/i);
          if (contentEnd > 0) text = text.slice(0, contentEnd);

          result.description = text.replace(/\s+/g, " ").trim();
        }

        // Also try to get deadline if not already set
        const deadlineMatch = body.match(/Deadline\s*:?\s*([A-Za-z]+\s+\d{1,2},?\s+\d{4})/i);
        result.deadline = deadlineMatch ? deadlineMatch[1].trim() : null;

        // Job level
        const levelMatch = body.match(/(?:Job Level|Category and Level)\s*:?\s*([^\n]+)/i);
        result.level = levelMatch ? levelMatch[1].trim() : null;

        return result;
      });

      if (detail.description && detail.description.length > 100) {
        job.description = detail.description;
        if (detail.deadline && !job.deadline) job.deadline = detail.deadline;
        if (detail.level) job.level = detail.level;
        console.log(`     ✅ ${detail.description.length} chars`);
      } else {
        console.log(`     ⚠️ Detail page had insufficient content`);
      }
    } catch (err) {
      console.log(`     ❌ Failed: ${err.message}`);
    }

    // Polite delay between pages
    await sleep(1500);
  }

  await page.close();
  return jobs;
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  console.log("UN Careers: Starting Puppeteer scraper...\n");

  // Ensure output directory exists
  const outDir = path.dirname(OUTPUT_PATH);
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const browser = await puppeteer.launch({
    headless: "new",
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-blink-features=AutomationControlled",
    ],
  });

  let allJobs = [];

  try {
    // Strategy 1: New portal (DOM scraping)
    const newPortalJobs = await scrapeNewPortal(browser);
    console.log(`  => Strategy 1 result: ${newPortalJobs.length} jobs\n`);
    allJobs.push(...newPortalJobs);

    // Strategy 2: Legacy portal
    if (allJobs.length === 0) {
      const legacyJobs = await scrapeLegacyPortal(browser);
      console.log(`  => Strategy 2 result: ${legacyJobs.length} jobs\n`);
      allJobs.push(...legacyJobs);
    }

    // Strategy 3: API interception (if DOM scraping didn't work)
    if (allJobs.length === 0) {
      const apiJobs = await scrapeViaApiIntercept(browser);
      console.log(`  => Strategy 3 result: ${apiJobs.length} jobs\n`);
      allJobs.push(...apiJobs);
    }

    // Strategy 4: ethiopia.un.org (Drupal page, likely easier to scrape)
    if (allJobs.length === 0) {
      const ethJobs = await scrapeEthiopiaUNPage(browser);
      console.log(`  => Strategy 4 result: ${ethJobs.length} jobs\n`);
      allJobs.push(...ethJobs);
    }

    // Deduplicate before fetching details (avoid duplicate detail fetches)
    allJobs = dedup(allJobs);

    // Fetch full descriptions from detail pages
    try {
      allJobs = await fetchJobDetails(browser, allJobs);
    } catch (err) {
      console.log(`  Detail fetching error: ${err.message}`);
    }
  } finally {
    await browser.close();
  }

  // Write output
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(allJobs, null, 2));

  console.log(`\nUN Careers: Found ${allJobs.length} opportunities total`);
  if (allJobs.length > 0) {
    console.log(`  Sample: "${allJobs[0].title}"`);
    console.log(`  Link:   ${allJobs[0].source_url}`);
  }
  console.log(`  Output: ${OUTPUT_PATH}`);
}

main().catch((err) => {
  console.error(`UN Careers scraper failed: ${err.message}`);
  process.exit(1);
});
