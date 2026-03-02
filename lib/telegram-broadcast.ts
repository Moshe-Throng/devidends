import { getTelegramBot, getChannelId } from "@/lib/telegram";
import { createClient } from "@supabase/supabase-js";
import type { SampleOpportunity } from "@/lib/types/cv-score";

// ---------------------------------------------------------------------------
// Supabase admin client
// ---------------------------------------------------------------------------

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://devidends.net";

/** HTML-escape for Telegram HTML parse mode. */
function escHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function truncate(text: string, max: number): string {
  if (!text || text.length <= max) return text || "";
  return text.slice(0, max - 1) + "\u2026";
}

/** Sleep for the given number of milliseconds. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Format a single opportunity as an HTML card for Telegram. */
function formatOpportunityHtml(opp: SampleOpportunity): string {
  const title = escHtml(truncate(opp.title, 100));
  const org = escHtml(truncate(opp.organization, 60));
  const country = escHtml(opp.country || "N/A");
  const deadline = opp.deadline
    ? escHtml(new Date(opp.deadline).toLocaleDateString("en-GB"))
    : "Open";
  const type = opp.classified_type || opp.type || "Opportunity";
  const typeBadge = escHtml(type.charAt(0).toUpperCase() + type.slice(1));
  const url = opp.source_url || `${SITE_URL}/jobs`;

  return [
    `\ud83d\udccc <b>${title}</b>`,
    `\ud83c\udfe2 ${org}`,
    `\ud83d\udccd ${country} | \u23f0 ${deadline} | \ud83c\udff7 ${typeBadge}`,
    opp.seniority ? `\ud83c\udfaf Level: ${escHtml(opp.seniority)}` : "",
    `\ud83d\udd17 <a href="${url}">Apply Here</a>`,
    "",
    `\u2014 <a href="${SITE_URL}">Devidends</a>`,
  ]
    .filter(Boolean)
    .join("\n");
}

// ---------------------------------------------------------------------------
// Channel broadcast
// ---------------------------------------------------------------------------

/**
 * Post up to 5 opportunities to the public Telegram channel.
 * Uses HTML parse_mode. Rate-limits at 100ms between messages.
 */
export async function broadcastToChannel(
  opportunities: SampleOpportunity[]
): Promise<{ sent: number; failed: number }> {
  const bot = getTelegramBot();
  const channelId = getChannelId();
  const toPost = opportunities.slice(0, 5);

  let sent = 0;
  let failed = 0;

  for (const opp of toPost) {
    try {
      const html = formatOpportunityHtml(opp);
      await bot.sendMessage(channelId, html, {
        parse_mode: "HTML",
        disable_web_page_preview: true,
      });
      sent++;
    } catch (err) {
      console.error(
        `[telegram-broadcast] Failed to post "${opp.title}" to channel:`,
        err
      );
      failed++;
    }

    // Rate limit: Telegram allows ~30 messages/second to a channel,
    // but we stay conservative.
    await sleep(100);
  }

  console.log(
    `[telegram-broadcast] Channel: ${sent} sent, ${failed} failed out of ${toPost.length}`
  );
  return { sent, failed };
}

// ---------------------------------------------------------------------------
// Group broadcast (daily digest to devidendstest/jobs topic)
// ---------------------------------------------------------------------------

/**
 * Post a single daily digest message to a Telegram group's forum topic.
 * Uses TELEGRAM_GROUP_ID and TELEGRAM_JOBS_TOPIC_ID env vars.
 */
/** A news article from the crawled feed. */
export interface NewsArticle {
  title: string;
  url: string;
  source_name: string;
  category: string;
}

