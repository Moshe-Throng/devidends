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

// Pending follow-up questions for CV ingest (chatId:messageId → profileId + missing fields)
const pendingIngestFollowups = new Map<string, { profileId: string; missing: string[] }>();

// ---------------------------------------------------------------------------
// Markdown helpers
// ---------------------------------------------------------------------------

/** Escape characters that break Telegram Markdown v1. */
function esc(text: string): string {
  return text.replace(/([_*\[\]()~`>#+\-=|{}.!])/g, "\\$1");
}

function escHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
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
// Group CV ingest — drop CVs in a Telegram group topic
// ---------------------------------------------------------------------------

async function handleGroupCvIngest(bot: TelegramBot, msg: Message) {
  const chatId = msg.chat.id;
  const threadId = msg.message_thread_id;
  const doc = msg.document;
  if (!doc) return;

  const fileName = doc.file_name || "unknown";
  const ext = fileName.toLowerCase().split(".").pop();
  const senderName = [msg.from?.first_name, msg.from?.last_name].filter(Boolean).join(" ") || "Unknown";

  // Parse "Recommended by" — 3 sources:
  // 1. Caption text (explicit: "Recommended by Mussie" or just a name)
  // 2. Sender is a known recommender in the DB → auto-attach
  const caption = (msg.caption || "").trim();
  let recommendedBy: string | null = null;
  const recMatch = caption.match(/(?:recommended|referred|rec|ref)(?:\s+by)?[:\s]+(.+)/i);
  if (recMatch) {
    recommendedBy = recMatch[1].trim();
  } else if (caption && !caption.includes("/") && caption.length < 100) {
    recommendedBy = caption;
  }

  // Only process PDF/DOCX
  if (ext !== "pdf" && ext !== "docx" && ext !== "doc") return;

  // "Recommended by" only from caption. Sender is tracked as "Added by" separately.

  const replyOpts: Record<string, unknown> = { parse_mode: "HTML" };
  if (threadId) replyOpts.message_thread_id = threadId;

  try {
    await bot.sendMessage(chatId, `<i>Processing ${escHtml(fileName)}...</i>`, replyOpts);

    // Download file
    const fileLink = await bot.getFileLink(doc.file_id);
    const response = await fetch(fileLink);
    if (!response.ok) throw new Error("Failed to download file");
    const buffer = Buffer.from(await response.arrayBuffer());

    // Extract text — with scanned-PDF detection for PDFs
    let cvText = "";
    if (ext === "pdf") {
      const { extractPdfWithMeta, isLikelyScanned } = await import("@/lib/file-parser");
      const { text, numpages } = await extractPdfWithMeta(buffer);
      if (isLikelyScanned(text, numpages)) {
        await bot.sendMessage(
          chatId,
          `<b>Rejected:</b> <b>${escHtml(fileName)}</b> appears to be a scanned/image-based PDF (${numpages} pages, ${text.trim().length} chars extracted). We don't process scanned CVs — please ask the candidate to send a text-based PDF or DOCX.`,
          replyOpts
        );
        return;
      }
      cvText = text;
    } else {
      const { extractText } = await import("@/lib/file-parser");
      cvText = await extractText(buffer, fileName);
    }

    if (!cvText || cvText.trim().length < 200) {
      await bot.sendMessage(
        chatId,
        `<b>Rejected:</b> Could not extract enough text from <b>${escHtml(fileName)}</b>. File may be scanned, encrypted, or corrupted.`,
        replyOpts
      );
      return;
    }

    // Single Claude call: extract structured CV
    // For very long CVs (>30K), trim to fit within the 60s function timeout
    const { extractCvData } = await import("@/lib/cv-extractor");
    const trimmedText = cvText.length > 30000 ? cvText.slice(0, 30000) + "\n\n[... CV continues with additional consultancy assignments ...]" : cvText;
    const { data: cvStructured } = await extractCvData(trimmedText);

    // Reject empty/garbage extractions — means AI couldn't parse the text
    const extractedName = cvStructured?.personal?.full_name?.trim() || "";
    const empCountCheck = (cvStructured?.employment || []).length;
    const eduCountCheck = (cvStructured?.education || []).length;
    const isEmpty =
      !extractedName ||
      extractedName.toLowerCase() === "unknown" ||
      (empCountCheck === 0 && eduCountCheck === 0);
    if (isEmpty) {
      await bot.sendMessage(
        chatId,
        `<b>Rejected:</b> Could not extract structured data from <b>${escHtml(fileName)}</b>. The CV may be in an unusual format or the text is garbled. No profile was created.`,
        replyOpts
      );
      return;
    }

    // Derive profile fields from structured data (no extra API call)
    const profile = {
      name: cvStructured?.personal?.full_name || "Unknown",
      headline: null as string | null,
      sectors: [] as string[],
      donors: [] as string[],
      countries: cvStructured?.countries_of_experience || [],
      skills: [] as string[],
      qualifications: cvStructured?.education?.[0] ? `${cvStructured.education[0].degree} in ${cvStructured.education[0].field_of_study}, ${cvStructured.education[0].institution}` : null,
      years_of_experience: null as number | null,
      profile_type: null as string | null,
    };

    // Calculate years from earliest employment
    const empDates = (cvStructured?.employment || []).map((e: any) => e.from_date).filter(Boolean).sort();
    if (empDates.length > 0) {
      const earliest = new Date(empDates[0]).getFullYear();
      if (earliest > 1970) profile.years_of_experience = new Date().getFullYear() - earliest;
    }
    const yrs = profile.years_of_experience || 0;
    profile.profile_type = yrs >= 15 ? "Expert" : yrs >= 10 ? "Senior" : yrs >= 5 ? "Mid-level" : yrs >= 2 ? "Junior" : "Entry";

    // Quick score (fast, no extra API call — just skip for now, score later via admin panel)
    let cvScore: number | null = null;

    // Extract fields from structured data
    const personal = cvStructured?.personal || {};
    const languages = cvStructured?.languages?.map((l: any) => l.language).filter(Boolean) || [];
    const degrees = (cvStructured?.education || []).map((e: any) => e.degree || "");
    const eduLevel = degrees.some((d: string) => /PhD|Doctorate/i.test(d)) ? "PhD"
      : degrees.some((d: string) => /Master|MSc|MA|MBA|MPH|MPA/i.test(d)) ? "Masters"
      : degrees.some((d: string) => /Bachelor|BSc|BA|BEng|LLB/i.test(d)) ? "Bachelors" : null;
    const empCount = (cvStructured?.employment || []).length;

    // Generate claim token
    const { randomUUID } = await import("crypto");
    const claimToken = randomUUID().replace(/-/g, "").slice(0, 8);

    // Auto-generate tags
    const tags: string[] = ["telegram_ingest"];
    if ((profile.years_of_experience || 0) >= 15) tags.push("expert");
    else if ((profile.years_of_experience || 0) >= 10) tags.push("senior");
    if (cvScore && cvScore >= 70) tags.push("strong_cv");
    if (languages.length >= 3) tags.push("multilingual");

    // Save to Supabase (dedup by name — update if exists)
    const { createClient } = await import("@supabase/supabase-js");
    const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

    const expertName = (personal.full_name || profile.name || "").trim();
    let isUpdate = false;
    let profileId: string | null = null;

    // Dedup strategy (in priority order):
    //   1. Same telegram file_id → same CV re-uploaded → update
    //   2. Same email (if present) → same person → update
    //   3. Exact name match (case-insensitive, trimmed) AND name is not "Unknown"/empty → update
    //   Never dedup on fallback/generic names — always insert a new row instead.
    let existing: { id: string; name: string; claim_token: string | null } | null = null;

    // 1. By telegram file_id (most reliable — same file)
    const cvUrl = `tg://${doc.file_id}`;
    {
      const { data } = await sb
        .from("profiles")
        .select("id, name, claim_token")
        .eq("cv_url", cvUrl)
        .limit(1)
        .maybeSingle();
      if (data) existing = data;
    }

    // 2. By email (if extracted and no file-id match)
    if (!existing && personal.email) {
      const { data } = await sb
        .from("profiles")
        .select("id, name, claim_token")
        .eq("email", personal.email)
        .limit(1)
        .maybeSingle();
      if (data) existing = data;
    }

    // 3. By exact name (only if name is clearly a real name — not "Unknown", not 1 word of 2 chars)
    const nameLooksReal =
      expertName.length >= 4 &&
      expertName.split(/\s+/).length >= 2 &&
      !/^unknown$/i.test(expertName);
    if (!existing && nameLooksReal) {
      const { data } = await sb
        .from("profiles")
        .select("id, name, claim_token")
        .ilike("name", expertName)
        .limit(1)
        .maybeSingle();
      if (data) existing = data;
    }

    const profileData = {
      name: expertName,
      headline: profile.headline,
      email: personal.email || null,
      phone: personal.phone || null,
      nationality: personal.nationality || null,
      city: personal.address || personal.country_of_residence || null,
      sectors: profile.sectors,
      donors: profile.donors,
      countries: profile.countries,
      skills: profile.skills,
      qualifications: profile.qualifications,
      years_of_experience: profile.years_of_experience,
      profile_type: profile.profile_type,
      cv_text: cvText.slice(0, 50000),
      cv_url: doc.file_id ? `tg://${doc.file_id}` : null,
      cv_structured_data: cvStructured,
      cv_score: cvScore,
      languages: languages,
      education_level: eduLevel,
      tags: tags,
      recommended_by: recommendedBy || null,
      admin_notes: `Added by ${senderName}${recommendedBy ? ` | Recommended by ${recommendedBy}` : ""}`,
      source: "telegram_ingest" as const,
    };

    if (existing) {
      // Update existing profile
      isUpdate = true;
      profileId = existing.id;
      const { error: updateErr } = await sb.from("profiles").update(profileData).eq("id", existing.id);
      if (updateErr) throw new Error(updateErr.message);
      // Keep existing claim_token
    } else {
      // Create new profile
      const { data: created, error: insertErr } = await sb
        .from("profiles")
        .insert({ ...profileData, claim_token: claimToken })
        .select("id")
        .single();
      if (insertErr) throw new Error(insertErr.message);
      profileId = created?.id || null;
    }

    // Build summary message
    const name = escHtml(personal.full_name || profile.name);
    const scoreStr = cvScore != null ? `${cvScore}/100` : "N/A";
    const sectorsStr = (profile.sectors || []).slice(0, 3).join(", ") || "None detected";
    const yrsStr = profile.years_of_experience ? `${profile.years_of_experience} years` : "N/A";
    const effectiveToken = existing?.claim_token || claimToken;
    const claimLink = `https://t.me/Devidends_Bot?start=claim_${effectiveToken}`;

    const summary = [
      isUpdate ? `<b>CV Updated</b>` : `<b>CV Ingested</b>`,
      ``,
      `<b>${name}</b>`,
      profile.headline ? `<i>${escHtml(profile.headline)}</i>` : null,
      ``,
      `Score: <b>${scoreStr}</b>`,
      `Experience: ${yrsStr} | ${profile.profile_type || "N/A"}`,
      `Education: ${eduLevel || "N/A"}`,
      `Sectors: ${escHtml(sectorsStr)}`,
      `Employment: ${empCount} roles`,
      `Languages: ${languages.join(", ") || "N/A"}`,
      recommendedBy ? `Recommended by: <b>${escHtml(recommendedBy)}</b>` : null,
      `Added by: ${escHtml(senderName)}`,
      ``,
      `Claim: <code>${claimLink}</code>`,
    ].filter(Boolean).join("\n");

    await bot.sendMessage(chatId, summary, replyOpts);

    // Ask follow-up questions for missing fields
    const missing: string[] = [];
    if (!personal.email) missing.push("Email");
    if (!personal.phone) missing.push("Phone");
    if (!recommendedBy) missing.push("Recommended by");
    missing.push("Gender"); // Always ask — can't reliably detect from CV

    if (missing.length > 0 && profileId) {
      const followUp = [
        `<b>Missing info for ${escHtml(personal.full_name || profile.name)}:</b>`,
        ``,
        `Please reply to this message with the following (one per line):`,
        ...missing.map((f, i) => `${i + 1}. ${f}: ...`),
        ``,
        `<i>Example:</i>`,
        ...missing.map((f) => {
          if (f === "Email") return `<code>Email: name@example.com</code>`;
          if (f === "Phone") return `<code>Phone: +251911234567</code>`;
          if (f === "Recommended by") return `<code>Recommended by: Mussie Tsegaye</code>`;
          if (f === "Gender") return `<code>Gender: Male</code> or <code>Female</code>`;
          return "";
        }),
      ].filter(Boolean).join("\n");

      const followUpMsg = await bot.sendMessage(chatId, followUp, { ...replyOpts, reply_to_message_id: undefined });

      // Store profile ID in a pending map so we can update when they reply
      pendingIngestFollowups.set(`${chatId}:${followUpMsg.message_id}`, { profileId, missing });
    }

    // Track event
    const { trackEvent } = await import("@/lib/logger");
    trackEvent({ event: "cv_ingested", profile_id: profileId || undefined, metadata: { source: "telegram_group", name: profile.name, score: cvScore, sender: senderName } });

  } catch (err: any) {
    console.error("[telegram-ingest]", err.message);
    await bot.sendMessage(chatId, `<b>Ingest failed:</b> ${escHtml(err.message || "Unknown error")}`, replyOpts).catch(() => {});

    const { logException } = await import("@/lib/logger");
    logException("telegram-ingest", err, { fileName, sender: senderName });
  }
}

