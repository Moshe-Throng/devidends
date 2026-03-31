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

  const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
  const recent = opportunities.filter((o) => !o.scraped_at || new Date(o.scraped_at).getTime() > dayAgo);

  // Load news
  const newsPath = path.join(__dirname, "..", "test-output", "news.json");
  const newsArticles = fs.existsSync(newsPath)
    ? (JSON.parse(fs.readFileSync(newsPath, "utf-8")) as any[])
    : [];

  // Fetch email subscribers
  const { data: subscribers, error } = await supabase
    .from("subscriptions")
    .select("email, sectors_filter, news_categories_filter")
    .eq("channel", "email")
    .eq("is_active", true)
    .not("email", "is", null);

  if (error || !subscribers?.length) {
    console.log("[email] No email subscribers or error:", error?.message);
    return;
  }

  console.log(`[email] Sending to ${subscribers.length} email subscribers`);

  let sent = 0, failed = 0, skipped = 0;

  for (const sub of subscribers) {
    try {
      const sectorFilter: string[] = sub.sectors_filter || [];
      const newsFilter: string[] = sub.news_categories_filter || [];

      // Filter opportunities
      const matchedOpps = sectorFilter.length > 0
        ? recent.filter((o) => {
            const text = [o.title, o.description, o.classified_type].filter(Boolean).join(" ").toLowerCase();
            return sectorFilter.some((s) => text.includes(s.toLowerCase()));
          })
        : recent;

      // Filter news
      const matchedNews = newsFilter.length > 0
        ? newsArticles.filter((a) => newsFilter.includes(a.category))
        : newsArticles;

      if (matchedOpps.length === 0 && matchedNews.length === 0) {
        skipped++;
        continue;
      }

      // Send ONE combined daily digest email (jobs + news together)
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
      await new Promise((r) => setTimeout(r, 200)); // rate limit
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
