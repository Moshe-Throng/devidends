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

/**
 * Per-chat rate-limit gate. Telegram throttles to ~1 msg/sec per chat for
 * group messages and ~30/sec globally. When the ingest group gets multiple
 * CVs within a few seconds we blow past this and hit ETELEGRAM 429s. This
 * helper serializes outbound sends per chat with a small minimum gap.
 */
const _lastChatSend = new Map<string | number, number>();
async function paceChat(chatId: string | number, minGapMs = 1100): Promise<void> {
  const last = _lastChatSend.get(chatId) || 0;
  const wait = last + minGapMs - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  _lastChatSend.set(chatId, Date.now());
}

const TOP_RECOMMENDERS = 6;

interface RecRow { id: string; name: string; count: number }

/**
 * Fetch all recommenders (is_recommender=true) sorted alphabetically,
 * each with a recommendation count (how many profiles cite them as
 * recommended_by). Used to pick the most active for quick access.
 */
async function fetchRecommenders(): Promise<RecRow[]> {
  try {
    const { createClient } = await import("@supabase/supabase-js");
    const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    const [{ data: recs }, { data: recBy }] = await Promise.all([
      sb.from("profiles").select("id, name").eq("is_recommender", true).order("name", { ascending: true }),
      sb.from("profiles").select("recommended_by").not("recommended_by", "is", null),
    ]);
    // Count: a recBy string contains this recommender's first name + at least one other token
    function matches(recName: string, recBy: string): boolean {
      const rb = recBy.toLowerCase();
      const parts = recName.toLowerCase().split(/\s+/).filter(Boolean);
      if (parts.length === 0 || !rb.includes(parts[0])) return false;
      if (parts.length === 1) return true;
      return parts.slice(1).some((p) => p.length >= 3 && rb.includes(p));
    }
    const rows = (recs || []).map((r: any) => ({
      id: r.id,
      name: r.name,
      count: (recBy || []).filter((p: any) => matches(r.name, p.recommended_by)).length,
    }));
    // Re-sort by name with titles stripped, so "Dr. Getachew Eshete" sits with the G's.
    rows.sort((a, b) => stripTitle(a.name).localeCompare(stripTitle(b.name)));
    return rows;
  } catch {
    return [];
  }
}

/** Strip honorifics so "Dr. Getachew" buckets under G, not D. */
function stripTitle(name: string): string {
  return (name || "").trim().replace(/^(dr\.?|mr\.?|mrs\.?|ms\.?|miss|prof\.?|professor|hon\.?|sir|madam)\s+/i, "").trim();
}

function bucketLetter(name: string): string {
  const c = stripTitle(name).charAt(0).toUpperCase();
  return /[A-Z]/.test(c) ? c : "#";
}

/** Letter buckets present in the recommender list ("A", "B", "C", ...). */
function lettersPresent(recommenders: RecRow[]): string[] {
  const set = new Set<string>();
  for (const r of recommenders) {
    const c = bucketLetter(r.name);
    if (/[A-Z]/.test(c)) set.add(c);
  }
  return Array.from(set).sort();
}

/**
 * Top-level keyboard: gender buttons, top 6 recommenders by activity,
 * and an alphabet quick-jump row. Tapping a letter takes you to the
 * letter view in one click — total interaction = 2 clicks max.
 */
function buildTopKeyboard(profileId: string, recommenders: RecRow[], needsGender: boolean, needsRecommender: boolean) {
  const rows: { text: string; callback_data: string }[][] = [];
  if (needsGender) {
    rows.push([
      { text: "👨 Male", callback_data: `gen:${profileId}:m` },
      { text: "👩 Female", callback_data: `gen:${profileId}:f` },
    ]);
  }
  if (needsRecommender && recommenders.length > 0) {
    // Index lookup so we can encode picks by stable index.
    // Top by count, then alphabetical tie-break.
    const indexed = recommenders.map((r, i) => ({ ...r, idx: i }));
    const top = [...indexed].sort((a, b) => (b.count - a.count) || a.name.localeCompare(b.name)).slice(0, TOP_RECOMMENDERS);
    // 2 per row
    for (let i = 0; i < top.length; i += 2) {
      rows.push(top.slice(i, i + 2).map((r) => ({
        text: r.count > 0 ? `⭐ ${r.name} (${r.count})` : r.name,
        callback_data: `rec:${profileId}:${r.idx}`,
      })));
    }
    // Alphabet quick-jump
    const letters = lettersPresent(recommenders);
    for (let i = 0; i < letters.length; i += 6) {
      rows.push(letters.slice(i, i + 6).map((L) => ({
        text: L,
        callback_data: `recAB:${profileId}:${L}:${needsGender ? 1 : 0}`,
      })));
    }
  }
  return { inline_keyboard: rows };
}

/**
 * Letter view: show every recommender whose name starts with `letter`.
 * Single screen, no further pagination — letter buckets stay small enough.
 * "← Top" button returns to the top keyboard.
 */
function buildLetterKeyboard(profileId: string, recommenders: RecRow[], letter: string, needsGender: boolean) {
  const rows: { text: string; callback_data: string }[][] = [];
  if (needsGender) {
    rows.push([
      { text: "👨 Male", callback_data: `gen:${profileId}:m` },
      { text: "👩 Female", callback_data: `gen:${profileId}:f` },
    ]);
  }
  const matches = recommenders
    .map((r, idx) => ({ ...r, idx }))
    .filter((r) => bucketLetter(r.name) === letter);
  for (let i = 0; i < matches.length; i += 2) {
    rows.push(matches.slice(i, i + 2).map((r) => ({
      text: r.name,
      callback_data: `rec:${profileId}:${r.idx}`,
    })));
  }
  rows.push([{ text: "← Back to top recommenders", callback_data: `recTop:${profileId}:${needsGender ? 1 : 0}` }]);
  return { inline_keyboard: rows };
}

// Backward-compat alias used by existing callers
function buildFollowupKeyboard(profileId: string, recommenders: RecRow[], _page: number, needsGender: boolean, needsRecommender: boolean) {
  return buildTopKeyboard(profileId, recommenders, needsGender, needsRecommender);
}

/**
 * Validate that a "Recommended by" name belongs to someone already flagged as a recommender.
 * Returns the canonical name (from the matched profile) or null if no match.
 * The bot only accepts recommendations from existing recommenders — the network is curated.
 */
async function resolveRecommender(rawName: string | null | undefined): Promise<{ matched: string | null; suggestions: string[] }> {
  if (!rawName) return { matched: null, suggestions: [] };
  const name = rawName.trim();
  if (!name) return { matched: null, suggestions: [] };
  try {
    const { createClient } = await import("@supabase/supabase-js");
    const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    // Exact ilike match
    const { data: exact } = await sb
      .from("profiles")
      .select("name")
      .eq("is_recommender", true)
      .ilike("name", name)
      .limit(1)
      .maybeSingle();
    if (exact?.name) return { matched: exact.name, suggestions: [] };
    // Fuzzy: first name or last name contains
    const parts = name.split(/\s+/).filter(Boolean);
    if (parts.length > 0) {
      const { data: fuzzy } = await sb
        .from("profiles")
        .select("name")
        .eq("is_recommender", true)
        .or(parts.map((p) => `name.ilike.%${p}%`).join(","))
        .limit(5);
      if (fuzzy && fuzzy.length === 1) return { matched: fuzzy[0].name as string, suggestions: [] };
      if (fuzzy && fuzzy.length > 1) return { matched: null, suggestions: fuzzy.map((f) => f.name as string) };
    }
    return { matched: null, suggestions: [] };
  } catch {
    return { matched: null, suggestions: [] };
  }
}

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
// Referred start — new user lands via a Co-Creator's invite link
//   t.me/Devidends_Bot?start=ref_<invite_token>
// Looks up the referring CC, warm-welcomes, asks for a CV, pre-tags the
// eventual profile with the referrer's name.
// ---------------------------------------------------------------------------

