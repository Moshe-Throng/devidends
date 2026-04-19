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

  // Find truly NEW jobs by comparing against yesterday's snapshot
  const snapshotPath = path.join(__dirname, "..", "test-output", "_last_broadcast_urls.json");
  let lastUrls = new Set<string>();
  try {
    if (fs.existsSync(snapshotPath)) {
      lastUrls = new Set(JSON.parse(fs.readFileSync(snapshotPath, "utf-8")));
    }
  } catch {}

  const allUrls = opportunities.map((o: any) => o.source_url || o.url).filter(Boolean);

  // Relevance filter: jobs Ethiopians can actually apply to.
  // Rule: Ethiopia-based roles PLUS jobs that are clearly international/regional/remote
  // (open to nationals of any country, including Ethiopia).
  // Exclude: country-specific roles in non-Ethiopia locations, non-English postings.
  function isRelevantForEthiopians(opp: any): boolean {
    const country = (opp.country || "").toLowerCase();
    const title = (opp.title || "").toLowerCase();
    const city = (opp.city || "").toLowerCase();
    const desc = (opp.description || "").toLowerCase();
    const allText = [country, title, city, desc].join(" ");

    // Exclude non-English postings (Spanish/French/Danish/Arabic) — clearly regional
    if (/\b(oficial|asistente|gerente|equipo|l[íi]der|atenci[óo]n|protecci[óo]n)\b/i.test(title)) return false;
    if (/\b(projektleder|medarbejder|partnerskab)\b/i.test(title)) return false;
    if (/\b(responsable|coordinateur|assistant[e]?\s+(de|du|\u00e0))\b/i.test(title) && !title.includes("english")) return false;

    // Ethiopia-based — always include
    if (country.includes("ethiopia") || title.includes("ethiopia") || city.includes("addis") || city.includes("ethiopia")) return true;

    // Explicit Africa regional / Horn of Africa tags
    if (/\b(horn of africa|east africa|eastern africa|greater horn|ethiopia\/somalia)\b/i.test(allText)) return true;

    // International / global / regional / remote roles — open to anyone
    if (/\b(international consultant|international expert|international staff|international specialist|international advisor|international officer)\b/i.test(title)) return true;
    if (/\b(global|regional|remote|work from anywhere|home-?based)\b/i.test(title)) return true;
    if (/\b(headquarter|roving|multi-country|pan-african|continent[a-z]*)\b/i.test(title)) return true;

    // HQ-based positions at major donor agencies (open globally)
    if (/\b(hq|headquarters?)\b/i.test(country) || /\b(new york|geneva|vienna|rome,\s*italy|paris,\s*france|washington|nairobi.*regional)\b/i.test(country)) {
      // Only include HQ roles that aren't country-coordinator type
      if (!/\b(national|country)\s+(coordinator|manager|director|lead)\b/i.test(title)) return true;
    }

    // Exclude: clearly country-specific role in another country
    // (Default exclude for everything else — country-specific jobs in non-Ethiopia locations)
    return false;
  }

  const recent = opportunities.filter((o: any) => {
    const url = o.source_url || o.url;
    if (!url || lastUrls.has(url)) return false;
    return isRelevantForEthiopians(o);
  });

  // Save today's URLs (ALL, not just filtered — so dedup stays correct)
  fs.writeFileSync(snapshotPath, JSON.stringify(allUrls));
  const newTotal = opportunities.filter((o: any) => {
    const url = o.source_url || o.url;
    return url && !lastUrls.has(url);
  }).length;
  console.log(`${recent.length} relevant opportunities (of ${newTotal} new, ${opportunities.length} overall)`);

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

  // Also dedup news against yesterday
  const newsSnapshotPath = path.join(__dirname, "..", "test-output", "_last_broadcast_news.json");
  let lastNewsUrls = new Set<string>();
  try {
    if (fs.existsSync(newsSnapshotPath)) {
      lastNewsUrls = new Set(JSON.parse(fs.readFileSync(newsSnapshotPath, "utf-8")));
    }
  } catch {}
  const newNews = newsArticles.filter((a) => !lastNewsUrls.has(a.url));
  fs.writeFileSync(newsSnapshotPath, JSON.stringify(newsArticles.map((a) => a.url)));
  console.log(`${newNews.length} new news articles (not in yesterday's digest)`);
  newsArticles = newNews;

  if (recent.length === 0 && newsArticles.length === 0) {
    console.log("No new opportunities or news to broadcast. Skipping.");
    return;
  }

  const { broadcastToGroup, notifySubscribersDaily } = await import("../lib/telegram-broadcast");

  // 1. Group digest (public channel/topic)
  const groupResult = await broadcastToGroup(recent, newsArticles);
  console.log(`Group broadcast: sent=${groupResult.sent}, count=${groupResult.count}`);

  // 2. Combined daily digest to individual subscribers (ONE message with jobs + news)
  const digestResult = await notifySubscribersDaily(recent, newsArticles);
  console.log(`Daily digest: notified=${digestResult.notified}, skipped=${digestResult.skipped}, failed=${digestResult.failed}`);
}

main().catch((err) => {
  console.error("Broadcast failed:", err);
  process.exit(1);
});
