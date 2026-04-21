/**
 * Bidirectional sync: co_creators ↔ profiles.is_recommender.
 *
 * Principle: Co-Creators ARE the recommenders. The two lists must stay in sync.
 *
 * Actions (in order):
 *  1. For co_creators with no profile_id, try to link to a profile by fuzzy name match
 *     (name ilike or first+last token match). Skip if ambiguous.
 *  2. For every co_creator.profile_id, set that profile's is_recommender=true.
 *  3. For every is_recommender=true profile without a co_creator record, auto-create
 *     one with status='joined' and source='auto_imported' (this backfills the legacy
 *     recommender network into the Co-Creator dashboard).
 *
 * Usage:
 *   npx tsx scripts/sync-cc-recommenders.ts           (dry run)
 *   npx tsx scripts/sync-cc-recommenders.ts --apply   (apply)
 */
import * as fs from "fs";
import * as path from "path";
import { randomBytes } from "crypto";

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

function generateToken(): string {
  return randomBytes(4).toString("hex");
}

(async () => {
  console.log(`\n═══════════════════════════════════════════════════════════`);
  console.log(`  Sync co_creators ↔ is_recommender ${APPLY ? "(APPLY)" : "(DRY RUN)"}`);
  console.log(`═══════════════════════════════════════════════════════════\n`);

  const { createClient } = await import("@supabase/supabase-js");
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  const { data: cc } = await sb.from("co_creators").select("id, name, status, profile_id, invite_token");
  const { data: profiles } = await sb.from("profiles").select("id, name, is_recommender, email").order("created_at", { ascending: false });

  const allCc = cc || [];
  const allProfiles = profiles || [];

  // ── Step 1: Link unlinked co_creators to profiles by name ────────────
  let linked = 0;
  const unlinkedCc = allCc.filter((c) => !c.profile_id);
  console.log(`── Step 1: Link unlinked co-creators (${unlinkedCc.length}) ──`);

  function matchProfile(ccName: string): { id: string; name: string } | null {
    const ccLower = ccName.toLowerCase().trim();
    const ccParts = ccLower.split(/\s+/).filter(Boolean);
    // Exact (ilike)
    const exact = allProfiles.find((p) => p.name.toLowerCase() === ccLower);
    if (exact) return exact;
    // First-name uniqueness check
    if (ccParts.length === 1) {
      const firstMatches = allProfiles.filter((p) => {
        const pParts = p.name.toLowerCase().split(/\s+/);
        return pParts[0] === ccParts[0];
      });
      if (firstMatches.length === 1) return firstMatches[0];
      return null;
    }
    // Two-token overlap
    const candidates = allProfiles.filter((p) => {
      const pLower = p.name.toLowerCase();
      return ccParts.every((t) => t.length < 3 || pLower.includes(t));
    });
    if (candidates.length === 1) return candidates[0];
    return null;
  }

  for (const c of unlinkedCc) {
    const match = matchProfile(c.name);
    if (match) {
      console.log(`  ↳ ${c.name.padEnd(28)} → ${match.name} (${match.id})`);
      if (APPLY) {
        await sb.from("co_creators").update({ profile_id: match.id }).eq("id", c.id);
      }
      c.profile_id = match.id;
      linked++;
    } else {
      console.log(`  · ${c.name.padEnd(28)} (no match — leave unlinked)`);
    }
  }

  // ── Step 2: Flag co_creator profiles as is_recommender ──────────────
  console.log(`\n── Step 2: Flag linked co-creator profiles as is_recommender ──`);
  let flagged = 0;
  for (const c of allCc) {
    if (!c.profile_id) continue;
    const prof = allProfiles.find((p) => p.id === c.profile_id);
    if (!prof) continue;
    if (!prof.is_recommender) {
      console.log(`  ↑ ${prof.name.padEnd(30)} [cc: ${c.name}] → is_recommender=true`);
      if (APPLY) {
        await sb.from("profiles").update({ is_recommender: true }).eq("id", prof.id);
      }
      flagged++;
    }
  }

  // ── Step 3: Auto-import legacy recommenders as co_creators ──────────
  console.log(`\n── Step 3: Auto-import legacy is_recommender profiles as co_creators ──`);
  const ccProfileIds = new Set(allCc.map((c) => c.profile_id).filter(Boolean));
  const legacy = allProfiles.filter((p) => p.is_recommender && !ccProfileIds.has(p.id));

  // Next member_number
  const { data: maxMember } = await sb.from("co_creators").select("member_number").order("member_number", { ascending: false }).limit(1).maybeSingle();
  let nextNum = (maxMember?.member_number || 0) + 1;

  let imported = 0;
  for (const p of legacy) {
    const token = generateToken();
    console.log(`  + ${p.name.padEnd(30)} → co_creator #${nextNum} (auto_imported)`);
    if (APPLY) {
      const { error } = await sb.from("co_creators").insert({
        name: p.name,
        invite_token: token,
        member_number: nextNum,
        profile_id: p.id,
        email: p.email || null,
        status: "joined",
        joined_at: new Date().toISOString(),
      });
      if (error) console.log(`     ✗ ${error.message}`);
      else imported++;
    }
    nextNum++;
  }

  console.log(`\n═══════════════════════════════════════════════════════════`);
  console.log(`  ${APPLY ? "Applied" : "Would apply"}:`);
  console.log(`    Linked:    ${linked}`);
  console.log(`    Flagged:   ${flagged}`);
  console.log(`    Imported:  ${imported || legacy.length}${APPLY ? "" : " (dry)"}`);
  if (!APPLY) console.log(`\n  Re-run with --apply to execute.`);
  console.log(`═══════════════════════════════════════════════════════════\n`);
})().catch(e => { console.error(e); process.exit(1); });