async function handleReferredStart(bot: TelegramBot, msg: Message, refToken: string) {
  const chatId = msg.chat.id;
  try {
    const { createClient } = await import("@supabase/supabase-js");
    const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    const { data: cc } = await sb
      .from("co_creators")
      .select("id, name")
      .eq("invite_token", refToken)
      .maybeSingle();
    const referrerName = cc?.name || null;

    // Remember who referred them — used when they later upload a CV
    if (referrerName) {
      chatState.set(chatId, `awaiting_document:recommended_by:${referrerName}`);
    } else {
      chatState.set(chatId, "awaiting_document");
    }

    const firstName = referrerName ? referrerName.split(/\s+/)[0] : null;
    const intro = firstName
      ? `<b>Welcome — ${escHtml(firstName)} sent you. 👋</b>`
      : `<b>Welcome to Devidends.</b>`;
    const body = referrerName
      ? `${escHtml(referrerName)} vouched for you. You're now in the curated Ethiopian consulting network we're quietly building — 300+ senior consultants, opportunities filtered and matched, CVs scored against donor standards.`
      : `Ethiopia's curated consulting network — 300+ senior consultants, opportunities filtered and matched, CVs scored against donor standards.`;

    const text = [
      intro,
      "",
      body,
      "",
      "<b>Next step:</b> send me your CV as a <b>PDF</b> or <b>DOCX</b>. I'll score it and add you to the pool within 24 hours. You'll be tagged as recommended by " + (referrerName ? `<b>${escHtml(referrerName)}</b>` : "your inviter") + ".",
      "",
      "<i>It stays private. You control what shows up in your profile.</i>",
    ].join("\n");

    await bot.sendMessage(chatId, text, { parse_mode: "HTML" });
  } catch (err) {
    console.error("[telegram] handleReferredStart error:", err);
    await handleStart(bot, msg).catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// Web login handler — user tapped "Log in with Telegram" on devidends.net/login
// Flow: site POSTs to /api/auth/web-login/request, gets a token, opens
//       t.me/Devidends_Bot?start=weblogin_<token>. We resolve their canonical
//       auth user, stash a magic-link token_hash on login_tokens, and tell
//       them to switch back to the browser. Site polls and verifies.
// ---------------------------------------------------------------------------

async function handleWebLoginStart(bot: TelegramBot, msg: Message, loginToken: string) {
  const chatId = msg.chat.id;
  try {
    const { createClient } = await import("@supabase/supabase-js");
    const sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: tokenRow } = await sb
      .from("login_tokens")
      .select("token, expires_at, used_at, magic_token_hash")
      .eq("token", loginToken)
      .maybeSingle();

    if (!tokenRow) {
      await bot.sendMessage(chatId, "This login link is invalid or already used. Head back to devidends.net/login and try again.");
      return;
    }
    if (tokenRow.used_at || new Date(tokenRow.expires_at) < new Date()) {
      await bot.sendMessage(chatId, "This login link has expired. Head back to devidends.net/login and generate a fresh one.");
      return;
    }
    if (tokenRow.magic_token_hash) {
      // Already resolved — user tapped the deep link twice
      await bot.sendMessage(chatId, "You're already logged in on the web. Switch back to the browser tab.");
      return;
    }

    const telegramId = String(msg.from?.id || chatId);
    const telegramUsername = msg.from?.username || null;
    const firstName = msg.from?.first_name || "";
    const lastName = msg.from?.last_name || "";
    const fullName = [firstName, lastName].filter(Boolean).join(" ") || "there";

    // Resolve to a canonical auth user — same policy as /api/auth/telegram-login.
    const { data: existingProfile } = await sb
      .from("profiles")
      .select("id, user_id, email, name, telegram_username")
      .eq("telegram_id", telegramId)
      .maybeSingle();

    // Capture tg_username onto the profile if missing (best-effort).
    if (existingProfile && telegramUsername && existingProfile.telegram_username !== telegramUsername) {
      await sb
        .from("profiles")
        .update({ telegram_username: telegramUsername })
        .eq("id", existingProfile.id);
    }

    const { data: list } = await sb.auth.admin.listUsers({ perPage: 1000 });
    let authUserId: string;
    let resolvedEmail: string;

    const canonicalUser = existingProfile?.user_id
      ? list?.users?.find((u: any) => u.id === existingProfile.user_id)
      : null;

    if (canonicalUser) {
      authUserId = canonicalUser.id;
      resolvedEmail = canonicalUser.email || `tg_${telegramId}@users.devidends.app`;
    } else {
      // No canonical user yet — create / reuse the synthetic one
      const syntheticEmail = `tg_${telegramId}@users.devidends.app`;
      const existing = list?.users?.find((u: any) => u.email === syntheticEmail);
      if (existing) {
        authUserId = existing.id;
      } else {
        const { data: created, error } = await sb.auth.admin.createUser({
          email: syntheticEmail,
          email_confirm: true,
          user_metadata: {
            telegram_id: telegramId,
            telegram_username: telegramUsername,
            name: fullName,
          },
        });
        if (error || !created?.user) {
          await bot.sendMessage(chatId, "Something went wrong creating your web session. Try again from devidends.net/login.");
          console.error("[tg weblogin] createUser error:", error);
          return;
        }
        authUserId = created.user.id;
      }
      resolvedEmail = syntheticEmail;

      // Link the profile if we have one
      if (existingProfile && !existingProfile.user_id) {
        await sb.from("profiles").update({ user_id: authUserId }).eq("id", existingProfile.id);
      }
    }

    // Mint the magic-link token_hash the client will verify
    const { data: linkData, error: linkErr } = await sb.auth.admin.generateLink({
      type: "magiclink",
      email: resolvedEmail,
    });
    if (linkErr || !linkData?.properties?.hashed_token) {
      await bot.sendMessage(chatId, "Couldn't generate your session. Try again in a minute.");
      console.error("[tg weblogin] generateLink error:", linkErr);
      return;
    }

    // Stash on the token row — client polling will pick it up
    await sb
      .from("login_tokens")
      .update({
        telegram_id: telegramId,
        telegram_username: telegramUsername,
        user_id: authUserId,
        email: resolvedEmail,
        magic_token_hash: linkData.properties.hashed_token,
      })
      .eq("token", loginToken);

    const short = firstName || "friend";
    const lines = [
      `<b>✅ Signed in, ${escHtml(short)}.</b>`,
      ``,
      `Switch back to the browser tab — it'll load your profile in a second.`,
      ``,
      `<i>Prefer Telegram? The mini app is right here:</i>`,
      `https://t.me/Devidends_Bot/app`,
    ];
    await bot.sendMessage(chatId, lines.join("\n"), { parse_mode: "HTML", disable_web_page_preview: true });
  } catch (err) {
    console.error("[telegram] handleWebLoginStart error:", err);
    try { await bot.sendMessage(chatId, "Something went wrong. Head back to devidends.net/login and try again."); } catch {}
  }
}

// ---------------------------------------------------------------------------
// Claim handler — expert clicks t.me/Devidends_Bot?start=claim_XXXXXXXX
// ---------------------------------------------------------------------------

async function handleClaimStart(bot: TelegramBot, msg: Message, claimToken: string) {
  const chatId = msg.chat.id;
  const firstName = msg.from?.first_name || "there";
  const telegramId = String(msg.from?.id || chatId);
  const telegramUsername = msg.from?.username || null;
  const sb = getSupabaseAdmin();

  const escHtml = (s: string) =>
    String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const sendInvalidLink = async (reason: "expired" | "unknown" = "expired") => {
    const lines = reason === "expired"
      ? [
        `<b>This claim link has already been used.</b>`,
        `If this is your account, tap <b>Dev Hub</b> below \u2014 your profile is waiting.`,
      ]
      : [
        `<b>This link isn't valid.</b>`,
        `Ask whoever shared it to resend the latest one. You can still browse via <b>Dev Hub</b> below.`,
      ];
    try {
      await bot.sendMessage(chatId, lines.join("\n"), {
        parse_mode: "HTML",
        disable_web_page_preview: true,
      });
    } catch {}
  };

  try {
    // 1. Find the profile that owns this claim token.
    const { data: profile } = await sb
      .from("profiles")
      .select("id, name, cv_score, sectors, is_recommender, claimed_at, telegram_id")
      .eq("claim_token", claimToken)
      .maybeSingle();

    if (!profile) {
      await sendInvalidLink("unknown");
      return;
    }

    // If a different Telegram account already owns this profile, we don't
    // overwrite \u2014 the user gets the invalid-link path.
    if (profile.telegram_id && profile.telegram_id !== telegramId) {
      await sendInvalidLink("expired");
      return;
    }

    // 2. Resolve duplicates \u2014 bare tg-only profiles already on this telegram_id
    //    that have no CV text are orphan /start-no-deeplink artefacts. Move
    //    any cv_scores to the canonical profile, then delete them.
    const { data: existingForTg } = await sb
      .from("profiles")
      .select("id, cv_text")
      .eq("telegram_id", telegramId);
    const orphanIds = (existingForTg || [])
      .filter((p: { id: string; cv_text: string | null }) => !p.cv_text && p.id !== profile.id)
      .map((p: { id: string }) => p.id);
    if (orphanIds.length > 0) {
      await sb.from("cv_scores").update({ profile_id: profile.id }).in("profile_id", orphanIds);
      await sb.from("profiles").delete().in("id", orphanIds);
    }

    // 3. Link / claim. Two cases:
    //    (a) Already claimed (e.g. via email) but no telegram_id yet \u2014
    //        we link Telegram, preserving the original claimed_at.
    //    (b) Not yet claimed \u2014 full atomic claim.
    //    Token possession + Telegram identity = sufficient authority.
    const claimedAt = profile.claimed_at || new Date().toISOString();
    const { error: updateErr } = await sb
      .from("profiles")
      .update({
        telegram_id: telegramId,
        telegram_username: telegramUsername,
        claimed_at: claimedAt,
      })
      .eq("id", profile.id);

    if (updateErr) {
      console.error("[claim] update error:", updateErr.message);
      await bot.sendMessage(chatId, "Something went wrong. Please try again.");
      return;
    }

    // 4. Mirror the claim to co_creators so the recommender dashboard updates.
    await sb
      .from("co_creators")
      .update({ status: "joined", claimed_at: claimedAt })
      .eq("profile_id", profile.id);

    // 5. Welcome message \u2014 branched by audience.
    //    Recommenders get a tight 3-line ask (drop a CV here, or open the
    //    hub for referrals/intros/network). Experts get the intel-feed +
    //    CV-scoring overview because that IS their core value.
    const displayName = profile.name || firstName;
    const sectors = (profile.sectors as string[]) || [];

    let lines: string[];

    if (profile.is_recommender) {
      lines = [
        `<b>Welcome, ${escHtml(displayName)} \u2014 you're our co-creator.</b>`,
        `Drop any CV here and I'll ingest it under your name.`,
        `Or tap <b>Dev Hub</b> below for your referrals, intros and the network you've built.`,
      ];
    } else {
      const sectorsLine =
        sectors.length > 0 ? `Briefs filtered to: <b>${escHtml(sectors.slice(0, 4).join(" \u00b7 "))}</b>` : null;
      const scoreLine = profile.cv_score
        ? `Your CV is on file at <b>${profile.cv_score}/100</b> against donor standards.`
        : null;
      lines = [
        `<b>Welcome, ${escHtml(displayName)} \u2014 you're in.</b>`,
        ``,
        `<b>Inside the Dev Hub:</b>`,
        `  \ud83d\udcca  Daily intel \u2014 jobs, consultancies and tenders matched to your profile`,
        `  \ud83c\udfaf  Live CV scoring against GIZ, FCDO, World Bank and EU standards`,
        `  \u270d\ufe0f  CV tailoring + donor-format templates on demand`,
        ...(sectorsLine || scoreLine ? [``] : []),
        ...(sectorsLine ? [sectorsLine] : []),
        ...(scoreLine ? [scoreLine] : []),
        ``,
        `Tap <b>Dev Hub</b> below to enter.`,
      ];
    }

    await bot.sendMessage(chatId, lines.join("\n"), {
      parse_mode: "HTML",
      disable_web_page_preview: true,
    });
  } catch (err) {
    console.error("[telegram] claim start error:", err);
    try {
      await bot.sendMessage(chatId, "Something went wrong. Please try again or contact support.");
    } catch {}
  }
}

function escapeMarkdown(text: string): string {
  return text.replace(/[_*[\]()~`>#+\-=|{}.!]/g, "\\$&");
}

// ---------------------------------------------------------------------------
// Group CV ingest — drop CVs in a Telegram group topic
// ---------------------------------------------------------------------------

async function handleGroupCvIngest(
  bot: TelegramBot,
  msg: Message,
  opts?: { forcedRecommendedBy?: string }
) {
  const chatId = msg.chat.id;
  const threadId = msg.message_thread_id;
  const doc = msg.document;
  if (!doc) return;

  const fileName = doc.file_name || "unknown";
  const ext = fileName.toLowerCase().split(".").pop();
  const senderName = [msg.from?.first_name, msg.from?.last_name].filter(Boolean).join(" ") || "Unknown";

  // Resolve "Recommended by":
  //   1. If caller forced a value (e.g. private-chat recommender ingest, where
  //      the sender IS the recommender), use it directly and skip parsing.
  //   2. Otherwise parse an explicit "Recommended by X" caption pattern and
  //      validate against our recommender network.
  //   If still unresolved, the follow-up prompt asks the user to pick.
  let recommendedBy: string | null = opts?.forcedRecommendedBy || null;
  if (!recommendedBy) {
    const caption = (msg.caption || "").trim();
    const recMatch = caption.match(/(?:recommended|referred)(?:\s+by)?[:\s]+(.+)/i);
    if (recMatch) {
      const { matched } = await resolveRecommender(recMatch[1].trim());
      if (matched) recommendedBy = matched;
    }
  }

  // Only process PDF/DOCX
  if (ext !== "pdf" && ext !== "docx" && ext !== "doc") return;

  // "Recommended by" only from caption. Sender is tracked as "Added by" separately.

  const replyOpts: Record<string, unknown> = { parse_mode: "HTML" };
  if (threadId) replyOpts.message_thread_id = threadId;

  try {
    await paceChat(chatId);
    await bot.sendMessage(chatId, `<i>Processing ${escHtml(fileName)}...</i>`, replyOpts);

    // Download file
    const fileLink = await bot.getFileLink(doc.file_id);
    const response = await fetch(fileLink);
    if (!response.ok) throw new Error("Failed to download file");
    const buffer = Buffer.from(await response.arrayBuffer());

    // Fire-and-forget: back up the raw file to Supabase Storage for audit.
    // Path is deterministic from file_id, so scripts/ingest-audit.ts can verify presence.
    const backupKey = `tg-ingest/${new Date().toISOString().slice(0, 10)}/${doc.file_id}.${ext}`;
    (async () => {
      try {
        const { createClient } = await import("@supabase/supabase-js");
        const sbBackup = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
        const contentType =
          ext === "pdf" ? "application/pdf" :
          ext === "docx" ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document" :
          ext === "doc" ? "application/msword" : "application/octet-stream";
        await sbBackup.storage.from("cv-downloads").upload(backupKey, buffer, { contentType, upsert: true });
      } catch (e) {
        console.warn("[ingest-backup] failed:", (e as Error).message);
      }
    })();

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
      try {
        const { forwardCvToAdmin } = await import("@/lib/cv-admin-cc");
        forwardCvToAdmin({
          buffer, filename: fileName,
          senderName: senderName, senderTelegramId: String(msg.from?.id || chatId),
          source: "tg_group_ingest", status: "rejected",
          resultSummary: `Rejected: text too short (${cvText?.trim().length || 0} chars). Sent by ${senderName}${recommendedBy ? ` | Recommended: ${recommendedBy}` : ""}`,
        }).catch(() => {});
      } catch {}
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
      try {
        const { forwardCvToAdmin } = await import("@/lib/cv-admin-cc");
        forwardCvToAdmin({
          buffer, filename: fileName,
          senderName, senderTelegramId: String(msg.from?.id || chatId),
          source: "tg_group_ingest", status: "rejected",
          resultSummary: `AI extraction empty. Sent by ${senderName}${recommendedBy ? ` | Recommended: ${recommendedBy}` : ""}`,
        }).catch(() => {});
      } catch {}
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

    // When called from the recommender-private flow, the caller will send
    // its own unified summary + notes prompt. Skip BOTH the group-style
    // summary AND the missing-fields follow-up. The recommender is already
    // known, and missing email/phone/gender can be fixed on the admin page.
    if (opts?.forcedRecommendedBy) {
      return;
    }

    await paceChat(chatId);
    await bot.sendMessage(chatId, summary, replyOpts);

    // Ask follow-up questions for missing fields.
    // Check the FINAL profile state (after dedup/update) for gender/email/phone
    // so we don't re-ask things the DB already has from a prior ingest.
    let existingProfileFields: any = {};
    if (profileId) {
      const { data: existingRow } = await sb
        .from("profiles")
        .select("gender, email, phone")
        .eq("id", profileId)
        .maybeSingle();
      existingProfileFields = existingRow || {};
    }
    const missing: string[] = [];
    if (!personal.email && !existingProfileFields.email) missing.push("Email");
    if (!personal.phone && !existingProfileFields.phone) missing.push("Phone");
    if (!recommendedBy) missing.push("Recommended by");
    if (!existingProfileFields.gender && !(cvStructured?.personal as any)?.gender) missing.push("Gender");

    if (missing.length > 0 && profileId) {
      const needsGender = missing.includes("Gender");
      const needsRecommender = missing.includes("Recommended by");
      const textMissing = missing.filter((f) => f === "Email" || f === "Phone");

      const recommenders = needsRecommender ? await fetchRecommenders() : [];
      const keyboard = buildFollowupKeyboard(profileId, recommenders, 0, needsGender, needsRecommender);

      const lines = [
        `<b>Missing info for ${escHtml(personal.full_name || profile.name)}:</b>`,
        ``,
      ];
      if (textMissing.length > 0) {
        lines.push(`Reply to this message with:`);
        for (const f of textMissing) {
          if (f === "Email") lines.push(`<code>Email: name@example.com</code>`);
          if (f === "Phone") lines.push(`<code>Phone: +251911234567</code>`);
        }
        lines.push("");
      }
      if (needsGender) lines.push(`Pick <b>Gender</b> below${needsRecommender ? " · pick <b>Recommender</b> below" : ""}.`);
      else if (needsRecommender) lines.push(`Pick <b>Recommender</b> below.`);
      lines.push("", `<i>pid=${profileId}</i>`);

      const followUp = lines.filter((l) => l !== null && l !== undefined).join("\n");
      const sendOpts: any = { ...replyOpts, reply_to_message_id: undefined, reply_markup: keyboard };
      await paceChat(chatId);
      const followUpMsg = await bot.sendMessage(chatId, followUp, sendOpts);

      pendingIngestFollowups.set(`${chatId}:${followUpMsg.message_id}`, { profileId, missing });
    }

    // Track event
    const { trackEvent } = await import("@/lib/logger");
    trackEvent({ event: "cv_ingested", profile_id: profileId || undefined, metadata: { source: "telegram_group", name: profile.name, score: cvScore, sender: senderName } });

    // CC admin on success — pass extracted CV so quality auto-flags
    try {
      const { forwardCvToAdmin } = await import("@/lib/cv-admin-cc");
      forwardCvToAdmin({
        buffer, filename: fileName,
        senderName, senderTelegramId: String(msg.from?.id || chatId),
        source: "tg_group_ingest", status: "success",
        resultSummary: `${isUpdate ? "Updated" : "Created"} profile: ${expertName} · ${empCount} roles${recommendedBy ? ` · Recommended by ${recommendedBy}` : ""}`,
        extractedCv: cvStructured,
      }).catch(() => {});
    } catch {}

    // Fire-and-forget: enrich profile with sectors/donors/skills (Haiku call ~3s).
    // Done AFTER the user-facing response so we don't slow down the ingest.
    // Without this, search/match by sector returns empty for tg-ingested profiles.
    if (profileId) {
      (async () => {
        try {
          const { extractProfileFromCV } = await import("@/lib/extract-profile");
          const extracted = await extractProfileFromCV(cvText.slice(0, 30_000));
          const enrichPatch: any = {};
          if (extracted.sectors?.length) enrichPatch.sectors = extracted.sectors;
          if (extracted.skills?.length) enrichPatch.skills = extracted.skills;
          if (extracted.donors?.length) enrichPatch.donors = extracted.donors;
          if (extracted.headline) enrichPatch.headline = extracted.headline;
          if (Object.keys(enrichPatch).length > 0) {
            await sb.from("profiles").update(enrichPatch).eq("id", profileId);
          }
        } catch (e) {
          console.warn("[tg-ingest enrich]", (e as Error).message);
        }
      })();
    }

  } catch (err: any) {
    console.error("[telegram-ingest]", err.message);
    await bot.sendMessage(chatId, `<b>Ingest failed:</b> ${escHtml(err.message || "Unknown error")}`, replyOpts).catch(() => {});

    const { logException } = await import("@/lib/logger");
    logException("telegram-ingest", err, { fileName, sender: senderName });
  }
}

// ---------------------------------------------------------------------------
// Private-chat CV ingest by a claimed recommender ("I'm bringing someone in")
// Routes through handleGroupCvIngest by pre-filling a synthetic caption with
// the recommender's canonical name, then logs an attribution row so we can
// track who's bringing whom into the network.
// ---------------------------------------------------------------------------

async function handleRecommenderPrivateCvIngest(
  bot: TelegramBot,
  msg: Message,
  sender: { id: string; name: string }
) {
  const chatId = msg.chat.id;
  const doc = msg.document;
  if (!doc) return;

  // Upfront confirmation so they know what's happening.
  try {
    await paceChat(chatId);
    await bot.sendMessage(
      chatId,
      `<b>Got it.</b> Ingesting as a CV you're bringing in, tagged <i>Recommended by ${escHtml(sender.name)}</i>. Hold on ~30 seconds.\n\n<i>To score or update your own CV, open the Dev Hub.</i>`,
      { parse_mode: "HTML" }
    );
  } catch {}

  // Run the standard ingest pipeline with the recommender pre-resolved.
  // This skips the caption parsing AND the "pick a recommender" follow-up
  // keyboard entirely, since the sender IS the recommender.
  await handleGroupCvIngest(bot, msg, { forcedRecommendedBy: sender.name });

  // After ingest, find the profile we just created/updated via the Telegram
  // file_id we stashed in cv_url, then log an attribution row + send a
  // recommender-facing summary DM.
  try {
    const { createClient } = await import("@supabase/supabase-js");
    const sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    const cvUrl = `tg://${doc.file_id}`;
    let subject: any = null;
    {
      const { data } = await sb
        .from("profiles")
        .select("id, name, claim_token, sectors, cv_score, years_of_experience, profile_type, updated_at")
        .eq("cv_url", cvUrl)
        .maybeSingle();
      if (data) subject = data;
    }
    // Fallback: grab the most recently updated profile where recommended_by
    // matches the sender. Covers edge cases where cv_url didn't persist.
    if (!subject) {
      const { data } = await sb
        .from("profiles")
        .select("id, name, claim_token, sectors, cv_score, years_of_experience, profile_type, updated_at")
        .eq("recommended_by", sender.name)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data) subject = data;
    }
    if (!subject) {
      console.warn(`[recommender-ingest] could not locate subject profile after ingest. cv_url=${cvUrl} recommended_by=${sender.name}`);
      return;
    }

    // De-dup: does an attribution already exist for this contributor + subject?
    const { data: existingAttr } = await sb
      .from("attributions")
      .select("id")
      .eq("contributor_profile_id", sender.id)
      .eq("subject_profile_id", subject.id)
      .eq("attribution_type", "referral_member")
      .maybeSingle();

    let attributionId: string | null = existingAttr?.id || null;
    if (!existingAttr) {
      const { data: created } = await sb
        .from("attributions")
        .insert({
          attribution_type: "referral_member",
          contributor_profile_id: sender.id,
          subject_profile_id: subject.id,
          firm_name: "Devidends network",
          opportunity_title: `Brought in by ${sender.name}: ${subject.name}`,
          sector: subject.sectors || [],
          share_pct: 10,
          stage: "introduced",
          occurred_at: new Date().toISOString().slice(0, 10),
          source_of_record: "telegram_bot",
          confidence: "high",
          notes: `${sender.name} sent this CV via private chat on @Devidends_Bot on ${new Date().toISOString().slice(0, 10)}.`,
        })
        .select("id")
        .single();
      attributionId = created?.id || null;
    }

    // Body count: every person this recommender has brought in, including
    // pre-Devidends introductions captured on profiles.recommended_by (the
    // legacy free-text field) AND attribution rows where they're the
    // contributor. We dedupe by subject_profile_id so cross-counted entries
    // don't inflate the total.
    const senderParts = (sender.name || "").toLowerCase().split(/\s+/).filter(Boolean);
    const senderFirst = senderParts[0] || "";
    const broughtSet = new Set<string>();
    if (senderFirst) {
      const { data: legacy } = await sb
        .from("profiles")
        .select("id, recommended_by")
        .ilike("recommended_by", `%${senderFirst}%`);
      for (const r of legacy || []) {
        const rb = ((r as any).recommended_by || "").toLowerCase();
        const matchesFirst = rb.includes(senderFirst);
        const matchesRest = senderParts.length === 1
          ? true
          : senderParts.slice(1).some((p) => p.length >= 3 && rb.includes(p));
        if (matchesFirst && matchesRest) broughtSet.add((r as any).id);
      }
    }
    const { data: attrRows } = await sb
      .from("attributions")
      .select("subject_profile_id")
      .eq("contributor_profile_id", sender.id);
    for (const r of attrRows || []) {
      if ((r as any).subject_profile_id) broughtSet.add((r as any).subject_profile_id);
    }
    const broughtInCount = broughtSet.size;

    const firstName = sender.name.split(/\s+/)[0];
    const claimLink = `https://t.me/Devidends_Bot?start=claim_${subject.claim_token}`;
    const yrs = subject.years_of_experience ? `${subject.years_of_experience}y exp` : "years unclear";
    const score = subject.cv_score != null ? `CV score ${subject.cv_score}/100` : "not yet scored";
    const sectorsPreview = (subject.sectors || []).slice(0, 3).join(" · ") || "sectors pending";

    const summary = [
      `<b>✅ Added to your network, ${escHtml(firstName)}.</b>`,
      ``,
      `<b>${escHtml(subject.name)}</b>`,
      `${yrs} · ${subject.profile_type || "tier TBD"} · ${score}`,
      `Sectors: ${escHtml(sectorsPreview)}`,
      ``,
      `This CV is now tagged as recommended by you. Their claim link, if you want to forward it directly:`,
      claimLink,
      ``,
      `<b>Your running total:</b> ${broughtInCount} brought in to date.`,
    ].join("\n");

    await paceChat(chatId);
    await bot.sendMessage(chatId, summary, { parse_mode: "HTML", disable_web_page_preview: true });

    // Prompt for endorsement strength + optional free-text notes.
    // Ownership framing so the recommender understands they're on record.
    if (attributionId) {
      await paceChat(chatId);
      const prompt = [
        `<b>${escHtml(subject.name)}</b> is in Devidends, tagged as recommended by you.`,
        ``,
        `Your name is on record as the introducer, so when they land assignments through the network, you're credited and share in the outcome.`,
        ``,
        `<b>How would you describe your relationship with them?</b>`,
        ``,
        `<i>Pick one below. You can also reply with context anytime.</i>`,
      ].join("\n");
      const keyboard = {
        inline_keyboard: [
          [{ text: "👋 I just know them", callback_data: `refnotes_lvl:casual:${attributionId}:${subject.id}` }],
          [{ text: "🤝 We worked together", callback_data: `refnotes_lvl:worked:${attributionId}:${subject.id}` }],
          [{ text: "⭐ Strongly recommend", callback_data: `refnotes_lvl:strong:${attributionId}:${subject.id}` }],
          [{ text: "Skip", callback_data: `refnotes_skip:${attributionId}:${subject.id}` }],
        ],
      };
      await bot.sendMessage(chatId, prompt, { parse_mode: "HTML", reply_markup: keyboard });
      // State remains open so a text reply still lands as notes.
      chatState.set(chatId, `awaiting_referral_notes:${attributionId}:${subject.id}`);
    }
  } catch (e) {
    console.warn("[recommender-ingest] post-hook failed:", (e as Error).message);
  }
}

