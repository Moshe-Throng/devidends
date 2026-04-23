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

(async () => {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data } = await sb
    .from("profiles")
    .select("*")
    .ilike("name", "%daniel%dendir%")
    .maybeSingle();
  if (!data) { console.log("not found"); return; }

  console.log(`Name: ${data.name}`);
  console.log(`Email: ${data.email}`);
  console.log(`Phone: ${data.phone}`);
  console.log(`Nationality: ${data.nationality}`);
  console.log(`Profile type: ${data.profile_type}  YoE: ${data.years_of_experience}  CV score: ${data.cv_score}`);
  console.log(`Claim token: ${data.claim_token}  Claimed: ${data.claimed_at || "no"}  TG: ${data.telegram_id || "none"}`);
  console.log(`Headline: ${data.headline}`);
  console.log(`Sectors: ${(data.sectors || []).join(", ")}`);
  console.log(`Skills: ${(data.skills || []).slice(0, 10).join(", ")}`);
  console.log(`Qualifications: ${data.qualifications}`);
  console.log(`Languages: ${(data.languages || []).join(", ")}`);
  console.log(`Education level: ${data.education_level}`);

  const cv = data.cv_structured_data || {};
  console.log(`\nProfessional summary:\n${cv.professional_summary?.slice(0, 800) || "(none)"}`);
  console.log(`\nRecent employment (top 5):`);
  for (const e of (cv.employment || []).slice(0, 5)) {
    console.log(`  - ${e.position} at ${e.employer} (${e.from_date} to ${e.to_date})`);
    if (e.description_of_duties) console.log(`    ${e.description_of_duties.slice(0, 250)}...`);
  }
})();
