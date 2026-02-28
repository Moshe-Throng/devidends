/**
 * PoC Scraper: Workday Template (FHI360 + UNHCR)
 * Source: fhi.wd1.myworkdayjobs.com, unhcr.wd3.myworkdayjobs.com
 * Method: Hidden Workday JSON API at /wday/cxs/ endpoint
 * Expected: ~54 combined jobs
 */
const fs = require("fs");
const path = require("path");

const WORKDAY_ORGS = [
  {
    name: "FHI 360",
    baseUrl: "https://fhi.wd1.myworkdayjobs.com",
    tenant: "fhi",
    siteId: "FHI_360_External_Career_Portal",
    searchUrl:
      "https://fhi.wd1.myworkdayjobs.com/wday/cxs/fhi/FHI_360_External_Career_Portal/jobs",
    referer:
      "https://fhi.wd1.myworkdayjobs.com/en-US/FHI_360_External_Career_Portal",
  },
  {
    name: "UNHCR",
    baseUrl: "https://unhcr.wd3.myworkdayjobs.com",
    tenant: "unhcr",
    siteId: "External",
    searchUrl:
      "https://unhcr.wd3.myworkdayjobs.com/wday/cxs/unhcr/External/jobs",
    referer: "https://unhcr.wd3.myworkdayjobs.com/en-US/External",
  },
];

async function scrapeWorkday(org) {
  console.log(`🔍 Workday/${org.name}: Fetching via CXS API...`);
  console.log(`   URL: ${org.searchUrl}`);

  const payload = {
    appliedFacets: {},
    limit: 20,
    offset: 0,
    searchText: "Ethiopia",
  };

  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json",
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    Referer: org.referer,
    Origin: org.baseUrl,
  };

  try {
    const res = await fetch(org.searchUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      console.log(
        `   ${org.name}: API returned ${res.status}, trying without search filter...`
      );
      // Try without search text — some Workday instances don't support text search well
      const broadPayload = { appliedFacets: {}, limit: 20, offset: 0, searchText: "" };
      const broadRes = await fetch(org.searchUrl, {
        method: "POST",
        headers,
        body: JSON.stringify(broadPayload),
      });

      if (broadRes.ok) {
        const data = await broadRes.json();
        console.log(`   ${org.name}: Broad search returned ${data.total} total jobs`);
        return parseWorkdayResponse(data, org);
      }

      console.log(`   ${org.name}: Broad search also failed (${broadRes.status}), trying HTML fallback...`);
      return scrapeWorkdayHTML(org);
    }

    const data = await res.json();
    // If Ethiopia search returns 0, try broad search and filter client-side
    if (data.total === 0) {
      console.log(`   ${org.name}: 0 results for "Ethiopia", trying broad search...`);
      const broadPayload = { appliedFacets: {}, limit: 20, offset: 0, searchText: "" };
      const broadRes = await fetch(org.searchUrl, {
        method: "POST",
        headers,
        body: JSON.stringify(broadPayload),
      });
      if (broadRes.ok) {
        const broadData = await broadRes.json();
        console.log(`   ${org.name}: Broad search returned ${broadData.total} total jobs`);
        const allJobs = parseWorkdayResponse(broadData, org);
        const ethiopiaJobs = allJobs.filter(
          (j) =>
            j.description.toLowerCase().includes("ethiopia") ||
            j.title.toLowerCase().includes("ethiopia")
        );
        if (ethiopiaJobs.length > 0) {
          return ethiopiaJobs;
        }
        // Return all jobs if no Ethiopia-specific ones found
        console.log(`   ${org.name}: No Ethiopia-specific jobs, returning all ${allJobs.length} jobs`);
        return allJobs;
      }
    }

    return parseWorkdayResponse(data, org);
  } catch (err) {
    console.log(`   ${org.name}: API failed (${err.message}), trying HTML fallback...`);
    return scrapeWorkdayHTML(org);
  }
}

function parseWorkdayResponse(data, org) {
  const postings = data.jobPostings || [];
  return postings.map((job) => ({
    title: job.title || job.bulletFields?.[0] || "",
    description: job.locationsText || "",
    location: job.locationsText || "",
    posted: job.postedOn || "",
    deadline: null,
    organization: org.name,
    country: job.locationsText || "Unknown",
    source_url: job.externalPath
      ? `${org.baseUrl}/en-US/${org.siteId}${job.externalPath}`
      : org.baseUrl,
    source_domain: new URL(org.baseUrl).hostname,
    type: "job",
    externalPath: job.externalPath || null,
    bulletFields: job.bulletFields || [],
    scraped_at: new Date().toISOString(),
  }));
}

/**
 * Fetch detailed job description from Workday CXS individual job endpoint.
 * Endpoint: /wday/cxs/{tenant}/{siteId}{externalPath}
 * Returns full HTML job description, requirements, qualifications, etc.
 */
