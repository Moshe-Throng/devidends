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

function escHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function truncate(text: string, max: number): string {
  if (!text || text.length <= max) return text || "";
  return text.slice(0, max - 1) + "\u2026";
}

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

/** Compact one-line opportunity format for digests */
function oppLine(opp: SampleOpportunity): string {
  const type = (opp.classified_type || opp.type || "").toLowerCase();
  const emoji = TYPE_EMOJI[type] || "📌";
  const title = escHtml(truncate(opp.title, 65));
  const org = escHtml(truncate(opp.organization, 30));
  const deadline = opp.deadline
    ? new Date(opp.deadline).toLocaleDateString("en-GB", { day: "numeric", month: "short" })
    : "Open";
  const url = opp.source_url || `${SITE_URL}/opportunities`;
  return `${emoji} <a href="${url}">${title}</a>\n    ${org} · ${deadline}`;
}

// ---------------------------------------------------------------------------
// News article type
// ---------------------------------------------------------------------------

export interface NewsArticle {
  title: string;
  url: string;
  source_name: string;
  category: string;
}

// ---------------------------------------------------------------------------
// Group broadcast — ONE clean digest to group topic
// ---------------------------------------------------------------------------

export async function broadcastToGroup(
  opportunities: SampleOpportunity[],
  newsArticles?: NewsArticle[]
): Promise<{ sent: boolean; count: number }> {
  const groupId = process.env.TELEGRAM_GROUP_ID;
  const topicId = process.env.TELEGRAM_JOBS_TOPIC_ID;

  if (!groupId) {
    console.warn("[telegram-broadcast] TELEGRAM_GROUP_ID not set, skipping");
    return { sent: false, count: 0 };
  }

  const bot = getTelegramBot();

  // Filter out tenders
  const TENDER_RE = /\b(procurement|supply|rfp|rfq|bid|tender|construction|installation|purchase|provision of goods)\b/i;
  const jobs = opportunities.filter((o) => {
    const type = (o.classified_type || o.type || "").toLowerCase();
    return type !== "tender" && !TENDER_RE.test(o.title || "");
  });

  const news = newsArticles || [];
  if (jobs.length === 0 && news.length === 0) {
    console.log("[telegram-broadcast] Nothing to broadcast");
    return { sent: false, count: 0 };
  }

  const date = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

  const lines: string[] = [
    `📡 <b>Daily Brief</b> — ${escHtml(date)}`,
    ``,
  ];

  // Jobs (max 10, compact)
  if (jobs.length > 0) {
    lines.push(`<b>💼 ${jobs.length} New Opportunities</b>`);
    lines.push(``);
    for (const opp of jobs.slice(0, 10)) {
      lines.push(oppLine(opp));
    }
    if (jobs.length > 10) {
      lines.push(`\n<i>+${jobs.length - 10} more</i>`);
    }
    lines.push(``);
  }

  // News (max 4, compact)
  if (news.length > 0) {
    lines.push(`<b>📰 Dev News</b>`);
    lines.push(``);
    for (const a of news.slice(0, 4)) {
      const catEmoji = CAT_EMOJI[a.category] || "📰";
      lines.push(`${catEmoji} <a href="${a.url}">${escHtml(truncate(a.title, 70))}</a>`);
    }
    lines.push(``);
  }

  lines.push(`<a href="${SITE_URL}/opportunities">Browse all</a> · <a href="${SITE_URL}/tg-app/alerts">Set alerts</a>`);

  try {
    const opts: Record<string, unknown> = {
      parse_mode: "HTML",
      disable_web_page_preview: true,
    };
    if (topicId) opts.message_thread_id = parseInt(topicId, 10);

    await bot.sendMessage(groupId, lines.join("\n"), opts);
    console.log(`[telegram-broadcast] Group digest sent: ${jobs.length} jobs`);
    return { sent: true, count: jobs.length };
  } catch (err) {
    console.error("[telegram-broadcast] Group digest failed:", err);
    return { sent: false, count: 0 };
  }
}

// ---------------------------------------------------------------------------
// Subscriber matching
// ---------------------------------------------------------------------------

interface Subscription {
  id: string;
  telegram_id: string;
  sectors_filter: string[] | null;
  donor_filter: string[] | null;
  country_filter: string[] | null;
  work_type_filter: string[] | null;
}