// ---------------------------------------------------------------------------
// Capture free-text notes the recommender sends after a CV ingest, save them
// to the attribution row and a copy on the subject profile's admin_notes.
// ---------------------------------------------------------------------------

async function handleReferralNotesReply(
  bot: TelegramBot,
  msg: Message,
  attributionId: string,
  subjectProfileId: string
) {
  const chatId = msg.chat.id;
  const text = (msg.text || "").trim();
  if (!text) return;
  if (/^skip$/i.test(text) || /^(no|nope|none|n\/a)$/i.test(text)) {
    chatState.delete(chatId);
    await bot.sendMessage(chatId, "<i>No notes saved. You're all set.</i>", { parse_mode: "HTML" });
    return;
  }
  try {
    const { createClient } = await import("@supabase/supabase-js");
    const sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Append (don't overwrite) to attributions.notes
    const { data: existing } = await sb
      .from("attributions")
      .select("notes")
      .eq("id", attributionId)
      .maybeSingle();
    const prior = existing?.notes || "";
    const sep = prior ? "\n\n" : "";
    const stamped = `${new Date().toISOString().slice(0, 10)} — recommender notes: ${text}`;
    await sb.from("attributions").update({ notes: prior + sep + stamped }).eq("id", attributionId);

    // Also append to the subject profile's admin_notes for quick visibility.
    const { data: prof } = await sb
      .from("profiles")
      .select("admin_notes")
      .eq("id", subjectProfileId)
      .maybeSingle();
    const priorAdmin = prof?.admin_notes || "";
    const sep2 = priorAdmin ? "\n" : "";
    await sb
      .from("profiles")
      .update({ admin_notes: priorAdmin + sep2 + stamped })
      .eq("id", subjectProfileId);

    chatState.delete(chatId);
    await bot.sendMessage(chatId, "<b>Saved.</b> Notes attached to the profile and the referral record.", {
      parse_mode: "HTML",
    });
  } catch (e) {
    console.warn("[referral-notes] save failed:", (e as Error).message);
    chatState.delete(chatId);
    await bot.sendMessage(chatId, "Couldn't save the notes. Try again or flag it to Mussie.");
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
    let rejectedRecommender: { raw: string; suggestions: string[] } | null = null;

    for (const line of lines) {
      const emailMatch = line.match(/^(?:email|e-?mail)[:\s]+(.+)/i);
      if (emailMatch) { update.email = emailMatch[1].trim(); filled.push("Email"); continue; }

      const phoneMatch = line.match(/^(?:phone|tel|mobile|cell)[:\s]+(.+)/i);
      if (phoneMatch) { update.phone = phoneMatch[1].trim(); filled.push("Phone"); continue; }

      const recMatch = line.match(/^(?:recommended|rec|ref|referred)(?:\s+by)?[:\s]+(.+)/i);
      if (recMatch) {
        const raw = recMatch[1].trim();
        const { matched, suggestions } = await resolveRecommender(raw);
        if (matched) {
          update.recommended_by = matched;
          filled.push("Recommended by");
        } else {
          rejectedRecommender = { raw, suggestions };
        }
        continue;
      }

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

    // Build the recommender-rejection line (shown either alongside updates or as a standalone error)
    let rejLine = "";
    if (rejectedRecommender) {
      const { raw, suggestions } = rejectedRecommender;
      rejLine = suggestions.length > 0
        ? `\n<b>Note:</b> "${escHtml(raw)}" isn't in our recommender network. Did you mean: ${suggestions.map((s) => `<b>${escHtml(s)}</b>`).join(", ")}?`
        : `\n<b>Note:</b> "${escHtml(raw)}" isn't in our recommender network. Only registered recommenders can be credited — ask admin to onboard them first.`;
    }

    if (Object.keys(update).length > 0) {
      const { createClient } = await import("@supabase/supabase-js");
      const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
      await sb.from("profiles").update(update).eq("id", pending.profileId);

      await bot.sendMessage(chatId, `<b>Updated:</b> ${filled.join(", ")}${rejLine}`, replyOpts);

      // Remove from pending if all fields filled
      const remaining = pending.missing.filter(m => !filled.includes(m));
      if (remaining.length === 0) {
        const replyKey = `${chatId}:${msg.reply_to_message?.message_id}`;
        pendingIngestFollowups.delete(replyKey);
      }
    } else if (rejectedRecommender) {
      await bot.sendMessage(chatId, rejLine.trim(), replyOpts);
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
    "/profile \\- View your profile",
    "/help \\- Show this message",
    "",
    "_Recommenders: drop any CV here and I'll ingest it under your name\\._",
    "_To score your own CV, open the Dev Hub below\\._",
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

/**
 * /delete — user-initiated data wipe. Two-step: first /delete shows what
 * will be removed and asks for confirmation; sending "CONFIRM DELETE" within
 * the same chat triggers the hard delete across profile + co_creator +
 * subscription.
 */
async function handleDelete(bot: TelegramBot, msg: Message) {
  const chatId = msg.chat.id;
  const tgId = String(msg.from?.id || chatId);
  try {
    const { createClient } = await import("@supabase/supabase-js");
    const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    const { data: profile } = await sb
      .from("profiles")
      .select("id, name, cv_text")
      .eq("telegram_id", tgId)
      .maybeSingle();
    if (!profile) {
      await bot.sendMessage(chatId, "No profile linked to this Telegram account — nothing to delete.");
      return;
    }
    const hasCv = (profile.cv_text || "").length > 200;
    chatState.set(chatId, `awaiting_delete_confirm:${profile.id}`);
    await bot.sendMessage(
      chatId,
      [
        "<b>Delete everything?</b>",
        "",
        `This will permanently remove:`,
        `• Your profile (${escHtml(profile.name || "unnamed")})`,
        hasCv ? `• Your stored CV + structured data` : null,
        `• Your subscriptions and alerts`,
        `• Your Co-Creator record (if any)`,
        ``,
        `<b>This cannot be undone.</b>`,
        ``,
        `Send <code>CONFIRM DELETE</code> within 5 minutes to proceed.`,
        `Send anything else to cancel.`,
      ].filter(Boolean).join("\n"),
      { parse_mode: "HTML" }
    );
  } catch (err) {
    console.error("[delete]", (err as Error).message);
    await bot.sendMessage(chatId, "Couldn't process delete request. Try again later.");
  }
}

async function performDelete(bot: TelegramBot, msg: Message, profileId: string) {
  const chatId = msg.chat.id;
  try {
    const { createClient } = await import("@supabase/supabase-js");
    const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    // Order matters: drop referencing rows first
    await sb.from("subscriptions").delete().eq("telegram_id", String(msg.from?.id || chatId));
    await sb.from("cv_scores").delete().eq("profile_id", profileId);
    await sb.from("events").delete().eq("profile_id", profileId);
    await sb.from("co_creators").delete().eq("profile_id", profileId);
    await sb.from("profiles").delete().eq("id", profileId);
    chatState.delete(chatId);
    await bot.sendMessage(
      chatId,
      "<b>Deleted.</b> Everything is gone. Thank you for having been part of Devidends. You can return anytime by forwarding a CV to me again.",
      { parse_mode: "HTML" }
    );
  } catch (err) {
    console.error("[delete/perform]", (err as Error).message);
    await bot.sendMessage(chatId, "Delete failed. Reply with details and we'll remove manually.");
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

  const senderDisplayName = [msg.from?.first_name, msg.from?.last_name].filter(Boolean).join(" ") || "Unknown";
  const senderTgId = String(msg.from?.id || chatId);

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

    const { forwardCvToAdmin } = await import("@/lib/cv-admin-cc");

    if (!cvText || cvText.trim().length < 50) {
      await bot.sendMessage(
        chatId,
        "Could not extract enough text from your file\\. The file may be image\\-based \\(scanned\\)\\. Please try a different file\\.",
        { parse_mode: "MarkdownV2" }
      );
      // CC admin on rejection
      forwardCvToAdmin({
        buffer, filename: fileName,
        senderName: senderDisplayName, senderTelegramId: senderTgId,
        source: "tg_bot_dm", status: "rejected",
        resultSummary: `Could not extract text (likely scanned PDF).`,
      }).catch(() => {});
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

    // CC admin on successful score
    forwardCvToAdmin({
      buffer, filename: fileName,
      senderName: senderDisplayName, senderTelegramId: senderTgId,
      source: "tg_bot_dm", status: "success",
      resultSummary: `Scored: ${result.overall_score}/100 · ${cvText.length} chars extracted`,
    }).catch(() => {});
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
    // CC admin on error
    try {
      const { forwardCvToAdmin: fwdErr } = await import("@/lib/cv-admin-cc");
      await fwdErr({
        buffer: Buffer.from(await (await fetch(await bot.getFileLink(doc.file_id))).arrayBuffer()),
        filename: fileName,
        senderName: senderDisplayName, senderTelegramId: senderTgId,
        source: "tg_bot_dm", status: "error",
        resultSummary: `Error: ${(err as Error)?.message?.slice(0, 200) || "Unknown"}`,
      });
    } catch {}
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

    // No-op (used for pagination indicator buttons)
    if (data === "noop") return;

    // --- Recommender-ingest: skip the post-ingest notes prompt ---
    if (data.startsWith("refnotes_skip:")) {
      // Clear the awaiting_referral_notes state and acknowledge.
      chatState.delete(chatId);
      try {
        await bot.sendMessage(chatId, "<i>Skipped. You're all set.</i>", { parse_mode: "HTML" });
      } catch {}
      return;
    }

    // --- Recommender-ingest: endorsement level tap ---
    if (data.startsWith("refnotes_lvl:")) {
      const [, level, attributionId, subjectProfileId] = data.split(":");
      if (!level || !attributionId || !subjectProfileId) return;
      // New 3-level scheme + back-compat for any in-flight messages with the
      // old 4-level keys.
      const labels: Record<string, string> = {
        casual: "I just know them",
        worked: "We worked together",
        strong: "Strongly recommend",
        // legacy keys
        light: "I just know them",
        professional: "I just know them",
      };
      const confidenceMap: Record<string, string> = {
        casual: "medium",
        worked: "high",
        strong: "high",
        light: "medium",
        professional: "medium",
      };
      const label = labels[level] || level;
      const confidence = confidenceMap[level] || "medium";
      try {
        const { createClient } = await import("@supabase/supabase-js");
        const sb = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!
        );
        // Prepend the endorsement line to attributions.notes
        const { data: existing } = await sb
          .from("attributions")
          .select("notes")
          .eq("id", attributionId)
          .maybeSingle();
        const prior = existing?.notes || "";
        const stamped = `[Endorsement: ${label}] (${new Date().toISOString().slice(0, 10)})`;
        const newNotes = prior ? `${stamped}\n\n${prior}` : stamped;
        await sb
          .from("attributions")
          .update({ notes: newNotes, confidence })
          .eq("id", attributionId);
        // Mirror to profiles.admin_notes for admin page visibility
        const { data: prof } = await sb
          .from("profiles")
          .select("admin_notes")
          .eq("id", subjectProfileId)
          .maybeSingle();
        const priorAdmin = prof?.admin_notes || "";
        const sep = priorAdmin ? "\n" : "";
        await sb
          .from("profiles")
          .update({ admin_notes: priorAdmin + sep + stamped })
          .eq("id", subjectProfileId);
      } catch (e) {
        console.warn("[refnotes_lvl] save failed:", (e as Error).message);
      }
      // Check whether the subject profile already has gender on file. If not,
      // ask the recommender — we use this for diversity reporting in shortlists,
      // and recommenders almost always know without thinking.
      let askGender = false;
      try {
        const { createClient } = await import("@supabase/supabase-js");
        const sb2 = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
        const { data: subjP } = await sb2
          .from("profiles")
          .select("gender")
          .eq("id", subjectProfileId)
          .maybeSingle();
        askGender = !subjP?.gender;
      } catch {}

      if (askGender) {
        try {
          await bot.sendMessage(
            chatId,
            [
              `<b>✓ Saved as ${escHtml(label)}.</b>`,
              ``,
              `<b>Quick — what's their gender?</b>`,
              `<i>Used for diversity reporting on shortlists. Skip if you'd rather not.</i>`,
            ].join("\n"),
            {
              parse_mode: "HTML",
              reply_markup: {
                inline_keyboard: [
                  [
                    { text: "♀ Woman", callback_data: `refnotes_gender:female:${attributionId}:${subjectProfileId}` },
                    { text: "♂ Man", callback_data: `refnotes_gender:male:${attributionId}:${subjectProfileId}` },
                  ],
                  [
                    { text: "Prefer not to say", callback_data: `refnotes_gender:nb:${attributionId}:${subjectProfileId}` },
                    { text: "Skip", callback_data: `refnotes_gender:skip:${attributionId}:${subjectProfileId}` },
                  ],
                ],
              },
            }
          );
        } catch {}
      } else {
        try {
          await bot.sendMessage(
            chatId,
            [
              `<b>✓ Saved as ${escHtml(label)}.</b>`,
              ``,
              `Want to add context? Reply here with anything — strengths, availability, specific roles you'd put them forward for. Or ignore to move on.`,
            ].join("\n"),
            { parse_mode: "HTML" }
          );
        } catch {}
      }
      // Keep the chatState open so a text follow-up is captured as notes.
      return;
    }

    // --- Recommender-ingest: gender tap ---
    if (data.startsWith("refnotes_gender:")) {
      const [, value, attributionId, subjectProfileId] = data.split(":");
      if (!value || !attributionId || !subjectProfileId) return;
      try {
        const { createClient } = await import("@supabase/supabase-js");
        const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
        if (value === "female" || value === "male") {
          await sb.from("profiles").update({ gender: value }).eq("id", subjectProfileId);
        } else if (value === "nb") {
          await sb.from("profiles").update({ gender: "prefer_not_to_say" }).eq("id", subjectProfileId);
        }
        // "skip" → write nothing
      } catch (e) {
        console.warn("[refnotes_gender] save failed:", (e as Error).message);
      }
      const ack: Record<string, string> = {
        female: "♀ Woman",
        male: "♂ Man",
        nb: "Prefer not to say",
        skip: "Skipped",
      };
      try {
        await bot.sendMessage(
          chatId,
          [
            `<b>✓ ${escHtml(ack[value] || "Noted")}.</b>`,
            ``,
            `Want to add context? Reply here with anything — strengths, availability, specific roles you'd put them forward for. Or ignore to move on.`,
          ].join("\n"),
          { parse_mode: "HTML" }
        );
      } catch {}
      // chatState (awaiting_referral_notes) stays open — any text reply
      // still captures as notes.
      return;
    }

    // --- Ingest follow-up: gender pick ---
    if (data.startsWith("gen:")) {
      const [, profileId, val] = data.split(":");
      const gender = val === "m" ? "male" : val === "f" ? "female" : null;
      if (!profileId || !gender) return;
      const { createClient } = await import("@supabase/supabase-js");
      const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
      await sb.from("profiles").update({ gender }).eq("id", profileId);
      const threadId = query.message?.message_thread_id;
      const opts: any = { parse_mode: "HTML" };
      if (threadId) opts.message_thread_id = threadId;
      await bot.sendMessage(chatId, `✓ Gender set: <b>${gender === "male" ? "Male" : "Female"}</b>`, opts);
      return;
    }

    // --- Ingest follow-up: recommender pick ---
    if (data.startsWith("rec:")) {
      const [, profileId, idxStr] = data.split(":");
      const idx = parseInt(idxStr, 10);
      if (!profileId || isNaN(idx)) return;
      const recommenders = await fetchRecommenders();
      const rec = recommenders[idx];
      if (!rec) {
        await bot.sendMessage(chatId, `Recommender not found (list changed).`);
        return;
      }
      const { createClient } = await import("@supabase/supabase-js");
      const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
      await sb.from("profiles").update({ recommended_by: rec.name }).eq("id", profileId);
      const threadId = query.message?.message_thread_id;
      const opts: any = { parse_mode: "HTML" };
      if (threadId) opts.message_thread_id = threadId;
      await bot.sendMessage(chatId, `✓ Recommender set: <b>${escHtml(rec.name)}</b>`, opts);
      return;
    }

    // --- Ingest follow-up: jump to recommenders for letter ---
    if (data.startsWith("recAB:")) {
      const [, profileId, letter, needsGenderStr] = data.split(":");
      if (!profileId || !letter) return;
      const recommenders = await fetchRecommenders();
      const keyboard = buildLetterKeyboard(profileId, recommenders, letter, needsGenderStr === "1");
      if (query.message?.message_id) {
        await bot.editMessageReplyMarkup(keyboard, {
          chat_id: chatId,
          message_id: query.message.message_id,
        }).catch(() => {});
      }
      return;
    }

    // --- Ingest follow-up: back to top recommender view ---
    if (data.startsWith("recTop:")) {
      const [, profileId, needsGenderStr] = data.split(":");
      if (!profileId) return;
      const recommenders = await fetchRecommenders();
      const keyboard = buildTopKeyboard(profileId, recommenders, needsGenderStr === "1", true);
      if (query.message?.message_id) {
        await bot.editMessageReplyMarkup(keyboard, {
          chat_id: chatId,
          message_id: query.message.message_id,
        }).catch(() => {});
      }
      return;
    }

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
      // Self-scoring is now Dev-Hub-only. Don't accept CV uploads in DM.
      await bot.sendMessage(
        chatId,
        [
          `<b>CV scoring lives in the Dev Hub.</b>`,
          ``,
          `Open the <b>Dev Hub</b> below to upload, score, tailor or generate donor-format CVs.`,
        ].join("\n"),
        { parse_mode: "HTML", disable_web_page_preview: true },
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
      const msgChatId = String(msg.chat.id);
      const msgTopicId = String(msg.message_thread_id || "");
      const groupMatch = !!ingestGroupId && msgChatId === ingestGroupId;
      const topicMatch = !ingestTopicId || msgTopicId === ingestTopicId;
      // Diagnostic: log every doc drop to events so we can debug routing.
      try {
        const { trackEvent } = await import("@/lib/logger");
        trackEvent({
          event: "doc_received",
          telegram_id: msg.from?.id ? String(msg.from.id) : undefined,
          metadata: {
            chat_id: msgChatId,
            chat_type: msg.chat.type,
            topic_id: msgTopicId || null,
            env_group: ingestGroupId || null,
            env_topic: ingestTopicId || null,
            group_match: groupMatch,
            topic_match: topicMatch,
            file_name: msg.document.file_name,
          },
        });
      } catch {}
      if (groupMatch && topicMatch) {
        await handleGroupCvIngest(bot, msg);
        return;
      }

      // Private chat — every CV drop is a recommendation, never a self-score.
      // Self-scoring lives in the Dev Hub. Recommenders are our trust moat;
      // the bot's job in private DM is to ingest CVs under their name.
      if (msg.chat.type === "private") {
        const senderTgId = String(msg.from?.id || msg.chat.id);
        try {
          const { createClient } = await import("@supabase/supabase-js");
          const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
          const { data: senderProfile } = await sb
            .from("profiles")
            .select("id, name, is_recommender, claimed_at")
            .eq("telegram_id", senderTgId)
            .maybeSingle();

          if (senderProfile?.is_recommender && senderProfile?.claimed_at) {
            // Recommender — always ingest under their name.
            await handleRecommenderPrivateCvIngest(bot, msg, { id: senderProfile.id, name: senderProfile.name });
            return;
          }

          // Non-recommender drop — politely redirect to the Dev Hub instead
          // of silently scoring (which created the "your CV got their score"
          // confusion).
          try {
            await bot.sendMessage(
              msg.chat.id,
              [
                `<b>This bot ingests CVs from recommenders.</b>`,
                ``,
                `If you're scoring your own CV, open the <b>Dev Hub</b> below — that's where the scorer + tailoring tools live.`,
                ``,
                `If you meant to recommend someone, ask whoever invited you to send your claim link first.`,
              ].join("\n"),
              { parse_mode: "HTML", disable_web_page_preview: true },
            );
          } catch {}
          return;
        } catch (e) {
          console.warn("[doc-dispatch] recommender lookup failed:", (e as Error).message);
          // On lookup failure, do not self-score the document — silently drop.
          return;
        }
      }

      // Non-private (channel/group not matching ingest topic) — drop silently.
      return;
    }

    // Handle delete-confirmation
    if (msg.text) {
      const state = chatState.get(msg.chat.id);
      if (state && state.startsWith("awaiting_delete_confirm:")) {
        const profileId = state.slice("awaiting_delete_confirm:".length);
        if (msg.text.trim() === "CONFIRM DELETE") {
          await performDelete(bot, msg, profileId);
          return;
        }
        // Anything else cancels
        chatState.delete(msg.chat.id);
        try { await bot.sendMessage(msg.chat.id, "Cancelled. Nothing was deleted."); } catch {}
        return;
      }
      // Capture referral notes after a recommender-private CV ingest.
      if (state && state.startsWith("awaiting_referral_notes:")) {
        const rest = state.slice("awaiting_referral_notes:".length);
        const [attributionId, subjectProfileId] = rest.split(":");
        if (attributionId && subjectProfileId) {
          await handleReferralNotesReply(bot, msg, attributionId, subjectProfileId);
          return;
        }
      }
    }

    // Handle replies to ingest follow-up questions
    if (msg.reply_to_message && msg.text) {
      const replyKey = `${msg.chat.id}:${msg.reply_to_message.message_id}`;
      let pending = pendingIngestFollowups.get(replyKey);
      // Fallback: parse pid=<profileId> from the original followup text (stateless, survives cold starts)
      if (!pending) {
        const refMatch = (msg.reply_to_message.text || "").match(/pid=([0-9a-fA-F-]{36})/);
        if (refMatch) {
          pending = { profileId: refMatch[1], missing: ["Email", "Phone", "Recommended by", "Gender"] };
        }
      }
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
      } else if (payload.startsWith("weblogin_")) {
        await handleWebLoginStart(bot, msg, payload.slice(9));
      } else if (payload.startsWith("ref_")) {
        // Someone tapped a Co-Creator's referral link. Look up the referrer
        // and personalize the onboarding so the new user feels invited.
        const refToken = payload.slice(4);
        await handleReferredStart(bot, msg, refToken);
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
    } else if (text.startsWith("/whereami")) {
      // Admin helper — prints chat and topic id so we can reconfigure the ingest group.
      const threadId = msg.message_thread_id;
      const reply = [
        `<b>Chat ID:</b> <code>${msg.chat.id}</code>`,
        `<b>Chat type:</b> ${msg.chat.type}`,
        threadId ? `<b>Topic (message_thread_id):</b> <code>${threadId}</code>` : `<i>No topic — this is the general chat.</i>`,
        ``,
        `To set this as the ingest location, update Vercel env vars:`,
        `<code>TELEGRAM_INGEST_GROUP_ID=${msg.chat.id}</code>`,
        threadId ? `<code>TELEGRAM_INGEST_TOPIC_ID=${threadId}</code>` : `(no TELEGRAM_INGEST_TOPIC_ID needed — general chat)`,
      ].filter(Boolean).join("\n");
      const replyOpts: any = { parse_mode: "HTML" };
      if (threadId) replyOpts.message_thread_id = threadId;
      try { await bot.sendMessage(msg.chat.id, reply, replyOpts); } catch {}
    } else if (text.startsWith("/help")) {
      await handleHelp(bot, msg);
    } else if (text.startsWith("/subscribe")) {
      await handleSubscribe(bot, msg);
    } else if (text.startsWith("/search")) {
      await handleSearch(bot, msg);
    } else if (text.startsWith("/score")) {
      // /score is removed from the bot — self-scoring lives in the Dev Hub.
      try {
        await bot.sendMessage(
          msg.chat.id,
          [
            `<b>Scoring lives in the Dev Hub now.</b>`,
            ``,
            `Open the <b>Dev Hub</b> below to score, tailor or update your CV.`,
            ``,
            `<i>This private chat is for recommenders to drop CVs they're bringing in — those get ingested under their name.</i>`,
          ].join("\n"),
          { parse_mode: "HTML", disable_web_page_preview: true },
        );
      } catch {}
    } else if (text.startsWith("/profile")) {
      await handleProfile(bot, msg);
    } else if (text.startsWith("/delete") || text.startsWith("/deletemydata")) {
      await handleDelete(bot, msg);
    } else if (text.startsWith("/privacy")) {
      try {
        await bot.sendMessage(msg.chat.id,
          [
            "<b>Your data stays yours.</b>",
            "",
            "• Your CV and profile are visible only to you.",
            "• We never share your info with third parties without your explicit permission.",
            "• Matching to opportunities happens inside our system — your data does not leave.",
            "• You can delete everything anytime. Type <code>/delete</code> and confirm.",
            "",
            "Full policy: https://devidends.net/privacy",
          ].join("\n"),
          { parse_mode: "HTML", disable_web_page_preview: true }
        );
      } catch {}
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