// ---------------------------------------------------------------------------
// Handle follow-up replies to ingest questions
// ---------------------------------------------------------------------------

async function handleIngestFollowupReply(
  bot: TelegramBot,
  msg: Message,
  pending: { profileId: string; missing: string[] }
) {
  const chatId = msg.chat.id;
  const threadId = msg.message_thread_id;
  const replyOpts: Record<string, unknown> = { parse_mode: "HTML" };
  if (threadId) replyOpts.message_thread_id = threadId;

  try {
    const text = (msg.text || "").trim();
    const lines = text.split("\n").map(l => l.trim()).filter(Boolean);

    const update: Record<string, unknown> = {};
    const filled: string[] = [];

    for (const line of lines) {
      const emailMatch = line.match(/^(?:email|e-?mail)[:\s]+(.+)/i);
      if (emailMatch) { update.email = emailMatch[1].trim(); filled.push("Email"); continue; }

      const phoneMatch = line.match(/^(?:phone|tel|mobile|cell)[:\s]+(.+)/i);
      if (phoneMatch) { update.phone = phoneMatch[1].trim(); filled.push("Phone"); continue; }

      const recMatch = line.match(/^(?:recommended|rec|ref|referred)(?:\s+by)?[:\s]+(.+)/i);
      if (recMatch) { update.recommended_by = recMatch[1].trim(); filled.push("Recommended by"); continue; }

      const genderMatch = line.match(/^(?:gender|sex)[:\s]+(.+)/i);
      if (genderMatch) {
        const g = genderMatch[1].trim().toLowerCase();
        update.gender = g.startsWith("m") ? "male" : g.startsWith("f") ? "female" : g;
        filled.push("Gender");
        continue;
      }

      // Try to match single values like "Male" or "+251..."
      if (/^(?:male|female)$/i.test(line)) { update.gender = line.toLowerCase(); filled.push("Gender"); continue; }
      if (/^\+?\d[\d\s-]{7,}$/.test(line)) { update.phone = line; filled.push("Phone"); continue; }
      if (line.includes("@") && line.includes(".")) { update.email = line; filled.push("Email"); continue; }
    }

    if (Object.keys(update).length > 0) {
      const { createClient } = await import("@supabase/supabase-js");
      const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
      await sb.from("profiles").update(update).eq("id", pending.profileId);

      await bot.sendMessage(chatId, `<b>Updated:</b> ${filled.join(", ")}`, replyOpts);

      // Remove from pending if all fields filled
      const remaining = pending.missing.filter(m => !filled.includes(m));
      if (remaining.length === 0) {
        const replyKey = `${chatId}:${msg.reply_to_message?.message_id}`;
        pendingIngestFollowups.delete(replyKey);
      }
    } else {
      await bot.sendMessage(chatId, `<i>Could not parse. Please use format:</i>\n<code>Email: name@example.com\nPhone: +251...\nGender: Male\nRecommended by: Name</code>`, replyOpts);
    }
  } catch (err: any) {
    console.error("[ingest-followup]", err.message);
  }
}

