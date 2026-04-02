import type TelegramBot from "node-telegram-bot-api";
import type { Update, Message, CallbackQuery } from "node-telegram-bot-api";
import { createClient } from "@supabase/supabase-js";
import type { CvScoreResult } from "@/lib/types/cv-score";

// ---------------------------------------------------------------------------
// Supabase admin client (same pattern as app/api/subscribe/route.ts)
// ---------------------------------------------------------------------------

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

// ---------------------------------------------------------------------------
// In-memory state (per serverless container — miss just means user resends)
// ---------------------------------------------------------------------------

const chatState = new Map<number, string>();
const sectorSelections = new Map<number, Set<string>>();

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SECTORS = [
  "Humanitarian Aid",
  "Global Health",
  "Finance",
  "ICT",
  "Agriculture",
  "Project Management",
  "Economic Development",
  "Gender",
  "Environment",
  "Education",
  "WASH",
  "Governance",
];

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://devidends.net";

// ---------------------------------------------------------------------------
// Markdown helpers
// ---------------------------------------------------------------------------

/** Escape characters that break Telegram Markdown v1. */
function esc(text: string): string {
  return text.replace(/([_*\[\]()~`>#+\-=|{}.!])/g, "\\$1");
}

/** Truncate a string and add ellipsis. */
function truncate(text: string, max: number): string {
  if (!text || text.length <= max) return text || "";
  return text.slice(0, max - 1) + "\u2026";
}

// ---------------------------------------------------------------------------
// Opportunity search (via API — works on Vercel serverless)
// ---------------------------------------------------------------------------

interface OpportunityRecord {
  title: string;
  organization?: string;
  description?: string;
  deadline?: string | null;
  country?: string;
  source_url?: string;
  type?: string;
}

async function searchOpportunities(keyword: string): Promise<OpportunityRecord[]> {
  try {
    const res = await fetch(
      `${SITE_URL}/api/opportunities/sample?hideExpired=true&minQuality=30`
    );
    if (!res.ok) return [];

    const data = await res.json();
    const all: OpportunityRecord[] = (data.opportunities || []).map(
      (o: any) => ({
        title: o.title,
        organization: o.organization,
        description: o.description,
        deadline: o.deadline,
        country: o.country,
        source_url: o.source_url,
        type: o.classified_type || o.type,
      })
    );

    const kw = keyword.toLowerCase();
    return all
      .filter(
        (o) =>
          o.title?.toLowerCase().includes(kw) ||
          o.organization?.toLowerCase().includes(kw) ||
          o.description?.toLowerCase().includes(kw)
      )
      .slice(0, 5);
  } catch {
    return [];
  }
}

function formatOpportunity(opp: OpportunityRecord): string {
  const title = esc(truncate(opp.title, 100));
  const org = opp.organization ? esc(truncate(opp.organization, 60)) : "N/A";
  const country = opp.country ? esc(opp.country) : "N/A";
  const deadline = opp.deadline
    ? esc(new Date(opp.deadline).toLocaleDateString("en-GB"))
    : "Open";
  const url = opp.source_url || SITE_URL + "/jobs";

  return [
    `\ud83d\udccc *${title}*`,
    `\ud83c\udfe2 ${org}`,
    `\ud83d\udccd ${country} | \u23f0 ${deadline}`,
    `\ud83d\udd17 [Apply Here](${url})`,
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Claim handler — expert clicks t.me/Devidends_Bot?start=claim_XXXXXXXX
// ---------------------------------------------------------------------------

async function handleClaimStart(bot: TelegramBot, msg: Message, claimToken: string) {
  const chatId = msg.chat.id;
  const firstName = msg.from?.first_name || "there";

  try {
    // Verify claim token exists via API
    const res = await fetch(`${SITE_URL}/api/claim?token=${claimToken}`);
    const data = await res.json();

    if (!data.success) {
      await bot.sendMessage(
        chatId,
        `Sorry, this claim link is no longer valid\\. It may have already been claimed\\.`,
        { parse_mode: "MarkdownV2" }
      );
      return;
    }

    const name = data.profile.name ? escapeMarkdown(data.profile.name) : firstName;
    const score = data.profile.cv_score ? ` \\(Score: ${data.profile.cv_score}/100\\)` : "";

    await bot.sendMessage(
      chatId,
      [
        `*Welcome, ${name}\\!*`,
        "",
        `Your professional profile has been prepared on Devidends${score}\\.`,
        "",
        "Tap below to review and claim it:",
      ].join("\n"),
      {
        parse_mode: "MarkdownV2",
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "\u2705 Review & Claim My Profile",
                web_app: { url: `${SITE_URL}/tg-app/claim?token=${claimToken}` },
              },
            ],
          ],
        },
      }
    );
  } catch (err) {
    console.error("[telegram] claim start error:", err);
    await bot.sendMessage(
      chatId,
      "Something went wrong\\. Please try again or contact support\\.",
      { parse_mode: "MarkdownV2" }
    );
  }
}

function escapeMarkdown(text: string): string {
  return text.replace(/[_*[\]()~`>#+\-=|{}.!]/g, "\\$&");
}

// ---------------------------------------------------------------------------
// Command handlers
// ---------------------------------------------------------------------------

async function handleStart(bot: TelegramBot, msg: Message) {
  const chatId = msg.chat.id;
  const text = [
    "*Welcome to Devidends\\!*",
    "",
    "I help development professionals in East Africa find opportunities and strengthen their CVs\\.",
    "",
    "What would you like to do?",
  ].join("\n");

  try {
    await bot.sendMessage(chatId, text, {
      parse_mode: "MarkdownV2",
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "\ud83d\udcf1 Open App",
              web_app: { url: `${SITE_URL}/tg-app` },
            },
          ],
          [
            {
              text: "\ud83d\udd0d Search Opportunities",
              callback_data: "search_prompt",
            },
            {
              text: "\ud83d\udce9 Subscribe to Alerts",
              callback_data: "subscribe_start",
            },
          ],
          [
            { text: "\ud83d\udcca Score My CV", callback_data: "score_info" },
            {
              text: "\ud83c\udf10 Visit Website",
              url: SITE_URL,
            },
          ],
        ],
      },
    });
  } catch (err) {
    console.error("[telegram] /start error:", err);
  }
}

