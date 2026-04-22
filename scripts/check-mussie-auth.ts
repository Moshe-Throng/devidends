/**
 * Look at the most recent Supabase auth users + see which one is Mussie,
 * and whether a profile exists matching it.
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

  const { data: list } = await sb.auth.admin.listUsers({ perPage: 50 });
  const sorted = (list?.users || []).sort((a: any, b: any) =>
    (b.last_sign_in_at || b.created_at || "").localeCompare(a.last_sign_in_at || a.created_at || "")
  );

  console.log(`Most recent auth users (top 10):`);
  for (const u of sorted.slice(0, 10)) {
    console.log(`  ${u.id}  email=${u.email}  provider=${(u.app_metadata as any)?.provider}  last=${u.last_sign_in_at || u.created_at}`);
  }

  // Look for any Mussie-ish
  const mussies = sorted.filter((u: any) =>
    (u.email || "").toLowerCase().includes("mussie") ||
    (u.email || "").toLowerCase().includes("sheklave") ||
    (u.email || "").toLowerCase().includes("mussietsegg")
  );
  console.log(`\nMussie-matching auth users:`);
  for (const u of mussies) {
    console.log(`  ${u.id}  email=${u.email}  provider=${(u.app_metadata as any)?.provider}`);
    const { data: prof } = await sb
      .from("profiles")
      .select("id, name, email, telegram_id, user_id, cv_score")
      .or(`user_id.eq.${u.id},email.eq.${u.email}`);
    console.log(`     matching profiles:`, prof);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
