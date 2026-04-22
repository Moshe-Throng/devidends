import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as
    | "signup" | "invite" | "magiclink" | "recovery" | "email_change" | "email" | null;
  const next = searchParams.get("next") ?? "/";

  // Handle OAuth errors (e.g., Google provider not configured)
  const errorParam = searchParams.get("error");
  const errorDesc = searchParams.get("error_description");
  if (errorParam) {
    console.error("[auth/callback] OAuth error:", errorParam, errorDesc);
    const msg = encodeURIComponent(errorDesc || errorParam || "Authentication failed");
    return NextResponse.redirect(`${origin}/login?error=${msg}`);
  }

  if (code || (token_hash && type)) {
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

    // Magic link / email OTP flow (token_hash) vs OAuth / PKCE flow (code)
    let authError: { message: string } | null = null;
    if (token_hash && type) {
      const { error } = await supabase.auth.verifyOtp({
        type: type as "signup" | "invite" | "magiclink" | "recovery" | "email_change" | "email",
        token_hash,
      });
      authError = error;
    } else if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      authError = error;
    }

    if (authError) {
      console.error("[auth/callback] Auth exchange failed:", authError.message);
      const msg = encodeURIComponent(authError.message);
      return NextResponse.redirect(`${origin}/login?error=${msg}`);
    }

    // Link web-auth user to any existing Telegram-created profile by email.
    // Case-insensitive match so 'Mussietsegg@gmail.com' (profile) links to
    // 'mussietsegg@gmail.com' (Google auth user). Last-login-wins: always
    // update profile.user_id to the current authenticated user so /profile
    // can find them no matter which auth method they used most recently.
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.email) {
        const { createClient } = await import("@supabase/supabase-js");
        const admin = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!
        );
        const { data: orphan } = await admin
          .from("profiles")
          .select("id, user_id, telegram_id")
          .ilike("email", user.email)
          .maybeSingle();
        if (orphan && orphan.user_id !== user.id) {
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
