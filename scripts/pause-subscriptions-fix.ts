/**
 * Correct the allowlist: "Mussie Haile" is NOT on the allowlist (fuzzy match
 * caught both Mussies). Deactivate his subscription if any.
 *
 * Final allowlist: Mussie Tsegaye (297659579), Petros Mulugeta, Yonus Fantahun,
 * Bezawit Liro.
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

  // Deactivate Mussie Haile's rows specifically
  const { data: haileRows } = await sb
    .from("subscriptions")
    .select("id, email, telegram_id, is_active")
    .eq("email", "musshaile@gmail.com");
  console.log("Mussie Haile subscription rows:", haileRows);

  if (haileRows && haileRows.length > 0) {
    const { error } = await sb
      .from("subscriptions")
      .update({ is_active: false })
      .eq("email", "musshaile@gmail.com");
    if (error) console.error("Failed:", error);
    else console.log(`Deactivated ${haileRows.length} Mussie Haile row(s)`);
  }

  // Show final active list
  const { data: activeRows } = await sb
    .from("subscriptions")
    .select("id, email, telegram_id, channel, sectors_filter")
    .eq("is_active", true);
  console.log(`\nFinal active subscriptions (${activeRows?.length || 0}):`);
  for (const r of activeRows || []) {
    console.log(`  - email=${r.email || "-"}  tg=${r.telegram_id || "-"}  channel=${r.channel}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
