/**
 * Identity Harmonizer — detects duplicate profiles and unlinked Co-Creator
 * records, reports merge candidates, and (with --apply) performs merges.
 *
 * Detection rules (strong identity signals only):
 *   1. Same non-null EMAIL    → strong evidence, merge
 *   2. Same non-null TELEGRAM_ID → strong evidence, merge
 *   3. Same PHONE + first-name token match → conditional (phones can collide across people)
 *
 * Merge strategy:
 *   - Keeper = profile with the most signal (has cv_structured_data > has CV score > has user_id > has email > has telegram_id > most recent)
 *   - Copy missing fields from losers to keeper (telegram_id, email, phone, claim_token, etc.)
 *   - Merge array fields as union (sectors, countries, skills, languages, certifications, donors)
 *   - Re-point all co_creators.profile_id and events/cv_scores to the keeper
 *   - Delete losers
 *
 * Usage:
 *   npx tsx scripts/harmonize-identities.ts           (dry run, report only)
 *   npx tsx scripts/harmonize-identities.ts --apply   (perform merges)
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

const APPLY = process.argv.includes("--apply");

type Profile = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  telegram_id: string | null;
  user_id: string | null;
  cv_structured_data: unknown | null;
  cv_score: number | null;
  cv_text: string | null;
  claim_token: string | null;
  claimed_at: string | null;
  sectors: string[] | null;
  donors: string[] | null;
  countries: string[] | null;
  skills: string[] | null;
  languages: string[] | null;
  certifications: string[] | null;
  qualifications: string | null;
  headline: string | null;
  nationality: string | null;
  city: string | null;
  years_of_experience: number | null;
  profile_type: string | null;
  recommended_by: string | null;
  education_level: string | null;
  created_at: string;
};

function norm(s: string | null | undefined): string {
  return (s || "").trim().toLowerCase();
}

function score(p: Profile): number {
  // Higher = better keeper
  let s = 0;
  if (p.cv_structured_data) s += 100;
  if (p.cv_text && p.cv_text.length > 500) s += 50;
  if (p.cv_score != null) s += 20;
  if (p.user_id) s += 30;
  if (p.claimed_at) s += 15;
  if (p.email) s += 10;
  if (p.telegram_id) s += 10;
  if (p.phone) s += 5;
  if (p.sectors?.length) s += 5;
  if (p.name && p.name.split(/\s+/).length >= 2) s += 3; // full name over "Aurora"
  if (p.claim_token) s += 2;
  return s;
}

function uniq<T>(arr: (T | null | undefined)[]): T[] {
  return [...new Set(arr.filter((x) => x != null))] as T[];
}

async function main() {
  const { createClient } = await import("@supabase/supabase-js");
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  console.log(`\n═══════════════════════════════════════════════════════════`);
  console.log(`  Identity Harmonizer ${APPLY ? "(APPLY MODE — will merge)" : "(DRY RUN)"}`);
  console.log(`═══════════════════════════════════════════════════════════\n`);

  const { data: allProfiles, error } = await sb.from("profiles").select("*");
  if (error) {
    console.error("Failed to load profiles:", error.message);
    process.exit(1);
  }
  const profiles = (allProfiles || []) as Profile[];
  console.log(`Loaded ${profiles.length} profiles.\n`);

  // Build indexes
  const byEmail = new Map<string, Profile[]>();
  const byTg = new Map<string, Profile[]>();
  const byPhone = new Map<string, Profile[]>();
  for (const p of profiles) {
    if (p.email) {
      const k = norm(p.email);
      if (!byEmail.has(k)) byEmail.set(k, []);
      byEmail.get(k)!.push(p);
    }
    if (p.telegram_id) {
      const k = String(p.telegram_id);
      if (!byTg.has(k)) byTg.set(k, []);
      byTg.get(k)!.push(p);
    }
    if (p.phone) {
      const k = norm(p.phone).replace(/[^0-9+]/g, "");
      if (k.length >= 7) {
        if (!byPhone.has(k)) byPhone.set(k, []);
        byPhone.get(k)!.push(p);
      }
    }
  }

  // Collect duplicate groups
  const groups: Profile[][] = [];
  const seen = new Set<string>();
  function addGroup(g: Profile[]) {
    if (g.length < 2) return;
    const ids = g.map((p) => p.id).sort().join("|");
    if (seen.has(ids)) return;
    seen.add(ids);
    groups.push(g);
  }
  for (const g of byEmail.values()) addGroup(g);
  for (const g of byTg.values()) addGroup(g);
  // Phone only groups people when first-name token ALSO matches (phone collisions are real)
  for (const g of byPhone.values()) {
    if (g.length < 2) continue;
    const firstNames = new Set(g.map((p) => norm(p.name).split(/\s+/)[0]).filter(Boolean));
    if (firstNames.size === 1) addGroup(g); // all same first name → safe to merge
  }

  console.log(`Found ${groups.length} duplicate groups.\n`);

  if (groups.length === 0) {
    console.log("✓ No duplicates. Nothing to merge.");
    return;
  }

  let merged = 0;
  for (const group of groups) {
    // Pick keeper
    const sorted = [...group].sort((a, b) => score(b) - score(a));
    const keeper = sorted[0];
    const losers = sorted.slice(1);

    console.log(`── Group (${group.length} profiles):`);
    for (const p of group) {
      const flag = p.id === keeper.id ? "KEEP" : "MERGE";
      console.log(`   [${flag}] ${p.name.padEnd(30)} score:${score(p).toString().padStart(3)} | email:${p.email || "—"} | tg:${p.telegram_id || "—"} | cv:${p.cv_structured_data ? "Y" : "N"}`);
    }

    if (!APPLY) { console.log(""); continue; }

    // Apply merge
    const updates: Partial<Profile> = {};
    // Copy missing single fields from losers
    const singleFields: (keyof Profile)[] = [
      "email", "phone", "telegram_id", "user_id", "cv_structured_data", "cv_text",
      "cv_score", "claim_token", "claimed_at", "qualifications", "headline",
      "nationality", "city", "years_of_experience", "profile_type",
      "recommended_by", "education_level",
    ];
    for (const field of singleFields) {
      if (!(keeper as any)[field]) {
        for (const l of losers) {
          if ((l as any)[field]) {
            (updates as any)[field] = (l as any)[field];
            break;
          }
        }
      }
    }
    // Union array fields
    const arrayFields: (keyof Profile)[] = [
      "sectors", "donors", "countries", "skills", "languages", "certifications",
    ];
    for (const field of arrayFields) {
      const combined = uniq([
        ...((keeper as any)[field] || []),
        ...losers.flatMap((l) => (l as any)[field] || []),
      ]);
      if (combined.length > ((keeper as any)[field]?.length || 0)) {
        (updates as any)[field] = combined;
      }
    }
    // Prefer longer name if keeper name is single-word and loser has 2+ words
    if (keeper.name.split(/\s+/).length < 2) {
      const longer = losers.find((l) => l.name.split(/\s+/).length >= 2);
      if (longer) updates.name = longer.name;
    }

    if (Object.keys(updates).length > 0) {
      await sb.from("profiles").update(updates).eq("id", keeper.id);
    }

    // Re-point Co-Creator records, events, cv_scores
    for (const l of losers) {
      await sb.from("co_creators").update({ profile_id: keeper.id }).eq("profile_id", l.id);
      await (sb.from("events") as any).update({ profile_id: keeper.id }).eq("profile_id", l.id);
      await sb.from("cv_scores").update({ profile_id: keeper.id }).eq("profile_id", l.id);
      // Delete loser
      await (sb.from("events") as any).delete().eq("profile_id", l.id).is("profile_id", null);
      await sb.from("profiles").delete().eq("id", l.id);
    }

    console.log(`   → Merged ${losers.length} into keeper. Fields updated: ${Object.keys(updates).join(", ") || "none"}\n`);
    merged++;
  }

  console.log(`═══════════════════════════════════════════════════════════`);
  console.log(`  ${APPLY ? `✓ Merged ${merged} groups` : `Would merge ${groups.length} groups — rerun with --apply`}`);
  console.log(`═══════════════════════════════════════════════════════════\n`);

  // Bonus: find unlinked Co-Creator records
  console.log("── Unlinked Co-Creators (no profile_id):");
  const { data: unlinked } = await sb
    .from("co_creators")
    .select("id, name, email, whatsapp_number, status, invite_token")
    .is("profile_id", null);
  for (const cc of unlinked || []) {
    // Strong match only: email match, OR full-name match (≥2 name parts identical)
    let match: Profile | null = null;
    let matchType = "";
    if (cc.email) {
      const m = profiles.find((p) => norm(p.email) === norm(cc.email));
      if (m) { match = m; matchType = "email"; }
    }
    if (!match && cc.name) {
      const ccParts = cc.name.toLowerCase().split(/\s+/).filter((w: string) => w.length >= 3);
      if (ccParts.length >= 2) {
        const m = profiles.find((p) => {
          const pParts = p.name.toLowerCase().split(/\s+/).filter((w: string) => w.length >= 3);
          // Require at least 2 shared name parts (first + last)
          const shared = ccParts.filter((w: string) => pParts.includes(w));
          return shared.length >= 2;
        });
        if (m) { match = m; matchType = "full-name"; }
      }
    }
    console.log(`   [${cc.status}] ${cc.name.padEnd(28)} → ${match ? `✓ ${matchType}: ${match.name} (${match.id.slice(0, 8)})` : "no strong match — manual review"}`);
    if (APPLY && match) {
      await sb.from("co_creators").update({ profile_id: match.id }).eq("id", cc.id);
    }
  }
  if (APPLY) console.log("   ✓ Linked strong-match Co-Creators to profiles.\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
