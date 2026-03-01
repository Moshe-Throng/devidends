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

    return response;
  }

  // No code — redirect home
  return NextResponse.redirect(`${origin}/`);
}
