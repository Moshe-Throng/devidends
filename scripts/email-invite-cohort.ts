/**
 * Inspect the email-invite cohort for non-TG recommenders.
 * Breakdown: eligible, invalid email, missing claim_token, etc.
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

(async () => {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data: recs } = await sb
    .from("profiles")
    .select("id, name, email, telegram_id, claim_token, claimed_at, cv_score, years_of_experience, sectors, source, recommended_by, headline")
    .eq("is_recommender", true);

  const all = recs || [];
  console.log(`Total recommenders: ${all.length}\n`);

  // Cohorts
  const claimed = all.filter((r: any) => r.claimed_at);
  const hasTg = all.filter((r: any) => r.telegram_id && !r.claimed_at);
  const unclaimedNoTg = all.filter((r: any) => !r.claimed_at && !r.telegram_id);

  console.log(`Already claimed: ${claimed.length}`);
  console.log(`Unclaimed + has TG: ${hasTg.length}  (bot DM path, not email)`);
  console.log(`Unclaimed + no TG: ${unclaimedNoTg.length}  (email candidates)\n`);

  // Within the email cohort, bucket by email quality
  const parseFirstEmail = (raw: string | null): string | null => {
    if (!raw) return null;
    // Profiles sometimes have multiple emails with " / " or ";" or " or " or ","
    const parts = raw.split(/[;,]|\s+or\s+|\s+\/\s+/).map((s) => s.trim()).filter(Boolean);
    for (const p of parts) {
      if (EMAIL_RE.test(p)) return p;
    }
    return null;
  };

  const withValidEmail: any[] = [];
  const withInvalidEmail: any[] = [];
  const noEmail: any[] = [];
  for (const r of unclaimedNoTg) {
    if (!r.email) { noEmail.push(r); continue; }
    const e = parseFirstEmail(r.email);
    if (e) withValidEmail.push({ ...r, first_email: e });
    else withInvalidEmail.push(r);
  }

  console.log(`Of unclaimed + no TG (${unclaimedNoTg.length}):`);
  console.log(`  With parseable email:  ${withValidEmail.length}`);
  console.log(`  With unparseable email: ${withInvalidEmail.length}`);
  console.log(`  No email at all:        ${noEmail.length}\n`);

  // Within valid-email cohort, how many have claim_token?
  const hasToken = withValidEmail.filter((r: any) => r.claim_token);
  const noToken = withValidEmail.filter((r: any) => !r.claim_token);
  console.log(`Of parseable-email ${withValidEmail.length}:`);
  console.log(`  Has claim_token:  ${hasToken.length}  (ready to email)`);
  console.log(`  Missing claim_token: ${noToken.length}  (need to mint first)\n`);

  // Breakdown by source
  const bySource: Record<string, number> = {};
  for (const r of withValidEmail) bySource[r.source || "unknown"] = (bySource[r.source || "unknown"] || 0) + 1;
  console.log(`Source distribution:`);
  for (const [s, n] of Object.entries(bySource).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${n.toString().padStart(3)}  ${s}`);
  }

  // Sample preview
  console.log(`\n── Sample (first 10 ready-to-email) ──`);
  for (const r of hasToken.slice(0, 10)) {
    console.log(`  ${r.name.padEnd(32)}  ${(r.first_email || "").padEnd(36)}  yr=${r.years_of_experience || "?"}  src=${r.source}  rec_by=${(r.recommended_by || "-").slice(0, 18)}`);
  }

  console.log(`\n── Recommenders WHO have already brought people in (warmer intro possible) ──`);
  // Count how many profiles' recommended_by fuzzy-matches each recommender's name
  const { data: allProfsWithRec } = await sb.from("profiles").select("recommended_by").not("recommended_by", "is", null);
  const recBlobs = (allProfsWithRec || []).map((p: any) => (p.recommended_by || "").toLowerCase());
  const warmers = hasToken.map((r: any) => {
    const parts = r.name.toLowerCase().split(/\s+/).filter(Boolean);
    const count = recBlobs.filter((rb: string) => {
      if (!rb.includes(parts[0])) return false;
      if (parts.length === 1) return true;
      return parts.slice(1).some((p: string) => p.length >= 3 && rb.includes(p));
    }).length;
    return { ...r, brought_in: count };
  }).filter((r: any) => r.brought_in > 0).sort((a: any, b: any) => b.brought_in - a.brought_in);
  for (const r of warmers.slice(0, 15)) {
    console.log(`  [${r.brought_in.toString().padStart(2)}]  ${r.name}  (${r.first_email})`);
  }
})();
