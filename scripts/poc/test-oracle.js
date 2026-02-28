/**
 * PoC Scraper: Oracle HCM (NRC - Norwegian Refugee Council)
 * Source: ekum.fa.em2.oraclecloud.com, estm.fa.em2.oraclecloud.com
 * Method: Puppeteer (Oracle HCM Candidate Experience is fully JS-rendered via Oracle JET)
 * Expected: ~28 combined jobs
 */
const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer");

const ORACLE_ORGS = [
  {
    name: "NRC (Norwegian Refugee Council)",
    careersUrl:
      "https://ekum.fa.em2.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_1001/requisitions",
    baseUrl: "https://ekum.fa.em2.oraclecloud.com",
  },
  // ESTM instance removed — estm.fa.em2.oraclecloud.com resolves to UN Women website, not an Oracle HCM jobs portal
];

/**
 * Wait for Oracle JET / Candidate Experience job list to render.
 * Oracle HCM uses <oj-module>, Knockout.js data-bind, and custom web components.
 * The job list can appear under various selectors depending on the Oracle Cloud version.
 */
async function waitForJobList(page, timeoutMs = 45000) {
  const selectors = [
    // Oracle JET / Candidate Experience common selectors
    'a[href*="requisition"]',
    'a[href*="job/"]',
    '[data-bind*="requisition"]',
    ".job-list-item",
    ".job-card",
    '[class*="requisition"]',
    '[class*="job-list"]',
    // Oracle JET module content
    "oj-module",
    // Knockout-rendered list items inside the main content
    '[role="list"] [role="listitem"]',
    '[class*="ListItem"]',
    // Generic content containers that Oracle uses
    '[data-automation-id*="job"]',
    '[class*="card"]',
  ];

  for (const selector of selectors) {
    try {
      await page.waitForSelector(selector, { timeout: 5000 });
      return selector;
    } catch {
      // Try next selector
    }
  }

  // Final fallback: wait for network to be idle, meaning the page has loaded
  console.log("   No known selector found, waiting for network idle...");
  try {
    await page.waitForNetworkIdle({ idleTime: 3000, timeout: timeoutMs });
  } catch {
    // Proceed anyway -- we will try to extract what we can
  }
  return null;
}

/**
 * Attempt to type "Ethiopia" in the search box if one exists.
 * Oracle HCM search inputs can be <input>, <oj-input-text>, or custom elements.
 */
async function trySearchEthiopia(page) {
  const searchSelectors = [
    'input[placeholder*="earch"]',
    'input[placeholder*="eyword"]',
    'input[aria-label*="earch"]',
    'input[aria-label*="eyword"]',
    'input[type="search"]',
    'input[type="text"]',
    "oj-input-text input",
    'input[id*="search"]',
    'input[id*="keyword"]',
    '[data-automation-id*="search"] input',
  ];

  for (const selector of searchSelectors) {
    try {
      const input = await page.$(selector);
      if (input) {
        // Check if input is visible
        const isVisible = await input.evaluate((el) => {
          const rect = el.getBoundingClientRect();
          const style = window.getComputedStyle(el);
          return (
            rect.width > 0 &&
            rect.height > 0 &&
            style.display !== "none" &&
            style.visibility !== "hidden"
          );
        });
        if (!isVisible) continue;

        console.log(`   Found search input: ${selector}`);
        await input.click({ clickCount: 3 }); // Select all existing text
        await input.type("Ethiopia", { delay: 80 });

        // Try pressing Enter or clicking a search button
        await page.keyboard.press("Enter");
        console.log("   Typed 'Ethiopia' and pressed Enter");

        // Wait for results to update
        await new Promise((r) => setTimeout(r, 4000));
        return true;
      }
    } catch {
      // Try next
    }
  }

  console.log("   No search input found, will scrape all visible jobs");
  return false;
}

/**
 * Oracle HCM REST API intercept approach: listen for XHR responses that contain
 * job requisition data. Oracle Candidate Experience makes internal REST calls
 * to fetch job data even though the page is JS-rendered.
 */
async function scrapeWithApiIntercept(page, org) {
  const interceptedJobs = [];

  // Listen for responses that look like Oracle HCM job API calls
  page.on("response", async (response) => {
    const url = response.url();
    if (
      (url.includes("recruitingCEJobRequisitions") ||
        url.includes("requisitions") ||
        url.includes("jobRequisition")) &&
      response.status() === 200
    ) {
      try {
        const contentType = response.headers()["content-type"] || "";
        if (contentType.includes("json")) {
          const data = await response.json();
          if (data.items && Array.isArray(data.items)) {
            console.log(
              `   Intercepted API response with ${data.items.length} items`
            );
            for (const item of data.items) {
              interceptedJobs.push(item);
            }
          }
        }
      } catch {
        // Response may not be JSON
      }
    }
  });

  return interceptedJobs;
}

