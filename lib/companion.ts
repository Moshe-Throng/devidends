/**
 * AI Companion — conversational assistant for Devidends bot users.
 *
 * Responsibilities:
 *  1. Reply to free-text messages via Claude Haiku using profile context
 *  2. Detect gratitude moments → trigger share ask
 *  3. Generate proactive follow-ups (called by companion-engine cron)
 *
 * Design principles:
 *  - Only speak when there's something useful to say
 *  - Share ask comes ONLY after genuine gratitude ("thank you", "this is great", etc.)
 *  - Proactive messages are value-first (new matching jobs, CV tips, deadline reminders)
 *  - Never spam — max 1 proactive message per 24h per user
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { trackEvent, logException } from "@/lib/logger";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ProfileContext {
  id: string;
  name: string;
  telegram_id: string;
  sectors: string[];
  donors: string[];
  countries: string[];
  skills: string[];
  cv_score: number | null;
  years_of_experience: number | null;
  profile_type: string | null;
  onboarding_stage: string | null;
  user_intent: string | null;
  referral_code: string | null;
  referral_count: number | null;
}

interface CompanionReply {
  text: string;
  /** If set, bot should show these inline keyboard buttons */
  buttons?: { text: string; url?: string; callback_data?: string }[][];
  /** If true, log a drip_message of type "share_ask" */
  isShareAsk?: boolean;
}