export async function broadcastToGroup(
  opportunities: SampleOpportunity[],
  newsArticles?: NewsArticle[]
): Promise<{ sent: boolean; count: number }> {
  const groupId = process.env.TELEGRAM_GROUP_ID;
  const topicId = process.env.TELEGRAM_JOBS_TOPIC_ID;

  if (!groupId) {
    console.warn("[telegram-broadcast] TELEGRAM_GROUP_ID not set, skipping group broadcast");
    return { sent: false, count: 0 };
  }

  const bot = getTelegramBot();

  // Remove all tenders and procurement-style listings
  const TENDER_RE = /\b(procurement|supply|rfp|rfq|bid|tender|construction|installation|purchase|provision of goods)\b/i;
  const filtered = opportunities.filter((o) => {
    const type = (o.classified_type || o.type || "").toLowerCase();
    if (type === "tender") return false;
    if (TENDER_RE.test(o.title || "")) return false;
    return true;
  });

  if (filtered.length === 0 && (!newsArticles || newsArticles.length === 0)) {
    console.log("[telegram-broadcast] No opportunities or news to broadcast");
    return { sent: false, count: 0 };
  }

  const jobs = filtered;

  // Build single digest message
  const today = new Date().toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const parts: string[] = [
    `\ud83d\udce2 <b>Devidends Daily Brief \u2014 ${escHtml(today)}</b>`,
    `\ud83d\udcca ${opportunities.length} new opportunities today`,
    "",
  ];

  if (jobs.length > 0) {
    parts.push(`\ud83d\udcbc <b>JOBS (${jobs.length})</b>`);
    parts.push("");
    for (const opp of jobs.slice(0, 15)) {
      const title = escHtml(truncate(opp.title, 80));
      const org = escHtml(truncate(opp.organization, 40));
      const deadline = opp.deadline
        ? new Date(opp.deadline).toLocaleDateString("en-GB", { day: "numeric", month: "short" })
        : "Open";
      const url = opp.source_url || `${SITE_URL}/opportunities`;
      parts.push(`\u2022 <a href="${url}">${title}</a>`);
      parts.push(`  ${org} | \u23f0 ${escHtml(deadline)}`);
    }
    if (jobs.length > 15) {
      parts.push(`  <i>...and ${jobs.length - 15} more</i>`);
    }
    parts.push("");
  }

  // News section
  const news = newsArticles || [];
  if (news.length > 0) {
    parts.push(`\ud83d\udcf0 <b>DEV NEWS (${news.length})</b>`);
    parts.push("");
    for (const article of news.slice(0, 5)) {
      const title = escHtml(truncate(article.title, 80));
      parts.push(`\u2022 <a href="${article.url}">${title}</a>`);
      parts.push(`  ${escHtml(article.source_name)} | ${escHtml(article.category)}`);
    }
    if (news.length > 5) {
      parts.push(`  <i>...and ${news.length - 5} more on the feed</i>`);
    }
    parts.push("");
  }

  parts.push(`\ud83d\udd17 <a href="${SITE_URL}/opportunities">Browse opportunities</a> | <a href="${SITE_URL}/news">Dev news feed</a>`);
  parts.push(`\ud83d\udc64 <a href="${SITE_URL}/subscribe">Subscribe for personalized alerts</a>`);

  const html = parts.join("\n");

  try {
    const sendOptions: Record<string, unknown> = {
      parse_mode: "HTML",
      disable_web_page_preview: true,
    };

    // If topic ID is set, post to that specific forum topic
    if (topicId) {
      sendOptions.message_thread_id = parseInt(topicId, 10);
    }

    await bot.sendMessage(groupId, html, sendOptions);

    console.log(
      `[telegram-broadcast] Group digest sent: ${opportunities.length} opportunities to ${groupId}${topicId ? ` topic ${topicId}` : ""}`
    );
    return { sent: true, count: opportunities.length };
  } catch (err) {
    console.error("[telegram-broadcast] Failed to send group digest:", err);
    return { sent: false, count: 0 };
  }
}

// ---------------------------------------------------------------------------
// Subscriber notifications
// ---------------------------------------------------------------------------

interface Subscription {
  id: string;
  telegram_id: string;
  sectors_filter: string[] | null;
  donor_filter: string[] | null;
  country_filter: string[] | null;
  work_type_filter: string[] | null;
}

/**
 * Check whether an opportunity matches a subscriber's filter preferences.
 * If no filters are set for a dimension, it matches everything.
 */
