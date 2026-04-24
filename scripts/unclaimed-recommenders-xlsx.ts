/**
 * Generate an Excel workbook (.xlsx) of unclaimed recommenders for Mussie to
 * classify email vs telegram vs skip per recipient.
 * Writes to C:\Files\Pers\Devidends\unclaimed-recommenders.xlsx
 */

import * as fs from "fs";
import * as path from "path";
import { createClient } from "@supabase/supabase-js";
import ExcelJS from "exceljs";

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

const EMAIL_RE = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i;
function parseEmail(raw: string | null): string | null {
  if (!raw) return null;
  const parts = raw.split(/[;,]|\s+or\s+|\s+\/\s+/).map((s) => s.trim()).filter(Boolean);
  for (const p of parts) if (EMAIL_RE.test(p)) return p;
  return null;
}

async function main() {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  const { data: recs } = await sb
    .from("profiles")
    .select("id, name, email, telegram_id, claim_token, years_of_experience, source, headline, cv_score, sectors")
    .eq("is_recommender", true)
    .is("claimed_at", null)
    .order("name");
  const all = (recs || []).map((r: any) => ({ ...r, first_email: parseEmail(r.email) }));

  // brought_in counts
  const { data: recBy } = await sb.from("profiles").select("recommended_by").not("recommended_by", "is", null);
  const recBlobs = (recBy || []).map((r: any) => (r.recommended_by || "").toLowerCase());
  for (const r of all) {
    const parts = r.name.toLowerCase().split(/\s+/).filter(Boolean);
    r.brought_in = recBlobs.filter((rb: string) => {
      if (!rb.includes(parts[0])) return false;
      if (parts.length === 1) return true;
      return parts.slice(1).some((p: string) => p.length >= 3 && rb.includes(p));
    }).length;
  }

  const bucketOf = (r: any) =>
    r.telegram_id && r.first_email ? "Both"
    : r.telegram_id ? "Telegram only"
    : r.first_email ? "Email only"
    : "Neither";

  // Sort: by bucket priority then by brought_in desc then name
  const bucketOrder = { "Both": 0, "Telegram only": 1, "Email only": 2, "Neither": 3 } as const;
  all.sort((a: any, b: any) => {
    const ba = bucketOrder[bucketOf(a) as keyof typeof bucketOrder];
    const bb = bucketOrder[bucketOf(b) as keyof typeof bucketOrder];
    if (ba !== bb) return ba - bb;
    if (a.brought_in !== b.brought_in) return b.brought_in - a.brought_in;
    return a.name.localeCompare(b.name);
  });

  const wb = new ExcelJS.Workbook();
  wb.creator = "Devidends";
  wb.created = new Date();
  const ws = wb.addWorksheet("Unclaimed Recommenders");

  ws.columns = [
    { header: "Choice (email/tg/skip/manual)", key: "choice", width: 28 },
    { header: "Name", key: "name", width: 32 },
    { header: "Bucket", key: "bucket", width: 16 },
    { header: "Brought in", key: "brought_in", width: 12 },
    { header: "Years", key: "years", width: 8 },
    { header: "Headline", key: "headline", width: 60 },
    { header: "Email", key: "email", width: 36 },
    { header: "Telegram id", key: "tg", width: 15 },
    { header: "Claim token", key: "token", width: 12 },
    { header: "CV score", key: "cv_score", width: 10 },
    { header: "Top sectors", key: "sectors", width: 40 },
    { header: "Source", key: "source", width: 18 },
  ];

  // Header style
  const headerRow = ws.getRow(1);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF212121" } };
  headerRow.alignment = { vertical: "middle" };
  headerRow.height = 24;

  for (const r of all) {
    const bucket = bucketOf(r);
    const row = ws.addRow({
      choice: "",
      name: r.name,
      bucket,
      brought_in: r.brought_in || 0,
      years: r.years_of_experience || "",
      headline: r.headline || "",
      email: r.first_email || "",
      tg: r.telegram_id || "",
      token: r.claim_token || "MISSING",
      cv_score: r.cv_score ?? "",
      sectors: (r.sectors || []).slice(0, 4).join(", "),
      source: r.source || "",
    });
    // Color-code bucket column
    const bucketCell = row.getCell("bucket");
    if (bucket === "Both") bucketCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD1F5EA" } };
    else if (bucket === "Telegram only") bucketCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFCEEAFD" } };
    else if (bucket === "Email only") bucketCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFEFC9" } };
    else if (bucket === "Neither") bucketCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFADADA" } };

    // Highlight warmers
    if ((r.brought_in || 0) >= 3) {
      row.getCell("brought_in").font = { bold: true, color: { argb: "FFB8860B" } };
    }

    // Data validation on choice column
    row.getCell("choice").dataValidation = {
      type: "list",
      allowBlank: true,
      formulae: ['"email,tg,skip,manual"'],
      showErrorMessage: true,
      errorTitle: "Invalid",
      error: "Choose email, tg, skip, or manual",
    };
  }

  // Freeze header row
  ws.views = [{ state: "frozen", ySplit: 1 }];

  // Auto filter
  ws.autoFilter = { from: "A1", to: `L${ws.rowCount}` };

  const outDir = "C:\\Files\\Pers\\Devidends";
  fs.mkdirSync(outDir, { recursive: true });
  const out = path.join(outDir, "unclaimed-recommenders.xlsx");
  await wb.xlsx.writeFile(out);
  console.log(`✓ Wrote ${all.length} rows to ${out}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
