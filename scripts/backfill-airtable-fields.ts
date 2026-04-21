/**
 * Backfill recommended_by + gender from Airtable to Supabase.
 *
 * For each Airtable row:
 *  - Match to a Supabase profile (by supabaseProfileId cached in v3 audit,
 *    then by email, then by ilike name).
 *  - If Airtable has `Recommended By`:
 *      - Validate against is_recommender=true profiles (exact ilike, then fuzzy per-token).
 *      - If matched AND profile.recommended_by is null/empty: update with canonical name.
 *      - If no match: log for admin review (NEVER write unknown names).
 *  - If Airtable has `Gender`:
 *      - Normalize to "male"/"female".
 *      - If profile.gender is null: update.
 *
 * Usage:
 *   npx tsx scripts/backfill-airtable-fields.ts           (dry run)
 *   npx tsx scripts/backfill-airtable-fields.ts --apply   (apply)
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

interface AirtableRow {
  id: string;
  fields: Record<string, any>;
}

async function fetchAll(): Promise<AirtableRow[]> {
  const T = process.env.AIRTABLE_API_KEY!;
  const B = process.env.AIRTABLE_BASE_ID!;
  const TB = process.env.AIRTABLE_TABLE_NAME!;
  const rows: AirtableRow[] = [];
  let offset = "";
  while (true) {
    const url = `https://api.airtable.com/v0/${B}/${encodeURIComponent(TB)}?pageSize=100${offset ? `&offset=${offset}` : ""}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${T}` } });
    if (!res.ok) throw new Error(`Airtable fetch failed: ${res.status} ${await res.text()}`);
    const d: any = await res.json();
    rows.push(...(d.records || []));
    if (!d.offset) break;
    offset = d.offset;
  }
  return rows;
}

function normalizeGender(raw: string): string | null {
  const g = raw.trim().toLowerCase();
  if (g.startsWith("m")) return "male";
  if (g.startsWith("f")) return "female";
  return null;
}

async function main() {
  console.log(`\n═══════════════════════════════════════════════════════════`);
  console.log(`  Backfill Airtable fields ${APPLY ? "(APPLY)" : "(DRY RUN)"}`);
  console.log(`═══════════════════════════════════════════════════════════\n`);

  const { createClient } = await import("@supabase/supabase-js");
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  // Load recommender index once
  const { data: recProfiles } = await sb.from("profiles").select("id, name").eq("is_recommender", true);
  const recommenders: { id: string; name: string }[] = (recProfiles || []).map((p: any) => ({ id: p.id, name: p.name }));
  console.log(`Known recommenders: ${recommenders.length}`);
  const lowerToName = new Map<string, string>();
  for (const r of recommenders) lowerToName.set(r.name.toLowerCase(), r.name);

  function resolveRecommender(raw: string): { matched: string | null; suggestions: string[] } {
    const name = raw.trim();
    if (!name) return { matched: null, suggestions: [] };
    // Exact (case-insensitive)
    const direct = lowerToName.get(name.toLowerCase());
    if (direct) return { matched: direct, suggestions: [] };
    // Fuzzy: any recommender whose name contains every word in raw (or raw contains every word of recommender)
    const tokens = name.toLowerCase().split(/\s+/).filter(Boolean);
    const candidates = recommenders
      .map((r) => ({ r, tokensOfRec: r.name.toLowerCase().split(/\s+/).filter(Boolean) }))
      .filter(({ r, tokensOfRec }) =>
        tokens.every((t) => r.name.toLowerCase().includes(t)) ||
        tokensOfRec.every((t) => name.toLowerCase().includes(t))
      );
    if (candidates.length === 1) return { matched: candidates[0].r.name, suggestions: [] };
    if (candidates.length > 1) return { matched: null, suggestions: candidates.map((c) => c.r.name) };
    return { matched: null, suggestions: [] };
  }

  // Load audit mapping (airtableId → supabaseProfileId) if available
  const auditPath = path.join(__dirname, "..", "test-output", "v3.json");
  const airtableIdToSupabase = new Map<string, string>();
  if (fs.existsSync(auditPath)) {
    const audit = JSON.parse(fs.readFileSync(auditPath, "utf-8"));
    for (const r of audit) {
      if (r.airtableId && r.supabaseProfileId) airtableIdToSupabase.set(r.airtableId, r.supabaseProfileId);
    }
    console.log(`Audit mappings available: ${airtableIdToSupabase.size}`);
  }

  const rows = await fetchAll();
  console.log(`Airtable rows: ${rows.length}\n`);

  let recUpdated = 0, genderUpdated = 0, recRejected = 0, noProfile = 0, noChanges = 0;
  const rejectedRecs: { airtableName: string; raw: string; suggestions: string[] }[] = [];

  for (const row of rows) {
    const f = row.fields || {};
    const airtableName = (f["Name"] || "").trim();
    const airtableEmail = (f["Email Address"] || "").trim();
    const recRaw = (f["Recommended By"] || "").trim();
    const genRaw = (f["Gender"] || "").trim();

    if (!airtableName && !airtableEmail) continue;

    // Find target profile
    let profile: { id: string; recommended_by: string | null; gender: string | null; name: string } | null = null;
    const mappedId = airtableIdToSupabase.get(row.id);
    if (mappedId) {
      const { data } = await sb.from("profiles").select("id, recommended_by, gender, name").eq("id", mappedId).single();
      if (data) profile = data as any;
    }
    if (!profile && airtableEmail && airtableEmail !== "?") {
      const { data } = await sb.from("profiles").select("id, recommended_by, gender, name").eq("email", airtableEmail).maybeSingle();
      if (data) profile = data as any;
    }
    if (!profile && airtableName) {
      const { data } = await sb.from("profiles").select("id, recommended_by, gender, name").ilike("name", airtableName).maybeSingle();
      if (data) profile = data as any;
    }

    if (!profile) {
      noProfile++;
      continue;
    }

    const patch: Record<string, unknown> = {};

    if (recRaw && !profile.recommended_by) {
      // Airtable sometimes lists multiple recommenders comma/and-separated — try each piece.
      const pieces = recRaw
        .split(/\s*,\s*|\s+and\s+|\s*\/\s*/i)
        .map((s) => s.trim())
        .filter(Boolean);
      let matchedName: string | null = null;
      let lastSuggestions: string[] = [];
      for (const piece of pieces) {
        const { matched, suggestions } = resolveRecommender(piece);
        if (matched) { matchedName = matched; break; }
        lastSuggestions = suggestions.length > 0 ? suggestions : lastSuggestions;
      }
      if (matchedName) {
        patch.recommended_by = matchedName;
      } else {
        recRejected++;
        rejectedRecs.push({ airtableName, raw: recRaw, suggestions: lastSuggestions });
      }
    }

    if (genRaw && !profile.gender) {
      const normalized = normalizeGender(genRaw);
      if (normalized) patch.gender = normalized;
    }

    if (Object.keys(patch).length === 0) {
      noChanges++;
      continue;
    }

    const changes = Object.entries(patch).map(([k, v]) => `${k}=${v}`).join(", ");
    console.log(`~ ${profile.name.padEnd(28)} → ${changes}`);

    if (patch.recommended_by) recUpdated++;
    if (patch.gender) genderUpdated++;

    if (APPLY) {
      const { error } = await sb.from("profiles").update(patch).eq("id", profile.id);
      if (error) console.log(`  ✗ ${error.message}`);
    }
  }

  console.log(`\n═══════════════════════════════════════════════════════════`);
  console.log(`  ${APPLY ? "Applied" : "Would apply"}:`);
  console.log(`    Recommender updates: ${recUpdated}`);
  console.log(`    Gender updates:      ${genderUpdated}`);
  console.log(`    Recommender rejected (not in network): ${recRejected}`);
  console.log(`    No Supabase profile match:             ${noProfile}`);
  console.log(`    No changes needed:   ${noChanges}`);

  if (rejectedRecs.length > 0) {
    console.log(`\n─── Rejected recommenders (not in is_recommender network) ───`);
    for (const r of rejectedRecs) {
      console.log(`  ${r.airtableName}: "${r.raw}"${r.suggestions.length > 0 ? ` (close: ${r.suggestions.join(", ")})` : ""}`);
    }
  }

  if (!APPLY) console.log(`\n  Re-run with --apply to execute.`);
  console.log(`═══════════════════════════════════════════════════════════\n`);
}

main().catch((e) => { console.error(e); process.exit(1); });
