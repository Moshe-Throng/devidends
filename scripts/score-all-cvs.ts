/**
 * Score every profile that has cv_text (or cv_structured_data) but no cv_score.
 *
 * Also upserts a snapshot row into cv_scores for history.
 *
 * Usage:
 *   npx tsx scripts/score-all-cvs.ts           (dry run — count only)
 *   npx tsx scripts/score-all-cvs.ts --apply   (score + write)
 *   npx tsx scripts/score-all-cvs.ts --apply --rescore   (also rescore ones that already have a score)
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
const RESCORE = process.argv.includes("--rescore");

async function main() {
  console.log(`\n═══════════════════════════════════════════════════════════`);
  console.log(`  Score all CVs ${APPLY ? "(APPLY)" : "(DRY RUN)"} ${RESCORE ? "[rescore mode]" : ""}`);
  console.log(`═══════════════════════════════════════════════════════════\n`);

  const { createClient } = await import("@supabase/supabase-js");
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  const query = sb.from("profiles").select("id, name, cv_score, cv_text, cv_structured_data").not("cv_text", "is", null);
  const { data: profiles, error } = await query;
  if (error) throw new Error(error.message);

  const needsScore = (profiles || []).filter((p: any) => {
    if (!p.cv_text || p.cv_text.length < 200) return false;
    if (RESCORE) return true;
    return p.cv_score == null;
  });

  console.log(`Profiles with CV:         ${profiles?.length || 0}`);
  console.log(`Need scoring:             ${needsScore.length}`);
  console.log(`Estimated cost (Haiku):   ~$${(needsScore.length * 0.011).toFixed(2)}\n`);

  if (!APPLY) {
    console.log(`Re-run with --apply to score.`);
    return;
  }

  const { scoreCv } = await import("@/lib/cv-scorer");

  let ok = 0, failed = 0;
  for (let i = 0; i < needsScore.length; i++) {
    const p: any = needsScore[i];
    const prefix = `[${i + 1}/${needsScore.length}]`;
    try {
      const result = await scoreCv(p.cv_text);
      const dims = result.dimensions as any[];
      await sb.from("profiles").update({ cv_score: result.overall_score }).eq("id", p.id);
      // History snapshot
      await sb.from("cv_scores").insert({
        profile_id: p.id,
        overall_score: result.overall_score,
        dimensions: dims,
        improvements: result.top_3_improvements,
      });
      console.log(`${prefix} ✓ ${p.name.padEnd(28)} → ${result.overall_score}/100`);
      ok++;
    } catch (e: any) {
      console.log(`${prefix} ✗ ${p.name.padEnd(28)} → ${e.message.slice(0, 80)}`);
      failed++;
    }
  }

  console.log(`\n═══════════════════════════════════════════════════════════`);
  console.log(`  Scored: ${ok}  ·  Failed: ${failed}`);
  console.log(`═══════════════════════════════════════════════════════════\n`);
}

main().catch((e) => { console.error(e); process.exit(1); });
