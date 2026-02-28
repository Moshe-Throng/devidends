/**
 * PoC Scraper: African Union
 * Sources:
 *   1. au.int/en/careers   — HTML-based careers page with ~10 listings (reliable, server-rendered)
 *   2. jobs.au.int/sitemap.xml — XML sitemap with all job URLs from the SuccessFactors portal
 *
 * Finding (Feb 2026):
 *   - jobs.au.int is fully JS-rendered (SAP SuccessFactors). Cannot be scraped with cheerio.
 *   - The SuccessFactors OData API requires authentication (returns 401).
 *   - au.int/en/careers has real HTML listings with title, grade, location, publication/closing dates.
 *   - jobs.au.int/sitemap.xml has all job URLs with lastmod dates; title/location extracted from URL slug.
 *
 * HTML structure at au.int/en/careers:
 *   Each vacancy is a <li> containing:
 *     <strong>Position Title:</strong> <a href="https://jobs.au.int/job/...">Title</a>
 *     <ul>
 *       <li><strong>Grade:</strong> P3</li>
 *       <li><strong>Location:</strong> Ethiopia</li>
 *       <li><strong>Publication Date:</strong> September 30, 2024</li>
 *       <li><strong>Closing Date:</strong> October 31, 2024</li>
 *     </ul>
 *
 * Sitemap structure at jobs.au.int/sitemap.xml:
 *   <url>
 *     <loc>https://jobs.au.int/job/Addis-Ababa-Senior-Technical-Officer-.../2405/</loc>
 *     <lastmod>2026-02-21</lastmod>
 *   </url>
 *
 * Expected: ~10-20 jobs from careers page, ~10-20 from sitemap (with overlap)
 */
const fs = require("fs");
const path = require("path");
const cheerio = require("cheerio");
let puppeteer;
try {
  puppeteer = require("puppeteer");
} catch {
  // Puppeteer optional — detail page fetching will be skipped
}

/**
 * Strategy 1: Scrape au.int/en/careers (HTML page with job listings)
 */
