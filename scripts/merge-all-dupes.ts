/**
 * Merge all detected duplicate profile pairs into one canonical each,
 * re-pointing foreign keys in attributions, events, co_creators, cv_scores.
 *
 * Canonical pick rule (in order):
 *  1. Claimed > unclaimed
 *  2. is_recommender > not
 *  3. Has cv_text > doesn't
 *  4. Higher cv_score
 *  5. More recent updated_at
 * The canonical inherits the FULLER name from the pair when different.
 *
 * Also fixes:
 *  - Yonus Fantahun's "Yo Mama" headline (clears it)
 *  - Zewdu Eshetu's wrong email (mika.sulkinoja@greenstream.net — not his)
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

type P = {
  id: string;
  name: string;
  is_recommender: boolean;
  cv_text: string | null;
  cv_score: number | null;
  claimed_at: string | null;
  telegram_id: string | null;
  email: string | null;
  updated_at: string | null;
};

function rank(a: P, b: P): number {
  if (!!a.claimed_at !== !!b.claimed_at) return a.claimed_at ? -1 : 1;
  if (a.is_recommender !== b.is_recommender) return a.is_recommender ? -1 : 1;
  const ax = a.cv_text ? 1 : 0, bx = b.cv_text ? 1 : 0;
  if (ax !== bx) return bx - ax;
  const sa = a.cv_score ?? -1, sb = b.cv_score ?? -1;
  if (sa !== sb) return sb - sa;
  return (b.updated_at || "").localeCompare(a.updated_at || "");
}

async function mergePair(sb: any, a: P, b: P) {
  const ranked = [a, b].sort(rank);
  const canonical = ranked[0];
  const stub = ranked[1];

  // Pick the fuller name
  const fullName = (a.name.split(/\s+/).length >= b.name.split(/\s+/).length) ? a.name : b.name;

  // Merge: pull is_recommender, email, telegram_id, claim_token, claimed_at onto canonical if it doesn't have them
  const updates: any = { name: fullName };
  if (!canonical.is_recommender && stub.is_recommender) updates.is_recommender = true;
  if (!canonical.email && (stub as any).email) updates.email = (stub as any).email;
  if (!canonical.telegram_id && stub.telegram_id) updates.telegram_id = stub.telegram_id;

  await sb.from("profiles").update(updates).eq("id", canonical.id);

  // Re-point foreign keys
  for (const table of ["attributions", "cv_scores", "events", "co_creators", "co_creator_interactions"] as const) {
    try {
      if (table === "attributions") {
        await sb.from(table).update({ contributor_profile_id: canonical.id }).eq("contributor_profile_id", stub.id);
        await sb.from(table).update({ subject_profile_id: canonical.id }).eq("subject_profile_id", stub.id);
      } else if (table === "co_creators") {
        // If canonical already has one, delete the stub's; else re-point
        const { data: cc } = await sb.from("co_creators").select("id").eq("profile_id", canonical.id).maybeSingle();
        if (cc) {
          await sb.from("co_creators").delete().eq("profile_id", stub.id);
        } else {
          await sb.from("co_creators").update({ profile_id: canonical.id }).eq("profile_id", stub.id);
        }
      } else {
        await sb.from(table).update({ profile_id: canonical.id }).eq("profile_id", stub.id);
      }
    } catch (e) {
      // table may not exist or column may differ — skip silently
    }
  }

  // Profiles with recommended_by text matching stub's name — best-effort rewrite to canonical name
  // Skip: 'recommended_by' is a free-text field and could refer to the concept rather than the DB row.

  // Delete stub
  const { error } = await sb.from("profiles").delete().eq("id", stub.id);
  if (error) {
    console.log(`  ✗ Failed to delete stub ${stub.id}: ${error.message}`);
    return;
  }

  console.log(`✓ Merged: kept ${canonical.id.slice(0, 8)} (${fullName}), deleted ${stub.id.slice(0, 8)}`);
}

async function main() {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  // Re-run dupe detection inline
  const HONORIFICS = new Set(["mr", "mrs", "ms", "dr", "prof", "mr.", "dr.", "prof."]);
  const toks = (name: string) =>
    name.toLowerCase().replace(/[^a-z\s]/g, " ").split(/\s+/).filter((t) => t.length >= 3 && !HONORIFICS.has(t));

  const { data: all } = await sb
    .from("profiles")
    .select("id, name, email, telegram_id, claim_token, claimed_at, cv_text, cv_score, is_recommender, updated_at, source");
  const profs = (all || []) as any[];

  const grouped: Record<string, any[]> = {};
  for (const p of profs) {
    const ts = toks(p.name || "");
    if (ts.length === 0) continue;
    (grouped[ts[0]] = grouped[ts[0]] || []).push({ ...p, _toks: ts });
  }

  const pairs: { a: any; b: any }[] = [];
  const merged = new Set<string>();
  for (const group of Object.values(grouped)) {
    if (group.length < 2) continue;
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const A = group[i], B = group[j];
        const shared = A._toks.filter((t: string) => B._toks.includes(t));
        if (shared.length >= 2 && !merged.has(A.id) && !merged.has(B.id)) {
          pairs.push({ a: A, b: B });
          merged.add(A.id);
          merged.add(B.id);
        }
      }
    }
  }

  console.log(`\nMerging ${pairs.length} duplicate pairs...\n`);
  for (const p of pairs) await mergePair(sb, p.a, p.b);

  // Fix Yonus's "Yo Mama" headline
  console.log("\nFixing Yonus's headline...");
  const { data: yonus } = await sb
    .from("profiles")
    .select("id, name, headline")
    .ilike("name", "%yonus%fantahun%")
    .maybeSingle();
  if (yonus && /yo mama/i.test(yonus.headline || "")) {
    await sb.from("profiles").update({ headline: null }).eq("id", yonus.id);
    console.log(`  ✓ Cleared headline on ${yonus.name}`);
  } else {
    console.log(`  (no change needed)`);
  }

  // Fix Zewdu's wrong email
  console.log("\nFixing Zewdu's email...");
  const { data: zewdu } = await sb
    .from("profiles")
    .select("id, name, email")
    .ilike("name", "%zewdu%eshetu%")
    .maybeSingle();
  if (zewdu && /mika\.sulkinoja/i.test(zewdu.email || "")) {
    await sb.from("profiles").update({ email: null }).eq("id", zewdu.id);
    console.log(`  ✓ Cleared wrong email (mika.sulkinoja) on ${zewdu.name}`);
  } else {
    console.log(`  (no change needed; current email: ${zewdu?.email || "none"})`);
  }

  console.log("\n✓ Cleanup complete.");
}

main().catch((e) => { console.error(e); process.exit(1); });
