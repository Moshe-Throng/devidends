/**
 * Update the IRMAW attribution rows after the two emails went out
 * (Thomas @ LM and Deven @ AESA).
 *
 * New reality:
 *  - AESA: Mussie withdrew; Daniel Dendir is the proposed PSD candidate.
 *    Keep Helen as contributor, swap subject from Mussie to Daniel.
 *  - LM: Mussie still on the Market Linkage slot; rate negotiation open.
 *    Stage stays 'proposed'. Update the notes + opportunity title.
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

async function main() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: daniel } = await sb
    .from("profiles")
    .select("id, name")
    .ilike("name", "%daniel%dendir%")
    .maybeSingle();
  if (!daniel) { console.error("Daniel not found"); process.exit(1); }

  // 1. AESA row: swap subject to Daniel
  const { data: aesaUpd, error: aesaErr } = await sb
    .from("attributions")
    .update({
      subject_profile_id: daniel.id,
      opportunity_title: "IRMAW Ethiopia — PSD Expert (TMA / AFD)",
      stage: "proposed",
      notes: `Mussie withdrew due to parallel Ethiopia assignment; Daniel Dendir Abshir (AACCSA Manager of Research & PM, BIC Project Manager) proposed as PSD replacement. Helen introduced Mussie to Deven Padiachy originally; substitution email sent ${new Date().toISOString().slice(0, 10)} with Helen's endorsement. Daniel's CV attached in the send.`,
    })
    .eq("firm_name", "Agriconsulting Europe SA (AESA)")
    .eq("opportunity_title", "IRMAW Ethiopia — PSD Expert (TMA / AFD)")
    .select("id")
    .single();
  if (aesaErr) console.log("AESA update issue:", aesaErr.message);
  else console.log(`✓ AESA row updated: ${aesaUpd?.id?.slice(0, 8)} — subject now Daniel`);

  // 2. LM row: update notes with rate negotiation context
  const { data: lmUpd, error: lmErr } = await sb
    .from("attributions")
    .update({
      opportunity_title: "IRMAW Ethiopia — Market Linkage Specialist (TMA / AFD)",
      stage: "proposed",
      notes: `Original assumption (PSD) was incorrect; Thomas Patiallot clarified ${new Date().toISOString().slice(0, 10)} that the role is Market Linkage Specialist. Day rate was agreed earlier; Thomas signalled budget pressure (AFD-funded, bid meeting yesterday). Mussie responded ${new Date().toISOString().slice(0, 10)} offering two paths: (a) keep rate, reduce input days leveraging HoAI corridor overlap, or (b) adjust rate for this bid only. 20-min call offered.`,
    })
    .eq("firm_name", "Landell Mills")
    .select("id")
    .single();
  if (lmErr) console.log("LM update issue:", lmErr.message);
  else console.log(`✓ LM row updated: ${lmUpd?.id?.slice(0, 8)} — role corrected to Market Linkage`);

  // 3. Show the current state
  const { data: all } = await sb
    .from("attributions")
    .select("firm_name, opportunity_title, stage, notes")
    .in("firm_name", ["Agriconsulting Europe SA (AESA)", "Landell Mills"]);
  console.log("\nCurrent IRMAW attributions:");
  for (const a of all || []) {
    console.log(`\n  ${a.firm_name}`);
    console.log(`  ${a.opportunity_title}  [${a.stage}]`);
    console.log(`  ${(a.notes || "").slice(0, 250)}...`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
