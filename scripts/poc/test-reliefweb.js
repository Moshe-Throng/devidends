/**
 * PoC Scraper: ReliefWeb API
 * Source: api.reliefweb.int/v1/jobs
 * Method: REST API with POST + JSON body
 * Appname: DevidendslWobR5bzg4nrbI2JUvPj (approved Feb 27, 2026)
 * Expected: ~50+ Ethiopia jobs
 */
const fs = require("fs");
const path = require("path");

const API_URL = "https://api.reliefweb.int/v1/jobs";
const APPNAME = "DevidendslWobR5bzg4nrbI2JUvPj";
const OUTPUT_PATH = path.join(__dirname, "../../test-output/reliefweb.json");
const LIMIT = 50;

async function scrape() {
  console.log("ReliefWeb: Fetching Ethiopia jobs via API (POST)...");
  console.log(`  Appname: ${APPNAME}`);

  const body = {
    filter: {
      field: "country.name",
      value: ["Ethiopia"],
    },
    fields: {
      include: [
        "title",
        "body",
        "body-html",
        "how_to_apply",
        "date.closing",
        "date.created",
        "source.name",
        "country.name",
        "city.name",
        "url",
        "status",
        "type.name",
        "career_categories.name",
        "theme.name",
        "experience.name",
        "language.name",
      ],
    },
    sort: ["date.created:desc"],
    limit: LIMIT,
  };

  const res = await fetch(`${API_URL}?appname=${encodeURIComponent(APPNAME)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`ReliefWeb API error ${res.status}: ${errBody}`);
  }

  const data = await res.json();
  const total = data.totalCount || data.count || 0;
  const fetched = (data.data || []).length;
  console.log(`  API returned ${total} total results (fetched ${fetched})`);

  const jobs = (data.data || []).map((item) => {
    const f = item.fields || {};

    // Extract full description — strip HTML tags, keep full text (no truncation)
    const rawBody = f["body-html"] || f.body || "";
    const description = rawBody
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&#\d+;/g, "")
      .replace(/\s+/g, " ")
      .trim();

    // Extract how_to_apply separately
    const howToApply = (f.how_to_apply || "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    // Build full description: body + how to apply
    const fullDescription = [description, howToApply ? `\n\nHow to Apply: ${howToApply}` : ""]
      .join("")
      .trim();

    // Extract disaggregated fields
    const careerCategories = Array.isArray(f.career_categories)
      ? f.career_categories.map((c) => c.name)
      : [];
    const themes = Array.isArray(f.theme) ? f.theme.map((t) => t.name) : [];
    const experience = Array.isArray(f.experience)
      ? f.experience.map((e) => e.name)
      : [];
    const languages = Array.isArray(f.language)
      ? f.language.map((l) => l.name)
      : [];
    const cities = Array.isArray(f.city) ? f.city.map((c) => c.name) : [];
    const jobType = Array.isArray(f.type) ? f.type.map((t) => t.name).join(", ") : "";

    return {
      title: f.title || "",
      description: fullDescription,
      deadline: f.date?.closing || null,
      published: f.date?.created || null,
      organization: Array.isArray(f.source) ? f.source.map((s) => s.name).join(", ") : "",
      country: Array.isArray(f.country) ? f.country.map((c) => c.name).join(", ") : "Ethiopia",
      city: cities.join(", ") || null,
      source_url: f.url || `https://reliefweb.int/job/${item.id}`,
      source_domain: "reliefweb.int",
      type: jobType || "job",
      career_categories: careerCategories,
      themes: themes,
      experience: experience,
      languages: languages,
      scraped_at: new Date().toISOString(),
    };
  });

  return { jobs, total };
}

async function main() {
  try {
    const { jobs, total } = await scrape();
    const outDir = path.dirname(OUTPUT_PATH);
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(jobs, null, 2));
    console.log(`\nReliefWeb: Found ${jobs.length} opportunities (${total} total available)`);
    if (jobs.length > 0) {
      console.log(`  Sample: "${jobs[0].title}"`);
      console.log(`  Org:    "${jobs[0].organization}"`);
      console.log(`  Link:   ${jobs[0].source_url}`);
    }
    console.log(`  Output: ${OUTPUT_PATH}`);
  } catch (err) {
    console.error(`ReliefWeb ERROR: ${err.message}`);
  }
}

main();
