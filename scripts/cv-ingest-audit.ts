/**
 * CV Ingest Audit — takes a folder of CVs, runs each through the extractor,
 * reports what was captured vs missed per file. Produces a CSV + markdown summary.
 *
 * Usage:
 *   npx tsx scripts/cv-ingest-audit.ts              (default folder: .tmp/audit-cvs)
 *   npx tsx scripts/cv-ingest-audit.ts /path/to/cvs
 *
 * Output:
 *   test-output/cv-audit-<date>.csv   — per-file field coverage
 *   test-output/cv-audit-<date>.md    — human summary + top issues
 *   test-output/cv-audit-<date>.json  — full structured extractions (for review)
 */

import * as fs from "fs";
import * as path from "path";

const envPath = path.join(__dirname, "..", ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const idx = t.indexOf("=");
    if (idx < 0) continue;
    const key = t.slice(0, idx).trim();
    const val = t.slice(idx + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = val;
  }
}

const INPUT_DIR = process.argv[2] || path.join(__dirname, "..", ".tmp", "audit-cvs");
const OUT_DIR = path.join(__dirname, "..", "test-output");
const TODAY = new Date().toISOString().slice(0, 10);

type FileResult = {
  file: string;
  sizeBytes: number;
  fileType: string;
  textLength: number;
  textSample: string;
  scannedSuspect: boolean;
  extractSuccess: boolean;
  extractError: string | null;
  confidence: number | null;
  // Field coverage
  hasName: boolean;
  hasEmail: boolean;
  hasPhone: boolean;
  hasNationality: boolean;
  employmentCount: number;
  employmentWithDates: number;
  employmentWithDesc: number;
  educationCount: number;
  educationWithInst: number;
  languagesCount: number;
  certificationsCount: number;
  skillsCount: number;
  countriesCount: number;
  hasSummary: boolean;
  // Red flags
  redFlags: string[];
};

function findFiles(dir: string): string[] {
  const out: string[] = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...findFiles(full));
    else if (/\.(pdf|docx|doc)$/i.test(entry.name)) out.push(full);
  }
  return out;
}

