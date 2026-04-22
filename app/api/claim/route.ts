import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyInitData } from "@/lib/telegram-auth";
import { logException, trackEvent } from "@/lib/logger";

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * GET /api/claim?token=XXXX — Preview a claimable profile (public, no auth)
 */
export async function GET(req: NextRequest) {
  const token = new URL(req.url).searchParams.get("token");
  if (!token) return NextResponse.json({ error: "token required" }, { status: 400 });

  const sb = getAdmin();
  const { data, error } = await sb
    .from("profiles")
    .select("id, name, headline, sectors, profile_type, claimed_at, email, phone, is_recommender")
    .eq("claim_token", token)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Invalid or expired claim link" }, { status: 404 });
  }

  if (data.claimed_at) {
    return NextResponse.json({ error: "This profile has already been claimed" }, { status: 409 });
  }

  // Recommender extras: count of people they've already brought, and any
  // existing engagement preferences (so we pre-fill the "how you want to
  // engage" step instead of starting blank).
  let recommendedCount = 0;
  let cc: { interests: string[]; ask_frequency: string } | null = null;
  if (data.is_recommender) {
    // Fuzzy count: profiles where recommended_by loosely matches this name.
    const parts = (data.name || "").toLowerCase().split(/\s+/).filter(Boolean);
    if (parts.length > 0) {
      const { data: recs } = await sb
        .from("profiles")
        .select("id, recommended_by")
        .not("recommended_by", "is", null);
      recommendedCount = (recs || []).filter((p: any) => {
        const rb = (p.recommended_by || "").toLowerCase();
        if (!rb.includes(parts[0])) return false;
        if (parts.length === 1) return true;
        return parts.slice(1).some((p: string) => p.length >= 3 && rb.includes(p));
      }).length;
    }

    const { data: ccRow } = await sb
      .from("co_creators")
      .select("interests, ask_frequency")
      .eq("profile_id", data.id)
      .maybeSingle();
    if (ccRow) cc = {
      interests: Array.isArray(ccRow.interests) ? ccRow.interests : [],
      ask_frequency: ccRow.ask_frequency || "weekly",
    };
  }

  return NextResponse.json({
    success: true,
    profile: {
      name: data.name,
      headline: data.headline,
      sectors: data.sectors,
      profile_type: data.profile_type,
      email: data.email,
      phone: data.phone,
      is_recommender: !!data.is_recommender,
      recommended_count: recommendedCount,
      cc_interests: cc?.interests || [],
      cc_ask_frequency: cc?.ask_frequency || "weekly",
    },
  });
}

/**
 * POST /api/claim — Claim a profile by linking Telegram identity
 * Body: { initData, claimToken }
 */
export async function POST(req: NextRequest) {
  try {
    const { initData, claimToken, email, channel, sectors_filter, interests, ask_frequency } = await req.json();

    if (!initData || !claimToken) {
      return NextResponse.json({ error: "initData and claimToken required" }, { status: 400 });
    }

    // Verify Telegram identity
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
      return NextResponse.json({ error: "Bot not configured" }, { status: 500 });
    }
    const verified = verifyInitData(initData, botToken);
    if (!verified) {
      return NextResponse.json({ error: "Invalid Telegram authentication" }, { status: 401 });
    }

    const telegramId = String(verified.user.id);
    const sb = getAdmin();

    // Find the claim profile (atomic: only claim if not already claimed)
    const { data: claimProfile, error: findErr } = await sb
      .from("profiles")
      .select("id, name")
      .eq("claim_token", claimToken)
      .is("claimed_at", null)
      .single();

    if (findErr || !claimProfile) {
      return NextResponse.json({ error: "Invalid, expired, or already claimed link" }, { status: 404 });
    }

    // Check if this Telegram user already has a bare profile (from opening the app)
    const { data: existingProfiles } = await sb
      .from("profiles")
      .select("id, cv_text, source")
      .eq("telegram_id", telegramId);

    // Delete bare TG-created profiles (no CV data) to avoid duplicates
    if (existingProfiles && existingProfiles.length > 0) {
      const bareIds = existingProfiles
        .filter((p: any) => !p.cv_text && p.id !== claimProfile.id)
        .map((p: any) => p.id);
      if (bareIds.length > 0) {
        await sb.from("profiles").delete().in("id", bareIds);
      }
    }

    // Build claim patch — include email if the user set/confirmed one
    const patch: any = {
      telegram_id: telegramId,
      claimed_at: new Date().toISOString(),
      name: claimProfile.name || verified.user.first_name,
    };
    if (email && typeof email === "string") patch.email = email.trim();

    // Claim the profile — set telegram_id, claimed_at, email
    const { error: updateErr } = await sb
      .from("profiles")
      .update(patch)
      .eq("id", claimProfile.id)
      .is("claimed_at", null); // Double-check: only if still unclaimed

    if (updateErr) {
      return NextResponse.json({ error: "Failed to claim profile" }, { status: 500 });
    }

    // Create/update the subscription record so they start receiving briefs
    // immediately on the channel they picked. Unified with the web onboarding.
    const wantTg = channel === "telegram" || channel === "both";
    const wantEmail = (channel === "email" || channel === "both") && email;
    if (wantTg || wantEmail) {
      const subPatch: any = {
        channel: wantTg && wantEmail ? "both" : wantTg ? "telegram" : "email",
        sectors_filter: Array.isArray(sectors_filter) ? sectors_filter : [],
        country_filter: ["Ethiopia"],
        is_active: true,
      };
      if (wantTg) subPatch.telegram_id = telegramId;
      if (wantEmail) subPatch.email = email;

      // Upsert: prefer match by email if present, else telegram_id
      let existingId: string | null = null;
      if (email) {
        const { data } = await sb.from("subscriptions").select("id").eq("email", email).maybeSingle();
        existingId = data?.id || null;
      }
      if (!existingId) {
        const { data } = await sb.from("subscriptions").select("id").eq("telegram_id", telegramId).maybeSingle();
        existingId = data?.id || null;
      }
      if (existingId) {
        await sb.from("subscriptions").update(subPatch).eq("id", existingId);
      } else {
        await sb.from("subscriptions").insert(subPatch);
      }
    }

    // If they're a recommender, save their engagement preferences to the
    // co_creator row so the dashboard + asks are tuned from day one.
    if (Array.isArray(interests) || ask_frequency) {
      const ccPatch: any = {};
      if (Array.isArray(interests)) ccPatch.interests = interests;
      if (ask_frequency) ccPatch.ask_frequency = ask_frequency;
      if (!((await sb.from("co_creators").select("id").eq("profile_id", claimProfile.id).maybeSingle()).data)) {
        // Silently skip if no co_creator row — not a recommender
      } else {
        await sb.from("co_creators").update(ccPatch).eq("profile_id", claimProfile.id);
      }
    }

    trackEvent({ event: "claim_completed", profile_id: claimProfile.id, telegram_id: telegramId, metadata: { token: claimToken, channel: channel || null } });
    return NextResponse.json({
      success: true,
      profile_id: claimProfile.id,
      name: claimProfile.name,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Claim failed";
    logException("api/claim", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