function matchesSubscriber(
  opp: SampleOpportunity,
  sub: Subscription
): boolean {
  // Country filter
  if (sub.country_filter && sub.country_filter.length > 0) {
    const oppCountry = (opp.country || "").toLowerCase();
    const match = sub.country_filter.some(
      (c) => oppCountry.includes(c.toLowerCase())
    );
    if (!match) return false;
  }

  // Sector filter — match against title, description, type
  if (sub.sectors_filter && sub.sectors_filter.length > 0) {
    const searchText = [opp.title, opp.description, opp.classified_type]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    const match = sub.sectors_filter.some((sector) =>
      searchText.includes(sector.toLowerCase())
    );
    if (!match) return false;
  }

  // Work type filter — match against classified_type
  if (sub.work_type_filter && sub.work_type_filter.length > 0) {
    const oppType = (opp.classified_type || opp.type || "").toLowerCase();
    const typeMap: Record<string, string[]> = {
      "full-time": ["job", "full-time", "fulltime"],
      "consultancy": ["consulting", "consultancy", "consultant", "advisory"],
      "contract": ["contract", "fixed-term"],
      "internship": ["internship", "intern", "trainee", "graduate"],
    };
    const match = sub.work_type_filter.some((filter) => {
      const patterns = typeMap[filter.toLowerCase()] || [filter.toLowerCase()];
      return patterns.some((p) => oppType.includes(p));
    });
    if (!match) return false;
  }

  return true;
}

/**
 * Send personalized DMs to Telegram subscribers based on their sector/country filters.
 * Fetches subscribers from Supabase, filters opportunities per subscriber, and sends.
 */
export async function notifySubscribers(
  newOpportunities: SampleOpportunity[]
): Promise<{ notified: number; failed: number; skipped: number }> {
  if (newOpportunities.length === 0) {
    return { notified: 0, failed: 0, skipped: 0 };
  }

  const bot = getTelegramBot();
  const supabase = getSupabaseAdmin();

  // Fetch all active Telegram subscribers
  const { data: subscribers, error } = await supabase
    .from("subscriptions")
    .select("id, telegram_id, sectors_filter, donor_filter, country_filter, work_type_filter")
    .eq("channel", "telegram")
    .eq("is_active", true)
    .not("telegram_id", "is", null);

  if (error) {
    console.error("[telegram-broadcast] Failed to fetch subscribers:", error);
    return { notified: 0, failed: 0, skipped: 0 };
  }

  if (!subscribers || subscribers.length === 0) {
    console.log("[telegram-broadcast] No active Telegram subscribers found.");
    return { notified: 0, failed: 0, skipped: 0 };
  }

  let notified = 0;
  let failed = 0;
  let skipped = 0;

  for (const sub of subscribers as Subscription[]) {
    try {
      // Filter opportunities for this subscriber
      const matched = newOpportunities.filter((opp) =>
        matchesSubscriber(opp, sub)
      );

      if (matched.length === 0) {
        skipped++;
        continue;
      }

      // Send at most 10 per subscriber per digest
      const toSend = matched.slice(0, 10);
      const header =
        toSend.length === 1
          ? "\ud83d\udd14 <b>New opportunity matching your interests:</b>\n"
          : `\ud83d\udd14 <b>${toSend.length} new opportunities matching your interests:</b>\n`;

      const body = toSend.map(formatOpportunityHtml).join("\n\n");

      const footer = `\n\n\ud83d\udccd <a href="${SITE_URL}/jobs">See all opportunities</a> | /subscribe to update your preferences`;

      await bot.sendMessage(
        Number(sub.telegram_id),
        header + "\n" + body + footer,
        {
          parse_mode: "HTML",
          disable_web_page_preview: true,
        }
      );

      notified++;
    } catch (err) {
      console.error(
        `[telegram-broadcast] Failed to notify subscriber ${sub.telegram_id}:`,
        err
      );
      failed++;
    }

    // Rate limit between subscribers (Telegram limits ~30 msg/sec across all chats)
    await sleep(100);
  }

  console.log(
    `[telegram-broadcast] Subscribers: ${notified} notified, ${failed} failed, ${skipped} skipped (no matches) out of ${subscribers.length}`
  );
  return { notified, failed, skipped };
}