async function auditOne(filePath: string): Promise<FileResult> {
  const buffer = fs.readFileSync(filePath);
  const name = path.basename(filePath);
  const ext = name.toLowerCase().split(".").pop() || "unknown";

  const base: FileResult = {
    file: name,
    sizeBytes: buffer.length,
    fileType: ext,
    textLength: 0,
    textSample: "",
    scannedSuspect: false,
    extractSuccess: false,
    extractError: null,
    confidence: null,
    hasName: false,
    hasEmail: false,
    hasPhone: false,
    hasNationality: false,
    employmentCount: 0,
    employmentWithDates: 0,
    employmentWithDesc: 0,
    educationCount: 0,
    educationWithInst: 0,
    languagesCount: 0,
    certificationsCount: 0,
    skillsCount: 0,
    countriesCount: 0,
    hasSummary: false,
    redFlags: [],
  };

  try {
    // 1. Text extraction
    const { extractPdfWithMeta, isLikelyScanned, extractText } = await import("../lib/file-parser");
    let cvText = "";
    if (ext === "pdf") {
      const { text, numpages } = await extractPdfWithMeta(buffer);
      cvText = text;
      if (isLikelyScanned(text, numpages)) {
        base.scannedSuspect = true;
        base.redFlags.push(`scanned PDF (${numpages} pages, ${text.length} chars)`);
      }
    } else {
      cvText = await extractText(buffer, name);
    }

    base.textLength = cvText.length;
    base.textSample = cvText.slice(0, 200).replace(/\s+/g, " ").trim();

    if (cvText.length < 200) {
      base.redFlags.push(`text too short (${cvText.length} chars)`);
      return base;
    }

    // 2. AI structured extraction
    const { extractCvData } = await import("../lib/cv-extractor");
    const { data, confidence } = await extractCvData(cvText);
    base.extractSuccess = true;
    base.confidence = confidence;

    // 3. Field coverage analysis
    const cv = data as any;
    const p = cv.personal || {};
    base.hasName = !!p.full_name && p.full_name.toLowerCase() !== "unknown";
    base.hasEmail = !!p.email;
    base.hasPhone = !!p.phone;
    base.hasNationality = !!p.nationality;

    const emp = cv.employment || [];
    base.employmentCount = emp.length;
    base.employmentWithDates = emp.filter((e: any) => e.from_date || e.start_date).length;
    base.employmentWithDesc = emp.filter((e: any) => (e.description || "").length > 30 || (e.key_achievements || []).length > 0).length;

    const edu = cv.education || [];
    base.educationCount = edu.length;
    base.educationWithInst = edu.filter((e: any) => !!e.institution).length;

    base.languagesCount = (cv.languages || []).length;
    base.certificationsCount = (cv.certifications || []).filter(Boolean).length;
    base.skillsCount = (cv.skills || []).length;
    base.countriesCount = (cv.countries_of_experience || []).length;
    base.hasSummary = !!cv.professional_summary;

    // Red flags — where coverage is weak
    if (!base.hasName) base.redFlags.push("no name");
    if (!base.hasEmail) base.redFlags.push("no email");
    if (!base.hasPhone) base.redFlags.push("no phone");
    if (base.employmentCount === 0) base.redFlags.push("no employment extracted");
    else if (base.employmentWithDates < base.employmentCount) base.redFlags.push(`${base.employmentCount - base.employmentWithDates}/${base.employmentCount} employment without dates`);
    if (base.employmentCount > 0 && base.employmentWithDesc < base.employmentCount * 0.5) base.redFlags.push(`${base.employmentCount - base.employmentWithDesc}/${base.employmentCount} employment without description`);
    if (base.educationCount === 0) base.redFlags.push("no education extracted");
    else if (base.educationWithInst < base.educationCount) base.redFlags.push(`${base.educationCount - base.educationWithInst}/${base.educationCount} education missing institution`);
    if (base.languagesCount === 0) base.redFlags.push("no languages");
    if (base.skillsCount < 3) base.redFlags.push(`only ${base.skillsCount} skills`);
    if (!base.hasSummary) base.redFlags.push("no professional summary");
    if (confidence && confidence < 0.7) base.redFlags.push(`low confidence (${Math.round(confidence * 100)}%)`);

    // Save the extracted data for review
    (base as any)._extracted = data;
    (base as any)._rawText = cvText;
  } catch (e: any) {
    base.extractError = e.message || "Unknown error";
    base.redFlags.push(`extraction threw: ${base.extractError}`);
  }

  return base;
}

