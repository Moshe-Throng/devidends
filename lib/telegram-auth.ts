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

    if (computed !== hash) {
      console.error("[telegram-auth] Hash mismatch. computed:", computed.slice(0, 16), "expected:", hash.slice(0, 16));
      return null;
    }

    // Parse user from verified params
    const userStr = params.get("user");
    if (!userStr) return null;

    const user: TelegramUser = JSON.parse(userStr);
    const authDate = parseInt(params.get("auth_date") || "0", 10);

    // Reject data older than 7 days (generous for mini app sessions)
    const now = Math.floor(Date.now() / 1000);
    const age = now - authDate;
    if (age > 7 * 86400) {
      console.error("[telegram-auth] initData too old:", age, "seconds");
      return null;
    }

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
    "phone", "cv_structured_data", "cv_score", "cv_score_data", "cv_score_hash",
    "nationality", "city", "languages", "certifications", "education_level",
    "photo_file_id",
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
      // Merge: keep the profile with more data (CV data wins)
      const { data: tgProfile } = await supabase
        .from("profiles")
        .select("*")
        .eq("telegram_id", telegramId)
        .single();

      // Decide which profile to keep: the one with cv_structured_data
      const tgHasCv = !!tgProfile?.cv_structured_data;
      const webHasCv = !!webProfile.cv_structured_data;
      const keepProfile = tgHasCv ? tgProfile : webProfile;
      const deleteProfile = tgHasCv ? webProfile : tgProfile;

      // Merge: copy any missing fields from the deleted profile to the keeper
      const mergeFields: Record<string, unknown> = {
        telegram_id: telegramId,
        telegram_username: tgProfile?.telegram_username || null,
        email: safeUpdates.email as string,
        user_id: webProfile.user_id || tgProfile?.user_id || null,
        ...safeUpdates,
      };

      // Copy non-null fields from deleteProfile that are null on keepProfile
      for (const key of ["cv_structured_data", "cv_text", "cv_score", "headline", "sectors", "donors", "countries", "skills", "qualifications", "nationality", "languages", "phone"]) {
        if (!keepProfile[key] && deleteProfile?.[key]) {
          mergeFields[key] = deleteProfile[key];
        }
      }

      await supabase
        .from("profiles")
        .update(mergeFields)
        .eq("id", keepProfile.id);

      // Delete the duplicate
      if (deleteProfile && deleteProfile.id !== keepProfile.id) {
        await supabase
          .from("profiles")
          .delete()
          .eq("id", deleteProfile.id);
      }

      const { data: merged } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", keepProfile.id)
        .single();

      return merged;
    }
  }

  // When cv_structured_data is saved, extract profile-level fields + check ownership
  if (safeUpdates.cv_structured_data && typeof safeUpdates.cv_structured_data === "object") {
    const cv = safeUpdates.cv_structured_data as any;
    const p = cv.personal || {};
    if (p.nationality && !safeUpdates.nationality) safeUpdates.nationality = p.nationality;
    if (p.phone && !safeUpdates.phone) safeUpdates.phone = p.phone;
    if (p.email && !safeUpdates.email) safeUpdates.email = p.email;
    if ((p.address || p.country_of_residence)) safeUpdates.city = p.address || p.country_of_residence;
    if (cv.languages?.length > 0) safeUpdates.languages = cv.languages.map((l: any) => l.language).filter(Boolean);
    if (cv.certifications?.filter(Boolean).length > 0) safeUpdates.certifications = cv.certifications.filter(Boolean);
    // Derive education level
    const degrees = (cv.education || []).map((e: any) => e.degree || "");
    const eduLevel = degrees.some((d: string) => /PhD|Doctorate/i.test(d)) ? "PhD"
      : degrees.some((d: string) => /Master|MSc|MA|MBA|MPH|MPA/i.test(d)) ? "Masters"
      : degrees.some((d: string) => /Bachelor|BSc|BA|BEng|LLB/i.test(d)) ? "Bachelors"
      : degrees.some((d: string) => /Diploma/i.test(d)) ? "Diploma" : null;
    if (eduLevel) safeUpdates.education_level = eduLevel;
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