async function scrapeAUCareers() {
  console.log("AU: Fetching au.int/en/careers ...");

  // au.int is often slow — use AbortController for a 30-second timeout
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  let res;
  try {
    res = await fetch("https://au.int/en/careers", {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
      redirect: "follow",
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    console.log(`AU: au.int/en/careers returned HTTP ${res.status}`);
    return [];
  }

  const html = await res.text();
  const $ = cheerio.load(html);

  console.log(`AU: Careers page fetched (${(html.length / 1024).toFixed(0)} KB)`);

  const jobs = [];

  // The page structure has job listings in <li> elements with nested <ul> for metadata.
  // Each job has a link to jobs.au.int and metadata fields (Grade, Location, dates).

  // Approach: Find all anchor tags linking to jobs.au.int/job/
  $('a[href*="jobs.au.int/job/"]').each((_, el) => {
    const $a = $(el);
    const title = $a.text().trim();
    const link = ($a.attr("href") || "").trim();

    if (!title || title.length < 3) return;

    // Navigate up to find the containing <li> and its metadata <ul>
    const $parentLi = $a.closest("li");
    let grade = "";
    let location = "";
    let publicationDate = "";
    let closingDate = "";

    if ($parentLi.length) {
      // Look for the nested <ul> with metadata
      $parentLi.find("li").each((_, metaEl) => {
        const text = $(metaEl).text().trim();

        if (/grade\s*:/i.test(text)) {
          grade = text.replace(/^.*grade\s*:\s*/i, "").trim();
        } else if (/location\s*:/i.test(text)) {
          location = text.replace(/^.*location\s*:\s*/i, "").trim();
        } else if (/publication\s*date\s*:/i.test(text)) {
          publicationDate = text.replace(/^.*publication\s*date\s*:\s*/i, "").trim();
        } else if (/closing\s*date\s*:/i.test(text)) {
          closingDate = text.replace(/^.*closing\s*date\s*:\s*/i, "").trim();
        }
      });
    }

    jobs.push({
      title: title.replace(/\s+/g, " ").slice(0, 300),
      description: "",
      grade: grade || null,
      deadline: closingDate || null,
      published: publicationDate || null,
      organization: "African Union",
      country: location || "Ethiopia",
      source_url: link,
      source_domain: "au.int",
      type: "job",
      scraped_at: new Date().toISOString(),
      _source_method: "careers_page",
    });
  });

  // Fallback: If the above didn't find links, try broader pattern matching
  if (jobs.length === 0) {
    console.log("AU: Primary selector found nothing. Trying broader selectors...");

    // Look for any text blocks that look like job listings
    $("li").each((_, el) => {
      const $li = $(el);
      const text = $li.text().trim();

      // Skip if it's a metadata item (Grade, Location, etc.)
      if (/^(grade|location|publication|closing)\s*:/i.test(text)) return;

      // Look for items that contain a link and have metadata children
      const $link = $li.find("a").first();
      if (!$link.length) return;

      const title = $link.text().trim();
      const href = $link.attr("href") || "";

      // Must be a substantial title and link to a job-like URL
      if (title.length < 10) return;
      if (!href.includes("job") && !href.includes("vacanc") && !href.includes("career")) return;

      let fullLink = href;
      if (!href.startsWith("http")) {
        fullLink = `https://au.int${href.startsWith("/") ? "" : "/"}${href}`;
      }

      // Extract metadata from child items
      let grade = "";
      let location = "";
      let closingDate = "";
      let publicationDate = "";

      $li.find("li, span, div").each((_, meta) => {
        const metaText = $(meta).text().trim();
        if (/grade\s*:/i.test(metaText)) grade = metaText.replace(/^.*grade\s*:\s*/i, "").trim();
        if (/location\s*:/i.test(metaText)) location = metaText.replace(/^.*location\s*:\s*/i, "").trim();
        if (/closing/i.test(metaText)) closingDate = metaText.replace(/^.*closing\s*date?\s*:\s*/i, "").trim();
        if (/publication/i.test(metaText)) publicationDate = metaText.replace(/^.*publication\s*date?\s*:\s*/i, "").trim();
      });

      jobs.push({
        title: title.replace(/\s+/g, " ").slice(0, 300),
        description: "",
        grade: grade || null,
        deadline: closingDate || null,
        published: publicationDate || null,
        organization: "African Union",
        country: location || "Ethiopia",
        source_url: fullLink,
        source_domain: "au.int",
        type: "job",
        scraped_at: new Date().toISOString(),
        _source_method: "careers_page_fallback",
      });
    });
  }

  console.log(`AU: Careers page found ${jobs.length} jobs`);
  return jobs;
}

/**
 * Strategy 2: Parse jobs.au.int/sitemap.xml
 * The sitemap contains all job URLs with lastmod dates. Job title and location
 * can be extracted from the URL slug.
 */
async function scrapeSitemap() {
  console.log("AU: Fetching jobs.au.int/sitemap.xml ...");

  try {
    const res = await fetch("https://jobs.au.int/sitemap.xml", {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Accept: "application/xml, text/xml, */*",
      },
    });

    if (!res.ok) {
      console.log(`AU: Sitemap returned HTTP ${res.status}`);
      return [];
    }

    const xml = await res.text();
    const $ = cheerio.load(xml, { xmlMode: true });

    const jobs = [];

    $("url").each((_, el) => {
      const loc = $(el).find("loc").text().trim();
      const lastmod = $(el).find("lastmod").text().trim();

      if (!loc || !loc.includes("/job/")) return;

      // Skip French versions (they duplicate English listings)
      if (loc.includes("-fr_FR")) return;

      // Decode the URL to check for French text reliably
      let decodedLoc = "";
      try {
        decodedLoc = decodeURIComponent(loc);
      } catch {
        decodedLoc = loc;
      }

      // Strip location prefix from slug to check the title portion
      const slugPart = decodedLoc.split("/job/")[1] || "";
      // Remove known location prefixes for French detection
      const titleForCheck = slugPart
        .replace(/^(Addis-Ababa|Cairo-\([^)]*\)|Accra|Nairobi|All-AU-Member-States)-?/i, "")
        .trim();

      // Skip French entries based on common French title patterns
      if (
        /^(Chef|Responsable|Chargé|Charg%C3%A9|Directeur|Programme-de-stages|Programme-de-Bourses|AVOHC-Programme)/i.test(titleForCheck)
      )
        return;

      // Extract title and location from URL slug
      // Format: https://jobs.au.int/job/[Location]-[Title]/[ID]/
      // or: https://jobs.au.int/job/[Title]/[ID]-en_US
      const parsed = parseJobUrl(loc);

      jobs.push({
        title: parsed.title,
        description: "",
        grade: null,
        deadline: null,
        published: lastmod || null,
        organization: "African Union",
        country: parsed.location || "Ethiopia",
        source_url: loc,
        source_domain: "jobs.au.int",
        type: "job",
        scraped_at: new Date().toISOString(),
        _source_method: "sitemap",
      });
    });

    console.log(`AU: Sitemap found ${jobs.length} English job URLs`);
    return jobs;
  } catch (err) {
    console.log(`AU: Sitemap fetch failed: ${err.message}`);
    return [];
  }
}

