/**
 * Delete the orphan synthetic tg_297659579@users.devidends.app auth user
 * created by the first (buggy) TG login attempt. The fixed /api/auth/telegram-login
 * will now resolve Mussie to his canonical mussietsegg@gmail.com user.
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

const TARGET = "tg_297659579@users.devidends.app";

async function main() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: list } = await sb.auth.admin.listUsers({ perPage: 1000 });
  const target = list?.users?.find((u: any) => u.email === TARGET);
  if (!target) {
    console.log(`No auth user with email=${TARGET}`);
    return;
  }

  // Check if any profile is tied to this user (shouldn't be, but verify)
  const { data: tiedProfile } = await sb
    .from("profiles")
    .select("id, name, email")
    .eq("user_id", target.id)
    .maybeSingle();
  if (tiedProfile) {
    console.log(`Profile tied to this auth user:`, tiedProfile);
    console.log(`Unlinking first...`);
    await sb.from("profiles").update({ user_id: null }).eq("id", tiedProfile.id);
  }

  const { error } = await sb.auth.admin.deleteUser(target.id);
  if (error) {
    console.error("Delete failed:", error);
    process.exit(1);
  }
  console.log(`✓ Deleted synthetic auth user ${target.id} (${TARGET})`);
}

main().catch((e) => { console.error(e); process.exit(1); });
