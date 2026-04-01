import { NextResponse } from "next/server";

export async function GET() {
  const token = process.env.TELEGRAM_BOT_TOKEN || "";
  return NextResponse.json({
    token_length: token.length,
    token_prefix: token.slice(0, 10),
    token_has_newline: token.includes("\n"),
    token_has_space: token.includes(" "),
    token_has_quote: token.includes('"') || token.includes("'"),
    supabase_url_set: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    node_env: process.env.NODE_ENV,
  });
}