async function fetchJobDetail(org, externalPath) {
  if (!externalPath) return null;

  const detailUrl = `${org.baseUrl}/wday/cxs/${org.tenant}/${org.siteId}${externalPath}`;

  try {
    const res = await fetch(detailUrl, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Referer: `${org.baseUrl}/en-US/${org.siteId}${externalPath}`,
        Origin: org.baseUrl,
      },
    });

    if (!res.ok) return null;

    const data = await res.json();
    const posting = data.jobPostingInfo || data;

    // Extract all rich fields from the detail response
    const description = (posting.jobDescription || "")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/\s+/g, " ")
      .trim();

    const additionalInfo = (posting.additionalInformation || "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    const qualifications = (posting.qualifications || "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    const responsibilities = (posting.responsibilities || "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    // Build full description from all available sections
    const parts = [];
    if (description) parts.push(description);
    if (responsibilities) parts.push(`Responsibilities: ${responsibilities}`);
    if (qualifications) parts.push(`Qualifications: ${qualifications}`);
    if (additionalInfo) parts.push(`Additional Information: ${additionalInfo}`);

    return {
      description: parts.join("\n\n"),
      startDate: posting.startDate || null,
      endDate: posting.endDate || null,
      timeType: posting.timeType || null,
      jobCategory: posting.jobCategory || null,
      workerSubType: posting.workerSubType || null,
      location: posting.location || posting.locationsText || null,
      postedOn: posting.postedOn || null,
    };
  } catch (err) {
    console.log(`     Detail fetch failed for ${externalPath}: ${err.message}`);
    return null;
  }
}

async function scrapeWorkdayHTML(org) {
  // Fallback: scrape the HTML page
  let cheerio;
  try {
    cheerio = require("cheerio");
  } catch {
    console.log(`   ${org.name}: cheerio not installed, skipping HTML fallback`);
    return [];
  }

  try {
    const searchPage = `${org.baseUrl}/en-US/${org.siteId}?q=Ethiopia`;
    console.log(`   ${org.name}: Trying HTML fallback at ${searchPage}`);
    const res = await fetch(searchPage, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
        Referer: org.referer,
      },
    });
    if (!res.ok) {
      console.log(`   ${org.name}: HTML fallback returned ${res.status}`);
      return [];
    }

    const html = await res.text();
    const $ = cheerio.load(html);
    const jobs = [];

    $("a[data-automation-id='jobTitle'], a.css-19uc56f, li a").each(
      (_, el) => {
        const title = $(el).text().trim();
        const href = $(el).attr("href") || "";
        if (title && title.length > 5) {
          jobs.push({
            title,
            description: "",
            location: "",
            posted: "",
            deadline: null,
            organization: org.name,
            country: "Ethiopia",
            source_url: href.startsWith("http")
              ? href
              : `${org.baseUrl}${href}`,
            source_domain: new URL(org.baseUrl).hostname,
            type: "job",
            scraped_at: new Date().toISOString(),
          });
        }
      }
    );

    return jobs;
  } catch (err) {
    console.log(`   ${org.name}: HTML fallback failed: ${err.message}`);
    return [];
  }
}

async function main() {
  try {
    const results = {};
    let total = 0;

    for (const org of WORKDAY_ORGS) {
      const jobs = await scrapeWorkday(org);
      results[org.name] = jobs;
      total += jobs.length;
      console.log(`   ${org.name}: ${jobs.length} jobs found`);
      if (jobs.length > 0) {
        console.log(`   Sample: "${jobs[0].title}"`);
      }
      await new Promise((r) => setTimeout(r, 1000));
    }

    const allJobs = Object.values(results).flat();

    // Enrich each job with detailed description from the CXS detail endpoint
    console.log(`\n📄 Fetching detailed descriptions for ${allJobs.length} jobs...`);
    for (let i = 0; i < allJobs.length; i++) {
      const job = allJobs[i];
      if (!job.externalPath) continue;

      // Find the org config for this job
      const org = WORKDAY_ORGS.find((o) => job.source_url.includes(o.baseUrl));
      if (!org) continue;

      console.log(`   [${i + 1}/${allJobs.length}] ${job.title.slice(0, 60)}...`);
      const detail = await fetchJobDetail(org, job.externalPath);

      if (detail) {
        if (detail.description) job.description = detail.description;
        if (detail.endDate) job.deadline = detail.endDate;
        if (detail.timeType) job.work_type = detail.timeType;
        if (detail.jobCategory) job.category = detail.jobCategory;
        if (detail.location) job.country = detail.location;
        console.log(`     ✅ ${(job.description || "").length} chars`);
      }

      // Clean up internal field
      delete job.externalPath;
      delete job.bulletFields;

      // Polite delay between requests
      await new Promise((r) => setTimeout(r, 800));
    }

    const outPath = path.join(__dirname, "../../test-output/workday.json");
    fs.writeFileSync(outPath, JSON.stringify(allJobs, null, 2));
    console.log(`✅ Workday: Found ${total} total opportunities across ${WORKDAY_ORGS.length} orgs`);
  } catch (err) {
    console.error(`❌ Workday: ${err.message}`);
  }
}

main();