/**
 * Extract job data from the rendered DOM.
 * Oracle HCM Candidate Experience renders job cards with links to individual requisitions.
 */
async function extractJobsFromDOM(page, org) {
  return await page.evaluate((orgData) => {
    const jobs = [];
    const seen = new Set();

    // Strategy 1: Find all links containing "requisition" or "job/"
    const links = document.querySelectorAll(
      'a[href*="requisition"], a[href*="job/"], a[href*="Job/"]'
    );
    for (const link of links) {
      const title = (link.textContent || "").trim();
      const href = link.getAttribute("href") || "";
      if (title && title.length > 3 && !seen.has(href)) {
        seen.add(href);

        // Try to find sibling/parent elements with location, deadline info
        const card =
          link.closest('[class*="card"]') ||
          link.closest('[class*="list-item"]') ||
          link.closest('[class*="ListItem"]') ||
          link.closest('[role="listitem"]') ||
          link.closest("li") ||
          link.closest("tr") ||
          link.parentElement?.parentElement;

        let location = "";
        let deadline = "";
        let description = "";

        if (card) {
          const allText = card.innerText || "";
          const lines = allText.split("\n").map((l) => l.trim()).filter(Boolean);

          // Look for location patterns
          for (const line of lines) {
            if (
              line !== title &&
              (line.match(
                /ethiopia|addis|nairobi|kenya|africa|remote|global|multiple/i
              ) ||
                line.match(/location/i))
            ) {
              location = line.replace(/^location:?\s*/i, "").trim();
            }
            // Look for date patterns (DD-Mon-YYYY, YYYY-MM-DD, Mon DD YYYY, etc.)
            if (
              line.match(
                /\d{1,2}[\-\/]\w{3}[\-\/]\d{4}|\d{4}[\-\/]\d{2}[\-\/]\d{2}|\w{3}\s+\d{1,2},?\s+\d{4}/
              )
            ) {
              if (!deadline) {
                deadline = line;
              }
            }
          }

          // Collect remaining text as description
          description = lines
            .filter((l) => l !== title && l !== location && l !== deadline)
            .join(" | ")
            .slice(0, 500);
        }

        const fullUrl = href.startsWith("http")
          ? href
          : `${orgData.baseUrl}${href.startsWith("/") ? "" : "/"}${href}`;

        jobs.push({
          title,
          description,
          location,
          deadline: deadline || null,
          source_url: fullUrl,
        });
      }
    }

    // Strategy 2: If no requisition links found, look for other job-like elements
    if (jobs.length === 0) {
      // Look for elements with data-bind containing requisition text
      const dataBound = document.querySelectorAll(
        '[data-bind*="Title"], [data-bind*="title"], [data-bind*="requisition"]'
      );
      for (const el of dataBound) {
        const title = (el.textContent || "").trim();
        if (title && title.length > 3 && !seen.has(title)) {
          seen.add(title);
          const link = el.closest("a") || el.querySelector("a");
          const href = link ? link.getAttribute("href") || "" : "";
          const fullUrl = href
            ? href.startsWith("http")
              ? href
              : `${orgData.baseUrl}${href.startsWith("/") ? "" : "/"}${href}`
            : orgData.careersUrl;

          jobs.push({
            title,
            description: "",
            location: "",
            deadline: null,
            source_url: fullUrl,
          });
        }
      }
    }

    // Strategy 3: Look for any heading elements inside list-like containers
    if (jobs.length === 0) {
      const containers = document.querySelectorAll(
        '[role="list"], [class*="list"], ul, ol'
      );
      for (const container of containers) {
        const items = container.querySelectorAll(
          '[role="listitem"], li, [class*="item"]'
        );
        for (const item of items) {
          const headings = item.querySelectorAll("h1, h2, h3, h4, h5, h6, a, strong, b");
          for (const h of headings) {
            const title = (h.textContent || "").trim();
            if (
              title &&
              title.length > 5 &&
              title.length < 200 &&
              !seen.has(title) &&
              !title.match(/^(menu|nav|filter|sort|search|home|sign|log)/i)
            ) {
              seen.add(title);
              const link = h.closest("a") || h.querySelector("a") || item.querySelector("a");
              const href = link ? link.getAttribute("href") || "" : "";
              const fullUrl = href
                ? href.startsWith("http")
                  ? href
                  : `${orgData.baseUrl}${href.startsWith("/") ? "" : "/"}${href}`
                : orgData.careersUrl;

              jobs.push({
                title,
                description: "",
                location: "",
                deadline: null,
                source_url: fullUrl,
              });
            }
          }
        }
      }
    }

    return jobs;
  }, org);
}