interface DripCandidate {
  telegram_id: string;
  profile: ProfileContext;
  trigger: string;
  context: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Supabase helper
// ---------------------------------------------------------------------------

function getSb(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://devidends.net";

// ---------------------------------------------------------------------------
// Profile loader
// ---------------------------------------------------------------------------

export async function loadProfile(telegramId: string): Promise<ProfileContext | null> {
  const sb = getSb();
  const { data } = await sb
    .from("profiles")
    .select("id, name, telegram_id, sectors, donors, countries, skills, cv_score, years_of_experience, profile_type, onboarding_stage, user_intent, referral_code, referral_count")
    .eq("telegram_id", telegramId)
    .maybeSingle();
  return data as ProfileContext | null;
}

// ---------------------------------------------------------------------------
// Gratitude detection (deterministic, no AI needed)
// ---------------------------------------------------------------------------

const GRATITUDE_PATTERNS = [
  /\bthank(?:s| you)\b/i,
  /\bmuch appreciated\b/i,
  /\bthis is (?:great|amazing|awesome|helpful|perfect)\b/i,
  /\byou(?:'re| are) (?:great|amazing|awesome|helpful|the best)\b/i,
  /\bappreciate (?:it|this|that|your)\b/i,
  /\bgood job\b/i,
  /\bwell done\b/i,
  /\bexactly what i (?:needed|wanted)\b/i,
  /\bameseginalehu\b/i, // Amharic "thank you"
  /\begziabher yistilign\b/i, // Amharic gratitude
];

function isGratitude(text: string): boolean {
  return GRATITUDE_PATTERNS.some((p) => p.test(text));
}

// ---------------------------------------------------------------------------
// Conversation history (last N messages for context)
// ---------------------------------------------------------------------------

async function getRecentDrips(sb: SupabaseClient, telegramId: string, limit = 6): Promise<{ role: string; content: string }[]> {
  const { data } = await (sb.from("drip_messages") as any)
    .select("message_type, user_reply, context, sent_at")
    .eq("telegram_id", telegramId)
    .order("sent_at", { ascending: false })
    .limit(limit);

  if (!data || data.length === 0) return [];

  // Build conversation pairs (newest first → reverse for chronological)
  const messages: { role: string; content: string }[] = [];
  for (const row of (data as any[]).reverse()) {
    // The bot's message
    if (row.context?.bot_message) {
      messages.push({ role: "assistant", content: row.context.bot_message });
    }
    // The user's reply (if any)
    if (row.user_reply) {
      messages.push({ role: "user", content: row.user_reply });
    }
  }
  return messages;
}

// ---------------------------------------------------------------------------
// Claude Haiku call
// ---------------------------------------------------------------------------

async function callHaiku(
  systemPrompt: string,
  messages: { role: string; content: string }[],
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 400,
      system: systemPrompt,
      messages,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Haiku API ${res.status}: ${err}`);
  }

  const data = await res.json();
  return (data.content?.[0]?.text || "").trim();
}

// ---------------------------------------------------------------------------
// System prompt builder
// ---------------------------------------------------------------------------

function buildSystemPrompt(profile: ProfileContext | null): string {
  const profileBlock = profile
    ? [
        `User profile:`,
        `- Name: ${profile.name}`,
        `- Experience: ${profile.years_of_experience ?? "unknown"} years, ${profile.profile_type ?? "unknown"} level`,
        `- Sectors: ${profile.sectors?.join(", ") || "not set"}`,
        `- Donors: ${profile.donors?.join(", ") || "not set"}`,
        `- Countries: ${profile.countries?.join(", ") || "not set"}`,
        `- CV Score: ${profile.cv_score ?? "not scored"}`,
        `- Intent: ${profile.user_intent ?? "not stated"}`,
        `- Referrals: ${profile.referral_count ?? 0}`,
      ].join("\n")
    : "No profile on file — user has not uploaded a CV yet.";

  return `You are Devidends' AI assistant — a helpful, concise career companion for international development professionals in East Africa.

${profileBlock}

What Devidends does:
- Aggregates 280+ jobs and consulting opportunities from 40+ sources (GIZ, World Bank, UN, AU, AfDB, UNICEF, DRC, etc.)
- Users browse opportunities, score their CV, build formatted CVs, and subscribe to daily alerts — all inside the Telegram mini app

What the user can do RIGHT NOW (in this bot):
- Tap "Open App" to browse all opportunities, filter by sector, and view details
- Inside the app: "Score CV" scores their saved CV against donor standards
- Inside the app: "Build CV" lets them upload/edit their CV and export in 6 donor formats (Europass, AU, World Bank, UN PHP, Professional, Executive)
- Inside the app: "Alerts" lets them subscribe to daily notifications filtered by sector
- /search <keyword> finds matching opportunities by keyword
- /subscribe sets sector alert preferences
- /profile views their profile summary

What you should NEVER do:
- Never tell users to "visit the website" or "go to ${SITE_URL}" — everything is in the mini app, right here in Telegram
- Never fabricate job listings, titles, organizations, or deadlines
- Never make up data about the user's profile
- Never suggest features that don't exist

Your behavior:
- Be concise (2-4 sentences typical). No walls of text.
- Be warm but professional. These are senior consultants, not students.
- When users ask about jobs/opportunities: tell them to tap "Open App" to browse, or use /search <keyword> for quick results. If they want daily updates, suggest subscribing to alerts in the app.
- When users ask about CV improvement: reference their score (if available) and point them to "Score CV" or "Build CV" in the app.
- If you don't know something, say so briefly.
- Respond in the language the user writes in (English or Amharic).
- Plain text only — no markdown, no asterisks, no formatting.`;
}

// ---------------------------------------------------------------------------
// Main reply handler — called when user sends free text to bot
// ---------------------------------------------------------------------------

export async function handleFreeText(
  telegramId: string,
  userMessage: string,
): Promise<CompanionReply> {
  const sb = getSb();
  const profile = await loadProfile(telegramId);

  // Build conversation history
  const history = await getRecentDrips(sb, telegramId, 6);
  history.push({ role: "user", content: userMessage });

  const systemPrompt = buildSystemPrompt(profile);

  let reply: string;
  try {
    reply = await callHaiku(systemPrompt, history);
  } catch (err) {
    logException("companion", err, { telegramId });
    return {
      text: "I'm having trouble right now. Try again in a moment, or use /help to see what I can do.\n\nIf this keeps happening, tap below to let our team know.",
      buttons: [[{ text: "Report an issue", url: "https://t.me/Devidends_Bot?start=report" }]],
    };
  }

  // If reply seems confused or unhelpful, append escalation option
  const unhelpful = /i('m| am) not sure|i don('t| do not) have.*information|i can('t| cannot) help|beyond my/i.test(reply);
  if (unhelpful) {
    reply += "\n\nIf you need further help, our team can look into it:";
  }

  // Smart buttons based on reply content
  let isShareAsk = false;
  let buttons: { text: string; url?: string; callback_data?: string; web_app?: { url: string } }[][] | undefined;

  // If reply mentions browsing/opportunities/app, attach "Open App" button
  const mentionsApp = /open app|browse|opportunities|mini app|tap.*app|check.*app|alerts|subscribe/i.test(reply);
  const mentionsCv = /score.*cv|build.*cv|cv.*builder|cv.*score/i.test(reply);
  if (unhelpful) {
    buttons = [[{ text: "Contact our team", url: `https://t.me/Devidends_Bot?start=report` }]];
  } else if (mentionsApp && !mentionsCv) {
    buttons = [[{ text: "Browse Opportunities", web_app: { url: `${SITE_URL}/tg-app` } }]];
  } else if (mentionsCv && !mentionsApp) {
    buttons = [[{ text: "Open CV Tools", web_app: { url: `${SITE_URL}/tg-app/cv-builder` } }]];
  } else if (mentionsApp && mentionsCv) {
    buttons = [
      [{ text: "Browse Opportunities", web_app: { url: `${SITE_URL}/tg-app` } }],
      [{ text: "Open CV Tools", web_app: { url: `${SITE_URL}/tg-app/cv-builder` } }],
    ];
  }

  if (isGratitude(userMessage) && profile?.referral_code) {
    const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(`${SITE_URL}/score?ref=${profile.referral_code}`)}&text=${encodeURIComponent("Score your CV for international development consulting — free AI feedback in 30 seconds.")}`;

    // Check if we already sent a share ask in last 7 days
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { count } = await (sb.from("drip_messages") as any)
      .select("*", { count: "exact", head: true })
      .eq("telegram_id", telegramId)
      .eq("message_type", "share_ask")
      .gte("sent_at", weekAgo);

    if (!count || count === 0) {
      reply += "\n\nIf Devidends has been useful, sharing it with a colleague would mean a lot:";
      if (!buttons) buttons = [];
      buttons.push([{ text: "Share with a colleague", url: shareUrl }]);
      isShareAsk = true;
    }
  }

  // Log conversation
  await logDripMessage(sb, {
    telegram_id: telegramId,
    profile_id: profile?.id,
    message_type: isShareAsk ? "share_ask" : "conversation",
    user_reply: userMessage,
    trigger_type: "free_text",
    context: { bot_message: reply },
  });

  trackEvent({
    event: "companion_reply",
    profile_id: profile?.id,
    telegram_id: telegramId,
    metadata: { is_share_ask: isShareAsk, message_length: userMessage.length },
  });

  return { text: reply, buttons, isShareAsk };
}

// ---------------------------------------------------------------------------
// Proactive message generation (called by companion-engine cron)
// ---------------------------------------------------------------------------

export async function generateProactiveMessages(): Promise<DripCandidate[]> {
  const sb = getSb();
  const candidates: DripCandidate[] = [];

  // Rule: don't message anyone we messaged in the last 24h
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  // --- Trigger 1: New matching opportunities for users with profiles ---
  const { data: profiles } = await sb
    .from("profiles")
    .select("id, name, telegram_id, sectors, donors, countries, skills, cv_score, years_of_experience, profile_type, onboarding_stage, user_intent, referral_code, referral_count")
    .not("telegram_id", "is", null)
    .eq("drip_opted_out", false)
    .order("created_at", { ascending: false })
    .limit(200);

  if (!profiles || profiles.length === 0) return candidates;

  // Get users we already messaged recently
  const { data: recentDrips } = await (sb.from("drip_messages") as any)
    .select("telegram_id")
    .gte("sent_at", dayAgo)
    .in("message_type", ["proactive_jobs", "proactive_cv_tip", "proactive_deadline"]);

  const recentlyMessaged = new Set((recentDrips || []).map((d: any) => d.telegram_id));

  // Get new opportunities from last 6 hours
  const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
  const { data: newOpps } = await sb
    .from("opportunities")
    .select("id, title, organization, sectors, country, deadline, source_url, type")
    .eq("is_active", true)
    .gte("scraped_at", sixHoursAgo)
    .limit(50);

  for (const profile of profiles) {
    const tgId = String(profile.telegram_id);
    if (recentlyMessaged.has(tgId)) continue;

    const p = profile as ProfileContext;

    // Match opportunities to profile sectors
    if (newOpps && newOpps.length > 0 && p.sectors?.length > 0) {
      const profileSectors = new Set(p.sectors.map((s: string) => s.toLowerCase()));
      const matched = newOpps.filter((opp: any) =>
        (opp.sectors || []).some((s: string) => profileSectors.has(s.toLowerCase())),
      );

      if (matched.length > 0) {
        candidates.push({
          telegram_id: tgId,
          profile: p,
          trigger: "new_matching_jobs",
          context: {
            jobs: matched.slice(0, 3).map((j: any) => ({
              title: j.title,
              org: j.organization,
              deadline: j.deadline,
              url: j.source_url,
            })),
          },
        });
        continue; // one message per user per cycle
      }
    }

    // --- Trigger 2: CV not scored yet → nudge ---
    if (p.cv_score === null && p.onboarding_stage === "new") {
      candidates.push({
        telegram_id: tgId,
        profile: p,
        trigger: "cv_not_scored",
        context: {},
      });
      continue;
    }

    // --- Trigger 3: CV score < 50 → improvement tip ---
    if (p.cv_score !== null && p.cv_score < 50) {
      // Only send this once ever
      const { count } = await (sb.from("drip_messages") as any)
        .select("*", { count: "exact", head: true })
        .eq("telegram_id", tgId)
        .eq("message_type", "proactive_cv_tip");

      if (!count || count === 0) {
        candidates.push({
          telegram_id: tgId,
          profile: p,
          trigger: "low_cv_score",
          context: { score: p.cv_score },
        });
        continue;
      }
    }
  }

  return candidates;
}

/**
 * Build the actual Telegram message for a proactive drip candidate.
 */
export function buildProactiveMessage(candidate: DripCandidate): CompanionReply {
  const { trigger, context, profile } = candidate;
  const name = profile.name?.split(" ")[0] || "there";

  switch (trigger) {
    case "new_matching_jobs": {
      const jobs = (context.jobs as any[]) || [];
      const lines = [
        `Hi ${name}, ${jobs.length} new ${jobs.length === 1 ? "opportunity matches" : "opportunities match"} your profile:`,
        "",
      ];
      for (const j of jobs) {
        const deadline = j.deadline
          ? ` (deadline: ${new Date(j.deadline).toLocaleDateString("en-GB")})`
          : "";
        lines.push(`- ${j.title} at ${j.org || "N/A"}${deadline}`);
      }
      lines.push("", "Browse all opportunities in the app:");

      return {
        text: lines.join("\n"),
        buttons: [
          [{ text: "Browse Opportunities", web_app: { url: `${SITE_URL}/tg-app` } } as any],
        ],
      };
    }

    case "cv_not_scored":
      return {
        text: `Hi ${name}, welcome to Devidends! You can score your CV against international development standards — it takes about 30 seconds and gives you specific tips to improve.`,
        buttons: [
          [{ text: "Score My CV", web_app: { url: `${SITE_URL}/tg-app/score` } } as any],
        ],
      };

    case "low_cv_score":
      return {
        text: `Hi ${name}, your CV scored ${context.score}/100. A few targeted improvements could make a real difference — especially in the donor readiness and experience sections. Want to see what to fix?`,
        buttons: [
          [{ text: "Improve My CV", web_app: { url: `${SITE_URL}/tg-app/score` } } as any],
        ],
      };

    default:
      return { text: "" };
  }
}

// ---------------------------------------------------------------------------
// Drip message logger
// ---------------------------------------------------------------------------

async function logDripMessage(
  sb: SupabaseClient,
  row: {
    telegram_id: string;
    profile_id?: string;
    message_type: string;
    user_reply?: string;
    trigger_type?: string;
    context?: Record<string, unknown>;
  },
) {
  try {
    await (sb.from("drip_messages") as any).insert({
      telegram_id: row.telegram_id,
      profile_id: row.profile_id || null,
      message_type: row.message_type,
      user_reply: row.user_reply || null,
      trigger_type: row.trigger_type || null,
      context: row.context || {},
    });
  } catch (err) {
    console.error("[companion] Failed to log drip message:", err);
  }
}

export { logDripMessage, getSb };