async function handleHelp(bot: TelegramBot, msg: Message) {
  const chatId = msg.chat.id;
  const text = [
    "*Devidends Bot Commands*",
    "",
    "/start \\- Welcome \\+ main menu",
    "/subscribe \\- Select sector alerts",
    "/search \\<keyword\\> \\- Search opportunities",
    "/score \\- Upload your CV for AI scoring",
    "/profile \\- View your profile",
    "/help \\- Show this message",
  ].join("\n");

  try {
    await bot.sendMessage(chatId, text, { parse_mode: "MarkdownV2" });
  } catch (err) {
    console.error("[telegram] /help error:", err);
  }
}

async function handleSubscribe(bot: TelegramBot, msg: Message) {
  const chatId = msg.chat.id;
  sectorSelections.set(chatId, new Set());
  await sendSectorKeyboard(bot, chatId);
}

async function sendSectorKeyboard(bot: TelegramBot, chatId: number) {
  const selected = sectorSelections.get(chatId) || new Set<string>();

  // Build 2-column grid of sector buttons
  const buttons: { text: string; callback_data: string }[][] = [];
  for (let i = 0; i < SECTORS.length; i += 2) {
    const row: { text: string; callback_data: string }[] = [];
    for (let j = i; j < Math.min(i + 2, SECTORS.length); j++) {
      const sector = SECTORS[j];
      const check = selected.has(sector) ? "\u2705 " : "";
      row.push({
        text: `${check}${sector}`,
        callback_data: `toggle_sector:${sector}`,
      });
    }
    buttons.push(row);
  }

  // Done button
  buttons.push([
    { text: "\u2714\ufe0f Done — Save Preferences", callback_data: "subscribe_done" },
  ]);

  const count = selected.size;
  const header = count
    ? `Selected ${count} sector${count > 1 ? "s" : ""}. Tap to toggle, then press Done.`
    : "Select the sectors you want alerts for. Tap to toggle:";

  try {
    await bot.sendMessage(chatId, header, {
      reply_markup: { inline_keyboard: buttons },
    });
  } catch (err) {
    console.error("[telegram] sendSectorKeyboard error:", err);
  }
}

