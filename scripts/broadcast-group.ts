/**
 * Broadcast daily digest to Telegram group.
 * Called from daily pipeline after crawl engine completes.
 *
 * Usage: npx tsx scripts/broadcast-group.ts
 *
 * Requires env vars:
 *   TELEGRAM_BOT_TOKEN
 *   TELEGRAM_GROUP_ID      — chat ID of the target group
 *   TELEGRAM_JOBS_TOPIC_ID — forum topic ID for "jobs" (optional)
 */

import * as fs from "fs";
import * as path from "path";

// Load env vars
const envPath = path.join(__dirname, "..", ".env.local");
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, "utf-8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx < 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = val;
  }
}

async function main() {
  // Read the normalized opportunities file
  const normalizedPath = path.join(__dirname, "..", "test-output", "_all_normalized.json");
  if (!fs.existsSync(normalizedPath)) {
    console.error("No _all_normalized.json found. Run crawl engine first.");
    process.exit(1);
  }

  const raw = JSON.parse(fs.readFileSync(normalizedPath, "utf-8"));
  const opportunities = Array.isArray(raw) ? raw : [];
  console.log(`Loaded ${opportunities.length} opportunities`);

  // Filter to today's newly scraped items (within last 24h)
  const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
  const recent = opportunities.filter((o: any) => {
    if (!o.scraped_at) return true; // include if no timestamp
    return new Date(o.scraped_at).getTime() > dayAgo;
  });
  console.log(`${recent.length} opportunities scraped in last 24h`);

  if (recent.length === 0) {
    console.log("No recent opportunities to broadcast.");
    return;
  }

  // Import and call the broadcast function
  const { broadcastToGroup } = await import("../lib/telegram-broadcast");
  const result = await broadcastToGroup(recent);
  console.log(`Broadcast result: sent=${result.sent}, count=${result.count}`);
}

main().catch((err) => {
  console.error("Broadcast failed:", err);
  process.exit(1);
});
