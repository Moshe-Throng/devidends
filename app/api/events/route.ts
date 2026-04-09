import { NextRequest, NextResponse } from "next/server";
import { trackEvent } from "@/lib/logger";

/**
 * POST /api/events — client-side event tracking endpoint
 * Body: { event, telegram_id?, profile_id?, metadata? }
 */
export async function POST(req: NextRequest) {
  try {
    const { event, telegram_id, profile_id, metadata } = await req.json();
    if (!event) {
      return NextResponse.json({ error: "event required" }, { status: 400 });
    }

    trackEvent({
      event,
      telegram_id: telegram_id || undefined,
      profile_id: profile_id || undefined,
      metadata: metadata || {},
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: true }); // never fail client tracking
  }
}
