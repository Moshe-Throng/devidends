/**
 * Audit CV ingestion success rate.
 *
 * Queries the N most recent profiles from telegram_ingest (or any source),
 * computes a quality score from the extracted data, and reports a summary
 * plus per-CV breakdown of problems.
 *
 * Also checks Supabase Storage for a backup copy of each CV at the
 * deterministic path `cv-downloads/tg-ingest/YYYY-MM-DD/<file_id>.<ext>`.
 *
 * Usage:
 *   npx tsx scripts/ingest-audit.ts                      (last 50, all sources)
 *   npx tsx scripts/ingest-audit.ts --n 100              (last 100)
 *   npx tsx scripts/ingest-audit.ts --source telegram_ingest  (filter)
 *   npx tsx scripts/ingest-audit.ts --out ./audit.csv    (write CSV)
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
    const k = t.slice(0, idx).trim(), v = t.slice(idx + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[k]) process.env[k] = v;
  }
}

function arg(name: string, def?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  if (i < 0) return def;
  return process.argv[i + 1] || def;
}

const N = parseInt(arg("n", "50")!, 10);
const SOURCE_FILTER = arg("source");
const OUT = arg("out");

function assessQuality(cv: any): { score: number; warnings: string[] } {
  if (!cv) return { score: 0, warnings: ["no_structured_data"] };
  const w: string[] = [];
  let score = 100;
  const p = cv.personal || {};
  if (!p.full_name) { score -= 15; w.push("no_name"); }
  if (!p.email) { score -= 10; w.push("no_email"); }
  if (!p.phone) { score -= 5; w.push("no_phone"); }
  const emp = Array.isArray(cv.employment) ? cv.employment : [];
  if (emp.length === 0) { score -= 30; w.push("no_employment"); }
  else {
    const noDesc = emp.filter((e: any) => !(e.description_of_duties || "").trim()).length;
    if (noDesc > 0) { score -= Math.min(20, noDesc * 5); w.push(`${noDesc}_roles_no_duties`); }
    const noDates = emp.filter((e: any) => !e.from_date).length;
    if (noDates > 0) { score -= Math.min(10, noDates * 3); w.push(`${noDates}_roles_no_dates`); }
  }
  const edu = Array.isArray(cv.education) ? cv.education : [];
  if (edu.length === 0) { score -= 10; w.push("no_education"); }
  if (!cv.key_qualifications && !cv.professional_summary) { score -= 10; w.push("no_summary_or_quals"); }
  return { score: Math.max(0, score), warnings: w };
}

async function main() {
  const { createClient } = await import("@supabase/supabase-js");
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  console.log(`\n═══════════════════════════════════════════════════════════`);
  console.log(`  Ingest Audit — last ${N} profiles${SOURCE_FILTER ? ` (source=${SOURCE_FILTER})` : ""}`);
  console.log(`═══════════════════════════════════════════════════════════\n`);

  let q = sb
    .from("profiles")
    .select("id, name, source, cv_url, cv_structured_data, cv_score, created_at, recommended_by, gender, email, phone")
    .order("created_at", { ascending: false })
    .limit(N);
  if (SOURCE_FILTER) q = q.eq("source", SOURCE_FILTER);
  const { data: profiles, error } = await q;
  if (error) throw new Error(error.message);

  // Build a set of existing backup paths (list all under tg-ingest/)
  const backupPresence = new Map<string, boolean>();
  try {
    // List the last ~14 days of date folders
    const dates = [];
    for (let i = 0; i < 14; i++) {
      const d = new Date(Date.now() - i * 86400000);
      dates.push(d.toISOString().slice(0, 10));
    }
    for (const date of dates) {
      const { data: files } = await sb.storage.from("cv-downloads").list(`tg-ingest/${date}`, { limit: 1000 });
      for (const f of files || []) {
        // file name: <file_id>.<ext>
        const fileId = f.name.replace(/\.(pdf|docx?|doc)$/i, "");
        backupPresence.set(fileId, true);
      }
    }
  } catch {}

  const rows: any[] = [];
  const buckets = { green: 0, yellow: 0, red: 0 };
  const warningCounts: Record<string, number> = {};
  let withBackup = 0;

  for (const p of profiles || []) {
    const cv = (p as any).cv_structured_data;
    const { score, warnings } = assessQuality(cv);
    let backup = false;
    if (p.cv_url?.startsWith("tg://")) {
      const fid = p.cv_url.slice(5);
      backup = backupPresence.get(fid) || false;
    }
    if (backup) withBackup++;
    if (score >= 80) buckets.green++;
    else if (score >= 60) buckets.yellow++;
    else buckets.red++;
    for (const w of warnings) warningCounts[w] = (warningCounts[w] || 0) + 1;

    rows.push({
      name: p.name,
      source: p.source,
      created_at: (p as any).created_at,
      quality_score: score,
      warnings: warnings.join(";"),
      backup: backup ? "Y" : "N",
      cv_score: (p as any).cv_score ?? "",
      has_email: p.email ? "Y" : "N",
      has_phone: (p as any).phone ? "Y" : "N",
      recommended_by: (p as any).recommended_by || "",
      gender: (p as any).gender || "",
    });
  }

  console.log(`Total profiles:     ${rows.length}`);
  console.log(`Quality buckets:    🟢 ≥80: ${buckets.green}   🟡 60-79: ${buckets.yellow}   🔴 <60: ${buckets.red}`);
  const pct = rows.length ? Math.round((buckets.green / rows.length) * 100) : 0;
  console.log(`Success rate (≥80): ${pct}%`);
  console.log(`Raw file backup:    ${withBackup}/${rows.length} in cv-downloads/tg-ingest/`);
  console.log(`\nTop warnings:`);
  Object.entries(warningCounts).sort((a, b) => b[1] - a[1]).slice(0, 10).forEach(([w, n]) => {
    console.log(`  ${w.padEnd(24)} ${n}`);
  });

  console.log(`\n─── Low-quality rows (<60) ───`);
  const lows = rows.filter((r) => r.quality_score < 60).sort((a, b) => a.quality_score - b.quality_score);
  for (const r of lows.slice(0, 20)) {
    console.log(`  ${String(r.quality_score).padStart(3)}  ${r.name.padEnd(30)} · ${r.warnings}`);
  }
  if (lows.length > 20) console.log(`  … and ${lows.length - 20} more`);

  if (OUT) {
    const header = Object.keys(rows[0] || {}).join(",");
    const lines = rows.map((r) =>
      Object.values(r).map((v: any) => typeof v === "string" && v.includes(",") ? `"${v.replace(/"/g, '""')}"` : v).join(",")
    );
    fs.writeFileSync(OUT, [header, ...lines].join("\n"));
    console.log(`\nCSV written: ${OUT}`);
  }

  console.log(`\n═══════════════════════════════════════════════════════════\n`);
}

main().catch((e) => { console.error(e); process.exit(1); });
