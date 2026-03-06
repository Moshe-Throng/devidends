import { NextRequest, NextResponse } from "next/server";
import { createHmac, createHash } from "crypto";
import { createClient } from "@supabase/supabase-js";

interface TelegramWidgetUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
}

/**
 * Verify Telegram Login Widget hash.
 * Different from Mini App — uses SHA256(botToken) as the secret key.
 */
function verifyWidgetHash(data: TelegramWidgetUser, botToken: string): boolean {
  try {
    const { hash, ...fields } = data;
    const dataCheckString = Object.entries(fields)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join("\n");

    const secret = createHash("sha256").update(botToken).digest();
    const computed = createHmac("sha256", secret)
      .update(dataCheckString)
      .digest("hex");

    if (computed !== hash) return false;

    // Reject data older than 24 hours
    const now = Math.floor(Date.now() / 1000);
    if (now - data.auth_date > 86400) return false;

    return true;
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  try {
    const body: TelegramWidgetUser = await req.json();

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
      return NextResponse.json({ error: "Bot not configured" }, { status: 500 });
    }

    if (!verifyWidgetHash(body, botToken)) {
      return NextResponse.json({ error: "Invalid Telegram data" }, { status: 401 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const telegramId = String(body.id);
    const fullName = [body.first_name, body.last_name].filter(Boolean).join(" ");
    const syntheticEmail = `tg_${telegramId}@users.devidends.app`;

    // Find or create Supabase auth user
    let supabaseUserId: string;

    const { data: listData } = await supabase.auth.admin.listUsers();
    const existingUser = listData?.users?.find((u) => u.email === syntheticEmail);

    if (existingUser) {
      supabaseUserId = existingUser.id;
    } else {
      const { data: created, error: createErr } = await supabase.auth.admin.createUser({
        email: syntheticEmail,
        email_confirm: true,
        user_metadata: {
          telegram_id: telegramId,
          name: fullName,
          username: body.username,
        },
      });
      if (createErr || !created.user) {
        return NextResponse.json({ error: "Failed to create user" }, { status: 500 });
      }
      supabaseUserId = created.user.id;
    }

    // Link Supabase user to profile (if profile exists via telegram_id)
    await supabase
      .from("profiles")
      .update({ user_id: supabaseUserId })
      .eq("telegram_id", telegramId)
      .is("user_id", null);

    // Generate magic link token
    const { data: linkData, error: linkErr } = await supabase.auth.admin.generateLink({
      type: "magiclink",
      email: syntheticEmail,
    });

    if (linkErr || !linkData?.properties?.hashed_token) {
      return NextResponse.json({ error: "Failed to generate session" }, { status: 500 });
    }

    return NextResponse.json({
      token_hash: linkData.properties.hashed_token,
      email: syntheticEmail,
    });
  } catch (err) {
    console.error("[telegram-web auth]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
