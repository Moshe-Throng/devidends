/**
 * Seed `_last_broadcast_urls.json` from all currently-active opportunities in Supabase.
 * Run once after fixing the crawler, BEFORE the next broadcast, to prevent a flood
 * of every active job being re-sent as "new".
 *
 * Usage: npx tsx scripts/seed-broadcast-snapshot.ts
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
    const key = t.slice(0, idx).trim();
    const val = t.slice(idx + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = val;
  }
}

async function main() {
  const { createClient } = await import("@supabase/supabase-js");
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data, error } = await sb
    .from("opportunities")
    .select("source_url")
    .eq("is_active", true);

  if (error) throw new Error(error.message);

  const urls = (data || []).map((r: any) => r.source_url).filter(Boolean);
  const outPath = path.join(__dirname, "..", "test-output", "_last_broadcast_urls.json");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(urls));

  console.log(`Seeded ${urls.length} active URLs into ${outPath}`);
  console.log("Next broadcast will only send jobs NOT in this list.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
