import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/** GET /api/profile/me — returns the current user's profile, used by the nav bar */
export async function GET() {
  const cookieStore = await cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll() { /* no-op — reading only */ },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "not authenticated" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, name, email, cv_score, cv_structured_data, cv_text")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!profile) return NextResponse.json({ profile: null });

  // Return boolean flags, not the full CV (for privacy + payload size)
  return NextResponse.json({
    profile: {
      id: profile.id,
      name: profile.name,
      email: profile.email,
      cv_score: profile.cv_score,
      cv_structured_data: !!profile.cv_structured_data,
      cv_text: !!profile.cv_text,
    },
  });
}
