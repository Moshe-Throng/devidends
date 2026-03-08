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

const TYPE_EMOJI: Record<string, string> = {
  job: "💼", consultancy: "📋", tender: "📦", internship: "🎓",
  contract: "📄", fellowship: "🎖️", volunteer: "🤝",
};
const CAT_EMOJI: Record<string, string> = {
  "Humanitarian": "🆘", "Policy & Governance": "🏛️", "Funding & Donors": "💰",
  "Health": "🏥", "Economy & Trade": "📈", "Climate & Environment": "🌍",
  "Education": "📚", "General": "📰",
};

/** Format a single opportunity as a rich HTML card for Telegram DMs. */
function formatOpportunityHtml(opp: SampleOpportunity): string {
  const title = escHtml(truncate(opp.title, 90));
  const org = escHtml(truncate(opp.organization, 50));
  const country = escHtml(opp.country || "Remote");
  const deadline = opp.deadline
    ? new Date(opp.deadline).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
    : "Rolling";
  const type = (opp.classified_type || opp.type || "opportunity").toLowerCase();
  const typeEmoji = TYPE_EMOJI[type] || "📌";
  const url = opp.source_url || `${SITE_URL}/opportunities`;

  const lines = [
    `${typeEmoji} <b>${title}</b>`,
    ``,
    `🏢 <i>${org}</i>`,
    `📍 ${country}${opp.seniority ? ` · 🎯 ${escHtml(opp.seniority)}` : ""}`,
    `⏰ Deadline: <b>${deadline}</b>`,
    ``,
    `<a href="${url}">→ View &amp; Apply</a>`,
  ];
  return lines.join("\n");
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
    `┌─────────────────────────────┐`,
    `│  📡 <b>DEVIDENDS DAILY BRIEF</b>   │`,
    `└─────────────────────────────┘`,
    ``,
    `📅 <b>${escHtml(today)}</b>`,
    ``,
  ];

  if (jobs.length > 0) {
    parts.push(`💼 <b>NEW OPPORTUNITIES</b> <i>(${jobs.length} total)</i>`);
    parts.push(`─────────────────────────`);
    for (const opp of jobs.slice(0, 12)) {
      const title = escHtml(truncate(opp.title, 75));
      const org = escHtml(truncate(opp.organization, 35));
      const deadline = opp.deadline
        ? new Date(opp.deadline).toLocaleDateString("en-GB", { day: "numeric", month: "short" })
        : "Open";
      const type = (opp.classified_type || opp.type || "").toLowerCase();
      const tEmoji = TYPE_EMOJI[type] || "📌";
      const url = opp.source_url || `${SITE_URL}/opportunities`;
      parts.push(`${tEmoji} <a href="${url}"><b>${title}</b></a>`);
      parts.push(`   🏢 ${org}  ·  ⏰ ${escHtml(deadline)}`);
      parts.push(``);
    }
    if (jobs.length > 12) {
      parts.push(`<i>+${jobs.length - 12} more → <a href="${SITE_URL}/opportunities">Browse all</a></i>`);
      parts.push(``);
    }
  }

  // News section
  const news = newsArticles || [];
  if (news.length > 0) {
    parts.push(`📰 <b>DEVELOPMENT NEWS</b> <i>(${news.length} articles)</i>`);
    parts.push(`─────────────────────────`);
    for (const article of news.slice(0, 5)) {
      const title = escHtml(truncate(article.title, 80));
      const catEmoji = CAT_EMOJI[article.category] || "📰";
      parts.push(`${catEmoji} <a href="${article.url}">${title}</a>`);
      parts.push(`   <i>${escHtml(article.source_name)}</i>`);
      parts.push(``);
    }
    if (news.length > 5) {
      parts.push(`<i>+${news.length - 5} more → <a href="${SITE_URL}/news">Full feed</a></i>`);
      parts.push(``);
    }
  }

  parts.push(`─────────────────────────`);
  parts.push(`🔔 <a href="${SITE_URL}/tg-app/alerts">Set your personal alerts</a>  |  <a href="${SITE_URL}/opportunities">Browse all</a>`);

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

      // Send at most 8 per subscriber per digest
      const toSend = matched.slice(0, 8);
      const today = new Date().toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });

      const lines: string[] = [
        `🔔 <b>Your Daily Job Alerts</b> · <i>${today}</i>`,
        ``,
        `<i>${toSend.length} opportunit${toSend.length !== 1 ? "ies" : "y"} matching your interests</i>`,
        `━━━━━━━━━━━━━━━━━━━━━━━━`,
        ``,
        ...toSend.map((opp, i) => `${formatOpportunityHtml(opp)}${i < toSend.length - 1 ? "\n\n──────────────────────\n" : ""}`),
        ``,
        `━━━━━━━━━━━━━━━━━━━━━━━━`,
        `📌 <a href="${SITE_URL}/opportunities">Browse all ${matched.length > 8 ? `(+${matched.length - 8} more)` : "opportunities"}</a>  ·  <a href="${SITE_URL}/tg-app/alerts">Edit alerts</a>`,
        ``,
        `<i>Powered by <a href="${SITE_URL}">Devidends</a></i>`,
      ];

      await bot.sendMessage(Number(sub.telegram_id), lines.join("\n"), {
        parse_mode: "HTML",
        disable_web_page_preview: true,
      });

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

