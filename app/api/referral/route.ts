import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

/**
 * GET /api/referral?telegram_id=xxx
 * Returns referral code, count, and unlocked rewards.
 */
export async function GET(req: NextRequest) {
  const telegramId = req.nextUrl.searchParams.get("telegram_id");
  const userId = req.nextUrl.searchParams.get("user_id");

  if (!telegramId && !userId) {
    return NextResponse.json({ error: "telegram_id or user_id required" }, { status: 400 });
  }

  const supabase = getSupabase();

  // Get or create referral code from profile
  const matchCol = telegramId ? "telegram_id" : "user_id";
  const matchVal = telegramId || userId;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, referral_code, referral_count")
    .eq(matchCol, matchVal!)
    .maybeSingle();

  if (!profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  // Generate referral code if not exists
  let refCode = profile.referral_code;
  if (!refCode) {
    refCode = generateRefCode();
    await supabase
      .from("profiles")
      .update({ referral_code: refCode })
      .eq("id", profile.id);
  }

  const count = profile.referral_count || 0;

  const rewards = {
    badge_contributor: count >= 3,
    badge_ambassador: count >= 10,
    priority_recruiter: count >= 5,
    analytics_access: count >= 10,
    cv_compare: count >= 1,           // "Compare CV to Job" unlocked at 1 referral
  };

  // Free templates: europass + generic-professional
  // Gated templates: au-standard, wb-standard, un-php, modern-executive (3 referrals)
  const freeTemplates = ["europass", "generic-professional"];
  const gatedTemplates = ["au-standard", "wb-standard", "un-php", "modern-executive"];
  const GATE_THRESHOLD = 3;

  const unlockedTemplates = count >= GATE_THRESHOLD
    ? [...freeTemplates, ...gatedTemplates]
    : freeTemplates;

  return NextResponse.json({
    referral_code: refCode,
    referral_count: count,
    referrals_needed_for_templates: Math.max(0, GATE_THRESHOLD - count),
    rewards,
    unlocked_templates: unlockedTemplates,
    all_templates: [...freeTemplates, ...gatedTemplates],
    share_url: `https://devidends.net/score?ref=${refCode}`,
    share_text: `I scored my CV on Devidends — the AI-powered platform for development professionals. Score yours free: https://devidends.net/score?ref=${refCode}`,
  });
}

/**
 * POST /api/referral — record a referral
 * Body: { referral_code, referred_telegram_id } or { referral_code, referred_user_id }
 */
export async function POST(req: NextRequest) {
  try {
    const { referral_code, referred_telegram_id, referred_user_id } = await req.json();

    if (!referral_code) {
      return NextResponse.json({ error: "referral_code required" }, { status: 400 });
    }
    if (!referred_telegram_id && !referred_user_id) {
      return NextResponse.json({ error: "referred user identifier required" }, { status: 400 });
    }

    const supabase = getSupabase();

    // Find referrer by code
    const { data: referrer } = await supabase
      .from("profiles")
      .select("id, telegram_id, referral_count")
      .eq("referral_code", referral_code)
      .maybeSingle();

    if (!referrer) {
      return NextResponse.json({ error: "Invalid referral code" }, { status: 404 });
    }

    // Find referred user
    const refCol = referred_telegram_id ? "telegram_id" : "user_id";
    const refVal = referred_telegram_id || referred_user_id;

    const { data: referred } = await supabase
      .from("profiles")
      .select("id, referred_by")
      .eq(refCol, String(refVal))
      .maybeSingle();

    if (!referred) {
      return NextResponse.json({ error: "Referred user not found" }, { status: 404 });
    }

    // Don't self-refer
    if (referred.id === referrer.id) {
      return NextResponse.json({ error: "Cannot refer yourself" }, { status: 400 });
    }

    // Don't double-count
    if (referred.referred_by) {
      return NextResponse.json({ message: "Already referred", already: true });
    }

    // Record referral
    await supabase
      .from("profiles")
      .update({ referred_by: referrer.id })
      .eq("id", referred.id);

    // Increment referrer's count
    const newCount = (referrer.referral_count || 0) + 1;
    await supabase
      .from("profiles")
      .update({ referral_count: newCount })
      .eq("id", referrer.id);

    return NextResponse.json({
      message: "Referral recorded!",
      new_count: newCount,
    });
  } catch {
    return NextResponse.json({ error: "Referral failed" }, { status: 500 });
  }
}

function generateRefCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}
