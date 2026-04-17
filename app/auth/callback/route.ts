import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  // Handle OAuth errors (e.g., Google provider not configured)
  const errorParam = searchParams.get("error");
  const errorDesc = searchParams.get("error_description");
  if (errorParam) {
    console.error("[auth/callback] OAuth error:", errorParam, errorDesc);
    const msg = encodeURIComponent(errorDesc || errorParam || "Authentication failed");
    return NextResponse.redirect(`${origin}/login?error=${msg}`);
  }

  if (code) {
    const response = NextResponse.redirect(`${origin}${next}`);

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              response.cookies.set(name, value, options)
            );
          },
        },
      }
    );

    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      console.error("[auth/callback] Code exchange failed:", error.message);
      const msg = encodeURIComponent(error.message);
      return NextResponse.redirect(`${origin}/login?error=${msg}`);
    }

    // Link web-auth user to any existing Telegram-created profile by email.
    // Enables seamless sync: CV built on TG appears on web and vice versa.
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.email) {
        const { createClient } = await import("@supabase/supabase-js");
        const admin = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!
        );
        // Find profile by email with no proper user_id link (likely a TG-created profile)
        const { data: orphan } = await admin
          .from("profiles")
          .select("id, user_id, telegram_id")
          .eq("email", user.email)
          .maybeSingle();
        if (orphan && orphan.user_id !== user.id) {
          // Link this profile to the authenticated user
          await admin
            .from("profiles")
            .update({ user_id: user.id })
            .eq("id", orphan.id);
          console.log(`[auth/callback] Linked web user ${user.id} to profile ${orphan.id}${orphan.telegram_id ? ` (TG: ${orphan.telegram_id})` : ""}`);
        }
      }
    } catch (e) {
      console.warn("[auth/callback] Profile link skipped:", e);
    }

    return response;
  }

  // No code — redirect home
  return NextResponse.redirect(`${origin}/`);
}
