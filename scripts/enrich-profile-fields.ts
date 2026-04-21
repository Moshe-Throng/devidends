/**
 * For every profile that has cv_text but no sectors/skills, run
 * extractProfileFromCV (Claude Haiku) to derive sectors, donors, skills,
 * headline, years_of_experience, profile_type, qualifications.
 *
 * Group-ingested profiles (telegram_ingest) skip this step at ingest time
 * to keep the webhook fast — this fills the gap so search/match works.
 *
 * Cost: ~$0.005 per profile (Haiku).
 *
 * Usage:
 *   npx tsx scripts/enrich-profile-fields.ts                    (dry run)
 *   npx tsx scripts/enrich-profile-fields.ts --apply
 *   npx tsx scripts/enrich-profile-fields.ts --apply --limit 10
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
const LIMIT_IDX = process.argv.indexOf("--limit");
const LIMIT = LIMIT_IDX >= 0 ? parseInt(process.argv[LIMIT_IDX + 1] || "0", 10) : 0;

async function main() {
  const { createClient } = await import("@supabase/supabase-js");
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { extractProfileFromCV } = await import("@/lib/extract-profile");

  console.log(`\n═══════════════════════════════════════════════════════════`);
  console.log(`  Enrich profile fields ${APPLY ? "(APPLY)" : "(DRY RUN)"}`);
  console.log(`═══════════════════════════════════════════════════════════\n`);

  const { data: profiles } = await sb
    .from("profiles")
    .select("id, name, source, cv_text, sectors, skills, donors, headline, profile_type, years_of_experience, qualifications")
    .not("cv_text", "is", null);

  // Need enrichment if sectors OR skills is empty
  const needs = (profiles || []).filter((p: any) => {
    const len = (p.cv_text || "").length;
    if (len < 500) return false;
    return (p.sectors || []).length === 0 || (p.skills || []).length === 0;
  });

  console.log(`Profiles with cv_text:    ${profiles?.length || 0}`);
  console.log(`Need enrichment:          ${needs.length}`);
  console.log(`Estimated cost (Haiku):   ~$${(needs.length * 0.005).toFixed(2)}\n`);

  if (!APPLY) {
    for (const p of needs.slice(0, 8)) console.log(`  would enrich: ${p.name?.padEnd(28)} [${p.source}]`);
    if (needs.length > 8) console.log(`  … and ${needs.length - 8} more`);
    console.log(`\nRe-run with --apply.`);
    return;
  }

  const todo = LIMIT > 0 ? needs.slice(0, LIMIT) : needs;
  let ok = 0, failed = 0;

  for (let i = 0; i < todo.length; i++) {
    const p: any = todo[i];
    const prefix = `[${i + 1}/${todo.length}]`;
    try {
      const extracted = await extractProfileFromCV(p.cv_text.slice(0, 30_000));
      const patch: any = {};
      // Only fill empty fields (don't overwrite existing data)
      if ((p.sectors || []).length === 0 && extracted.sectors?.length) patch.sectors = extracted.sectors;
      if ((p.skills || []).length === 0 && extracted.skills?.length) patch.skills = extracted.skills;
      if ((p.donors || []).length === 0 && extracted.donors?.length) patch.donors = extracted.donors;
      if (!p.headline && extracted.headline) patch.headline = extracted.headline;
      if (!p.profile_type && extracted.profile_type) patch.profile_type = extracted.profile_type;
      if (p.years_of_experience == null && extracted.years_of_experience != null) patch.years_of_experience = extracted.years_of_experience;
      if (!p.qualifications && extracted.qualifications) patch.qualifications = extracted.qualifications;

      if (Object.keys(patch).length === 0) {
        console.log(`${prefix} = ${p.name.padEnd(28)} (nothing to add)`);
        continue;
      }

      const { error } = await sb.from("profiles").update(patch).eq("id", p.id);
      if (error) { console.log(`${prefix} ✗ ${p.name.padEnd(28)} ${error.message}`); failed++; continue; }
      const summary = [
        patch.sectors && `sectors=${patch.sectors.length}`,
        patch.skills && `skills=${patch.skills.length}`,
        patch.donors && `donors=${patch.donors.length}`,
        patch.profile_type && `type=${patch.profile_type}`,
      ].filter(Boolean).join(" ");
      console.log(`${prefix} ✓ ${p.name.padEnd(28)} ${summary}`);
      ok++;
    } catch (e: any) {
      console.log(`${prefix} ✗ ${p.name.padEnd(28)} ${e.message?.slice(0, 80)}`);
      failed++;
    }
  }

  console.log(`\n═══════════════════════════════════════════════════════════`);
  console.log(`  Enriched: ${ok}  ·  Failed: ${failed}`);
  console.log(`═══════════════════════════════════════════════════════════\n`);
}

main().catch((e) => { console.error(e); process.exit(1); });
