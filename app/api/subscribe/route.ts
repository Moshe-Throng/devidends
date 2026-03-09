import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  return createClient(url, key);
}

const subscribeRateLimit = new Map<string, { count: number; resetAt: number }>();
function checkSubscribeRate(ip: string): boolean {
  const now = Date.now();
  const entry = subscribeRateLimit.get(ip);
  if (!entry || now > entry.resetAt) {
    subscribeRateLimit.set(ip, { count: 1, resetAt: now + 60 * 60 * 1000 });
    return true;
  }
  if (entry.count >= 10) return false;
  entry.count++;
  return true;
}

/** GET /api/subscribe?telegram_id=xxx — fetch existing subscription */
export async function GET(req: NextRequest) {
  const telegramId = req.nextUrl.searchParams.get("telegram_id");
  const email = req.nextUrl.searchParams.get("email");
  if (!telegramId && !email) {
    return NextResponse.json({ error: "telegram_id or email required" }, { status: 400 });
  }
  const supabase = getSupabase();
  const query = supabase
    .from("subscriptions")
    .select("sectors_filter, news_categories_filter, news_sectors_filter, country_filter, work_type_filter, frequency, is_active");

  const { data } = await (telegramId
    ? query.eq("telegram_id", telegramId).eq("is_active", true).single()
    : query.eq("email", email!).eq("is_active", true).single());

  return NextResponse.json({ subscription: data || null });
}

/** POST /api/subscribe — create or update subscription */
export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    if (!checkSubscribeRate(ip)) {
      return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });
    }

    const body = await req.json();
    const {
      email,
      telegram_id,
      channel,
      sectors_filter,
      news_categories_filter,
      news_sectors_filter,
      donor_filter,
      country_filter,
      work_type_filter,
      frequency,
    } = body;

    if (!email && !telegram_id) {
      return NextResponse.json({ error: "Email or Telegram ID is required" }, { status: 400 });
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Invalid email address" }, { status: 400 });
    }

    const supabase = getSupabase();

    const payload: Record<string, unknown> = {
      channel: channel || (email ? "email" : "telegram"),
      sectors_filter: sectors_filter || [],
      donor_filter: donor_filter || [],
      country_filter: country_filter || ["Ethiopia"],
      work_type_filter: work_type_filter || [],
      frequency: frequency || "daily",
      is_active: true,
      ...(news_categories_filter !== undefined && { news_categories_filter }),
      ...(news_sectors_filter !== undefined && { news_sectors_filter }),
    };

    const matchCol = email ? "email" : "telegram_id";
    const matchVal = email || telegram_id;
    const { data: existing } = await supabase
      .from("subscriptions")
      .select("id")
      .eq(matchCol, matchVal)
      .single();

    if (existing) {
      let { error } = await supabase.from("subscriptions").update(payload).eq("id", existing.id);
      if (error?.message?.includes("news_categories_filter")) {
        // Column not yet migrated — save without it
        const { news_categories_filter: _ncf, ...rest } = payload;
        void _ncf;
        ({ error } = await supabase.from("subscriptions").update(rest).eq("id", existing.id));
      }
      if (error) return NextResponse.json({ error: "Failed to update." }, { status: 500 });
      return NextResponse.json({ message: "Preferences saved!", updated: true });
    }

    const insertPayload: Record<string, unknown> = { email: email || null, telegram_id: telegram_id || null, ...payload };
    let { error } = await supabase.from("subscriptions").insert(insertPayload);
    if (error?.message?.includes("news_categories_filter")) {
      const { news_categories_filter: _ncf, ...rest } = insertPayload;
      void _ncf;
      ({ error } = await supabase.from("subscriptions").insert(rest));
    }
    if (error) return NextResponse.json({ error: "Failed to subscribe." }, { status: 500 });

    return NextResponse.json({ message: "Subscribed! You'll receive daily alerts.", created: true }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
