import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "@/lib/co-creators";

/**
 * GET /api/co-creators/invite?token=XXXX
 * Returns the invite record + matched profile preview (for claim prompt).
 */
export async function GET(req: NextRequest) {
  const token = new URL(req.url).searchParams.get("token");
  if (!token) return NextResponse.json({ error: "token required" }, { status: 400 });

  const sb = getAdmin();
  const { data, error } = await sb
    .from("co_creators")
    .select("id, name, email, whatsapp_number, role_title, status, joined_at, profile_id, member_number")
    .eq("invite_token", token)
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({ error: "Invalid invite link" }, { status: 404 });
  }

  let profile = null;
  if (data.profile_id) {
    const { data: p } = await sb
      .from("profiles")
      .select("id, name, headline, sectors, cv_score, claimed_at, profile_type, email, phone")
      .eq("id", data.profile_id)
      .maybeSingle();
    profile = p;
  }

  return NextResponse.json({
    success: true,
    invite: data,
    profile,
    alreadyJoined: data.status === "joined",
  });
}

/**
 * POST /api/co-creators/invite
 * Body: { token, form fields... }
 * Saves the form submission, marks invite as joined, logs interaction.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      token,
      email,
      whatsapp_number,
      linkedin_url,
      role_title,
      years_in_sector,
      preferred_channel,
      ask_frequency,
      preferred_sectors,
      regions,
      interests,
      network_size,
      sharing_channels,
      suggested_invites,
      notes,
      cv_claim_requested,
    } = body || {};

    if (!token) return NextResponse.json({ error: "token required" }, { status: 400 });
    if (!preferred_channel) return NextResponse.json({ error: "preferred_channel required" }, { status: 400 });

    const sb = getAdmin();

    const { data: invite, error: findErr } = await sb
      .from("co_creators")
      .select("id, name, profile_id, status")
      .eq("invite_token", token)
      .maybeSingle();

    if (findErr || !invite) {
      return NextResponse.json({ error: "Invalid invite link" }, { status: 404 });
    }

    if (invite.status === "joined") {
      return NextResponse.json({ error: "This invite has already been accepted" }, { status: 409 });
    }

    const update = {
      email: email || null,
      whatsapp_number: whatsapp_number || null,
      linkedin_url: linkedin_url || null,
      role_title: role_title || null,
      years_in_sector: years_in_sector ? Number(years_in_sector) : null,
      preferred_channel,
      ask_frequency: ask_frequency || "weekly",
      preferred_sectors: Array.isArray(preferred_sectors) ? preferred_sectors : [],
      regions: Array.isArray(regions) ? regions : [],
      interests: Array.isArray(interests) ? interests : [],
      network_size: network_size || null,
      sharing_channels: Array.isArray(sharing_channels) ? sharing_channels : [],
      suggested_invites: suggested_invites || null,
      notes: notes || null,
      cv_claim_requested: !!cv_claim_requested,
      consent_granted_at: new Date().toISOString(),
      joined_at: new Date().toISOString(),
      status: "joined",
      updated_at: new Date().toISOString(),
    };

    const { error: updErr } = await sb
      .from("co_creators")
      .update(update)
      .eq("id", invite.id);

    if (updErr) {
      return NextResponse.json({ error: updErr.message }, { status: 500 });
    }

    // Log interaction
    await sb.from("co_creator_interactions").insert({
      co_creator_id: invite.id,
      direction: "inbound",
      interaction_type: "accepted_invite",
      channel: "web",
      content: `${invite.name} accepted Co-Creator invite`,
      metadata: { preferred_channel, ask_frequency, interests_count: (interests || []).length },
    });

    // Notify admin on Telegram
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const adminIds = (process.env.ADMIN_TELEGRAM_IDS || "297659579").split(",").map(s => s.trim());
    if (botToken) {
      const msg = [
        `<b>🌱 New Co-Creator joined</b>`,
        ``,
        `<b>${invite.name}</b>`,
        `Channel: ${preferred_channel} · ${ask_frequency || "weekly"}`,
        `Sectors: ${(preferred_sectors || []).slice(0, 3).join(", ") || "—"}`,
        `Interests: ${(interests || []).length} selected`,
        email ? `Email: ${email}` : null,
        whatsapp_number ? `WhatsApp: ${whatsapp_number}` : null,
        cv_claim_requested ? `<i>Requested to claim their profile</i>` : null,
      ].filter(Boolean).join("\n");

      for (const id of adminIds) {
        try {
          await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chat_id: id, text: msg, parse_mode: "HTML" }),
          });
        } catch {}
      }
    }

    return NextResponse.json({
      success: true,
      name: invite.name,
      profileId: invite.profile_id,
      cvClaimRequested: !!cv_claim_requested,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Server error" }, { status: 500 });
  }
}
