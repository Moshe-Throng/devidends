/**
 * 1) Merge Yitna Techalu duplicates into one canonical profile.
 * 2) Backfill NULL member_number rows on co_creators.
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

  // ── 1. Merge Yitna ────────────────────────────────────────────────
  const { data: yitnas } = await sb
    .from("profiles")
    .select("id, name, telegram_id, claim_token, claimed_at, cv_score, cv_text, updated_at, email")
    .ilike("name", "%yitna%");
  console.log(`Yitna profiles found: ${yitnas?.length || 0}`);
  for (const p of yitnas || []) console.log(`  ${p.id}  ${p.name}  tg=${p.telegram_id || "-"}  score=${p.cv_score ?? "-"}  claimed=${p.claimed_at ? "YES" : "no"}`);

  if (yitnas && yitnas.length > 1) {
    // Rank: claimed > has CV > higher score > newer
    const ranked = [...yitnas].sort((a: any, b: any) => {
      if (!!a.claimed_at !== !!b.claimed_at) return a.claimed_at ? -1 : 1;
      const ax = a.cv_text ? 1 : 0, bx = b.cv_text ? 1 : 0;
      if (ax !== bx) return bx - ax;
      const sa = a.cv_score ?? -1, sb = b.cv_score ?? -1;
      if (sa !== sb) return sb - sa;
      return (b.updated_at || "").localeCompare(a.updated_at || "");
    });
    const canonical = ranked[0] as any;
    const stubs = ranked.slice(1) as any[];
    console.log(`\nCanonical: ${canonical.id} (${canonical.name})`);
    console.log(`Stubs: ${stubs.map((s: any) => s.id).join(", ")}`);

    // Pick the fullest name
    const fullestName = yitnas
      .map((p: any) => p.name)
      .sort((a: string, b: string) => b.split(/\s+/).length - a.split(/\s+/).length)[0];

    // Collect stub telegram_id if canonical doesn't have one
    const tgToKeep = canonical.telegram_id || stubs.find((s: any) => s.telegram_id)?.telegram_id || null;

    // Re-point co_creators + cv_scores + events off stubs onto canonical
    for (const stub of stubs) {
      // co_creators: if canonical already has one, delete the stub's; else re-point
      const { data: canonCc } = await sb.from("co_creators").select("id").eq("profile_id", canonical.id).maybeSingle();
      const { data: stubCcs } = await sb.from("co_creators").select("id, invite_token").eq("profile_id", stub.id);
      for (const cc of stubCcs || []) {
        if (canonCc) {
          await sb.from("co_creators").delete().eq("id", (cc as any).id);
        } else {
          await sb.from("co_creators").update({ profile_id: canonical.id }).eq("id", (cc as any).id);
        }
      }
      try { await sb.from("cv_scores").update({ profile_id: canonical.id }).eq("profile_id", stub.id); } catch {}
      try { await sb.from("events").update({ profile_id: canonical.id }).eq("profile_id", stub.id); } catch {}
    }

    // Update canonical
    const upd: any = { name: fullestName };
    if (tgToKeep && !canonical.telegram_id) upd.telegram_id = tgToKeep;
    await sb.from("profiles").update(upd).eq("id", canonical.id);
    console.log(`✓ canonical updated: name='${fullestName}'${upd.telegram_id ? ", tg=" + upd.telegram_id : ""}`);

    // Delete stubs
    for (const stub of stubs) {
      await sb.from("profiles").delete().eq("id", stub.id);
      console.log(`✓ deleted stub ${stub.id}`);
    }
  } else {
    console.log("No merge needed (≤1 profile).");
  }

  // ── 2. Backfill NULL member_numbers ───────────────────────────────
  console.log(`\n─── Backfilling NULL member_numbers ───`);
  const { data: nullRows } = await sb
    .from("co_creators")
    .select("id, name, joined_at")
    .is("member_number", null)
    .order("joined_at", { ascending: true });

  if (nullRows && nullRows.length > 0) {
    const { data: maxRow } = await sb
      .from("co_creators")
      .select("member_number")
      .not("member_number", "is", null)
      .order("member_number", { ascending: false })
      .limit(1)
      .maybeSingle();
    let next = ((maxRow as any)?.member_number || 0) + 1;
    for (const row of nullRows as any[]) {
      const { error } = await sb.from("co_creators").update({ member_number: next }).eq("id", row.id);
      if (error) console.log(`  ✗ ${row.name}: ${error.message}`);
      else console.log(`  ✓ #${next}  ${row.name}`);
      next++;
    }
  } else {
    console.log("No NULL member_number rows.");
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