// ---------------------------------------------------------------------------
// Command handlers
// ---------------------------------------------------------------------------

async function handleStart(bot: TelegramBot, msg: Message) {
  const chatId = msg.chat.id;

  // Track bot_started event
  const { trackEvent } = await import("@/lib/logger");
  trackEvent({ event: "bot_started", telegram_id: String(chatId), metadata: { username: msg.from?.username, first_name: msg.from?.first_name } });

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
// AI Companion — free-text handler
// ---------------------------------------------------------------------------

async function handleCompanionMessage(bot: TelegramBot, msg: Message) {
  const chatId = msg.chat.id;
  const text = (msg.text || "").trim();
  if (!text) return;

  try {
    // Send typing indicator
    await bot.sendChatAction(chatId, "typing");

    const { handleFreeText } = await import("@/lib/companion");
    const reply = await handleFreeText(String(chatId), text);

    const sendOpts: Record<string, unknown> = {};
    if (reply.buttons && reply.buttons.length > 0) {
      sendOpts.reply_markup = { inline_keyboard: reply.buttons };
    }

    await bot.sendMessage(chatId, reply.text, sendOpts);
  } catch (err) {
    console.error("[telegram] companion error:", err);
    // Don't send error to user for companion failures — just silently fail
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
      // Check if this is a CV drop in the ingest topic
      const ingestGroupId = process.env.TELEGRAM_INGEST_GROUP_ID;
      const ingestTopicId = process.env.TELEGRAM_INGEST_TOPIC_ID;
      if (ingestGroupId && String(msg.chat.id) === ingestGroupId &&
          (!ingestTopicId || String(msg.message_thread_id || "") === ingestTopicId)) {
        await handleGroupCvIngest(bot, msg);
        return;
      }
      await handleDocument(bot, msg);
      return;
    }

    // Handle replies to ingest follow-up questions
    if (msg.reply_to_message && msg.text) {
      const replyKey = `${msg.chat.id}:${msg.reply_to_message.message_id}`;
      const pending = pendingIngestFollowups.get(replyKey);
      if (pending) {
        await handleIngestFollowupReply(bot, msg, pending);
        return;
      }
    }

    // Handle text commands
    const text = msg.text || "";

    if (text.startsWith("/start")) {
      const payload = text.replace(/^\/start\s*/, "").trim();
      if (payload.startsWith("claim_")) {
        await handleClaimStart(bot, msg, payload.slice(6));
      } else if (payload === "report") {
        // User tapped "Contact our team" from companion
        chatState.set(msg.chat.id, "awaiting_report");
        try {
          await bot.sendMessage(
            msg.chat.id,
            "Please describe the issue you're experiencing and our team will look into it. Type your message below:",
          );
        } catch {}
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
    } else if (text.trim() && msg.chat.type === "private") {
      // Check if user is submitting a report
      if (chatState.get(msg.chat.id) === "awaiting_report") {
        chatState.delete(msg.chat.id);
        const senderName = [msg.from?.first_name, msg.from?.last_name].filter(Boolean).join(" ");
        const username = msg.from?.username ? `@${msg.from.username}` : "";
        // Forward to admin
        const ADMIN_TG = "297659579";
        const reportText = `🚩 User Report\nFrom: ${senderName} ${username} (${msg.chat.id})\n\n${text}`;
        try {
          const token = process.env.TELEGRAM_BOT_TOKEN;
          if (token) {
            await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ chat_id: ADMIN_TG, text: reportText }),
            });
          }
          await bot.sendMessage(msg.chat.id, "Thanks for letting us know. Our team has been notified and will look into it.");
        } catch {
          await bot.sendMessage(msg.chat.id, "Thanks — your feedback has been noted.");
        }
        return;
      }
      // Free-text in private chat → AI companion
      await handleCompanionMessage(bot, msg);
    }
  } catch (err) {
    console.error("[telegram] handleUpdate error:", err);
  }
}
