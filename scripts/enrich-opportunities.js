/**
 * Batch enrichment script for opportunity descriptions.
 *
 * Usage:
 *   node scripts/enrich-opportunities.js [--source unjobs] [--limit 10] [--dry-run]
 *
 * Fetches source URLs with Puppeteer and extracts job descriptions
 * for opportunities that have empty description fields.
 */

const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer");
const { load } = require("cheerio");

const TEST_OUTPUT_DIR = path.join(__dirname, "..", "test-output");

/* ─── Site selectors ──────────────────────────────────────── */

const SITE_RULES = {
  "unjobs.org": {
    selectors: [".job-description", ".vacancy-description", "article", "body"],
    requiresJs: true,
  },
  "drc.ngo": {
    selectors: [".job-description", ".job-details-content", "article", "body"],
    requiresJs: true,
  },
  "jobs.au.int": {
    selectors: [".job-description", ".jd-info", "#job-description", "body"],
    requiresJs: true,
  },
  "kifiya.com": {
    selectors: [".job-description", ".entry-content", "article", "body"],
    requiresJs: true,
  },
};

const DEFAULT_SELECTORS = [
  ".job-description",
  ".vacancy-description",
  "#job-description",
  "article",
  "main",
  "body",
];

/* ─── Args parsing ────────────────────────────────────────── */

const args = process.argv.slice(2);
const sourceFilter = args.includes("--source")
  ? args[args.indexOf("--source") + 1]
  : null;
const limit = args.includes("--limit")
  ? parseInt(args[args.indexOf("--limit") + 1], 10)
  : 20;
const dryRun = args.includes("--dry-run");

/* ─── Helpers ─────────────────────────────────────────────── */

function cleanText(text) {
  return text
    .replace(/\s+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function getDomain(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function getSelectors(domain) {
  const entry = Object.entries(SITE_RULES).find(([key]) =>
    domain.includes(key)
  );
  return entry ? entry[1].selectors : DEFAULT_SELECTORS;
}

/* ─── Puppeteer fetch ─────────────────────────────────────── */

async function fetchWithPuppeteer(browser, url, selectors) {
  let page;
  try {
    page = await browser.newPage();
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36"
    );
    await page.goto(url, { waitUntil: "networkidle2", timeout: 25000 });

    for (const selector of selectors) {
      const text = await page.evaluate((sel) => {
        const el = document.querySelector(sel);
        if (!el) return "";
        el.querySelectorAll(
          "script, style, nav, footer, header, .breadcrumb, .sidebar, .cookie-banner"
        ).forEach((e) => e.remove());
        return el.textContent || "";
      }, selector);

      const cleaned = cleanText(text);
      if (cleaned.length > 80) {
        const maxLen = 3000;
        return cleaned.length > maxLen ? cleaned.slice(0, maxLen) + "..." : cleaned;
      }
    }
    return "";
  } catch (err) {
    console.log(`    Error: ${err.message}`);
    return "";
  } finally {
    if (page) await page.close();
  }
}

/* ─── Main ────────────────────────────────────────────────── */

async function main() {
  const sourceFiles = sourceFilter
    ? [`${sourceFilter}.json`]
    : ["unjobs.json", "drc.json", "au.json", "kifiya.json"];

  console.log("=== Opportunity Description Enrichment ===");
  console.log(`Sources: ${sourceFiles.join(", ")}`);
  console.log(`Limit: ${limit} items`);
  console.log(`Dry run: ${dryRun}`);
  console.log();

  let totalAttempted = 0;
  let totalEnriched = 0;

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    for (const file of sourceFiles) {
      const filePath = path.join(TEST_OUTPUT_DIR, file);
      if (!fs.existsSync(filePath)) {
        console.log(`Skipping ${file} (not found)`);
        continue;
      }

      const raw = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      const items = Array.isArray(raw) ? raw : raw.opportunities || [];

      const emptyItems = items.filter(
        (item) =>
          !(item.description || "").trim() &&
          (item.source_url || "").startsWith("http")
      );

      const toProcess = emptyItems.slice(0, limit - totalAttempted);
      console.log(
        `${file}: ${items.length} total, ${emptyItems.length} empty, processing ${toProcess.length}`
      );

      let fileEnriched = 0;

      for (const item of toProcess) {
        totalAttempted++;
        const domain = getDomain(item.source_url);
        const selectors = getSelectors(domain);

        process.stdout.write(
          `  [${totalAttempted}] ${item.title.slice(0, 60)}... `
        );

        const description = await fetchWithPuppeteer(
          browser,
          item.source_url,
          selectors
        );

        if (description) {
          item.description = description;
          fileEnriched++;
          totalEnriched++;
          console.log(`OK (${description.length} chars)`);
        } else {
          console.log("SKIP (no content)");
        }

        // Rate limit
        await new Promise((r) => setTimeout(r, 800));

        if (totalAttempted >= limit) break;
      }

      // Save
      if (!dryRun && fileEnriched > 0) {
        const data = Array.isArray(raw) ? items : { ...raw, opportunities: items };
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
        console.log(`  Saved ${fileEnriched} enriched items to ${file}`);
      }

      if (totalAttempted >= limit) break;
    }
  } finally {
    await browser.close();
  }

  console.log();
  console.log(`=== Done: ${totalEnriched}/${totalAttempted} enriched ===`);
}

main().catch((e) => {
  console.error("Fatal:", e.message);
  process.exit(1);
});
