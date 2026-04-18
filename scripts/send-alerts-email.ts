/**
 * Send personalised job alert + news digest emails to email subscribers.
 * Called from daily pipeline after crawl engine completes.
 *
 * Usage: npx tsx scripts/send-alerts-email.ts
 *
 * Requires env vars:
 *   RESEND_API_KEY
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import * as fs from "fs";
import * as path from "path";

// Load env vars from .env.local
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
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    console.log("[email] RESEND_API_KEY not set, skipping email alerts");
    return;
  }

  const { Resend } = await import("resend");
  const { createClient } = await import("@supabase/supabase-js");
  const { dailyDigestEmail } = await import("../lib/email-templates");

  const resend = new Resend(resendKey);
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Load today's opportunities
  const normalizedPath = path.join(__dirname, "..", "test-output", "_all_normalized.json");
  const opportunities = fs.existsSync(normalizedPath)
    ? (JSON.parse(fs.readFileSync(normalizedPath, "utf-8")) as any[])
    : [];

  // Dedup against yesterday's email — only include jobs NOT emailed yesterday
  const emailSnapPath = path.join(__dirname, "..", "test-output", "_last_email_urls.json");
  let lastEmailedUrls = new Set<string>();
  try {
    if (fs.existsSync(emailSnapPath)) {
      lastEmailedUrls = new Set(JSON.parse(fs.readFileSync(emailSnapPath, "utf-8")));
    }
  } catch {}
  const allTodayUrls = opportunities.map((o: any) => o.source_url || o.url).filter(Boolean);
  const recent = opportunities.filter((o: any) => {
    const url = o.source_url || o.url;
    return url && !lastEmailedUrls.has(url);
  });
  fs.writeFileSync(emailSnapPath, JSON.stringify(allTodayUrls));
  console.log(`[email] ${recent.length} new opportunities (out of ${opportunities.length} total)`);

  // Load news
  const newsPath = path.join(__dirname, "..", "test-output", "news.json");
  const allNews = fs.existsSync(newsPath)
    ? (JSON.parse(fs.readFileSync(newsPath, "utf-8")) as any[])
    : [];

  // Dedup news
  const newsSnapPath = path.join(__dirname, "..", "test-output", "_last_email_news.json");
  let lastEmailedNews = new Set<string>();
  try {
    if (fs.existsSync(newsSnapPath)) {
      lastEmailedNews = new Set(JSON.parse(fs.readFileSync(newsSnapPath, "utf-8")));
    }
  } catch {}
  const newsArticles = allNews.filter((a: any) => !lastEmailedNews.has(a.url));
  fs.writeFileSync(newsSnapPath, JSON.stringify(allNews.map((a: any) => a.url)));
  console.log(`[email] ${newsArticles.length} new news articles`);

  // Fetch ALL subscriptions with an email (any channel)
  const { data: rawSubs, error } = await supabase
    .from("subscriptions")
    .select("email, sectors_filter, news_categories_filter")
    .eq("is_active", true)
    .not("email", "is", null);

  if (error || !rawSubs?.length) {
    console.log("[email] No email subscribers or error:", error?.message);
    return;
  }

  // Deduplicate by email — each person gets exactly ONE email
  const byEmail = new Map<string, typeof rawSubs[0]>();
  for (const sub of rawSubs) {
    const email = sub.email!.toLowerCase();
    const existing = byEmail.get(email);
    if (!existing) {
      byEmail.set(email, { ...sub, email });
    } else {
      if (sub.sectors_filter?.length) {
        existing.sectors_filter = [...new Set([...(existing.sectors_filter || []), ...sub.sectors_filter])];
      }
      if (sub.news_categories_filter?.length) {
        existing.news_categories_filter = [...new Set([...(existing.news_categories_filter || []), ...sub.news_categories_filter])];
      }
    }
  }

  const subscribers = Array.from(byEmail.values());
  console.log(`[email] ${rawSubs.length} subscription rows → ${subscribers.length} unique emails`);

  let sent = 0, failed = 0, skipped = 0;

  for (const sub of subscribers) {
    try {
      const sectorFilter: string[] = sub.sectors_filter || [];
      const newsFilter: string[] = sub.news_categories_filter || [];

      const matchedOpps = sectorFilter.length > 0
        ? recent.filter((o) => {
            const text = [o.title, o.description, o.classified_type].filter(Boolean).join(" ").toLowerCase();
            return sectorFilter.some((s) => text.includes(s.toLowerCase()));
          })
        : recent;

      const matchedNews = newsFilter.length > 0
        ? newsArticles.filter((a) => newsFilter.includes(a.category))
        : newsArticles;

      if (matchedOpps.length === 0 && matchedNews.length === 0) {
        skipped++;
        continue;
      }

      const html = dailyDigestEmail(matchedOpps, matchedNews, undefined, sectorFilter, newsFilter);
      const oppCount = matchedOpps.length;
      const newsCount = matchedNews.length;
      const subjectParts: string[] = [];
      if (oppCount > 0) subjectParts.push(`${oppCount} opportunit${oppCount !== 1 ? "ies" : "y"}`);
      if (newsCount > 0) subjectParts.push(`${newsCount} article${newsCount !== 1 ? "s" : ""}`);

      await resend.emails.send({
        from: "Devidends <alerts@devidends.net>",
        to: sub.email,
        subject: `📡 ${subjectParts.join(" + ")} — Devidends Daily Brief`,
        html,
      });

      sent++;
      await new Promise((r) => setTimeout(r, 200));
    } catch (err) {
      console.error(`[email] Failed for ${sub.email}:`, err);
      failed++;
    }
  }

  console.log(`[email] Done: ${sent} sent, ${failed} failed, ${skipped} skipped`);
}

main().catch((err) => {
  console.error("Email alerts failed:", err);
  process.exit(1);
});