// ---------------------------------------------------------------------------
// News digest for individual subscribers
// ---------------------------------------------------------------------------

/**
 * Send a news digest DM to all active Telegram subscribers.
 * Every subscriber gets the same top-5 articles regardless of sector prefs.
 */
export async function notifySubscribersNews(
  articles: NewsArticle[]
): Promise<{ notified: number; failed: number }> {
  if (articles.length === 0) return { notified: 0, failed: 0 };

  const bot = getTelegramBot();
  const supabase = getSupabaseAdmin();

  const { data: subscribers, error } = await supabase
    .from("subscriptions")
    .select("id, telegram_id, news_categories_filter")
    .eq("channel", "telegram")
    .eq("is_active", true)
    .not("telegram_id", "is", null);

  if (error || !subscribers || subscribers.length === 0) {
    if (error) console.error("[telegram-broadcast] News: failed to fetch subscribers:", error);
    return { notified: 0, failed: 0 };
  }

  const today = new Date().toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });

  let notified = 0;
  let failed = 0;

  for (const sub of subscribers as { id: string; telegram_id: string; news_categories_filter?: string[] }[]) {
    try {
      // Filter articles by subscriber's chosen categories (empty = all categories)
      const catFilter = sub.news_categories_filter || [];
      const filtered = catFilter.length > 0
        ? articles.filter((a) => catFilter.includes(a.category))
        : articles;

      if (filtered.length === 0) continue;

      const top = filtered.slice(0, 6);
      const lines: string[] = [
        `📰 <b>Your Dev News Digest</b> · <i>${today}</i>`,
        ``,
        catFilter.length > 0
          ? `<i>${filtered.length} article${filtered.length !== 1 ? "s" : ""} in: ${catFilter.map(escHtml).join(", ")}</i>`
          : `<i>${filtered.length} development news articles</i>`,
        `━━━━━━━━━━━━━━━━━━━━━━━━`,
        ``,
      ];

      for (const a of top) {
        const catEmoji = CAT_EMOJI[a.category] || "📰";
        lines.push(`${catEmoji} <a href="${a.url}"><b>${escHtml(truncate(a.title, 85))}</b></a>`);
        lines.push(`   <i>${escHtml(a.source_name)}</i>`);
        lines.push(``);
      }

      if (filtered.length > 6) {
        lines.push(`<i>+${filtered.length - 6} more articles in your feed</i>`);
        lines.push(``);
      }

      lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━`);
      lines.push(`📖 <a href="${SITE_URL}/news">Full news feed</a>  ·  <a href="${SITE_URL}/tg-app/alerts">Edit preferences</a>`);
      lines.push(``);
      lines.push(`<i>Powered by <a href="${SITE_URL}">Devidends</a></i>`);

      await bot.sendMessage(Number(sub.telegram_id), lines.join("\n"), {
        parse_mode: "HTML",
        disable_web_page_preview: true,
      });
      notified++;
    } catch (err) {
      console.error(`[telegram-broadcast] News: failed to notify ${sub.telegram_id}:`, err);
      failed++;
    }
    await sleep(100);
  }

  console.log(`[telegram-broadcast] News digest: ${notified} notified, ${failed} failed`);
  return { notified, failed };
}
