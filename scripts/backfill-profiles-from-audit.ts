/**
 * Backfill Supabase profiles from a completed audit's extracted data.
 *
 * Takes the JSON report from scripts/airtable-cv-audit.ts and, for each row:
 *   - Matches to a Supabase profile (by email, then name)
 *   - Patches missing or weaker fields:
 *     cv_structured_data, cv_text, email, phone, nationality, city,
 *     sectors/countries/languages/certifications/qualifications,
 *     education_level, years_of_experience, profile_type, recommended_by
 *   - Re-generates cv_text from structured data so scoring works
 *   - NEVER overwrites a cv_structured_data that has MORE employment entries
 *     than the incoming one (keeps the richer version)
 *
 * Usage:
 *   npx tsx scripts/backfill-profiles-from-audit.ts                  (dry run)
 *   npx tsx scripts/backfill-profiles-from-audit.ts --apply          (apply)
 *   npx tsx scripts/backfill-profiles-from-audit.ts --audit <path>   (custom file)
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

const APPLY = process.argv.includes("--apply");
const auditIdx = process.argv.indexOf("--audit");
const AUDIT_PATH = auditIdx >= 0
  ? process.argv[auditIdx + 1]
  : path.join(__dirname, "..", "test-output", `airtable-cv-audit-${new Date().toISOString().slice(0, 10)}.json`);

function buildCvText(cv: any): string {
  const lines: string[] = [];
  const p = cv.personal || {};
  if (p.full_name) lines.push(p.full_name);
  if (p.email || p.phone) lines.push([p.email, p.phone].filter(Boolean).join(" | "));
  if (p.nationality) lines.push(`Nationality: ${p.nationality}`);
  if (p.address) lines.push(p.address);
  if (cv.professional_summary) lines.push("", "SUMMARY", cv.professional_summary);
  if (cv.education?.length) {
    lines.push("", "EDUCATION");
    for (const e of cv.education) lines.push(`${e.degree || ""} ${e.field_of_study || ""} — ${e.institution || ""} (${e.country || ""}, ${e.year_graduated || ""})`);
  }
  if (cv.employment?.length) {
    lines.push("", "PROFESSIONAL EXPERIENCE");
    for (const e of cv.employment) {
      lines.push(`${e.position || ""} — ${e.employer || ""} (${e.from_date || ""} to ${e.to_date || "Present"})`);
      if (e.country) lines.push(`Location: ${e.country}`);
      if (e.description_of_duties) lines.push(e.description_of_duties);
    }
  }
  if (cv.key_qualifications) lines.push("", "KEY QUALIFICATIONS", cv.key_qualifications);
  if (cv.languages?.length) {
    lines.push("", "LANGUAGES");
    for (const l of cv.languages) lines.push(`${l.language}: reading ${l.reading}, writing ${l.writing}, speaking ${l.speaking}`);
  }
  if (cv.certifications?.length) lines.push("", "CERTIFICATIONS", cv.certifications.filter(Boolean).join("; "));
  if (cv.countries_of_experience?.length) lines.push("", "COUNTRIES OF EXPERIENCE", cv.countries_of_experience.join(", "));
  if (cv.publications?.length) lines.push("", "PUBLICATIONS", cv.publications.filter(Boolean).join("\n"));
  return lines.join("\n").trim();
}

function deriveEduLevel(edu: any[]): string | null {
  const degrees = (edu || []).map((e) => (e.degree || "").toLowerCase());
  if (degrees.some((d) => /phd|doctorate/i.test(d))) return "PhD";
  if (degrees.some((d) => /master|msc|mph|mpa|mba|ma\b|mas\./i.test(d))) return "Masters";
  if (degrees.some((d) => /bachelor|bsc|ba\b|beng|llb/i.test(d))) return "Bachelors";
  if (degrees.some((d) => /diploma/i.test(d))) return "Diploma";
  return null;
}

function deriveYoE(emp: any[]): number | null {
  if (!emp || emp.length === 0) return null;
  const dates = emp.map((e) => e.from_date).filter(Boolean).sort();
  if (dates.length === 0) return null;
  const earliest = new Date(dates[0]);
  if (isNaN(earliest.getTime()) || earliest.getFullYear() < 1970) return null;
  return Math.max(0, new Date().getFullYear() - earliest.getFullYear());
}

function profileType(yrs: number | null): string | null {
  if (yrs == null) return null;
  if (yrs >= 15) return "Expert";
  if (yrs >= 10) return "Senior";
  if (yrs >= 5) return "Mid-level";
  if (yrs >= 2) return "Junior";
  return "Entry";
}

async function main() {
  if (!fs.existsSync(AUDIT_PATH)) {
    console.error(`Audit JSON not found: ${AUDIT_PATH}`);
    console.error(`Pass --audit <path> or run an audit first.`);
    process.exit(1);
  }

  const audit = JSON.parse(fs.readFileSync(AUDIT_PATH, "utf-8"));
  const extractable = audit.filter((r: any) => r.extractSuccess && r._extracted);
  console.log(`\n═══════════════════════════════════════════════════════════`);
  console.log(`  Backfill from audit ${APPLY ? "(APPLY)" : "(DRY RUN)"}`);
  console.log(`═══════════════════════════════════════════════════════════`);
  console.log(`Audit file:   ${AUDIT_PATH}`);
  console.log(`Rows:         ${audit.length}`);
  console.log(`Extractable:  ${extractable.length}\n`);

  if (extractable.length === 0) {
    console.log("No successful extractions to backfill from.");
    return;
  }

  const { createClient } = await import("@supabase/supabase-js");
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  let updated = 0, created = 0, skipped = 0;

  for (const row of extractable) {
    const cv = row._extracted;
    const p = cv.personal || {};
    const name = row.name || p.full_name;
    const email = p.email || row.email;

    // Find target profile
    let profile: any = null;
    if (row.supabaseProfileId) {
      const { data } = await sb.from("profiles").select("*").eq("id", row.supabaseProfileId).single();
      profile = data;
    }
    if (!profile && email) {
      const { data } = await sb.from("profiles").select("*").eq("email", email).maybeSingle();
      profile = data;
    }
    if (!profile && name) {
      const { data } = await sb.from("profiles").select("*").ilike("name", name).maybeSingle();
      profile = data;
    }

    // Decide: create or update
    const existingEmpCount = profile?.cv_structured_data?.employment?.length || 0;
    const newEmpCount = (cv.employment || []).length;

    // Compute derived fields
    const cvText = buildCvText(cv);
    const eduLevel = deriveEduLevel(cv.education);
    const yoe = deriveYoE(cv.employment);
    const pType = profileType(yoe);
    const languages = (cv.languages || []).map((l: any) => l.language).filter(Boolean);
    const certs = (cv.certifications || []).filter(Boolean);

    const patch: any = {};
    // Always update CV text + structured if incoming is richer
    if (newEmpCount >= existingEmpCount || !profile?.cv_structured_data) {
      patch.cv_structured_data = cv;
      patch.cv_text = cvText.slice(0, 50_000);
    }
    // Fill gaps — only set if current field is empty/null
    if (!profile?.email && email) patch.email = email;
    if (!profile?.phone && p.phone) patch.phone = p.phone;
    if (!profile?.nationality && p.nationality) patch.nationality = p.nationality;
    if (!profile?.city && (p.address || p.country_of_residence)) patch.city = p.address || p.country_of_residence;
    if (!profile?.education_level && eduLevel) patch.education_level = eduLevel;
    if (!profile?.years_of_experience && yoe != null) patch.years_of_experience = yoe;
    if (!profile?.profile_type && pType) patch.profile_type = pType;
    if (!profile?.qualifications && cv.key_qualifications) patch.qualifications = cv.key_qualifications.slice(0, 10_000);
    // Array fields — union
    const mergeArr = (existing: any[], incoming: any[]) => [...new Set([...(existing || []), ...(incoming || [])])];
    if (languages.length > 0) {
      const merged = mergeArr(profile?.languages || [], languages);
      if (merged.length > (profile?.languages?.length || 0)) patch.languages = merged;
    }
    if (certs.length > 0) {
      const merged = mergeArr(profile?.certifications || [], certs);
      if (merged.length > (profile?.certifications?.length || 0)) patch.certifications = merged;
    }
    const countries = cv.countries_of_experience || [];
    if (countries.length > 0) {
      const merged = mergeArr(profile?.countries || [], countries);
      if (merged.length > (profile?.countries?.length || 0)) patch.countries = merged;
    }

    if (Object.keys(patch).length === 0) {
      console.log(`- ${name.padEnd(28)} → skip (no changes)`);
      skipped++;
      continue;
    }

    if (!profile) {
      console.log(`+ ${name.padEnd(28)} → CREATE (emp:${newEmpCount})`);
      if (APPLY) {
        const { error } = await sb.from("profiles").insert({
          name, email, source: "airtable_backfill",
          ...patch,
        });
        if (error) console.log(`  ✗ ${error.message}`); else created++;
      } else created++;
    } else {
      const fields = Object.keys(patch).join(", ");
      console.log(`~ ${name.padEnd(28)} → UPDATE [${fields}]`);
      if (APPLY) {
        const { error } = await sb.from("profiles").update(patch).eq("id", profile.id);
        if (error) console.log(`  ✗ ${error.message}`); else updated++;
      } else updated++;
    }
  }

  console.log(`\n═══════════════════════════════════════════════════════════`);
  console.log(`  ${APPLY ? "Applied" : "Would apply"}:`);
  console.log(`    Updated:    ${updated}`);
  console.log(`    Created:    ${created}`);
  console.log(`    Skipped:    ${skipped}`);
  if (!APPLY) console.log(`\n  Re-run with --apply to execute.`);
  console.log(`═══════════════════════════════════════════════════════════\n`);
}

main().catch((e) => { console.error(e); process.exit(1); });
