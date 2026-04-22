/**
 * Activation prep — generates missing claim_tokens and exports a CSV
 * sorted by tier (Co-Creator > Expert/Senior > Mid/Junior). Each row
 * has the Telegram deep link the user can paste into WhatsApp / email.
 *
 * Usage:
 *   npx tsx scripts/activation-prepare.ts                 (dry run)
 *   npx tsx scripts/activation-prepare.ts --apply         (mints tokens + writes CSV)
 */
import * as fs from "fs";
import * as path from "path";
import { randomBytes } from "crypto";

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

function genToken(): string {
  return randomBytes(4).toString("hex");
}

function tier(p: any): string {
  if (p.is_recommender) return "1_recommender";
  if (p.profile_type === "Expert" || p.profile_type === "Senior") return "2_expert_senior";
  if (p.profile_type === "Mid-level" || p.profile_type === "Junior") return "3_mid_junior";
  return "4_other";
}

function csvCell(v: any): string {
  const s = (v ?? "").toString();
  if (s.includes(",") || s.includes('"') || s.includes("\n")) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

(async () => {
  const { createClient } = await import("@supabase/supabase-js");
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  const { data: profiles } = await sb
    .from("profiles")
    .select("id, name, email, phone, telegram_id, claim_token, claimed_at, is_recommender, profile_type, cv_score, sectors")
    .order("created_at", { ascending: false });

  const all = profiles || [];
  const sendable = all.filter((p: any) => !p.claimed_at && (p.email || p.phone));
  const needsToken = sendable.filter((p: any) => !p.claim_token);

  console.log(`\n═══════════════════════════════════════════════════════════`);
  console.log(`  Activation Prep ${APPLY ? "(APPLY)" : "(DRY RUN)"}`);
  console.log(`═══════════════════════════════════════════════════════════\n`);
  console.log(`Total profiles:                   ${all.length}`);
  console.log(`Sendable (unclaimed + reachable): ${sendable.length}`);
  console.log(`Need claim_token minted:          ${needsToken.length}`);

  if (APPLY && needsToken.length > 0) {
    console.log(`\nMinting ${needsToken.length} claim tokens...`);
    let ok = 0;
    for (const p of needsToken as any[]) {
      const token = genToken();
      const { error } = await sb.from("profiles").update({ claim_token: token }).eq("id", p.id);
      if (!error) { p.claim_token = token; ok++; }
    }
    console.log(`  ✓ ${ok} tokens minted`);
  }

  // Re-sort by tier and recency
  const tagged = sendable.map((p: any) => ({ ...p, _tier: tier(p) }));
  tagged.sort((a: any, b: any) => a._tier.localeCompare(b._tier) || (a.name || "").localeCompare(b.name || ""));

  if (APPLY) {
    const outPath = path.join(__dirname, "..", "test-output", "activation-list.csv");
    const rows: string[] = [];
    rows.push(["tier", "name", "email", "phone", "telegram_id", "is_recommender", "profile_type", "cv_score", "top_sector", "claim_link", "web_link"].join(","));
    for (const p of tagged as any[]) {
      if (!p.claim_token) continue;
      const tg = `https://t.me/Devidends_Bot?start=claim_${p.claim_token}`;
      const web = `https://devidends.net/claim?token=${p.claim_token}`;
      rows.push([
        p._tier, csvCell(p.name), csvCell(p.email || ""), csvCell(p.phone || ""),
        csvCell(p.telegram_id || ""), p.is_recommender ? "Y" : "N",
        csvCell(p.profile_type || ""), p.cv_score ?? "",
        csvCell((p.sectors || [])[0] || ""), tg, web,
      ].join(","));
    }
    fs.writeFileSync(outPath, rows.join("\n"));
    console.log(`\n✓ CSV written: ${outPath}`);
    console.log(`  Rows: ${rows.length - 1}`);

    // Tier breakdown
    const byTier: Record<string, number> = {};
    for (const p of tagged as any[]) byTier[p._tier] = (byTier[p._tier] || 0) + 1;
    console.log(`\n── Sendable by tier ──`);
    for (const [k, v] of Object.entries(byTier).sort()) console.log(`  ${k.padEnd(20)} ${v}`);
  } else {
    console.log(`\nRe-run with --apply to mint tokens and write the CSV.`);
  }
})().catch((e) => { console.error(e); process.exit(1); });
