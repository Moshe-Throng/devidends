/**
 * Seed the attributions table with live pipeline rows:
 *   1. Helen Asnake Mekonen -> AESA intro for IRMAW PSD
 *   2. Direct -> Landell Mills for IRMAW PSD (rate agreed, silent since Apr 13)
 *   3. Saron Berhane Habtom -> climate CV shortlist request (open)
 *   4. Seble (Seblewongel Haregewein) + Envest team -> ILO bid (in preparation)
 *
 * Idempotent: skips if a row already exists with the same
 * (contributor, firm, opportunity_title).
 *
 * Run after creating the table via the SQL file.
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

async function findProfile(sb: any, pattern: string): Promise<{ id: string; name: string } | null> {
  const { data } = await sb
    .from("profiles")
    .select("id, name, cv_score, claimed_at, cv_text")
    .ilike("name", pattern);
  if (!data || data.length === 0) return null;
  // Pick richest profile if multiple
  const ranked = [...data].sort((a: any, b: any) => {
    if (!!a.claimed_at !== !!b.claimed_at) return a.claimed_at ? -1 : 1;
    const ax = a.cv_text ? 1 : 0, bx = b.cv_text ? 1 : 0;
    if (ax !== bx) return bx - ax;
    return (b.cv_score ?? -1) - (a.cv_score ?? -1);
  });
  return { id: ranked[0].id, name: ranked[0].name };
}

async function upsertAttribution(sb: any, row: any) {
  // Check for existing row with same contributor/firm/opportunity
  const q = sb.from("attributions").select("id").eq("firm_name", row.firm_name).eq("opportunity_title", row.opportunity_title);
  if (row.contributor_profile_id) q.eq("contributor_profile_id", row.contributor_profile_id);
  else q.is("contributor_profile_id", null);
  const { data: existing } = await q.maybeSingle();
  if (existing) {
    console.log(`  [skip] already exists: ${row.firm_name} / ${row.opportunity_title}`);
    return;
  }
  const { data, error } = await sb.from("attributions").insert(row).select("id").single();
  if (error) {
    console.log(`  [err] ${row.firm_name}: ${error.message}`);
    return;
  }
  console.log(`  [ok]  ${row.firm_name} / ${row.opportunity_title}  (id=${(data as any).id.slice(0, 8)})`);
}

async function main() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Sanity: table exists?
  const { error: probe } = await sb.from("attributions").select("id").limit(1);
  if (probe) {
    console.error(`Table 'attributions' not ready: ${probe.message}`);
    console.error(`Paste the SQL from scripts/sql/attributions.sql into the Supabase SQL editor first.`);
    console.error(`https://supabase.com/dashboard/project/bfjgtqqvootfpyxkriqb/sql/new`);
    process.exit(1);
  }

  // Resolve profile ids
  const helen = await findProfile(sb, "%helen%asnake%");
  const mussie = await findProfile(sb, "%mussie%tsegaye%");
  const saron = await findProfile(sb, "%saron%berhane%");
  const seble = await findProfile(sb, "%seblewongel%");

  console.log("Resolved profiles:");
  console.log(`  Helen:  ${helen?.name || "NOT FOUND"}  (${helen?.id?.slice(0, 8) || "-"})`);
  console.log(`  Mussie: ${mussie?.name || "NOT FOUND"}  (${mussie?.id?.slice(0, 8) || "-"})`);
  console.log(`  Saron:  ${saron?.name || "NOT FOUND"}  (${saron?.id?.slice(0, 8) || "-"})`);
  console.log(`  Seble:  ${seble?.name || "NOT FOUND"}  (${seble?.id?.slice(0, 8) || "-"})`);

  if (!helen || !mussie) {
    console.error("Missing Helen or Mussie profile. Fix before seeding.");
    process.exit(1);
  }

  const rows: any[] = [
    // 1. Helen -> AESA intro for IRMAW PSD
    {
      attribution_type: "intro_firm",
      contributor_profile_id: helen.id,
      subject_profile_id: mussie.id,
      firm_name: "Agriconsulting Europe SA (AESA)",
      firm_contact_name: "Deven Padiachy",
      firm_contact_email: "D.Padiachy@aesagroup.eu",
      opportunity_title: "IRMAW Ethiopia — PSD Expert (TMA / AFD)",
      sector: ["private_sector_development", "women_in_trade", "market_access", "cross_border_trade"],
      expected_value_usd: 30000,  // 60 days x $500 midpoint
      day_rate_usd: 500,
      days_worked: 60,
      share_pct: 10,
      stage: "introduced",
      occurred_at: "2026-04-22",
      source_of_record: "email",
      confidence: "high",
      notes: "Helen cc'd Mussie on email thread with Deven (AESA) on 2026-04-22, forwarding the Women-in-Trade TA PSD Expert role. Mussie's customized CV sent 2026-04-22 with Devidends mention and Helen as collaborator.",
    },
    // 2. Direct -> Landell Mills for IRMAW PSD
    {
      attribution_type: "bid_submission",
      contributor_profile_id: null,
      subject_profile_id: mussie.id,
      firm_name: "Landell Mills",
      firm_contact_name: "Thomas Patiallot",
      firm_contact_email: null,
      opportunity_title: "IRMAW Ethiopia — PSD Expert (TMA / AFD)",
      sector: ["private_sector_development", "women_in_trade", "market_access", "cross_border_trade"],
      expected_value_usd: 30000,
      day_rate_usd: 500,
      days_worked: 60,
      share_pct: 0,  // Direct engagement, no introducer share
      stage: "proposed",  // rate agreed, informally nominated
      occurred_at: "2026-04-13",
      source_of_record: "email",
      confidence: "high",
      notes: "Mussie submitted CV directly, daily rate agreed. Thomas said he would 'get back shortly' on 2026-04-13. Ping sent 2026-04-22 asking for status. If confirmed on LM bid, must decline AESA to avoid TMA conflict-of-interest flag.",
    },
    // 3. Saron -> 3-expert shortlist request (EUDR + PSD + Climate Risk/Adaptation)
    {
      attribution_type: "recommend_candidate",
      contributor_profile_id: saron?.id || null,
      subject_profile_id: null,
      firm_name: "TBD (Saron's client firm)",
      firm_contact_name: null,
      firm_contact_email: null,
      opportunity_title: "Shortlist: EUDR + PSD + Climate Risk/Adaptation experts",
      sector: ["eudr", "private_sector_development", "climate_risk", "climate_adaptation"],
      expected_value_usd: null,
      share_pct: 10,
      stage: "introduced",
      occurred_at: "2026-04-22",
      source_of_record: "memory",
      confidence: "high",
      notes: "Saron asked Mussie for experts across three profiles for a bid she is working on (2026-04-22): (1) EUDR expert, (2) PSD expert, (3) Climate Risk + Climate Adaptation expert. Client firm name not yet confirmed. Shortlist to be sourced from Devidends by sector tag (climate, private_sector_development, EUDR/deforestation). Need: client firm, ToR, deadline.",
    },
    // 4. Seble + Envest team -> ILO Ethiopia Sectoral Baseline Assessment (in preparation)
    {
      attribution_type: "bid_submission",
      contributor_profile_id: seble?.id || null,
      subject_profile_id: null,
      firm_name: "ILO (International Labour Organization)",
      firm_contact_name: null,
      firm_contact_email: null,
      opportunity_title: "Sectoral Baseline Assessment: working conditions, labour management, productivity, skills gaps, OSH (Ethiopia)",
      sector: ["labour", "decent_work", "productivity", "osh", "coffee", "horticulture"],
      expected_value_usd: null,
      share_pct: 10,
      stage: "in_preparation",
      occurred_at: "2026-04-22",
      source_of_record: "reliefweb",
      source_url: "https://reliefweb.int/job/4207759/consulting-firm-sectoral-baseline-assessment-working-conditions-labour-management-productivity-skills-gaps-and-osh",
      confidence: "high",
      notes: "ReliefWeb job 4207759. Likely under ILO/EU-funded 'Advancing Decent Work in Ethiopian Coffee and Horticulture Value Chains' (2025-2029, part of SIRAYE programme). Seble and Envest team actively preparing the proposal. Need: exact ToR text, deadline, budget ceiling, team composition already confirmed.",
    },
  ];

  console.log("\nSeeding attribution rows:");
  for (const row of rows) await upsertAttribution(sb, row);

  // Read back
  const { data: all } = await sb
    .from("attributions")
    .select("firm_name, opportunity_title, stage, expected_value_usd, share_pct")
    .order("created_at", { ascending: false });
  console.log(`\nAll attributions (${all?.length || 0}):`);
  for (const r of all || []) {
    const val = r.expected_value_usd ? `$${r.expected_value_usd.toLocaleString()}` : "$?";
    console.log(`  [${r.stage.padEnd(15)}] ${r.firm_name.padEnd(40)} ${r.opportunity_title.slice(0, 50).padEnd(50)} ${val.padStart(8)}  ${r.share_pct}%`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