async function main() {
  console.log(`\n═══════════════════════════════════════════════════════════`);
  console.log(`  CV Ingest Audit`);
  console.log(`═══════════════════════════════════════════════════════════\n`);
  console.log(`Input folder: ${INPUT_DIR}`);

  const files = findFiles(INPUT_DIR);
  console.log(`Found ${files.length} CV files.\n`);

  if (files.length === 0) {
    console.log(`Drop PDFs/DOCX into ${INPUT_DIR} and re-run.`);
    return;
  }

  const results: FileResult[] = [];
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    process.stdout.write(`[${i + 1}/${files.length}] ${path.basename(f).slice(0, 55)}...`);
    const r = await auditOne(f);
    results.push(r);
    const status = r.extractSuccess ? (r.redFlags.length === 0 ? "✓" : `⚠ ${r.redFlags.length}`) : "✗";
    console.log(` ${status}`);
  }

  // Write CSV
  const csvHeaders = [
    "file", "size_kb", "type", "text_length", "scanned_suspect", "extract_success",
    "confidence", "name", "email", "phone", "summary",
    "emp_total", "emp_with_dates", "emp_with_desc",
    "edu_total", "edu_with_inst",
    "languages", "certifications", "skills", "countries",
    "red_flags",
  ];
  const csvRows = [csvHeaders.join(",")];
  for (const r of results) {
    csvRows.push([
      `"${r.file.replace(/"/g, '""')}"`,
      Math.round(r.sizeBytes / 1024),
      r.fileType,
      r.textLength,
      r.scannedSuspect,
      r.extractSuccess,
      r.confidence != null ? r.confidence.toFixed(2) : "",
      r.hasName ? "Y" : "N",
      r.hasEmail ? "Y" : "N",
      r.hasPhone ? "Y" : "N",
      r.hasSummary ? "Y" : "N",
      r.employmentCount,
      r.employmentWithDates,
      r.employmentWithDesc,
      r.educationCount,
      r.educationWithInst,
      r.languagesCount,
      r.certificationsCount,
      r.skillsCount,
      r.countriesCount,
      `"${r.redFlags.join("; ").replace(/"/g, '""')}"`,
    ].join(","));
  }
  const csvPath = path.join(OUT_DIR, `cv-audit-${TODAY}.csv`);
  fs.writeFileSync(csvPath, csvRows.join("\n"));

  // Write JSON (with raw data for manual review)
  const jsonPath = path.join(OUT_DIR, `cv-audit-${TODAY}.json`);
  fs.writeFileSync(jsonPath, JSON.stringify(results, null, 2));

  // Write Markdown summary
  const total = results.length;
  const ok = results.filter((r) => r.extractSuccess && r.redFlags.length === 0).length;
  const warn = results.filter((r) => r.extractSuccess && r.redFlags.length > 0).length;
  const failed = results.filter((r) => !r.extractSuccess).length;
  const scanned = results.filter((r) => r.scannedSuspect).length;

  // Aggregate red flag patterns
  const flagCounts: Record<string, number> = {};
  for (const r of results) {
    for (const f of r.redFlags) {
      const key = f.replace(/\d+/g, "N").replace(/\([^)]*\)/g, "").trim();
      flagCounts[key] = (flagCounts[key] || 0) + 1;
    }
  }
  const topFlags = Object.entries(flagCounts).sort((a, b) => b[1] - a[1]);

  const md = [
    `# CV Ingest Audit — ${TODAY}`,
    ``,
    `**Input:** ${INPUT_DIR}`,
    `**Files audited:** ${total}`,
    ``,
    `## Summary`,
    ``,
    `| Status | Count | % |`,
    `|---|---|---|`,
    `| ✓ Clean extraction | ${ok} | ${Math.round((ok / total) * 100)}% |`,
    `| ⚠ Extracted with issues | ${warn} | ${Math.round((warn / total) * 100)}% |`,
    `| ✗ Extraction failed | ${failed} | ${Math.round((failed / total) * 100)}% |`,
    `| (of which scanned PDFs) | ${scanned} | ${Math.round((scanned / total) * 100)}% |`,
    ``,
    `## Top issues`,
    ``,
    ...topFlags.slice(0, 15).map(([flag, n]) => `- **${n}×** ${flag}`),
    ``,
    `## Per-file red flags`,
    ``,
    ...results
      .filter((r) => r.redFlags.length > 0)
      .map((r) => `### ${r.file}\n\n- ${r.redFlags.join("\n- ")}\n\n*Text sample:* ${r.textSample.slice(0, 150)}...\n`),
    ``,
    `## Clean files (no issues)`,
    ``,
    ...results.filter((r) => r.extractSuccess && r.redFlags.length === 0).map((r) => `- ${r.file} (${r.employmentCount} roles, ${r.educationCount} education, ${Math.round((r.confidence || 0) * 100)}% conf)`),
  ].join("\n");
  const mdPath = path.join(OUT_DIR, `cv-audit-${TODAY}.md`);
  fs.writeFileSync(mdPath, md);

  console.log(`\n═══════════════════════════════════════════════════════════`);
  console.log(`  Summary:`);
  console.log(`    Total:      ${total}`);
  console.log(`    Clean:      ${ok} (${Math.round((ok / total) * 100)}%)`);
  console.log(`    With issues:${warn}`);
  console.log(`    Failed:     ${failed}`);
  console.log(`    Scanned:    ${scanned}`);
  console.log(`\n  Top issues:`);
  for (const [flag, n] of topFlags.slice(0, 8)) console.log(`    ${n}× ${flag}`);
  console.log(`\n  Reports:`);
  console.log(`    ${csvPath}`);
  console.log(`    ${mdPath}`);
  console.log(`    ${jsonPath}`);
  console.log(`═══════════════════════════════════════════════════════════\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
