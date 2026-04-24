/**
 * Output a classifier-ready list of all UNCLAIMED recommenders, grouped by
 * available channels. Mussie annotates each one email vs telegram, then we
 * build the outreach batches accordingly.
 */

import * as fs from "fs";
import * as path from "path";
import { createClient } from "@supabase/supabase-js";

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
    .select("id, name, email, telegram_id, claim_token, years_of_experience, source, headline")
    .eq("is_recommender", true)
    .is("claimed_at", null)
    .order("name");

  const all = (recs || []).map((r: any) => ({
    ...r,
    first_email: parseEmail(r.email),
  }));

  // How many each has brought in (fuzzy match on recommended_by)
  const { data: recBy } = await sb
    .from("profiles")
    .select("recommended_by")
    .not("recommended_by", "is", null);
  const recBlobs = (recBy || []).map((r: any) => (r.recommended_by || "").toLowerCase());
  for (const r of all) {
    const parts = r.name.toLowerCase().split(/\s+/).filter(Boolean);
    r.brought_in = recBlobs.filter((rb: string) => {
      if (!rb.includes(parts[0])) return false;
      if (parts.length === 1) return true;
      return parts.slice(1).some((p: string) => p.length >= 3 && rb.includes(p));
    }).length;
  }

  const hasTgAndEmail = all.filter((r: any) => r.telegram_id && r.first_email);
  const tgOnly = all.filter((r: any) => r.telegram_id && !r.first_email);
  const emailOnly = all.filter((r: any) => !r.telegram_id && r.first_email);
  const neither = all.filter((r: any) => !r.telegram_id && !r.first_email);

  console.log(`# Unclaimed Recommenders — ${all.length} total\n`);
  console.log(`Generated ${new Date().toISOString().slice(0, 10)}\n`);

  const row = (r: any) => {
    const yrs = r.years_of_experience ? `${r.years_of_experience}y` : "-";
    const warm = r.brought_in > 0 ? `[${r.brought_in} brought in] ` : "";
    return `| ${r.name} | ${yrs} | ${warm}${(r.headline || "").slice(0, 55)} | ${r.first_email || "-"} | ${r.telegram_id || "-"} | ${r.claim_token || "MISSING"} |`;
  };

  const header = `| Name | Yrs | Headline | Email | TG id | Claim token |`;
  const sep = `|------|-----|----------|-------|-------|-------------|`;

  console.log(`## Has both email + Telegram (${hasTgAndEmail.length}) — you pick channel`);
  if (hasTgAndEmail.length > 0) {
    console.log(`\n${header}`);
    console.log(sep);
    for (const r of hasTgAndEmail.sort((a: any, b: any) => b.brought_in - a.brought_in)) console.log(row(r));
  }

  console.log(`\n## Telegram only (${tgOnly.length}) — bot DM candidates`);
  if (tgOnly.length > 0) {
    console.log(`\n${header}`);
    console.log(sep);
    for (const r of tgOnly.sort((a: any, b: any) => b.brought_in - a.brought_in)) console.log(row(r));
  }

  console.log(`\n## Email only (${emailOnly.length}) — email candidates`);
  if (emailOnly.length > 0) {
    console.log(`\n${header}`);
    console.log(sep);
    for (const r of emailOnly.sort((a: any, b: any) => b.brought_in - a.brought_in)) console.log(row(r));
  }

  console.log(`\n## Neither email nor Telegram (${neither.length}) — needs manual outreach`);
  if (neither.length > 0) {
    console.log(`\n${header}`);
    console.log(sep);
    for (const r of neither.sort((a: any, b: any) => b.brought_in - a.brought_in)) console.log(row(r));
  }

  // Write a TSV for easy spreadsheet import
  const out = path.join(__dirname, "..", ".tmp", "unclaimed-recommenders.tsv");
  try {
    fs.mkdirSync(path.dirname(out), { recursive: true });
    const tsv = [
      ["Name", "Brought_in", "Years", "Headline", "Email", "TG_id", "Claim_token", "Source", "Bucket", "Your_choice_email_or_tg"].join("\t"),
      ...all.map((r: any) => [
        r.name, r.brought_in, r.years_of_experience || "", (r.headline || "").replace(/\t/g, " "),
        r.first_email || "", r.telegram_id || "", r.claim_token || "", r.source || "",
        r.telegram_id && r.first_email ? "both"
          : r.telegram_id ? "tg_only"
          : r.first_email ? "email_only"
          : "neither",
        "",
      ].join("\t")),
    ].join("\n");
    fs.writeFileSync(out, tsv);
    console.log(`\nTSV written to: ${out}`);
  } catch (e) { /* non-critical */ }
}

main().catch((e) => { console.error(e); process.exit(1); });
