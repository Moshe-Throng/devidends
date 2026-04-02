import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * POST /api/claim/web — Claim a profile via web (email auth)
 * Body: { claimToken, userId }
 */
export async function POST(req: NextRequest) {
  try {
    const { claimToken, userId } = await req.json();

    if (!claimToken || !userId) {
      return NextResponse.json({ error: "claimToken and userId required" }, { status: 400 });
    }

    const sb = getAdmin();

    // Find the claim profile (only if unclaimed)
    const { data: claimProfile, error: findErr } = await sb
      .from("profiles")
      .select("id, name")
      .eq("claim_token", claimToken)
      .is("claimed_at", null)
      .single();

    if (findErr || !claimProfile) {
      return NextResponse.json({ error: "Invalid, expired, or already claimed link" }, { status: 404 });
    }

    // Get the user's email from Supabase Auth
    const { data: authUser } = await sb.auth.admin.getUserById(userId);
    const email = authUser?.user?.email || null;

    // Claim: set user_id, email, claimed_at
    const { error: updateErr } = await sb
      .from("profiles")
      .update({
        user_id: userId,
        email: email,
        claimed_at: new Date().toISOString(),
      })
      .eq("id", claimProfile.id)
      .is("claimed_at", null);

    if (updateErr) {
      return NextResponse.json({ error: "Failed to claim profile" }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      profile_id: claimProfile.id,
      name: claimProfile.name,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Claim failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