/**
 * Parse a jobs.au.int URL slug into a human-readable title and location.
 * Examples:
 *   /job/Addis-Ababa-Senior-Technical-Officer-Grants-Management-(AfCDC)/2405/
 *   /job/Internship-Program/1506-en_US
 *   /job/Cairo-Political-Officer/2477/
 */
function parseJobUrl(url) {
  try {
    const pathPart = new URL(url).pathname; // e.g., /job/Addis-Ababa-Senior-.../2405/
    const segments = pathPart.split("/").filter(Boolean); // ["job", "Addis-Ababa-...", "2405"]

    if (segments.length < 2) return { title: url, location: "" };

    let slug = segments[1]; // e.g., "Addis-Ababa-Senior-Technical-Officer-..."

    // Decode URL encoding
    slug = decodeURIComponent(slug);

    // Known AU locations that appear at the start of slugs
    // Location prefixes in the URL slug. Some include parenthetical country info
    // e.g., "Cairo-(Egypt)-Political-Officer-..." or "Addis-Ababa-Senior-..."
    const locationRegexes = [
      { regex: /^Addis-Ababa-/, location: "Ethiopia", len: "Addis-Ababa-".length },
      { regex: /^Cairo-\([^)]*\)-/, location: "Egypt" },
      { regex: /^Cairo-/, location: "Egypt", len: "Cairo-".length },
      { regex: /^Accra-/, location: "Ghana", len: "Accra-".length },
      { regex: /^Nairobi-/, location: "Kenya", len: "Nairobi-".length },
      { regex: /^Lusaka-/, location: "Zambia", len: "Lusaka-".length },
      { regex: /^Arusha-/, location: "Tanzania", len: "Arusha-".length },
      { regex: /^Yaound[eé]-/, location: "Cameroon" },
      { regex: /^Bamako-/, location: "Mali", len: "Bamako-".length },
      { regex: /^Algiers-/, location: "Algeria", len: "Algiers-".length },
      { regex: /^Kigali-/, location: "Rwanda", len: "Kigali-".length },
      { regex: /^All-AU-Member-States-/, location: "All AU Member States", len: "All-AU-Member-States-".length },
    ];

    let location = "";
    let titleSlug = slug;

    for (const { regex, location: loc, len } of locationRegexes) {
      const match = slug.match(regex);
      if (match) {
        location = loc;
        titleSlug = slug.slice(match[0].length); // Remove the matched location prefix
        break;
      }
    }

    // Convert slug to readable title: replace hyphens with spaces
    let title = titleSlug
      .replace(/-/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    // Clean up common suffixes
    title = title.replace(/\s*\d+(-en_US)?$/, "").trim();

    // Fix common patterns
    title = title.replace(/\((\w+)\)/g, "($1)"); // Clean parentheses
    title = title.replace(/%28/g, "(").replace(/%29/g, ")");
    title = title.replace(/%2C/g, ",");

    if (!title) title = slug.replace(/-/g, " ");

    return { title, location };
  } catch {
    return { title: url, location: "" };
  }
}

