/**
 * PoC Scraper: DRC (Danish Refugee Council)
 * Source: www.drc.ngo/jobs/
 * Method: HTML scrape with cheerio
 *
 * The DRC jobs page at www.drc.ngo/jobs/ renders all job listings server-side
 * as .job-item divs with data attributes for region, category, contract type,
 * and dates. Job links follow the pattern /job?id=XXXXX.
 *
 * The old approach tried drc.ngo/about-us/careers/ and hr-manager.net, which
 * are either redirects or application portals (not listing pages).
 *
 * Key selectors:
 *   .job-item         - container div with data-region, data-category, data-contract,
 *                        data-published, data-deadline attributes
 *   .job-title         - position title text (country embedded in title, e.g. "Finance Intern - Ethiopia")
 *   .timestamp.published  - publication date span
 *   .timestamp.deadline   - deadline date span
 *
 * Job links: Each .job-item either wraps or contains an <a> linking to /job?id=NNNNN
 *
 * Expected: ~60 jobs total, ~5-15 for Ethiopia/Africa
 */
const fs = require("fs");
const path = require("path");
const cheerio = require("cheerio");

const JOBS_URL = "https://www.drc.ngo/jobs/";

async function scrape() {
  console.log("DRC: Fetching jobs from www.drc.ngo/jobs/ ...");

  const res = await fetch(JOBS_URL, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
    },
    redirect: "follow",
  });

  if (!res.ok) {
    throw new Error(`www.drc.ngo/jobs/ returned HTTP ${res.status}`);
  }

  const html = await res.text();
  const $ = cheerio.load(html);

  console.log(`DRC: Page fetched (${(html.length / 1024).toFixed(0)} KB)`);

  const allJobs = [];

  // Strategy 1: Parse .job-item elements (primary approach)
  $(".job-item").each((_, el) => {
    const $el = $(el);

    // Extract data attributes
    const region = ($el.attr("data-region") || "").trim();
    const category = ($el.attr("data-category") || "").trim();
    const contract = ($el.attr("data-contract") || "").trim();
    const publishedDate = ($el.attr("data-published") || "").trim();
    const deadlineDate = ($el.attr("data-deadline") || "").trim();

    // Extract title from .job-title
    let title = $el.find(".job-title").text().trim();
    if (!title) {
      // Fallback: try the first anchor text or any heading
      title = $el.find("a").first().text().trim() || $el.find("h3, h4").first().text().trim();
    }

    // Extract link - look for anchor tag in or around the job item
    let link = "";
    const $anchor = $el.find("a[href]").first();
    if ($anchor.length) {
      link = $anchor.attr("href") || "";
    } else if ($el.is("a")) {
      link = $el.attr("href") || "";
    } else {
      // Check parent for wrapping anchor
      const $parentAnchor = $el.closest("a[href]");
      if ($parentAnchor.length) {
        link = $parentAnchor.attr("href") || "";
      }
    }

    // Build absolute URL
    if (link && !link.startsWith("http")) {
      link = `https://www.drc.ngo${link.startsWith("/") ? "" : "/"}${link}`;
    }

    // Extract displayed dates (fallback to data attributes)
    let published =
      $el.find(".timestamp.published").text().trim() ||
      $el.find(".published").text().trim() ||
      publishedDate;
    let deadline =
      $el.find(".timestamp.deadline").text().trim() ||
      $el.find(".deadline").text().trim() ||
      deadlineDate;

    if (!title || title.length < 5) return;

    // Determine country from the title text (DRC embeds country in title)
    let country = "Unknown";
    const titleLower = title.toLowerCase();
    const countryPatterns = [
      { pattern: /ethiopia/i, name: "Ethiopia" },
      { pattern: /kenya/i, name: "Kenya" },
      { pattern: /somalia/i, name: "Somalia" },
      { pattern: /sudan/i, name: "Sudan" },
      { pattern: /south sudan/i, name: "South Sudan" },
      { pattern: /uganda/i, name: "Uganda" },
      { pattern: /tanzania/i, name: "Tanzania" },
      { pattern: /nigeria/i, name: "Nigeria" },
      { pattern: /cameroon/i, name: "Cameroon" },
      { pattern: /drc|congo/i, name: "DRC (Congo)" },
      { pattern: /mali/i, name: "Mali" },
      { pattern: /niger\b/i, name: "Niger" },
      { pattern: /burkina/i, name: "Burkina Faso" },
      { pattern: /ukraine/i, name: "Ukraine" },
      { pattern: /syria/i, name: "Syria" },
      { pattern: /iraq/i, name: "Iraq" },
      { pattern: /yemen/i, name: "Yemen" },
      { pattern: /libya/i, name: "Libya" },
      { pattern: /tunisia/i, name: "Tunisia" },
      { pattern: /colombia/i, name: "Colombia" },
      { pattern: /bangladesh/i, name: "Bangladesh" },
      { pattern: /myanmar/i, name: "Myanmar" },
      { pattern: /afghanistan/i, name: "Afghanistan" },
      { pattern: /occupied palestinian/i, name: "Palestine" },
      { pattern: /denmark|copenhagen/i, name: "Denmark" },
      { pattern: /global/i, name: "Global" },
    ];

    for (const { pattern, name } of countryPatterns) {
      if (pattern.test(title)) {
        country = name;
        break;
      }
    }

    allJobs.push({
      title: title.replace(/\s+/g, " ").slice(0, 300),
      description: "",
      deadline: deadline || null,
      published: published || null,
      organization: "Danish Refugee Council (DRC)",
      country,
      region: region || null,
      category: category || null,
      contract_type: contract || null,
      source_url: link || JOBS_URL,
      source_domain: "drc.ngo",
      type: "job",
      scraped_at: new Date().toISOString(),
    });
  });

  if (allJobs.length > 0) {
    console.log(`DRC: Strategy 1 (.job-item) found ${allJobs.length} jobs`);
  }

  // Strategy 2 (fallback): If .job-item didn't work, try broader link-based approach
  if (allJobs.length === 0) {
    console.log("DRC: Strategy 1 found nothing, trying fallback selectors...");

    // Look for any links to /job?id= pages
    $('a[href*="/job?id="], a[href*="/job/?id="]').each((_, el) => {
      const $el = $(el);
      const title = $el.text().trim();
      let href = $el.attr("href") || "";

      if (!title || title.length < 5) return;
      // Skip navigation/menu links
      if (/^(home|about|contact|menu|search|login|apply|back|read more)/i.test(title)) return;

      if (!href.startsWith("http")) {
        href = `https://www.drc.ngo${href.startsWith("/") ? "" : "/"}${href}`;
      }

      allJobs.push({
        title: title.replace(/\s+/g, " ").slice(0, 300),
        description: "",
        deadline: null,
        published: null,
        organization: "Danish Refugee Council (DRC)",
        country: "Unknown",
        region: null,
        category: null,
        contract_type: null,
        source_url: href,
        source_domain: "drc.ngo",
        type: "job",
        scraped_at: new Date().toISOString(),
      });
    });

    if (allJobs.length > 0) {
      console.log(`DRC: Strategy 2 (link-based) found ${allJobs.length} jobs`);
    }
  }

  // Strategy 3 (last resort): Look for structured data or JSON-LD in script tags
  if (allJobs.length === 0) {
    console.log("DRC: Trying strategy 3 (embedded JSON/structured data)...");

    $("script").each((_, tag) => {
      const content = $(tag).html() || "";
      // Look for JSON-LD job postings
      if (content.includes('"JobPosting"') || content.includes('"jobPosting"')) {
        try {
          const parsed = JSON.parse(content);
          const postings = Array.isArray(parsed) ? parsed : [parsed];
          for (const p of postings) {
            if (p["@type"] === "JobPosting" && p.title) {
              allJobs.push({
                title: p.title,
                description: (p.description || "").slice(0, 500),
                deadline: p.validThrough || null,
                published: p.datePosted || null,
                organization: "Danish Refugee Council (DRC)",
                country: p.jobLocation?.address?.addressCountry || "Unknown",
                region: null,
                category: null,
                contract_type: p.employmentType || null,
                source_url: p.url || JOBS_URL,
                source_domain: "drc.ngo",
                type: "job",
                scraped_at: new Date().toISOString(),
              });
            }
          }
        } catch {
          // Not valid JSON
        }
      }
    });

    if (allJobs.length > 0) {
      console.log(`DRC: Strategy 3 (JSON-LD) found ${allJobs.length} jobs`);
    }
  }

  // Deduplicate by source_url
  const seen = new Set();
  const unique = allJobs.filter((j) => {
    const key = j.source_url || j.title;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return unique;
}

async function main() {
  try {
    const jobs = await scrape();

    // Ensure output directory exists
    const outDir = path.join(__dirname, "../../test-output");
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }

    const outPath = path.join(outDir, "drc.json");
    fs.writeFileSync(outPath, JSON.stringify(jobs, null, 2));

    console.log(`\n=== DRC RESULTS ===`);
    console.log(`Total jobs found: ${jobs.length}`);

    // Show breakdown by region
    const byRegion = {};
    for (const j of jobs) {
      const r = j.region || "Unknown";
      byRegion[r] = (byRegion[r] || 0) + 1;
    }
    console.log("By region:", JSON.stringify(byRegion));

    // Show Ethiopia jobs specifically
    const ethiopiaJobs = jobs.filter(
      (j) => j.country === "Ethiopia" || /ethiopia/i.test(j.title)
    );
    console.log(`Ethiopia jobs: ${ethiopiaJobs.length}`);

    // Show first 5 samples
    const samples = jobs.slice(0, 5);
    for (const s of samples) {
      console.log(
        `  - ${s.title} | ${s.country} | deadline: ${s.deadline || "N/A"} | ${s.source_url}`
      );
    }

    if (jobs.length === 0) {
      console.log(
        "\nWARNING: No jobs found. The page structure may have changed."
      );
      console.log(
        "Debug: Save the HTML and inspect .job-item selectors manually."
      );
    }

    console.log(`\nOutput saved to: ${outPath}`);
  } catch (err) {
    console.error(`DRC ERROR: ${err.message}`);
    console.error(err.stack);
  }
}

main();
