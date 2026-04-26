import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ token: string }>;
}

/**
 * Magic-link landing for the universal claim flow.
 * The user has just authenticated via Supabase magic link; we attach their
 * auth user_id to the profile that owns this claim_token, set claimed_at,
 * then bounce to the hub.
 *
 * If the auth session didn't materialise (link expired, browser blocked
 * cookies), we render an error state with retry.
 */
export default async function ClaimFinalizePage({ params }: PageProps) {
  const { token } = await params;
  const cookieStore = await cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll() {
          // No-op on server component — auth callback already wrote the cookies.
        },
      },
    },
  );

  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return (
      <main className="min-h-screen bg-gradient-to-b from-dark-50 to-white flex items-center justify-center px-6 py-20">
        <div className="max-w-md w-full text-center bg-white rounded-2xl border border-dark-100 p-10">
          <h1 className="text-xl font-bold text-dark-900 mb-3">Couldn&apos;t verify the link</h1>
          <p className="text-dark-600 mb-6">
            Magic links expire after 10 minutes. Go back and request a new one.
          </p>
          <a
            href={`/claim/${token}`}
            className="inline-block px-6 py-3 bg-cyan-500 text-white font-bold rounded-xl"
          >
            Try again
          </a>
        </div>
      </main>
    );
  }

  // Attach the auth user to the profile that owns this claim_token, set
  // claimed_at if not yet, capture the email if missing.
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: profile } = await admin
    .from("profiles")
    .select("id, email, claimed_at, user_id, is_recommender")
    .eq("claim_token", token)
    .maybeSingle();

  if (!profile) {
    redirect("/");
  }

  const now = new Date().toISOString();
  const updates: Record<string, string> = {};
  if (!profile.user_id) updates.user_id = user.id;
  if (!profile.email && user.email) updates.email = user.email;
  if (!profile.claimed_at) updates.claimed_at = now;

  if (Object.keys(updates).length > 0) {
    await admin.from("profiles").update(updates).eq("id", profile.id);
  }

  // Mirror to co_creators for recommenders so the dashboard counters move.
  if (profile.is_recommender && !profile.claimed_at) {
    await admin
      .from("co_creators")
      .update({ status: "joined", claimed_at: now })
      .eq("profile_id", profile.id);
  }

  // Land them in the hub. /tg-app works in a regular browser too.
  redirect("/tg-app");
}
