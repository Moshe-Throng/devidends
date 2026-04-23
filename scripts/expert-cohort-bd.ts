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
  const { data: all } = await sb
    .from("profiles")
    .select("id, name, email, telegram_id, claim_token, claimed_at, cv_score, years_of_experience, sectors, donors, profile_type, source, is_recommender");
  const xs = all || [];
  const nonRecs = xs.filter((p: any) => !p.is_recommender);
  console.log(`Total profiles: ${xs.length}`);
  console.log(`Non-recommender experts: ${nonRecs.length}\n`);

  const byTier: Record<string, number> = {};
  for (const p of nonRecs) byTier[p.profile_type || "(unclassified)"] = (byTier[p.profile_type || "(unclassified)"] || 0) + 1;
  console.log(`By tier:`);
  for (const [t, n] of Object.entries(byTier).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${n.toString().padStart(3)}  ${t}`);
  }

  // Donor frequency across all experts — reveals which firms our network has worked with
  const donorCount: Record<string, number> = {};
  for (const p of nonRecs) {
    for (const d of (p.donors || [])) {
      const norm = d.toLowerCase().trim();
      donorCount[norm] = (donorCount[norm] || 0) + 1;
    }
  }
  console.log(`\nTop 20 donors/firms appearing in expert CVs (BD target list signal):`);
  for (const [d, n] of Object.entries(donorCount).sort((a, b) => b[1] - a[1]).slice(0, 20)) {
    console.log(`  ${n.toString().padStart(3)}  ${d}`);
  }

  // Email reachability
  const parseEmail = (raw: string | null): string | null => {
    if (!raw) return null;
    const parts = raw.split(/[;,]|\s+or\s+|\s+\/\s+/).map((s: string) => s.trim()).filter(Boolean);
    for (const p of parts) if (EMAIL_RE.test(p)) return p;
    return null;
  };
  let claimed = 0, hasTg = 0, emailReachable = 0, noEmail = 0;
  for (const p of nonRecs) {
    if (p.claimed_at) { claimed++; continue; }
    if (p.telegram_id) { hasTg++; continue; }
    if (parseEmail(p.email)) emailReachable++;
    else noEmail++;
  }
  console.log(`\nReachability of the non-recommender experts (${nonRecs.length}):`);
  console.log(`  Already claimed:                     ${claimed}`);
  console.log(`  Unclaimed, on Telegram already:      ${hasTg}`);
  console.log(`  Unclaimed, parseable email:          ${emailReachable}  ← email-invite cohort`);
  console.log(`  Unclaimed, no email + no TG:         ${noEmail}`);

  // By source
  const bySource: Record<string, number> = {};
  for (const p of nonRecs) bySource[p.source || "unknown"] = (bySource[p.source || "unknown"] || 0) + 1;
  console.log(`\nExpert profiles by source:`);
  for (const [s, n] of Object.entries(bySource).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${n.toString().padStart(3)}  ${s}`);
  }

  // Top sectors
  const sectorCount: Record<string, number> = {};
  for (const p of nonRecs) for (const s of (p.sectors || [])) sectorCount[s] = (sectorCount[s] || 0) + 1;
  console.log(`\nTop 15 sectors in expert pool:`);
  for (const [s, n] of Object.entries(sectorCount).sort((a, b) => b[1] - a[1]).slice(0, 15)) {
    console.log(`  ${n.toString().padStart(3)}  ${s}`);
  }
})();
