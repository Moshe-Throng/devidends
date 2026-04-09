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

/** Single opportunity line — clean, scannable */
function oppLine(opp: SampleOpportunity, num: number): string {
  const title = escHtml(truncate(opp.title, 52));
  const org = escHtml(truncate(opp.organization, 25));
  const deadline = opp.deadline
    ? new Date(opp.deadline).toLocaleDateString("en-GB", { day: "numeric", month: "short" })
    : "";
  const url = opp.source_url || `${SITE_URL}/opportunities`;
  const type = (opp.classified_type || opp.type || "job").toLowerCase();
  const badge = type === "consultancy" ? "📋" : type === "internship" ? "🎓" : "▪️";
  const meta = [org, deadline].filter(Boolean).join(" · ");
  return `${badge} <a href="${url}"><b>${title}</b></a>\n     <i>${meta}</i>`;
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

  const now = new Date();
  const date = now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
  const greeting = now.getUTCHours() < 12 ? "Good morning" : "Good afternoon";

  const lines: string[] = [
    `✦ <b>DEVIDENDS DAILY</b>`,
    `<i>${greeting} — ${escHtml(date)}</i>`,
    ``,
  ];

  // Jobs — grouped by type
  if (jobs.length > 0) {
    // Separate consultancies from jobs
    const consultancies = jobs.filter(j => (j.classified_type || j.type || "").toLowerCase() === "consultancy");
    const regularJobs = jobs.filter(j => (j.classified_type || j.type || "").toLowerCase() !== "consultancy");

    if (regularJobs.length > 0) {
      lines.push(`<b>💼 ${regularJobs.length} New Position${regularJobs.length > 1 ? "s" : ""}</b>`);
      lines.push(``);
      for (const opp of regularJobs.slice(0, 6)) {
        lines.push(oppLine(opp, 0));
        lines.push(``);
      }
      if (regularJobs.length > 6) {
        lines.push(`     <i>+ ${regularJobs.length - 6} more positions</i>`);
        lines.push(``);
      }
    }

    if (consultancies.length > 0) {
      lines.push(`<b>📋 ${consultancies.length} Consultanc${consultancies.length > 1 ? "ies" : "y"}</b>`);
      lines.push(``);
      for (const opp of consultancies.slice(0, 4)) {
        lines.push(oppLine(opp, 0));
        lines.push(``);
      }
      if (consultancies.length > 4) {
        lines.push(`     <i>+ ${consultancies.length - 4} more</i>`);
        lines.push(``);
      }
    }
  }

  // News — compact
  if (news.length > 0) {
    lines.push(`<b>📰 Dev Intel</b>`);
    lines.push(``);
    for (const a of news.slice(0, 3)) {
      lines.push(`  → <a href="${a.url}">${escHtml(truncate(a.title, 65))}</a>`);
    }
    lines.push(``);
  }

  // Footer with inline keyboard-style links
  lines.push(`━━━━━━━━━━━━━━━━━━━━`);
  lines.push(`<a href="${SITE_URL}/tg-app">🔍 Browse All</a>  ·  <a href="${SITE_URL}/score">📊 Score CV</a>  ·  <a href="${SITE_URL}/tg-app/alerts">⚙️ Alerts</a>`);

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

  // Fetch ALL subscriptions with a telegram_id (any channel: telegram, email, both)
  const { data: rawSubs, error } = await supabase
    .from("subscriptions")
    .select("id, telegram_id, sectors_filter, donor_filter, country_filter, work_type_filter, news_categories_filter")
    .eq("is_active", true)
    .not("telegram_id", "is", null);

  if (error || !rawSubs?.length) {
    if (error) console.error("[telegram-broadcast] Subscriber fetch error:", error);
    return { notified: 0, failed: 0, skipped: 0 };
  }

  // DEDUPLICATE by telegram_id — each person gets exactly ONE message
  // If they have multiple subscription rows, merge their filters
  const byTgId = new Map<string, DailySubscription>();
  for (const sub of rawSubs as DailySubscription[]) {
    const tgId = String(sub.telegram_id);
    const existing = byTgId.get(tgId);
    if (!existing) {
      byTgId.set(tgId, { ...sub, telegram_id: tgId });
    } else {
      // Merge filters from multiple subscription rows
      if (sub.sectors_filter?.length) {
        existing.sectors_filter = [...new Set([...(existing.sectors_filter || []), ...sub.sectors_filter])];
      }
      if (sub.news_categories_filter?.length) {
        existing.news_categories_filter = [...new Set([...(existing.news_categories_filter || []), ...sub.news_categories_filter])];
      }
      if (sub.country_filter?.length) {
        existing.country_filter = [...new Set([...(existing.country_filter || []), ...sub.country_filter])];
      }
    }
  }

  const subscribers = Array.from(byTgId.values());
  console.log(`[telegram-broadcast] ${rawSubs.length} subscription rows → ${subscribers.length} unique users`);

  const date = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short" });

  let notified = 0, failed = 0, skipped = 0;

  for (const sub of subscribers) {
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

      // Build personalized digest
      const lines: string[] = [
        `✦ <b>Your Daily Brief</b>`,
        `<i>${escHtml(date)}</i>`,
        ``,
      ];

      // Jobs (max 6)
      if (matchedJobs.length > 0) {
        lines.push(`<b>${matchedJobs.length} opportunit${matchedJobs.length > 1 ? "ies" : "y"} matched to you</b>`);
        lines.push(``);
        for (const opp of matchedJobs.slice(0, 6)) {
          lines.push(oppLine(opp, 0));
          lines.push(``);
        }
        if (matchedJobs.length > 6) {
          lines.push(`     <i>+ ${matchedJobs.length - 6} more → <a href="${SITE_URL}/tg-app/opportunities">see all</a></i>`);
          lines.push(``);
        }
      }

      // News (max 2, compact)
      if (matchedNews.length > 0) {
        lines.push(`<b>📰 Intel</b>`);
        for (const a of matchedNews.slice(0, 2)) {
          lines.push(`  → <a href="${a.url}">${escHtml(truncate(a.title, 60))}</a>`);
        }
        lines.push(``);
      }

      lines.push(`━━━━━━━━━━━━━━━━━━━━`);
      lines.push(`<a href="${SITE_URL}/tg-app">🔍 Browse</a>  ·  <a href="${SITE_URL}/score">📊 Score CV</a>  ·  <a href="${SITE_URL}/tg-app/alerts">⚙️ Alerts</a>`);

      await bot.sendMessage(Number(sub.telegram_id), lines.join("\n"), {
        parse_mode: "HTML",
        disable_web_page_preview: true,
      });

      notified++;

      // Track digest sent event
      const { trackEvent } = await import("@/lib/logger");
      trackEvent({ event: "digest_sent", telegram_id: String(sub.telegram_id), metadata: { jobs_count: matchedJobs.length } });
    } catch (err) {
      console.error(`[telegram-broadcast] Failed ${sub.telegram_id}:`, err);
      failed++;
    }

    await sleep(100);
  }

  console.log(`[telegram-broadcast] Digest: ${notified} sent, ${failed} failed, ${skipped} skipped / ${subscribers.length}`);
  return { notified, failed, skipped };
}
