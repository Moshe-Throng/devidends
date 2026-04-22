import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * GET /api/auth/web-login/check?token=…
 *
 * Polling endpoint. Returns the magic-link token_hash once the bot has
 * confirmed the user's identity on the other side, or { ready: false }.
 * Each successful read marks the row as used so the token can't be reused.
 */
export async function GET(req: NextRequest) {
  const token = new URL(req.url).searchParams.get("token");
  if (!token) return NextResponse.json({ error: "token required" }, { status: 400 });

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data, error } = await sb
    .from("login_tokens")
    .select("token, magic_token_hash, email, expires_at, used_at")
    .eq("token", token)
    .maybeSingle();

  if (error) {
    console.error("[web-login/check] fetch failed:", error);
    return NextResponse.json({ error: "Check failed" }, { status: 500 });
  }
  if (!data) return NextResponse.json({ ready: false, missing: true });

  if (data.used_at) return NextResponse.json({ ready: false, used: true });
  if (new Date(data.expires_at) < new Date()) {
    return NextResponse.json({ ready: false, expired: true });
  }

  if (!data.magic_token_hash) return NextResponse.json({ ready: false });

  // One-shot: mark used and return the hash.
  await sb
    .from("login_tokens")
    .update({ used_at: new Date().toISOString() })
    .eq("token", token);

  return NextResponse.json({
    ready: true,
    magic_token_hash: data.magic_token_hash,
    email: data.email,
  });
}