/**
 * Fetch full job descriptions from jobs.au.int detail pages using Puppeteer.
 * SAP SuccessFactors is JS-rendered, so cheerio alone cannot extract the content.
 */
async function fetchDetailPages(jobs) {
  if (!puppeteer) {
    console.log("AU: Puppeteer not installed, skipping detail page crawling");
    return jobs;
  }

  // Only fetch detail pages for jobs on jobs.au.int (which need JS rendering)
  const jobsNeedingDetail = jobs.filter(
    (j) => j.source_url && j.source_url.includes("jobs.au.int") && (!j.description || j.description.length < 80)
  );

  if (jobsNeedingDetail.length === 0) {
    console.log("AU: No jobs need detail page crawling");
    return jobs;
  }

  console.log(`\nAU: Fetching detail pages for ${jobsNeedingDetail.length} jobs via Puppeteer...`);

  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
    );

    for (let i = 0; i < jobsNeedingDetail.length; i++) {
      const job = jobsNeedingDetail[i];
      console.log(`   [${i + 1}/${jobsNeedingDetail.length}] ${job.title.slice(0, 60)}...`);

      try {
        await page.goto(job.source_url, { waitUntil: "networkidle2", timeout: 30000 });
        // SuccessFactors pages take time to render
        await new Promise((r) => setTimeout(r, 4000));

        const detail = await page.evaluate(() => {
          const body = document.body.innerText || "";
          const result = { description: "", qualifications: "", deadline: null, location: null };

          // SuccessFactors detail pages typically have sections like:
          // - Job Description / Purpose
          // - Key Responsibilities / Duties
          // - Qualifications / Requirements
          // - Education / Experience

          // Try structured extraction
          const sectionHeaders = [
            "Purpose of the Role",
            "Overall Purpose",
            "Job Description",
            "Key Responsibilities",
            "Responsibilities",
            "Duties",
            "Required Qualifications",
            "Qualifications",
            "Requirements",
            "Education",
            "Experience",
            "Skills",
            "Languages",
            "Competencies",
            "Core Values",
            "Application Deadline",
          ];

          const sections = [];
          for (const header of sectionHeaders) {
            const regex = new RegExp(`(${header}[\\s\\S]*?)(?=${sectionHeaders.map((h) => h.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")}|$)`, "i");
            const match = body.match(regex);
            if (match && match[1].trim().length > 20) {
              sections.push(match[1].replace(/\s+/g, " ").trim());
            }
          }

          if (sections.length > 0) {
            result.description = sections.join("\n\n");
          }

          // Fallback: use full body text (trimmed)
          if (!result.description || result.description.length < 100) {
            let text = body;
            // Try to find content start
            const contentStart = text.search(/(?:Purpose|Job Description|Responsibilities|About the Role)/i);
            if (contentStart > 0) text = text.slice(contentStart);

            // Remove footer / cookie text
            const footerStart = text.search(/(?:Apply Now|Submit Application|Cookie|Privacy Policy|© \d{4})/i);
            if (footerStart > 200) text = text.slice(0, footerStart);

            result.description = text.replace(/\s+/g, " ").trim();
          }

          // Extract deadline
          const deadlineMatch = body.match(/(?:Application Deadline|Closing Date|Deadline)\s*:?\s*([^\n]+)/i);
          if (deadlineMatch) result.deadline = deadlineMatch[1].trim();

          // Extract location
          const locationMatch = body.match(/(?:Location|Duty Station)\s*:?\s*([^\n]+)/i);
          if (locationMatch) result.location = locationMatch[1].trim();

          // Cap description length
          if (result.description.length > 5000) {
            result.description = result.description.slice(0, 5000) + "...";
          }

          return result;
        });

        if (detail.description && detail.description.length > 80) {
          job.description = detail.description;
          if (detail.deadline) job.deadline = detail.deadline;
          if (detail.location && (!job.country || job.country === "Ethiopia")) {
            job.country = detail.location;
          }
          console.log(`     ✅ ${detail.description.length} chars`);
        } else {
          console.log(`     ⚠️ Insufficient content on detail page`);
        }
      } catch (err) {
        console.log(`     ❌ ${err.message}`);
      }

      // Polite delay
      await new Promise((r) => setTimeout(r, 2000));
    }

    await page.close();
  } finally {
    await browser.close();
  }

  return jobs;
}

