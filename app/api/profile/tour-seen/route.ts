import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";

/**
 * POST /api/profile/tour-seen
 *
 * Marks the current user's hub tour as completed by setting
 * onboarding_stage = "hub_tour_seen". Idempotent — the tour component
 * fires this fire-and-forget on every completion. The check at hub
 * load time (`profile.onboarding_stage !== "new"`) is what actually
 * suppresses the tour next time.
 */
export async function POST() {
  const cookieStore = await cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll() { /* no-op */ },
      },
    },
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "not authenticated" }, { status: 401 });

  // Use the admin client for the update so RLS doesn't block — we've
  // already verified the requester via the auth-getUser call above.
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { error } = await admin
    .from("profiles")
    .update({ onboarding_stage: "hub_tour_seen" })
    .eq("user_id", user.id);

  if (error) {
    console.warn("[tour-seen] update failed:", error.message);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
