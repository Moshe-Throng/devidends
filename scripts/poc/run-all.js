/**
 * Run All PoC Scrapers
 * Executes each scraper sequentially and produces a summary report
 */
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const SCRAPERS = [
  { name: "ReliefWeb", file: "test-reliefweb.js", output: "reliefweb.json" },
  { name: "World Bank", file: "test-worldbank.js", output: "worldbank.json" },
  { name: "UNJobs", file: "test-unjobs.js", output: "unjobs.json" },
  { name: "DRC", file: "test-drc.js", output: "drc.json" },
  { name: "AU", file: "test-au.js", output: "au.json" },
  { name: "Workday (FHI360+UNHCR)", file: "test-workday.js", output: "workday.json" },
  { name: "UN Careers", file: "test-uncareers.js", output: "uncareers.json" },
  { name: "Kifiya", file: "test-kifiya.js", output: "kifiya.json" },
  { name: "Oracle HCM (NRC)", file: "test-oracle.js", output: "oracle.json" },
];

const scriptDir = __dirname;
const outDir = path.join(scriptDir, "../../test-output");

fs.mkdirSync(outDir, { recursive: true });

console.log("=".repeat(60));
console.log("  DEVIDENDS — PoC Scraper Test Suite");
console.log("  " + new Date().toISOString());
console.log("=".repeat(60));
console.log();

const results = [];

for (const scraper of SCRAPERS) {
  const scriptPath = path.join(scriptDir, scraper.file);
  console.log(`--- ${scraper.name} ---`);

  let status = "error";
  let count = 0;
  let log = "";

  try {
    log = execSync(`node "${scriptPath}"`, {
      encoding: "utf-8",
      timeout: 300000, // 5 min for Puppeteer scrapers
      cwd: path.join(scriptDir, "../.."),
    });
    console.log(log.trim());

    // Read output file
    const outFile = path.join(outDir, scraper.output);
    if (fs.existsSync(outFile)) {
      const data = JSON.parse(fs.readFileSync(outFile, "utf-8"));
      if (Array.isArray(data)) {
        count = data.length;
      } else if (data.opportunities) {
        count = data.opportunities.length;
      }
      status = count > 0 ? "ok" : "empty";
    } else {
      status = "no_output";
    }
  } catch (err) {
    log = err.stdout || err.message || "Unknown error";
    console.log(log.trim());
    status = "error";
  }

  results.push({ name: scraper.name, status, count });
  console.log();
}

// Summary
console.log("=".repeat(60));
console.log("  SUMMARY");
console.log("=".repeat(60));
console.log();

let totalJobs = 0;
let working = 0;

for (const r of results) {
  const icon =
    r.status === "ok" ? "OK" :
    r.status === "empty" ? "EMPTY" :
    r.status === "no_output" ? "NO FILE" : "ERROR";

  const pad = r.name.padEnd(28);
  console.log(`  ${pad} ${icon.padEnd(10)} ${r.count} jobs`);
  totalJobs += r.count;
  if (r.status === "ok") working++;
}

console.log();
console.log(`  Total: ${totalJobs} opportunities from ${working}/${results.length} working scrapers`);
console.log("=".repeat(60));

// Save summary JSON
const summaryPath = path.join(outDir, "_summary.json");
fs.writeFileSync(summaryPath, JSON.stringify({
  timestamp: new Date().toISOString(),
  results,
  total: totalJobs,
  working,
}, null, 2));
console.log(`\n  Summary saved to: ${summaryPath}`);