/**
 * Scrape a single Oracle HCM org using Puppeteer.
 */
async function scrapeOracle(browser, org) {
  console.log(`\n--- ${org.name} ---`);
  console.log(`   URL: ${org.careersUrl}`);

  const page = await browser.newPage();

  // Set a realistic viewport and user agent
  await page.setViewport({ width: 1366, height: 900 });
  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36"
  );

  // Set up API response interception
  const interceptedJobs = await scrapeWithApiIntercept(page, org);

  try {
    // Navigate to the careers page with a generous timeout
    console.log("   Navigating to Oracle Candidate Experience portal...");
    await page.goto(org.careersUrl, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });

    // Oracle pages take time to fully render -- wait for the JET framework to load
    console.log("   Waiting for Oracle JET framework to load...");
    await new Promise((r) => setTimeout(r, 5000));

    // Wait for job list to appear
    const matchedSelector = await waitForJobList(page, 45000);
    if (matchedSelector) {
      console.log(`   Job list detected via: ${matchedSelector}`);
    }

    // Give Oracle time to finish rendering all job cards
    await new Promise((r) => setTimeout(r, 3000));

    // Try to search for "Ethiopia" in the search box
    const searched = await trySearchEthiopia(page);
    if (searched) {
      // Wait for search results to load
      console.log("   Waiting for search results to update...");
      await new Promise((r) => setTimeout(r, 5000));
      await waitForJobList(page, 20000);
    }

    // Save debug screenshot
    const debugDir = path.join(__dirname, "../../test-output");
    const orgSlug = org.name.replace(/[^a-z0-9]/gi, "_").toLowerCase();
    const screenshotPath = path.join(debugDir, `oracle_debug_${orgSlug}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`   Debug screenshot saved: ${screenshotPath}`);

    // Try to extract jobs from the DOM
    let jobs = await extractJobsFromDOM(page, org);
    console.log(`   DOM extraction: ${jobs.length} jobs found`);

    // If DOM extraction found nothing, check intercepted API responses
    if (jobs.length === 0 && interceptedJobs.length > 0) {
      console.log(
        `   Using ${interceptedJobs.length} jobs from intercepted API responses`
      );
      jobs = interceptedJobs.map((item) => ({
        title:
          item.Title ||
          item.RequisitionTitle ||
          item.title ||
          item.requisitionTitle ||
          "",
        description:
          item.ShortDescriptionStr ||
          item.shortDescriptionStr ||
          item.description ||
          "",
        location:
          item.PrimaryLocation ||
          item.primaryLocation ||
          item.LocationsText ||
          "",
        deadline:
          item.ExternalCloseDate ||
          item.externalCloseDate ||
          item.ClosingDate ||
          null,
        source_url: item.Id
          ? `${org.baseUrl}/hcmUI/CandidateExperience/en/sites/CX_1001/requisitions/${item.Id}`
          : org.careersUrl,
      }));
    }

    // If still nothing, try scrolling down to trigger lazy loading
    if (jobs.length === 0) {
      console.log("   Trying scroll to trigger lazy-loaded content...");
      for (let i = 0; i < 5; i++) {
        await page.evaluate(() =>
          window.scrollTo(0, document.body.scrollHeight)
        );
        await new Promise((r) => setTimeout(r, 2000));
      }
      jobs = await extractJobsFromDOM(page, org);
      console.log(`   After scrolling: ${jobs.length} jobs found`);
    }

    // If still nothing, dump the page HTML for debugging
    if (jobs.length === 0) {
      const htmlPath = path.join(debugDir, `oracle_debug_${orgSlug}.html`);
      const html = await page.content();
      fs.writeFileSync(htmlPath, html);
      console.log(`   0 jobs found. Debug HTML saved: ${htmlPath}`);
      console.log(
        "   TIP: Inspect the HTML file to find the correct selectors for this Oracle instance."
      );
    }

    // Format jobs to the standard output schema
    const formattedJobs = jobs.map((job) => ({
      title: job.title || "",
      description: job.description || "",
      deadline: job.deadline || null,
      organization: org.name,
      country: "Ethiopia",
      source_url: job.source_url || org.careersUrl,
      source_domain: new URL(org.baseUrl).hostname,
      type: "job",
      scraped_at: new Date().toISOString(),
    }));

    // Filter out navigation elements, menu items, and non-job entries
    const NAV_PATTERNS = /^(ABOUT|About Us|WHAT WE DO|Directorate|Governance|Guiding Documents|Accountability|Programme Implementation|Leadership and Political Participation|Economic Empowerment|Ending Violence|Humanitarian Action|HIV and AIDS|SDGs|CSW|Beijing|Generation Equality|Annual Report|Latest|In Focus|News|Press|Speeches|Stories|Multimedia|Videos|Photos|Social Media|Audit|Executive Board|UN Trust Fund|Fund for Gender|Innovation|Research|Partnership|Locations|Menu|Contact|Home|Login|Sign|Search|Filter|Sort|Page|Next|Prev|Back|FAQ|Help|Terms|Privacy|Cookie|Legal|Disclaimer|Careers|Our Work|Who We Are|Get Involved|About UN Women)$/i;
    const filteredJobs = formattedJobs.filter((job) => {
      // Reject very short titles (likely nav items)
      if (!job.title || job.title.trim().length < 5) return false;
      // Reject titles that match known navigation patterns
      if (NAV_PATTERNS.test(job.title.trim())) return false;
      // Reject multi-line titles (DOM parsing artifacts)
      if (job.title.includes("\n") && job.title.trim().split("\n").length > 3) return false;
      return true;
    });

    console.log(`   After filtering: ${filteredJobs.length} real jobs (removed ${formattedJobs.length - filteredJobs.length} nav elements)`);
    return filteredJobs;
  } catch (err) {
    console.error(`   Error scraping ${org.name}: ${err.message}`);

    // Save debug info on error
    try {
      const debugDir = path.join(__dirname, "../../test-output");
      const orgSlug = org.name.replace(/[^a-z0-9]/gi, "_").toLowerCase();
      await page.screenshot({
        path: path.join(debugDir, `oracle_error_${orgSlug}.png`),
        fullPage: true,
      });
      const html = await page.content();
      fs.writeFileSync(
        path.join(debugDir, `oracle_error_${orgSlug}.html`),
        html
      );
      console.log("   Error debug files saved.");
    } catch {
      // Ignore screenshot errors
    }

    return [];
  } finally {
    await page.close();
  }
}

/**
 * Visit individual Oracle HCM requisition pages and extract full job descriptions.
 * Oracle Candidate Experience detail pages contain the full job description,
 * qualifications, responsibilities, etc.
 */
async function fetchRequisitionDetails(browser, jobs) {
  const jobsNeedingDetail = jobs.filter(
    (j) => j.source_url && j.source_url.includes("requisition") && (!j.description || j.description.length < 100)
  );

  if (jobsNeedingDetail.length === 0) return jobs;

  console.log(`\n📄 Fetching detail pages for ${jobsNeedingDetail.length} Oracle requisitions...`);

  const page = await browser.newPage();
  await page.setViewport({ width: 1366, height: 900 });
  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36"
  );

  for (let i = 0; i < jobsNeedingDetail.length; i++) {
    const job = jobsNeedingDetail[i];
    console.log(`   [${i + 1}/${jobsNeedingDetail.length}] ${job.title.slice(0, 60)}...`);

    try {
      await page.goto(job.source_url, { waitUntil: "domcontentloaded", timeout: 30000 });
      // Oracle JET takes time to render
      await new Promise((r) => setTimeout(r, 5000));

      // Wait for content to load
      try {
        await page.waitForSelector('[class*="description"], [class*="requisition"], [data-bind], article', { timeout: 10000 });
      } catch {
        // Proceed with what's available
      }

      await new Promise((r) => setTimeout(r, 2000));

      const detail = await page.evaluate(() => {
        const body = document.body.innerText || "";
        const result = { description: "", qualifications: "", location: "", deadline: "" };

        // Oracle Candidate Experience detail pages have structured sections
        // Look for common section patterns
        const sectionHeaders = [
          "Description",
          "Job Description",
          "Responsibilities",
          "Key Responsibilities",
          "Qualifications",
          "Required Qualifications",
          "Desired Qualifications",
          "Requirements",
          "Education",
          "Experience",
          "Skills",
          "About Us",
          "About NRC",
          "What we offer",
          "What You Will Do",
          "What You Will Bring",
          "Competencies",
          "Generic professional competencies",
          "Context/Background",
        ];

        const parts = [];
        for (const header of sectionHeaders) {
          const escapedHeader = header.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          const regex = new RegExp(
            `(${escapedHeader}[\\s\\S]*?)(?=${sectionHeaders.map((h) => h.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")}|$)`,
            "i"
          );
          const match = body.match(regex);
          if (match && match[1].trim().length > 30) {
            parts.push(match[1].replace(/\s+/g, " ").trim());
          }
        }

        if (parts.length > 0) {
          result.description = parts.join("\n\n");
        }

        // Fallback: use full page text
        if (!result.description || result.description.length < 100) {
          let text = body;
          // Skip navigation/header
          const contentStart = text.search(/(?:Description|Responsibilities|About|Context|Background|What You)/i);
          if (contentStart > 0) text = text.slice(contentStart);

          // Remove footer
          const footerStart = text.search(/(?:Apply Now|Submit|Cookie|Privacy|© \d{4}|Back to search)/i);
          if (footerStart > 200) text = text.slice(0, footerStart);

          result.description = text.replace(/\s+/g, " ").trim();
        }

        // Extract location
        const locMatch = body.match(/(?:Location|Duty Station)\s*:?\s*([^\n]+)/i);
        if (locMatch) result.location = locMatch[1].trim();

        // Extract deadline
        const deadlineMatch = body.match(/(?:Closing Date|Deadline|Apply By)\s*:?\s*([^\n]+)/i);
        if (deadlineMatch) result.deadline = deadlineMatch[1].trim();

        if (result.description.length > 5000) {
          result.description = result.description.slice(0, 5000) + "...";
        }

        return result;
      });

      if (detail.description && detail.description.length > 80) {
        job.description = detail.description;
        if (detail.deadline) job.deadline = detail.deadline;
        if (detail.location) job.location = detail.location;
        console.log(`     ✅ ${detail.description.length} chars`);
      } else {
        console.log(`     ⚠️ Insufficient content`);
      }
    } catch (err) {
      console.log(`     ❌ ${err.message}`);
    }

    await new Promise((r) => setTimeout(r, 2000));
  }

  await page.close();
  return jobs;
}