async function handleSearch(bot: TelegramBot, msg: Message) {
  const chatId = msg.chat.id;
  const text = msg.text || "";
  const keyword = text.replace(/^\/search\s*/i, "").trim();

  if (!keyword) {
    try {
      await bot.sendMessage(
        chatId,
        "Please provide a keyword\\. Example:\n`/search health`",
        { parse_mode: "MarkdownV2" }
      );
    } catch (err) {
      console.error("[telegram] /search prompt error:", err);
    }
    return;
  }

  const results = await searchOpportunities(keyword);

  if (results.length === 0) {
    try {
      await bot.sendMessage(
        chatId,
        `No opportunities found for "${esc(keyword)}"\\. Try a different keyword\\.`,
        { parse_mode: "MarkdownV2" }
      );
    } catch (err) {
      console.error("[telegram] /search no-results error:", err);
    }
    return;
  }

  const header = `*Found ${results.length} result${results.length > 1 ? "s" : ""} for "${esc(keyword)}":*\n`;
  const body = results.map(formatOpportunity).join("\n\n");

  try {
    await bot.sendMessage(chatId, header + "\n" + body, {
      parse_mode: "MarkdownV2",
      disable_web_page_preview: true,
    });
  } catch (err) {
    console.error("[telegram] /search results error:", err);
    // Fallback without markdown if formatting fails
    try {
      const plain = results
        .map(
          (o) =>
            `${o.title}\n${o.organization || ""}\n${o.source_url || ""}`
        )
        .join("\n\n");
      await bot.sendMessage(chatId, `Results for "${keyword}":\n\n${plain}`);
    } catch (fallbackErr) {
      console.error("[telegram] /search fallback error:", fallbackErr);
    }
  }
}

async function handleScore(bot: TelegramBot, msg: Message) {
  const chatId = msg.chat.id;
  chatState.set(chatId, "awaiting_document");

  try {
    await bot.sendMessage(
      chatId,
      [
        "\ud83d\udcca *CV Scorer*",
        "",
        "Send me your CV as a *PDF* or *DOCX* file and I'll score it against international development standards\\.",
        "",
        "I'll evaluate: structure, summary, experience, skills, education, and donor readiness\\.",
      ].join("\n"),
      { parse_mode: "MarkdownV2" }
    );
  } catch (err) {
    console.error("[telegram] /score error:", err);
  }
}

async function handleProfile(bot: TelegramBot, msg: Message) {
  const chatId = msg.chat.id;
  const username = msg.from?.username;

  if (!username) {
    try {
      await bot.sendMessage(
        chatId,
        "Please set a Telegram username in your Telegram settings, then try again\\. Or view your profile on the web:",
        {
          parse_mode: "MarkdownV2",
          reply_markup: {
            inline_keyboard: [
              [{ text: "\ud83c\udf10 View Profile on Web", url: `${SITE_URL}/profile` }],
            ],
          },
        }
      );
    } catch (err) {
      console.error("[telegram] /profile no-username error:", err);
    }
    return;
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data: profile } = await supabase
      .from("profiles")
      .select("name, sectors, qualifications, cv_score, profile_score_pct")
      .eq("telegram_id", username)
      .single();

    if (profile) {
      const sectors =
        profile.sectors && profile.sectors.length > 0
          ? profile.sectors.join(", ")
          : "Not set";
      const text = [
        `\ud83d\udc64 *${esc(profile.name || username)}*`,
        "",
        `\ud83c\udfaf Sectors: ${esc(sectors)}`,
        `\ud83d\udcbc Qualifications: ${esc(profile.qualifications || "Not set")}`,
        `\ud83d\udcca CV Score: ${profile.cv_score ?? "Not scored yet"}`,
        `\ud83d\udcdd Profile Completion: ${profile.profile_score_pct ?? 0}%`,
      ].join("\n");

      await bot.sendMessage(chatId, text, {
        parse_mode: "MarkdownV2",
        reply_markup: {
          inline_keyboard: [
            [{ text: "\u270f\ufe0f Edit on Web", url: `${SITE_URL}/profile` }],
          ],
        },
      });
    } else {
      await bot.sendMessage(
        chatId,
        "No profile found for your Telegram username\\. Create one on the website:",
        {
          parse_mode: "MarkdownV2",
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: "\u2795 Create Profile",
                  url: `${SITE_URL}/score`,
                },
              ],
            ],
          },
        }
      );
    }
  } catch (err) {
    console.error("[telegram] /profile error:", err);
    try {
      await bot.sendMessage(
        chatId,
        "Something went wrong fetching your profile. Please try again later."
      );
    } catch (sendErr) {
      console.error("[telegram] /profile fallback error:", sendErr);
    }
  }
}

