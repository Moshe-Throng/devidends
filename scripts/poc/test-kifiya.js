/**
 * PoC Scraper: Kifiya Financial Technology
 * Source: kifiya.com
 * Method: HTML scrape
 * Expected: ~39 jobs
 */
const fs = require("fs");
const path = require("path");
const cheerio = require("cheerio");

async function scrape() {
  console.log("🔍 Kifiya: Scraping careers page...");

  const urls = [
    "https://kifiya.com/careers",
    "https://kifiya.com/careers/",
    "https://kifiya.com/jobs",
    "https://www.kifiya.com/careers",
  ];

  let allJobs = [];

  for (const url of urls) {
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
          Accept: "text/html",
        },
        redirect: "follow",
      });

      if (!res.ok) continue;

      const html = await res.text();
      const $ = cheerio.load(html);

      // Try to find job listings
      $(
        "a[href*='career'], a[href*='job'], a[href*='position'], a[href*='vacancy'], .job-listing a, .career-item a, h3 a, h4 a"
      ).each((_, el) => {
        const $el = $(el);
        const title = $el.text().trim();
        const href = $el.attr("href") || "";

        if (
          title &&
          title.length > 8 &&
          title.length < 200 &&
          !title.match(/^(Home|About|Contact|Menu|Services|Products|Blog|News|Login|Sign|Read More|Apply|Submit|Learn More|View|See|Click|Download)/i) &&
          href.includes("/jobs/")
        ) {
          let link = href;
          if (href && !href.startsWith("http")) {
            link = `https://kifiya.com${href.startsWith("/") ? "" : "/"}${href}`;
          }

          allJobs.push({
            title: title.replace(/\s+/g, " "),
            description: "",
            deadline: null,
            organization: "Kifiya Financial Technology",
            country: "Ethiopia",
            source_url: link || url,
            source_domain: "kifiya.com",
            type: "job",
            scraped_at: new Date().toISOString(),
          });
        }
      });

      if (allJobs.length > 0) break;
    } catch (err) {
      console.log(`   Tried ${url}: ${err.message}`);
    }
  }

  // Deduplicate
  const seen = new Set();
  return allJobs.filter((j) => {
    const key = j.title;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Fetch a single job detail page and extract the full description.
 */
async function fetchJobDetail(url) {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        Accept: "text/html",
      },
      redirect: "follow",
    });

    if (!res.ok) return null;

    const html = await res.text();
    const $ = cheerio.load(html);

    // Remove nav, header, footer, sidebar elements
    $("nav, header, footer, aside, .sidebar, .menu, .navigation, script, style, noscript").remove();

    // Try to find the main job description content
    const descSelectors = [
      ".job-description",
      ".job-detail",
      ".job-content",
      ".entry-content",
      ".post-content",
      "article",
      ".content",
      "main",
      "#content",
      ".page-content",
    ];

    let description = "";

    for (const sel of descSelectors) {
      const $el = $(sel);
      if ($el.length && $el.text().trim().length > 100) {
        description = $el.text().replace(/\s+/g, " ").trim();
        break;
      }
    }

    // Fallback: extract from body if no specific container found
    if (!description || description.length < 100) {
      description = $("body").text().replace(/\s+/g, " ").trim();
      // Try to find the job content portion
      const markers = [
        /(?:job\s*description|responsibilities|qualifications|requirements|about\s*the\s*role)/i,
      ];
      for (const marker of markers) {
        const match = description.match(marker);
        if (match) {
          description = description.slice(match.index);
          break;
        }
      }
    }

    // Extract additional structured data
    let deadline = null;
    let location = null;

    $("*").each((_, el) => {
      const text = $(el).text().trim();
      if (!deadline && /deadline|closing\s*date|apply\s*by/i.test(text)) {
        const dateMatch = text.match(/(\d{1,2}[\s\-\/]\w{3,9}[\s\-\/]\d{4}|\w{3,9}\s+\d{1,2},?\s+\d{4}|\d{4}-\d{2}-\d{2})/);
        if (dateMatch) deadline = dateMatch[1];
      }
      if (!location && /location|duty\s*station/i.test(text) && text.length < 200) {
        location = text.replace(/^.*(?:location|duty\s*station)\s*:?\s*/i, "").trim();
      }
    });

    // Keep generous description length (5000 chars)
    if (description.length > 5000) {
      description = description.slice(0, 5000) + "...";
    }

    return { description, deadline, location };
  } catch (err) {
    console.log(`   Error fetching ${url}: ${err.message}`);
    return null;
  }
}

async function main() {
  try {
    const jobs = await scrape();

    // Enrich each job by visiting its detail page
    console.log(`📄 Fetching detail pages for ${jobs.length} Kifiya jobs...`);
    for (let i = 0; i < jobs.length; i++) {
      const job = jobs[i];
      if (!job.source_url || !job.source_url.startsWith("http")) continue;

      console.log(`   [${i + 1}/${jobs.length}] ${job.title.slice(0, 60)}...`);
      const detail = await fetchJobDetail(job.source_url);

      if (detail) {
        if (detail.description && detail.description.length > 50) {
          job.description = detail.description;
          console.log(`     ✅ ${detail.description.length} chars`);
        }
        if (detail.deadline) job.deadline = detail.deadline;
        if (detail.location) job.location = detail.location;
      } else {
        console.log(`     ❌ Could not fetch detail page`);
      }

      // Polite delay
      await new Promise((r) => setTimeout(r, 1200));
    }

    const outPath = path.join(__dirname, "../../test-output/kifiya.json");
    fs.writeFileSync(outPath, JSON.stringify(jobs, null, 2));
    console.log(`✅ Kifiya: Found ${jobs.length} opportunities`);
    if (jobs.length > 0) {
      console.log(`   Sample: "${jobs[0].title}"`);
      console.log(`   Description: ${(jobs[0].description || "").slice(0, 120)}...`);
    }
    if (jobs.length === 0) {
      console.log("   ⚠️ Kifiya may use JS rendering or have restructured their careers page");
    }
  } catch (err) {
    console.error(`❌ Kifiya: ${err.message}`);
  }
}

main();
