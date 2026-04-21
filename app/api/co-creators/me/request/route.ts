import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createClient as createAdmin } from "@supabase/supabase-js";

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "sheklave@gmail.com,mussietsegg@gmail.com")
  .split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);

export async function POST(req: NextRequest) {
  const { service, note } = await req.json();
  if (!service) return NextResponse.json({ error: "service required" }, { status: 400 });

  const cookieStore = await cookies();
  const supa = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  );
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!ADMIN_EMAILS.includes((user.email || "").toLowerCase())) {
    return NextResponse.json({ error: "Not enabled yet" }, { status: 403 });
  }

  const sb = createAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data: profile } = await sb.from("profiles").select("id").eq("user_id", user.id).maybeSingle();
  if (!profile) return NextResponse.json({ error: "No profile" }, { status: 404 });
  const { data: cc } = await sb.from("co_creators").select("id, name").eq("profile_id", profile.id).maybeSingle();
  if (!cc) return NextResponse.json({ error: "Not a Co-Creator" }, { status: 404 });

  // Log as a co_creator_interaction
  await sb.from("co_creator_interactions").insert({
    co_creator_id: cc.id,
    direction: "inbound",
    interaction_type: "service_request",
    channel: "web_dashboard",
    content: `Requested: ${service}${note ? ` — ${note}` : ""}`,
    metadata: { service, note: note || null },
  });

  // Notify admin on Telegram
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const adminIds = (process.env.ADMIN_TELEGRAM_IDS || "297659579").split(",").map((s) => s.trim());
  if (botToken) {
    const msg = `🛎 <b>Service request</b>\n\n<b>${cc.name}</b>\nRequested: <b>${service}</b>${note ? `\nNote: ${note}` : ""}`;
    for (const id of adminIds) {
      fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: id, text: msg, parse_mode: "HTML" }),
      }).catch(() => {});
    }
  }

  return NextResponse.json({ success: true });
}
