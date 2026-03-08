/**
 * Broadcast daily digest to Telegram group + notify individual subscribers.
 * Called from daily pipeline after crawl engine completes.
 *
 * Usage: npx tsx scripts/broadcast-group.ts
 *
 * Requires env vars:
 *   TELEGRAM_BOT_TOKEN
 *   TELEGRAM_GROUP_ID         — chat ID of the target group
 *   TELEGRAM_JOBS_TOPIC_ID    — forum topic ID for "jobs" (optional)
 *   NEXT_PUBLIC_SUPABASE_URL  — for subscriber lookups
 *   SUPABASE_SERVICE_ROLE_KEY — for subscriber lookups
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

  // Load news articles
  const newsPath = path.join(__dirname, "..", "test-output", "news.json");
  let newsArticles: { title: string; url: string; source_name: string; category: string }[] = [];
  if (fs.existsSync(newsPath)) {
    try {
      newsArticles = JSON.parse(fs.readFileSync(newsPath, "utf-8"));
      console.log(`Loaded ${newsArticles.length} news articles`);
    } catch {
      console.warn("Failed to parse news.json");
    }
  }

  if (recent.length === 0 && newsArticles.length === 0) {
    console.log("No opportunities or news to broadcast.");
    return;
  }

  const { broadcastToGroup, notifySubscribers, notifySubscribersNews } = await import("../lib/telegram-broadcast");

  // 1. Group digest (public channel/topic)
  const groupResult = await broadcastToGroup(recent, newsArticles);
  console.log(`Group broadcast: sent=${groupResult.sent}, count=${groupResult.count}`);

  // 2. Individual job alerts (personalised per subscriber sector prefs)
  if (recent.length > 0) {
    const jobResult = await notifySubscribers(recent);
    console.log(`Subscriber job alerts: notified=${jobResult.notified}, skipped=${jobResult.skipped}, failed=${jobResult.failed}`);
  }

  // 3. Individual news digest (all active Telegram subscribers)
  if (newsArticles.length > 0) {
    const newsResult = await notifySubscribersNews(newsArticles);
    console.log(`Subscriber news digest: notified=${newsResult.notified}, failed=${newsResult.failed}`);
  }
}

main().catch((err) => {
  console.error("Broadcast failed:", err);
  process.exit(1);
});
