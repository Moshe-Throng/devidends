/**
 * Read-only DB integrity audit. Sanity-checks the most leak-prone invariants
 * after the recent claim/orphan/attribution work.
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
config({ path: ".env.local" });

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

(async () => {
  const checks: { name: string; ok: boolean; detail: string }[] = [];

  // 1. No two profiles share a telegram_id.
  {
    const { data } = await sb
      .from("profiles")
      .select("telegram_id, id, name")
      .not("telegram_id", "is", null);
    const byTg = new Map<string, any[]>();
    for (const r of data || []) {
      if (!byTg.has(r.telegram_id)) byTg.set(r.telegram_id, []);
      byTg.get(r.telegram_id)!.push(r);
    }
    const dupes = [...byTg.entries()].filter(([, v]) => v.length > 1);
    checks.push({
      name: "Unique telegram_id per profile",
      ok: dupes.length === 0,
      detail: dupes.length === 0 ? "no dupes" : `${dupes.length} dupe sets: ${dupes.slice(0, 3).map(([tg, v]) => `tg=${tg} → ${v.map(p => p.name).join("/")}`).join("; ")}`,
    });
  }

  // 2. No two profiles share a claim_token (must be unique by design).
  {
    const { data } = await sb
      .from("profiles")
      .select("claim_token, id, name")
      .not("claim_token", "is", null);
    const byTok = new Map<string, any[]>();
    for (const r of data || []) {
      if (!byTok.has(r.claim_token)) byTok.set(r.claim_token, []);
      byTok.get(r.claim_token)!.push(r);
    }
    const dupes = [...byTok.entries()].filter(([, v]) => v.length > 1);
    checks.push({
      name: "Unique claim_token per profile",
      ok: dupes.length === 0,
      detail: dupes.length === 0 ? "no dupes" : `${dupes.length} dupe sets`,
    });
  }

  // 3. Recommender flag count.
  {
    const { count } = await sb
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("is_recommender", true);
    checks.push({
      name: "Recommender count > 0",
      ok: (count || 0) > 0,
      detail: `${count} recommenders`,
    });
  }

  // 4. claimed_at must be set whenever telegram_id is set (otherwise the
  //    welcome flow didn't actually run — they're a stuck orphan).
  {
    const { data } = await sb
      .from("profiles")
      .select("id, name, telegram_id")
      .not("telegram_id", "is", null)
      .is("claimed_at", null);
    checks.push({
      name: "telegram_id set ⇒ claimed_at set",
      ok: (data || []).length === 0,
      detail: (data || []).length === 0
        ? "all linked profiles also claimed"
        : `${data!.length} stuck: ${data!.slice(0, 3).map((p: any) => p.name).join(", ")}`,
    });
  }

  // 5. Attribution self-reference: contributor cannot equal subject.
  {
    const { data } = await sb
      .from("attributions")
      .select("id, contributor_profile_id, subject_profile_id")
      .limit(2000);
    const selfRefs = (data || []).filter((r: any) => r.contributor_profile_id === r.subject_profile_id);
    checks.push({
      name: "No self-referencing attributions",
      ok: selfRefs.length === 0,
      detail: selfRefs.length === 0 ? "clean" : `${selfRefs.length} self-refs`,
    });
  }

  // 6. Recommenders should have claim_tokens (so we can send claim cards).
  {
    const { data } = await sb
      .from("profiles")
      .select("id, name")
      .eq("is_recommender", true)
      .is("claim_token", null);
    checks.push({
      name: "Recommenders all have claim_tokens",
      ok: (data || []).length === 0,
      detail: (data || []).length === 0
        ? "all set"
        : `${data!.length} missing: ${data!.slice(0, 5).map((p: any) => p.name).join(", ")}`,
    });
  }

  // 7. Rough orphan check — TG-source profiles with no name + no CV.
  {
    const { data } = await sb
      .from("profiles")
      .select("id, name, source, cv_text")
      .eq("source", "telegram")
      .is("cv_text", null);
    const trulyEmpty = (data || []).filter((p: any) => !p.name || p.name.length < 2);
    checks.push({
      name: "No truly-empty Telegram orphans",
      ok: trulyEmpty.length === 0,
      detail: trulyEmpty.length === 0 ? "clean" : `${trulyEmpty.length} empty`,
    });
  }

  // Print.
  let pass = 0, fail = 0;
  for (const c of checks) {
    console.log(`${c.ok ? "✓" : "✗"} ${c.name} — ${c.detail}`);
    if (c.ok) pass++; else fail++;
  }
  console.log(`\n══ pass=${pass}  fail=${fail} ══`);
  process.exit(fail > 0 ? 1 : 0);
})();