// ---------------------------------------------------------------------------
// Document handler (CV scoring via Telegram)
// ---------------------------------------------------------------------------

async function handleDocument(bot: TelegramBot, msg: Message) {
  const chatId = msg.chat.id;
  const state = chatState.get(chatId);

  if (state !== "awaiting_document") {
    // User sent a document without /score first — prompt them
    try {
      await bot.sendMessage(
        chatId,
        "Use /score first, then send your CV file\\.",
        { parse_mode: "MarkdownV2" }
      );
    } catch (err) {
      console.error("[telegram] document-no-state error:", err);
    }
    return;
  }

  const doc = msg.document;
  if (!doc) return;

  const fileName = doc.file_name || "unknown";
  const ext = fileName.toLowerCase().split(".").pop();

  if (ext !== "pdf" && ext !== "docx") {
    try {
      await bot.sendMessage(
        chatId,
        "Please send a *PDF* or *DOCX* file\\.",
        { parse_mode: "MarkdownV2" }
      );
    } catch (err) {
      console.error("[telegram] document-wrong-type error:", err);
    }
    return;
  }

  // Clear state
  chatState.delete(chatId);

  try {
    await bot.sendMessage(chatId, "\u23f3 Analyzing your CV... This may take 15-30 seconds.");

    // Download file
    const fileLink = await bot.getFileLink(doc.file_id);
    const response = await fetch(fileLink);
    if (!response.ok) {
      throw new Error(`Failed to download file: ${response.statusText}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Extract text using the existing file-parser
    const { extractText } = await import("@/lib/file-parser");
    const cvText = await extractText(buffer, fileName);

    if (!cvText || cvText.trim().length < 50) {
      await bot.sendMessage(
        chatId,
        "Could not extract enough text from your file\\. The file may be image\\-based \\(scanned\\)\\. Please try a different file\\.",
        { parse_mode: "MarkdownV2" }
      );
      return;
    }

    // Score using the existing cv-scorer
    const { scoreCv } = await import("@/lib/cv-scorer");
    const result: CvScoreResult = await scoreCv(cvText);

    // Format score response
    const dim = (name: string): number => {
      const d = result.dimensions.find((dd) => dd.name === name);
      return d?.score ?? 0;
    };

    const improvements = (result.top_3_improvements || [])
      .slice(0, 3)
      .map((imp, i) => `${i + 1}\\. ${esc(truncate(imp, 200))}`)
      .join("\n");

    const scoreText = [
      `\ud83d\udcca *Your CV Score: ${result.overall_score}/100*`,
      "",
      `\ud83d\udcd0 Structure: ${dim("Structure & Format")}/100`,
      `\ud83d\udcdd Summary: ${dim("Professional Summary")}/100`,
      `\ud83d\udcbc Experience: ${dim("Experience Relevance")}/100`,
      `\ud83d\udd27 Skills: ${dim("Skills & Keywords")}/100`,
      `\ud83c\udf93 Education: ${dim("Education & Certifications")}/100`,
      `\ud83c\udfdb Donor Readiness: ${dim("Donor Readiness")}/100`,
      "",
      "*Top improvements:*",
      improvements,
      "",
      `See full results: [devidends\\.net/score](${SITE_URL}/score)`,
    ].join("\n");

    await bot.sendMessage(chatId, scoreText, {
      parse_mode: "MarkdownV2",
      disable_web_page_preview: true,
    });
  } catch (err) {
    console.error("[telegram] document scoring error:", err);
    try {
      await bot.sendMessage(
        chatId,
        "Sorry, something went wrong while scoring your CV. Please try again or use the web version at " +
          SITE_URL +
          "/score"
      );
    } catch (sendErr) {
      console.error("[telegram] document fallback error:", sendErr);
    }
  }
}

// ---------------------------------------------------------------------------
// Callback query handler (inline keyboard presses)
// ---------------------------------------------------------------------------

async function handleCallbackQuery(bot: TelegramBot, query: CallbackQuery) {
  const chatId = query.message?.chat.id;
  if (!chatId) return;

  const data = query.data || "";

  try {
    // Acknowledge the callback to remove loading spinner
    await bot.answerCallbackQuery(query.id);

    // --- Sector toggle ---
    if (data.startsWith("toggle_sector:")) {
      const sector = data.replace("toggle_sector:", "");
      const selected = sectorSelections.get(chatId) || new Set<string>();

      if (selected.has(sector)) {
        selected.delete(sector);
      } else {
        selected.add(sector);
      }
      sectorSelections.set(chatId, selected);

      // Delete old message and send updated keyboard
      if (query.message?.message_id) {
        try {
          await bot.deleteMessage(chatId, query.message.message_id);
        } catch {
          // Ignore delete failures
        }
      }
      await sendSectorKeyboard(bot, chatId);
      return;
    }

    // --- Subscribe done ---
    if (data === "subscribe_done") {
      const selected = sectorSelections.get(chatId);
      if (!selected || selected.size === 0) {
        await bot.sendMessage(
          chatId,
          "Please select at least one sector before saving."
        );
        return;
      }

      const sectors = Array.from(selected);
      sectorSelections.delete(chatId);

      // Delete the keyboard message
      if (query.message?.message_id) {
        try {
          await bot.deleteMessage(chatId, query.message.message_id);
        } catch {
          // Ignore delete failures
        }
      }

      // Save to Supabase
      const supabase = getSupabaseAdmin();

      // Check for existing subscription
      const { data: existing } = await supabase
        .from("subscriptions")
        .select("id")
        .eq("telegram_id", String(chatId))
        .eq("channel", "telegram")
        .single();

      if (existing) {
        await supabase
          .from("subscriptions")
          .update({
            sectors_filter: sectors,
            is_active: true,
          })
          .eq("id", existing.id);
      } else {
        await supabase.from("subscriptions").insert({
          telegram_id: String(chatId),
          channel: "telegram",
          sectors_filter: sectors,
          country_filter: ["Ethiopia"],
          is_active: true,
        });
      }

      await bot.sendMessage(
        chatId,
        `\u2705 Subscribed\\! You'll receive alerts for:\n\n${sectors.map((s) => `\\- ${esc(s)}`).join("\n")}\n\nUse /subscribe to update your preferences anytime\\.`,
        { parse_mode: "MarkdownV2" }
      );
      return;
    }

    // --- Menu actions from /start ---
    if (data === "search_prompt") {
      await bot.sendMessage(
        chatId,
        "Send me a keyword to search\\. Example:\n`/search health`",
        { parse_mode: "MarkdownV2" }
      );
      return;
    }

    if (data === "subscribe_start") {
      sectorSelections.set(chatId, new Set());
      await sendSectorKeyboard(bot, chatId);
      return;
    }

    if (data === "score_info") {
      chatState.set(chatId, "awaiting_document");
      await bot.sendMessage(
        chatId,
        "Send me your CV as a *PDF* or *DOCX* file and I'll score it\\!",
        { parse_mode: "MarkdownV2" }
      );
      return;
    }
  } catch (err) {
    console.error("[telegram] callback query error:", err);
  }
}

