import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  return createClient(url, key);
}

// Rate limit subscribe endpoint (per IP, 10/hour)
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

export async function POST(req: NextRequest) {
  try {
    // Rate limiting
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    if (!checkSubscribeRate(ip)) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429 }
      );
    }

    const body = await req.json();
    const { email, telegram_id, channel, sectors_filter, donor_filter, country_filter } = body;

    // Validate
    if (!email && !telegram_id) {
      return NextResponse.json(
        { error: "Email or Telegram ID is required" },
        { status: 400 }
      );
    }

    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { error: "Invalid email address" },
        { status: 400 }
      );
    }

    const supabase = getSupabase();

    // Check for existing subscription
    if (email) {
      const { data: existing } = await supabase
        .from("subscriptions")
        .select("id, is_active")
        .eq("email", email)
        .single();

      if (existing) {
        if (existing.is_active) {
          return NextResponse.json(
            { message: "You're already subscribed!", alreadySubscribed: true },
            { status: 200 }
          );
        }
        // Reactivate
        await supabase
          .from("subscriptions")
          .update({ is_active: true, channel: channel || "email" })
          .eq("id", existing.id);

        return NextResponse.json(
          { message: "Welcome back! Your subscription has been reactivated." },
          { status: 200 }
        );
      }
    }

    // Insert new subscription
    const { error } = await supabase.from("subscriptions").insert({
      email: email || null,
      telegram_id: telegram_id || null,
      channel: channel || (email ? "email" : "telegram"),
      sectors_filter: sectors_filter || [],
      donor_filter: donor_filter || [],
      country_filter: country_filter || ["Ethiopia"],
      is_active: true,
    });

    if (error) {
      console.error("Supabase insert error:", error);
      return NextResponse.json(
        { error: "Failed to subscribe. Please try again." },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { message: "Successfully subscribed! You'll receive updates soon." },
      { status: 201 }
    );
  } catch {
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