function matchesSubscriber(opp: SampleOpportunity, sub: Subscription): boolean {
  if (sub.country_filter && sub.country_filter.length > 0) {
    const oppCountry = (opp.country || "").toLowerCase();
    if (!sub.country_filter.some((c) => oppCountry.includes(c.toLowerCase()))) return false;
  }
  if (sub.sectors_filter && sub.sectors_filter.length > 0) {
    const text = [opp.title, opp.description, opp.classified_type].filter(Boolean).join(" ").toLowerCase();
    if (!sub.sectors_filter.some((s) => text.includes(s.toLowerCase()))) return false;
  }
  if (sub.work_type_filter && sub.work_type_filter.length > 0) {
    const oppType = (opp.classified_type || opp.type || "").toLowerCase();
    const typeMap: Record<string, string[]> = {
      "full-time": ["job", "full-time", "fulltime"],
      "consultancy": ["consulting", "consultancy", "consultant", "advisory"],
      "contract": ["contract", "fixed-term"],
      "internship": ["internship", "intern", "trainee", "graduate"],
    };
    if (!sub.work_type_filter.some((f) => {
      const patterns = typeMap[f.toLowerCase()] || [f.toLowerCase()];
      return patterns.some((p) => oppType.includes(p));
    })) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Legacy exports — delegate to combined function
// ---------------------------------------------------------------------------

export async function notifySubscribers(
  newOpportunities: SampleOpportunity[]
): Promise<{ notified: number; failed: number; skipped: number }> {
  return notifySubscribersDaily(newOpportunities, []);
}

export async function notifySubscribersNews(
  articles: NewsArticle[]
): Promise<{ notified: number; failed: number }> {
  const r = await notifySubscribersDaily([], articles);
  return { notified: r.notified, failed: r.failed };
}

// ---------------------------------------------------------------------------
// Combined daily digest — ONE message per subscriber (jobs + news)
// ---------------------------------------------------------------------------

interface DailySubscription extends Subscription {
  news_categories_filter?: string[] | null;
}

/**
 * Send ONE combined DM to each subscriber with matched jobs + news.
 * Compact format — no walls of text, just scannable links.
 */
export async function notifySubscribersDaily(
  newOpportunities: SampleOpportunity[],
  newsArticles: NewsArticle[]
): Promise<{ notified: number; failed: number; skipped: number }> {
  if (newOpportunities.length === 0 && newsArticles.length === 0) {
    return { notified: 0, failed: 0, skipped: 0 };
  }

  const bot = getTelegramBot();
  const supabase = getSupabaseAdmin();

  const { data: subscribers, error } = await supabase
    .from("subscriptions")
    .select("id, telegram_id, sectors_filter, donor_filter, country_filter, work_type_filter, news_categories_filter")
    .eq("channel", "telegram")
    .eq("is_active", true)
    .not("telegram_id", "is", null);

  if (error || !subscribers?.length) {
    if (error) console.error("[telegram-broadcast] Subscriber fetch error:", error);
    return { notified: 0, failed: 0, skipped: 0 };
  }

  const date = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short" });

  let notified = 0, failed = 0, skipped = 0;

  for (const sub of subscribers as DailySubscription[]) {
    try {
      const matchedJobs = newOpportunities.filter((o) => matchesSubscriber(o, sub));

      const catFilter = sub.news_categories_filter || [];
      const matchedNews = catFilter.length > 0
        ? newsArticles.filter((a) => catFilter.includes(a.category))
        : newsArticles;

      if (matchedJobs.length === 0 && matchedNews.length === 0) {
        skipped++;
        continue;
      }

      // Build compact single message
      const lines: string[] = [`📡 <b>Daily Brief</b> · ${escHtml(date)}`, ``];

      // Jobs (max 5)
      if (matchedJobs.length > 0) {
        lines.push(`💼 <b>${matchedJobs.length} Opportunities</b>`);
        lines.push(``);
        for (const opp of matchedJobs.slice(0, 5)) {
          lines.push(oppLine(opp));
        }
        if (matchedJobs.length > 5) {
          lines.push(`<i>+${matchedJobs.length - 5} more</i>`);
        }
        lines.push(``);
      }

      // News (max 3)
      if (matchedNews.length > 0) {
        lines.push(`📰 <b>News</b>`);
        for (const a of matchedNews.slice(0, 3)) {
          const catEmoji = CAT_EMOJI[a.category] || "📰";
          lines.push(`${catEmoji} <a href="${a.url}">${escHtml(truncate(a.title, 70))}</a>`);
        }
        if (matchedNews.length > 3) {
          lines.push(`<i>+${matchedNews.length - 3} more</i>`);
        }
        lines.push(``);
      }

      lines.push(`<a href="${SITE_URL}/opportunities">Browse</a> · <a href="${SITE_URL}/tg-app/alerts">Edit alerts</a>`);

      await bot.sendMessage(Number(sub.telegram_id), lines.join("\n"), {
        parse_mode: "HTML",
        disable_web_page_preview: true,
      });

      notified++;
    } catch (err) {
      console.error(`[telegram-broadcast] Failed ${sub.telegram_id}:`, err);
      failed++;
    }

    await sleep(100);
  }

  console.log(`[telegram-broadcast] Digest: ${notified} sent, ${failed} failed, ${skipped} skipped / ${subscribers.length}`);
  return { notified, failed, skipped };
}