// ---------------------------------------------------------------------------
// Main update dispatcher
// ---------------------------------------------------------------------------

export async function handleUpdate(
  bot: TelegramBot,
  update: Update
): Promise<void> {
  try {
    // Handle callback queries (inline keyboard presses)
    if (update.callback_query) {
      await handleCallbackQuery(bot, update.callback_query);
      return;
    }

    const msg = update.message;
    if (!msg) return;

    // Handle document uploads
    if (msg.document) {
      await handleDocument(bot, msg);
      return;
    }

    // Handle text commands
    const text = msg.text || "";

    if (text.startsWith("/start")) {
      const payload = text.replace(/^\/start\s*/, "").trim();
      if (payload.startsWith("claim_")) {
        await handleClaimStart(bot, msg, payload.slice(6));
      } else {
        await handleStart(bot, msg);
      }
    } else if (text.startsWith("/help")) {
      await handleHelp(bot, msg);
    } else if (text.startsWith("/subscribe")) {
      await handleSubscribe(bot, msg);
    } else if (text.startsWith("/search")) {
      await handleSearch(bot, msg);
    } else if (text.startsWith("/score")) {
      await handleScore(bot, msg);
    } else if (text.startsWith("/profile")) {
      await handleProfile(bot, msg);
    } else if (text.startsWith("/")) {
      // Unknown command
      try {
        await bot.sendMessage(
          msg.chat.id,
          "Unknown command\\. Use /help to see available commands\\.",
          { parse_mode: "MarkdownV2" }
        );
      } catch (err) {
        console.error("[telegram] unknown-command error:", err);
      }
    }
    // Non-command text messages are ignored
  } catch (err) {
    console.error("[telegram] handleUpdate error:", err);
  }
}
