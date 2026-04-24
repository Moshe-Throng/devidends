/**
 * Find potential duplicate profiles by fuzzy name match.
 * Two profiles are considered potential dupes if their names share
 * at least 2 common name tokens of length >=3 (ignoring titles/honorifics).
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

const HONORIFICS = new Set(["mr", "mrs", "ms", "dr", "prof", "mr.", "dr.", "prof."]);

function tokens(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !HONORIFICS.has(t));
}

async function main() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  const { data: all } = await sb
    .from("profiles")
    .select("id, name, email, telegram_id, claim_token, claimed_at, cv_text, cv_score, is_recommender, updated_at, source, created_at");
  const profs = all || [];

  // Index by first token for quick grouping
  const firstTokIdx: Record<string, any[]> = {};
  for (const p of profs) {
    const toks = tokens(p.name || "");
    if (toks.length === 0) continue;
    (firstTokIdx[toks[0]] = firstTokIdx[toks[0]] || []).push({ ...p, _toks: toks });
  }

  const dupes: { a: any; b: any; shared: string[] }[] = [];
  for (const group of Object.values(firstTokIdx)) {
    if (group.length < 2) continue;
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const A = group[i];
        const B = group[j];
        const shared = A._toks.filter((t: string) => B._toks.includes(t));
        if (shared.length >= 2) dupes.push({ a: A, b: B, shared });
      }
    }
  }

  console.log(`Found ${dupes.length} potential duplicate pairs:\n`);
  for (const d of dupes) {
    const a = d.a, b = d.b;
    console.log(`─── Shared: ${d.shared.join(", ")}`);
    console.log(`  A  ${a.id.slice(0, 8)}  ${a.name.padEnd(40)}  rec=${a.is_recommender ? "Y" : "n"} hasCv=${!!a.cv_text} cv=${a.cv_score ?? "-"} claimed=${a.claimed_at ? "Y" : "n"} src=${a.source}`);
    console.log(`  B  ${b.id.slice(0, 8)}  ${b.name.padEnd(40)}  rec=${b.is_recommender ? "Y" : "n"} hasCv=${!!b.cv_text} cv=${b.cv_score ?? "-"} claimed=${b.claimed_at ? "Y" : "n"} src=${b.source}`);
    console.log();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
