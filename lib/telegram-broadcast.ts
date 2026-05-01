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

/**
 * Compact one-line opportunity (per-subscriber DM digest — kept tight on
 * purpose since the recipient has already been pre-matched to their filters).
 */
function oppLine(opp: SampleOpportunity, _num: number): string {
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

/**
 * Convert a markdown / HTML / mixed description into plain text:
 * strip HTML, drop markdown headers and emphasis, collapse whitespace.
 * The Haiku formatter in publish-to-supabase produces markdown, so the
 * channel preview needs to undo that for clean inline display.
 */
function cleanDescription(text: string): string {
  return text
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#\d+;/g, " ")
    // Markdown stripping
    .replace(/^#+\s+/gm, "")           // headers
    .replace(/\*\*(.+?)\*\*/g, "$1")    // bold
    .replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, "$1") // italic
    .replace(/`([^`]+)`/g, "$1")        // inline code
    .replace(/^\s*[-•*]\s+/gm, "")      // bullets
    .replace(/^\s*\d+\.\s+/gm, "")      // numbered lists
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Truncate at a sentence boundary if possible; otherwise word boundary
 * with a terminal ellipsis. Avoids the mid-word "...rep..." cuts that
 * the previous truncate() helper produced.
 */
function smartTruncate(text: string, soft: number, hard: number): string {
  if (text.length <= soft) return text;
  // Look for a sentence end (.!?) followed by space, within a window
  // up to `hard` chars. Pick the latest one that's still past `soft - 60`
  // so we don't cut painfully short on the first short sentence.
  const window = text.slice(0, hard);
  const sentenceRe = /[.!?]["')\]]?\s/g;
  let lastSentenceEnd = -1;
  let match;
  while ((match = sentenceRe.exec(window)) !== null) {
    const endAt = match.index + 1;
    if (endAt <= soft) lastSentenceEnd = endAt;
    else break;
  }
  if (lastSentenceEnd > Math.max(60, soft - 80)) {
    return text.slice(0, lastSentenceEnd).trim();
  }
  // Fall back: cut at last word boundary before `soft`, add ellipsis.
  const sliced = text.slice(0, soft).replace(/\s+\S*$/, "");
  return sliced.trim() + "…";
}

function capitalize(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

/** Format the deadline cell with a friendly countdown. */
function formatDeadline(deadline: string | null): string | null {
  if (!deadline) return null;
  const d = new Date(deadline);
  if (isNaN(d.getTime())) return null;
  const dateStr = d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  const days = Math.ceil((d.getTime() - Date.now()) / 86_400_000);
  const tag =
    days < 0 ? "overdue" :
    days === 0 ? "today" :
    days === 1 ? "1 day left" :
    `${days} days left`;
  return `${dateStr} (${tag})`;
}

/**
 * Minimum cleaned-description length required for an opportunity to be
 * shown in the channel digest. Below this we drop the row rather than
 * show a thin one — uniform depth matters more than coverage breadth.
 */
const MIN_RICH_DESCRIPTION_LEN = 250;

/**
 * Rich block per opportunity. EVERY block has the exact same shape so
 * the post reads with consistent rhythm:
 *   Line 1: linked bold title
 *   Line 2: 🏢 organisation  ·  🎯 level  ·  ⏰ Closes <date> · <countdown>
 *   Line 3: (blank gap)
 *   Line 4: italic description preview, sentence-bounded
 *
 * Country/location is dropped — titles typically carry it already and
 * the channel is Ethiopia-focused so the line was redundant.
 *
 * Returns an empty array if the description isn't rich enough; the
 * caller filters those out before building the digest.
 */
function oppBlock(opp: SampleOpportunity): string[] {
  const cleaned = cleanDescription(opp.description || "");
  if (cleaned.length < MIN_RICH_DESCRIPTION_LEN) return [];

  const url = opp.source_url || `${SITE_URL}/opportunities`;
  const title = escHtml(truncate(opp.title, 100));
  const org = escHtml(truncate(opp.organization, 60));

  // Meta line: org · seniority · deadline. Built from a fixed slot order
  // so blocks line up visually even when one or two slots are missing.
  const seniority = opp.seniority || (opp as any).experience_level || null;
  const deadlineCell = formatDeadline(opp.deadline);
  const metaSlots: string[] = [`🏢 ${org}`];
  if (seniority) metaSlots.push(`🎯 ${escHtml(capitalize(seniority))}`);
  if (deadlineCell) metaSlots.push(`⏰ Closes ${deadlineCell}`);

  const desc = smartTruncate(cleaned, 240, 320);

  return [
    `<b><a href="${url}">${title}</a></b>`,
    metaSlots.join("  ·  "),
    "",
    `<i>${escHtml(desc)}</i>`,
  ];
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
  const allJobs = opportunities.filter((o) => {
    const type = (o.classified_type || o.type || "").toLowerCase();
    return type !== "tender" && !TENDER_RE.test(o.title || "");
  });

  // Enforce 100% rich descriptions in the digest. Anything below the
  // minimum length gets silently dropped — uniformity beats coverage.
  const jobs = allJobs.filter((o) => {
    const cleaned = cleanDescription(o.description || "");
    return cleaned.length >= MIN_RICH_DESCRIPTION_LEN;
  });
  const droppedThin = allJobs.length - jobs.length;
  if (droppedThin > 0) {
    console.log(`[telegram-broadcast] Dropped ${droppedThin} thin-description rows from the digest`);
  }

  const news = newsArticles || [];
  if (jobs.length === 0 && news.length === 0) {
    console.log("[telegram-broadcast] Nothing to broadcast (after richness filter)");
    return { sent: false, count: 0 };
  }

  const now = new Date();
  const date = now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
  const greeting = now.getUTCHours() < 12 ? "Good morning" : "Good afternoon";

  // Cap at 20 jobs per day, separated into consultancies and regular jobs.
  // The richer block format (4 lines + blank line ≈ 280 chars) means a
  // 20-item digest is ~5.5K chars, over Telegram's 4096-char message limit;
  // we split into Part 1 / Part 2 messages when needed.
  const MAX_JOBS = 20;
  const cappedJobs = jobs.slice(0, MAX_JOBS);

  const consultancies = cappedJobs.filter(
    (j) => (j.classified_type || j.type || "").toLowerCase() === "consultancy"
  );
  const regularJobs = cappedJobs.filter(
    (j) => (j.classified_type || j.type || "").toLowerCase() !== "consultancy"
  );

  // Build a pool of (header, body) blocks to pack into messages.
  type Block = { lines: string[] };
  const blocks: Block[] = [];

  if (regularJobs.length > 0) {
    const header = [
      `<b>💼 ${regularJobs.length} New Position${regularJobs.length > 1 ? "s" : ""}</b>`,
      ``,
    ];
    blocks.push({ lines: header });
    for (const opp of regularJobs) {
      blocks.push({ lines: [...oppBlock(opp), ``] });
    }
  }

  if (consultancies.length > 0) {
    const header = [
      `<b>📋 ${consultancies.length} Consultanc${consultancies.length > 1 ? "ies" : "y"}</b>`,
      ``,
    ];
    blocks.push({ lines: header });
    for (const opp of consultancies) {
      blocks.push({ lines: [...oppBlock(opp), ``] });
    }
  }

  if (news.length > 0) {
    const newsBlock: string[] = [`<b>📰 Dev Intel</b>`, ``];
    for (const a of news.slice(0, 3)) {
      newsBlock.push(
        `  → <a href="${a.url}">${escHtml(truncate(a.title, 65))}</a>`
      );
    }
    newsBlock.push(``);
    blocks.push({ lines: newsBlock });
  }

  if (jobs.length > MAX_JOBS) {
    blocks.push({
      lines: [
        `<i>+ ${jobs.length - MAX_JOBS} more on devidends.net/tg-app</i>`,
        ``,
      ],
    });
  }

  // Title for the first message; footer for the last.
  const titleLines = [
    `✦ <b>DEVIDENDS DAILY</b>`,
    `<i>${greeting} — ${escHtml(date)}</i>`,
    ``,
  ];
  const footerLines = [
    `━━━━━━━━━━━━━━━━━━━━`,
    `<a href="${SITE_URL}/tg-app">🔍 Browse All</a>  ·  <a href="${SITE_URL}/score">📊 Score CV</a>  ·  <a href="${SITE_URL}/tg-app/alerts">⚙️ Alerts</a>`,
  ];

  // Pack blocks into messages under the 4096-char limit (3800 to leave headroom).
  const MAX_CHARS = 3800;
  const messages: string[] = [];
  let current = titleLines.slice();
  let currentLen = current.join("\n").length;
  for (const block of blocks) {
    const blockText = block.lines.join("\n");
    const blockLen = blockText.length + 1;
    if (currentLen + blockLen > MAX_CHARS && current.length > titleLines.length) {
      messages.push(current.join("\n"));
      current = [];
      currentLen = 0;
    }
    current.push(...block.lines);
    currentLen += blockLen;
  }
  if (current.length > 0) messages.push(current.join("\n"));

  // Footer goes on the last message; if it would push it over, send footer
  // as its own short message.
  const footerText = footerLines.join("\n");
  if (messages.length > 0) {
    const last = messages[messages.length - 1];
    if (last.length + footerText.length + 1 <= MAX_CHARS) {
      messages[messages.length - 1] = last + "\n" + footerText;
    } else {
      messages.push(footerText);
    }
  } else {
    messages.push(titleLines.join("\n") + "\n" + footerText);
  }

  // Annotate Part X / N markers when more than one message is sent.
  const total = messages.length;
  const annotated = total > 1
    ? messages.map((m, i) => `<i>Part ${i + 1} of ${total}</i>\n${m}`)
    : messages;

  try {
    const opts: Record<string, unknown> = {
      parse_mode: "HTML",
      disable_web_page_preview: true,
    };
    if (topicId) opts.message_thread_id = parseInt(topicId, 10);

    for (let i = 0; i < annotated.length; i++) {
      await bot.sendMessage(groupId, annotated[i], opts);
      if (i < annotated.length - 1) await sleep(800); // gentle pacing
    }
    console.log(
      `[telegram-broadcast] Group digest sent: ${cappedJobs.length} jobs in ${annotated.length} message(s)`
    );
    return { sent: true, count: cappedJobs.length };
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
    const title = (opp.title || "").toLowerCase();
    const matchesCountry = sub.country_filter.some((c) => oppCountry.includes(c.toLowerCase()));
    // If the subscriber lists Ethiopia (the typical case), also accept regional/international/HQ roles
    // that Ethiopians can apply to — the caller pre-filtered to Ethiopia-relevant jobs, so trust that.
    const ethOnlyFilter = sub.country_filter.length === 1 && sub.country_filter[0].toLowerCase() === "ethiopia";
    const isRegionalOrGlobal =
      !oppCountry ||
      /\b(global|regional|remote|international|home.?based|headquarter|hq|roving|multi.?country|pan.?african|horn of africa|east africa|eastern africa)\b/i.test(
        `${title} ${oppCountry}`
      );
    if (!matchesCountry && !(ethOnlyFilter && isRegionalOrGlobal)) return false;
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
