import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyInitData } from "@/lib/telegram-auth";

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const sb = getAdmin();
    let profileId: string | null = null;

    if (body.initData) {
      const botToken = process.env.TELEGRAM_BOT_TOKEN;
      if (!botToken) return NextResponse.json({ error: "Not configured" }, { status: 500 });
      const verified = verifyInitData(body.initData, botToken);
      if (!verified) return NextResponse.json({ error: "Invalid auth" }, { status: 401 });
      const { data } = await sb.from("profiles").select("id").eq("telegram_id", String(verified.user.id)).single();
      profileId = data?.id || null;
    } else if (body.userId) {
      const { data } = await sb.from("profiles").select("id").eq("user_id", body.userId).single();
      profileId = data?.id || null;
    }

    if (!profileId) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

    await (sb.from("cv_scores") as any).delete().eq("profile_id", profileId);
    await (sb.from("events") as any).delete().eq("profile_id", profileId);
    await sb.from("profiles").delete().eq("id", profileId);

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }
}
