/**
 * Create the login_tokens table used by the bot-based web login flow.
 * Idempotent — safe to re-run.
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

  // Try to query — if table exists, done.
  const { error: probeErr } = await sb.from("login_tokens").select("token").limit(1);
  if (!probeErr) {
    console.log("login_tokens table already exists.");
    return;
  }

  if (probeErr.code !== "42P01" && !(probeErr.message || "").toLowerCase().includes("does not exist")) {
    console.error("Unexpected probe error:", probeErr);
    process.exit(1);
  }

  // Not supported directly via supabase-js. Instruct user to run SQL in Supabase dashboard.
  const sqlPath = path.join(__dirname, "sql", "login-tokens.sql");
  const sql = fs.readFileSync(sqlPath, "utf-8");
  console.log("Table does NOT exist yet. Paste this into Supabase SQL Editor:\n");
  console.log("=".repeat(60));
  console.log(sql);
  console.log("=".repeat(60));
  console.log(`\nDashboard: https://supabase.com/dashboard/project/bfjgtqqvootfpyxkriqb/sql/new`);
}

main().catch((e) => { console.error(e); process.exit(1); });
