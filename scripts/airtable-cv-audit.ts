/**
 * Airtable CV Audit
 *
 * Pulls all records + CV attachments from the Airtable Dev Recommender table,
 * downloads each CV, runs it through the extractor, and produces a
 * per-row audit report showing field coverage + red flags.
 *
 * Also matches each Airtable row to an existing Supabase profile
 * (by name + email) so we can later patch missing fields on the right profile.
 *
 * Usage:
 *   npx tsx scripts/airtable-cv-audit.ts            — full run
 *   npx tsx scripts/airtable-cv-audit.ts --limit 10 — quick test
 *
 * Outputs (test-output/):
 *   airtable-cv-audit-<date>.csv
 *   airtable-cv-audit-<date>.md
 *   airtable-cv-audit-<date>.json
 *   Downloaded CVs cached in .tmp/airtable-cvs/<AirtableID>.pdf
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

const LIMIT_IDX = process.argv.indexOf("--limit");
const LIMIT = LIMIT_IDX >= 0 ? parseInt(process.argv[LIMIT_IDX + 1] || "0", 10) : 0;

const TODAY = new Date().toISOString().slice(0, 10);
const CACHE_DIR = path.join(__dirname, "..", ".tmp", "airtable-cvs");
const OUT_DIR = path.join(__dirname, "..", "test-output");
fs.mkdirSync(CACHE_DIR, { recursive: true });
fs.mkdirSync(OUT_DIR, { recursive: true });

interface AirtableRow {
  id: string;
  fields: Record<string, any>;
}

async function fetchAll(): Promise<AirtableRow[]> {
  const T = process.env.AIRTABLE_API_KEY!;
  const B = process.env.AIRTABLE_BASE_ID!;
  const TB = process.env.AIRTABLE_TABLE_NAME!;
  const rows: AirtableRow[] = [];
  let offset = "";
  while (true) {
    const url = `https://api.airtable.com/v0/${B}/${encodeURIComponent(TB)}?pageSize=100${offset ? `&offset=${offset}` : ""}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${T}` } });
    if (!res.ok) throw new Error(`Airtable fetch failed: ${res.status} ${await res.text()}`);
    const d = await res.json();
    rows.push(...(d.records || []));
    if (!d.offset) break;
    offset = d.offset;
  }
  return rows;
}

async function downloadCv(row: AirtableRow): Promise<{ buffer: Buffer; filename: string } | null> {
  const atts = row.fields.CV || [];
  if (atts.length === 0) return null;
  const cv = atts[0];
  const cachedPath = path.join(CACHE_DIR, `${row.id}.${cv.filename.split(".").pop()}`);
  if (fs.existsSync(cachedPath)) {
    return { buffer: fs.readFileSync(cachedPath), filename: cv.filename };
  }
  const res = await fetch(cv.url);
  if (!res.ok) return null;
  const buffer = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(cachedPath, buffer);
  return { buffer, filename: cv.filename };
}

type Audit = {
  airtableId: string;
  name: string;
  email: string | null;
  filename: string | null;
  supabaseProfileId: string | null;
  sizeBytes: number;
  textLength: number;
  scannedSuspect: boolean;
  extractSuccess: boolean;
  confidence: number | null;
  hasName: boolean;
  hasEmail: boolean;
  hasPhone: boolean;
  employmentCount: number;
  employmentWithDates: number;
  employmentWithDesc: number;
  educationCount: number;
  languagesCount: number;
  certificationsCount: number;
  skillsCount: number;
  countriesCount: number;
  hasSummary: boolean;
  redFlags: string[];
  _extracted?: any;
};

async function auditRow(row: AirtableRow, supabaseProfiles: Map<string, string>): Promise<Audit> {
  const name = String(row.fields.Name || "").trim();
  const email = (row.fields["Email Address"] || "").toString().trim().toLowerCase() || null;

  const base: Audit = {
    airtableId: row.id,
    name,
    email,
    filename: null,
    supabaseProfileId: supabaseProfiles.get(email || "") || supabaseProfiles.get(name.toLowerCase()) || null,
    sizeBytes: 0,
    textLength: 0,
    scannedSuspect: false,
    extractSuccess: false,
    confidence: null,
    hasName: false,
    hasEmail: false,
    hasPhone: false,
    employmentCount: 0,
    employmentWithDates: 0,
    employmentWithDesc: 0,
    educationCount: 0,
    languagesCount: 0,
    certificationsCount: 0,
    skillsCount: 0,
    countriesCount: 0,
    hasSummary: false,
    redFlags: [],
  };

  const dl = await downloadCv(row);
  if (!dl) {
    base.redFlags.push("no CV attachment");
    return base;
  }
  base.filename = dl.filename;
  base.sizeBytes = dl.buffer.length;

  try {
    const ext = dl.filename.toLowerCase().split(".").pop() || "";
    const { extractPdfWithMeta, isLikelyScanned, extractText } = await import("../lib/file-parser");
    let cvText = "";
    if (ext === "pdf") {
      const { text, numpages } = await extractPdfWithMeta(dl.buffer);
      cvText = text;
      if (isLikelyScanned(text, numpages)) {
        base.scannedSuspect = true;
        base.redFlags.push(`scanned PDF (${numpages}p, ${text.length}ch)`);
      }
    } else {
      cvText = await extractText(dl.buffer, dl.filename);
    }
    base.textLength = cvText.length;

    if (cvText.length < 200) {
      base.redFlags.push(`text too short (${cvText.length})`);
      return base;
    }

    const { extractCvData } = await import("../lib/cv-extractor");
    const { data, confidence } = await extractCvData(cvText);
    base.extractSuccess = true;
    base.confidence = confidence;

    const cv = data as any;
    const p = cv.personal || {};
    base.hasName = !!p.full_name && p.full_name.toLowerCase() !== "unknown";
    base.hasEmail = !!p.email;
    base.hasPhone = !!p.phone;

    const emp = cv.employment || [];
    base.employmentCount = emp.length;
    base.employmentWithDates = emp.filter((e: any) => e.from_date || e.start_date).length;
    base.employmentWithDesc = emp.filter((e: any) => (e.description || "").length > 30 || (e.key_achievements || []).length > 0).length;

    base.educationCount = (cv.education || []).length;
    base.languagesCount = (cv.languages || []).length;
    base.certificationsCount = (cv.certifications || []).filter(Boolean).length;
    base.skillsCount = (cv.skills || []).length;
    base.countriesCount = (cv.countries_of_experience || []).length;
    base.hasSummary = !!cv.professional_summary;

    if (!base.hasName) base.redFlags.push("no name");
    if (!base.hasEmail) base.redFlags.push("no email");
    if (!base.hasPhone) base.redFlags.push("no phone");
    if (base.employmentCount === 0) base.redFlags.push("no employment");
    else if (base.employmentWithDates < base.employmentCount) base.redFlags.push(`${base.employmentCount - base.employmentWithDates}/${base.employmentCount} emp no dates`);
    if (base.employmentCount > 0 && base.employmentWithDesc < base.employmentCount * 0.5) {
      base.redFlags.push(`${base.employmentCount - base.employmentWithDesc}/${base.employmentCount} emp no desc`);
    }
    if (base.educationCount === 0) base.redFlags.push("no education");
    if (base.languagesCount === 0) base.redFlags.push("no languages");
    if (base.skillsCount < 3) base.redFlags.push(`only ${base.skillsCount} skills`);
    if (!base.hasSummary) base.redFlags.push("no summary");
    if (confidence != null && confidence < 0.7) base.redFlags.push(`low conf (${Math.round(confidence * 100)}%)`);

    base._extracted = data;
  } catch (e: any) {
    base.redFlags.push(`extract error: ${(e.message || String(e)).slice(0, 100)}`);
  }

  return base;
}

async function main() {
  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("  Airtable CV Audit");
  console.log("═══════════════════════════════════════════════════════════\n");

  console.log("Fetching Airtable records...");
  const rows = await fetchAll();
  console.log(`Got ${rows.length} records.`);

  const targetRows = rows.filter((r) => (r.fields.CV || []).length > 0);
  console.log(`${targetRows.length} have CV attachments.`);

  const batch = LIMIT > 0 ? targetRows.slice(0, LIMIT) : targetRows;
  console.log(`Auditing ${batch.length}...\n`);

  // Build Supabase profile lookup (email + name → profile id)
  const { createClient } = await import("@supabase/supabase-js");
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data: profiles } = await sb.from("profiles").select("id, name, email");
  const profileMap = new Map<string, string>();
  for (const p of profiles || []) {
    if (p.email) profileMap.set(p.email.toLowerCase(), p.id);
    if (p.name) profileMap.set(p.name.toLowerCase(), p.id);
  }

  const results: Audit[] = [];
  for (let i = 0; i < batch.length; i++) {
    const r = batch[i];
    const label = (r.fields.Name || r.id).toString().slice(0, 40);
    process.stdout.write(`[${i + 1}/${batch.length}] ${label.padEnd(42)}`);
    const audit = await auditRow(r, profileMap);
    results.push(audit);
    const mark = audit.extractSuccess ? (audit.redFlags.length === 0 ? "✓" : `⚠ ${audit.redFlags.length}`) : "✗";
    console.log(` ${mark}`);
  }

  // Aggregate flags
  const flagCounts: Record<string, number> = {};
  for (const r of results) {
    for (const f of r.redFlags) {
      const key = f.replace(/\d+/g, "N").replace(/\([^)]*\)/g, "").trim();
      flagCounts[key] = (flagCounts[key] || 0) + 1;
    }
  }
  const topFlags = Object.entries(flagCounts).sort((a, b) => b[1] - a[1]);

  const total = results.length;
  const clean = results.filter((r) => r.extractSuccess && r.redFlags.length === 0).length;
  const warn = results.filter((r) => r.extractSuccess && r.redFlags.length > 0).length;
  const fail = results.filter((r) => !r.extractSuccess).length;
  const scanned = results.filter((r) => r.scannedSuspect).length;
  const matched = results.filter((r) => !!r.supabaseProfileId).length;

  // CSV
  const csv = [[
    "airtable_id", "name", "email", "filename", "size_kb", "supabase_profile_id",
    "text_length", "scanned", "extract_success", "confidence",
    "name_ok", "email_ok", "phone_ok", "summary_ok",
    "emp_total", "emp_with_dates", "emp_with_desc",
    "edu_total", "langs", "certs", "skills", "countries",
    "red_flags"
  ].join(",")];
  for (const r of results) {
    csv.push([
      r.airtableId, `"${r.name.replace(/"/g, '""')}"`, r.email || "",
      `"${(r.filename || "").replace(/"/g, '""')}"`, Math.round(r.sizeBytes / 1024),
      r.supabaseProfileId || "",
      r.textLength, r.scannedSuspect, r.extractSuccess, r.confidence?.toFixed(2) || "",
      r.hasName ? "Y" : "N", r.hasEmail ? "Y" : "N", r.hasPhone ? "Y" : "N", r.hasSummary ? "Y" : "N",
      r.employmentCount, r.employmentWithDates, r.employmentWithDesc,
      r.educationCount, r.languagesCount, r.certificationsCount, r.skillsCount, r.countriesCount,
      `"${r.redFlags.join("; ").replace(/"/g, '""')}"`
    ].join(","));
  }
  const csvPath = path.join(OUT_DIR, `airtable-cv-audit-${TODAY}.csv`);
  fs.writeFileSync(csvPath, csv.join("\n"));

  // JSON
  const jsonPath = path.join(OUT_DIR, `airtable-cv-audit-${TODAY}.json`);
  fs.writeFileSync(jsonPath, JSON.stringify(results, null, 2));

  // Markdown
  const md = [
    `# Airtable CV Audit — ${TODAY}`,
    ``,
    `**Records audited:** ${total}`,
    `**With CV attachments:** ${results.filter((r) => r.filename).length}`,
    `**Matched to existing Supabase profile:** ${matched} (${Math.round((matched / total) * 100)}%)`,
    ``,
    `## Summary`,
    ``,
    `| Status | Count | % |`,
    `|---|---|---|`,
    `| ✓ Clean extraction | ${clean} | ${Math.round((clean / total) * 100)}% |`,
    `| ⚠ Extracted with issues | ${warn} | ${Math.round((warn / total) * 100)}% |`,
    `| ✗ Extraction failed | ${fail} | ${Math.round((fail / total) * 100)}% |`,
    `| Scanned PDFs | ${scanned} | ${Math.round((scanned / total) * 100)}% |`,
    ``,
    `## Top red flags`,
    ``,
    ...topFlags.slice(0, 20).map(([flag, n]) => `- **${n}×** ${flag}`),
    ``,
    `## Per-row issues`,
    ``,
    ...results
      .filter((r) => r.redFlags.length > 0)
      .map((r) => `### ${r.name || r.airtableId}${r.filename ? ` (${r.filename})` : ""}\n\n- ${r.redFlags.join("\n- ")}`),
    ``,
  ].join("\n");
  const mdPath = path.join(OUT_DIR, `airtable-cv-audit-${TODAY}.md`);
  fs.writeFileSync(mdPath, md);

  console.log("\n═══════════════════════════════════════════════════════════");
  console.log(`  Total:     ${total}`);
  console.log(`  Clean:     ${clean}`);
  console.log(`  Issues:    ${warn}`);
  console.log(`  Failed:    ${fail}`);
  console.log(`  Scanned:   ${scanned}`);
  console.log(`  Matched:   ${matched}/${total} to Supabase profile`);
  console.log(`\n  Top issues:`);
  for (const [f, n] of topFlags.slice(0, 8)) console.log(`    ${n}× ${f}`);
  console.log(`\n  Reports:`);
  console.log(`    ${csvPath}`);
  console.log(`    ${mdPath}`);
  console.log(`    ${jsonPath}`);
  console.log("═══════════════════════════════════════════════════════════\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