async function main() {
  try {
    // Run both strategies in parallel
    const [careersJobs, sitemapJobs] = await Promise.all([
      scrapeAUCareers().catch((err) => {
        console.log(`AU: Careers page error: ${err.message}`);
        return [];
      }),
      scrapeSitemap().catch((err) => {
        console.log(`AU: Sitemap error: ${err.message}`);
        return [];
      }),
    ]);

    // Merge results, preferring careers page data (has more metadata)
    const jobsByUrl = new Map();

    // Add sitemap jobs first (lower priority)
    for (const job of sitemapJobs) {
      jobsByUrl.set(job.source_url, job);
    }

    // Overlay careers page jobs (higher priority — has grade, dates, etc.)
    for (const job of careersJobs) {
      jobsByUrl.set(job.source_url, job);
    }

    // Also try to match by title similarity for jobs that appear in both
    // but with slightly different URLs (e.g., with/without en_US suffix)
    for (const sJob of sitemapJobs) {
      let found = false;
      for (const [, cJob] of jobsByUrl) {
        if (
          cJob._source_method === "careers_page" &&
          titlesMatch(cJob.title, sJob.title)
        ) {
          found = true;
          break;
        }
      }
      if (!found) {
        jobsByUrl.set(sJob.source_url, sJob);
      }
    }

    const allJobs = Array.from(jobsByUrl.values());

    // Remove internal _source_method field from output
    const cleanJobs = allJobs.map(({ _source_method, ...rest }) => ({
      ...rest,
      _source_method, // Keep for debugging
    }));

    // Fetch full descriptions from detail pages (jobs.au.int = SAP SuccessFactors, needs Puppeteer)
    const enrichedJobs = await fetchDetailPages(cleanJobs);

    // Ensure output directory exists
    const outDir = path.join(__dirname, "../../test-output");
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }

    const outPath = path.join(outDir, "au.json");
    fs.writeFileSync(outPath, JSON.stringify(enrichedJobs, null, 2));

    console.log(`\n=== AU RESULTS ===`);
    console.log(`Careers page: ${careersJobs.length} jobs`);
    console.log(`Sitemap: ${sitemapJobs.length} jobs`);
    console.log(`Total unique: ${cleanJobs.length} jobs`);

    // Show breakdown by location
    const byCountry = {};
    for (const j of cleanJobs) {
      const c = j.country || "Unknown";
      byCountry[c] = (byCountry[c] || 0) + 1;
    }
    console.log("By location:", JSON.stringify(byCountry));

    // Show Ethiopia jobs
    const ethiopiaJobs = cleanJobs.filter(
      (j) =>
        j.country === "Ethiopia" ||
        /ethiopia|addis/i.test(j.title) ||
        /ethiopia|addis/i.test(j.country)
    );
    console.log(`Ethiopia jobs: ${ethiopiaJobs.length}`);

    // Show samples
    const samples = cleanJobs.slice(0, 8);
    for (const s of samples) {
      console.log(
        `  - ${s.title} | ${s.country} | grade: ${s.grade || "N/A"} | deadline: ${s.deadline || "N/A"} | via ${s._source_method}`
      );
    }

    if (cleanJobs.length === 0) {
      console.log(
        "\nWARNING: No jobs found. Both au.int/en/careers and sitemap may have changed."
      );
      console.log(
        "Note: jobs.au.int is JS-rendered (SAP SuccessFactors) and requires Puppeteer."
      );
    }

    console.log(`\nOutput saved to: ${outPath}`);
  } catch (err) {
    console.error(`AU ERROR: ${err.message}`);
    console.error(err.stack);
  }
}

/**
 * Check if two job titles are similar enough to be the same position.
 * Handles minor differences in formatting, parentheses, etc.
 */
function titlesMatch(a, b) {
  const normalize = (s) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  const na = normalize(a);
  const nb = normalize(b);
  return na === nb || na.includes(nb) || nb.includes(na);
}

main();
