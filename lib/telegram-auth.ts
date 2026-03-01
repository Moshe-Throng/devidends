import { createHmac } from "crypto";
import { createClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// Telegram Mini App initData verification
// ---------------------------------------------------------------------------

export interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: boolean;
  photo_url?: string;
}

export interface VerifiedInitData {
  user: TelegramUser;
  auth_date: number;
  hash: string;
  query_id?: string;
  start_param?: string;
}

/**
 * Verify Telegram Mini App initData using HMAC-SHA256.
 * See: https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 */
export function verifyInitData(
  initDataRaw: string,
  botToken: string
): VerifiedInitData | null {
  try {
    const params = new URLSearchParams(initDataRaw);
    const hash = params.get("hash");
    if (!hash) return null;

    // Remove hash from params
    params.delete("hash");

    // Sort params alphabetically and build data-check-string
    const dataCheckString = Array.from(params.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join("\n");

    // HMAC-SHA256 with "WebAppData" + bot token
    const secretKey = createHmac("sha256", "WebAppData")
      .update(botToken)
      .digest();
    const computed = createHmac("sha256", secretKey)
      .update(dataCheckString)
      .digest("hex");

    if (computed !== hash) return null;

    // Parse user from verified params
    const userStr = params.get("user");
    if (!userStr) return null;

    const user: TelegramUser = JSON.parse(userStr);
    const authDate = parseInt(params.get("auth_date") || "0", 10);

    // Reject data older than 24 hours
    const now = Math.floor(Date.now() / 1000);
    if (now - authDate > 86400) return null;

    return {
      user,
      auth_date: authDate,
      hash,
      query_id: params.get("query_id") || undefined,
      start_param: params.get("start_param") || undefined,
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Profile lookup / creation for Telegram users
// ---------------------------------------------------------------------------

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

/**
 * Find or create a profile for a Telegram user.
 * Returns the profile data that the Mini App can use.
 */
export async function getOrCreateTelegramProfile(user: TelegramUser) {
  const supabase = getSupabaseAdmin();
  const telegramId = String(user.id);

  // Try to find existing profile by telegram_id
  const { data: existing } = await supabase
    .from("profiles")
    .select("*")
    .eq("telegram_id", telegramId)
    .single();

  if (existing) {
    // Update name/username if changed
    const updates: Record<string, string | null> = {};
    const fullName = [user.first_name, user.last_name]
      .filter(Boolean)
      .join(" ");
    if (existing.name !== fullName) updates.name = fullName;
    if (user.username && existing.telegram_username !== user.username) {
      updates.telegram_username = user.username;
    }

    if (Object.keys(updates).length > 0) {
      await supabase
        .from("profiles")
        .update(updates)
        .eq("id", existing.id);
    }

    return existing;
  }

  // Also check by telegram_username
  if (user.username) {
    const { data: byUsername } = await supabase
      .from("profiles")
      .select("*")
      .eq("telegram_username", user.username)
      .single();

    if (byUsername) {
      // Link telegram_id to existing profile
      await supabase
        .from("profiles")
        .update({ telegram_id: telegramId })
        .eq("id", byUsername.id);

      return { ...byUsername, telegram_id: telegramId };
    }
  }

  // Create new profile for Telegram user
  const fullName = [user.first_name, user.last_name]
    .filter(Boolean)
    .join(" ");

  // Try inserting without user_id first (nullable after migration)
  // Falls back to synthetic user_id if column requires NOT NULL
  let insertPayload: Record<string, unknown> = {
    name: fullName,
    telegram_id: telegramId,
    telegram_username: user.username || null,
    source: "telegram",
    sectors: [],
    donors: [],
    countries: [],
    skills: [],
    profile_score_pct: 10, // Just having a name = 10%
    version: 1,
    is_public: false,
  };

  let { data: newProfile, error } = await supabase
    .from("profiles")
    .insert(insertPayload)
    .select()
    .single();

  // If it failed because user_id is NOT NULL, retry with a synthetic UUID
  if (error && (error.message.includes("null") || error.message.includes("not-null") || error.code === "23502")) {
    console.warn("[telegram-auth] user_id NOT NULL — retrying with synthetic UUID");
    insertPayload.user_id = `tg_${user.id}`;
    const retry = await supabase
      .from("profiles")
      .insert(insertPayload)
      .select()
      .single();
    newProfile = retry.data;
    error = retry.error;
  }

  if (error) {
    console.error("[telegram-auth] Insert failed:", error.code, error.message, error.details);
    throw new Error(`Failed to create Telegram profile: ${error.message}`);
  }

  return newProfile;
}

/**
 * Update a Telegram user's profile fields.
 */
export async function updateTelegramProfile(
  telegramId: string,
  updates: Record<string, unknown>
) {
  const supabase = getSupabaseAdmin();

  // Only allow safe fields
  const allowed = [
    "headline", "sectors", "donors", "countries", "skills",
    "qualifications", "linkedin_url", "email", "years_of_experience",
    "phone",
  ];
  const safeUpdates: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in updates) {
      safeUpdates[key] = updates[key];
    }
  }

  // If email is being set, check if a web profile exists with that email → merge
  if (safeUpdates.email && typeof safeUpdates.email === "string") {
    const { data: webProfile } = await supabase
      .from("profiles")
      .select("*")
      .eq("email", safeUpdates.email)
      .neq("telegram_id", telegramId)
      .single();

    if (webProfile) {
      // Merge: link TG identity to the existing web profile
      const { data: tgProfile } = await supabase
        .from("profiles")
        .select("telegram_username")
        .eq("telegram_id", telegramId)
        .single();

      await supabase
        .from("profiles")
        .update({
          telegram_id: telegramId,
          telegram_username: tgProfile?.telegram_username || null,
          ...safeUpdates,
        })
        .eq("id", webProfile.id);

      // Delete the old TG-only profile to avoid duplicates
      await supabase
        .from("profiles")
        .delete()
        .eq("telegram_id", telegramId)
        .neq("id", webProfile.id);

      const { data: merged } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", webProfile.id)
        .single();

      return merged;
    }
  }

  // Recalculate profile completeness
  const fields = ["headline", "sectors", "donors", "countries", "skills", "qualifications", "linkedin_url"];
  let filled = 1; // name always counts
  for (const f of fields) {
    const val = safeUpdates[f] ?? undefined;
    if (Array.isArray(val) ? val.length > 0 : val) filled++;
  }
  safeUpdates.profile_score_pct = Math.round((filled / (fields.length + 1)) * 100);

  const { data, error } = await supabase
    .from("profiles")
    .update(safeUpdates)
    .eq("telegram_id", telegramId)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to update profile: ${error.message}`);
  }

  return data;
}