async function main() {
  console.log("Oracle HCM Scraper (Puppeteer)");
  console.log("================================\n");

  // Ensure output directory exists
  const outDir = path.join(__dirname, "../../test-output");
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: "new",
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--window-size=1366,900",
      ],
    });

    const allJobs = [];

    for (const org of ORACLE_ORGS) {
      const jobs = await scrapeOracle(browser, org);
      allJobs.push(...jobs);
      console.log(`   ${org.name}: ${jobs.length} jobs found`);
      if (jobs.length > 0) {
        console.log(`   Sample: "${jobs[0].title}"`);
      }

      // Pause between orgs to be polite
      await new Promise((r) => setTimeout(r, 2000));
    }

    // Deduplicate by source_url
    const seen = new Set();
    const dedupedJobs = allJobs.filter((job) => {
      if (seen.has(job.source_url)) return false;
      seen.add(job.source_url);
      return true;
    });

    // Fetch full descriptions from individual requisition pages
    const enrichedJobs = await fetchRequisitionDetails(browser, dedupedJobs);

    const outPath = path.join(outDir, "oracle.json");
    fs.writeFileSync(outPath, JSON.stringify(enrichedJobs, null, 2));
    console.log(`\n================================`);
    console.log(
      `Oracle HCM: Found ${enrichedJobs.length} total opportunities (${allJobs.length} before dedup)`
    );
    console.log(`Output saved to: ${outPath}`);

    if (enrichedJobs.length === 0) {
      console.log(
        "\nNo jobs found. Check the debug screenshots and HTML files in test-output/."
      );
      console.log(
        "Oracle HCM portals can vary in structure. You may need to inspect the"
      );
      console.log(
        "debug HTML and update the selectors in extractJobsFromDOM()."
      );
    }
  } catch (err) {
    console.error(`Oracle scraper failed: ${err.message}`);
    console.error(err.stack);
  } finally {
    if (browser) {
      await browser.close();
      console.log("\nBrowser closed.");
    }
  }
}

main();
