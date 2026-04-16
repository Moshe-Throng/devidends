import { NextRequest, NextResponse } from "next/server";
import { getAdmin, generateInviteToken, findProfileByName } from "@/lib/co-creators";

/** GET — list all co-creators (admin) */
export async function GET() {
  const sb = getAdmin();
  const { data, error } = await sb
    .from("co_creators")
    .select("*")
    .order("member_number", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ members: data || [] });
}

/** POST — create a new invite { name } */
export async function POST(req: NextRequest) {
  try {
    const { name } = await req.json();
    if (!name || typeof name !== "string") {
      return NextResponse.json({ error: "name required" }, { status: 400 });
    }

    const sb = getAdmin();

    // Assign next member_number
    const { data: existing } = await sb
      .from("co_creators")
      .select("member_number")
      .order("member_number", { ascending: false })
      .limit(1);
    const nextNum = (existing && existing[0]?.member_number) ? existing[0].member_number + 1 : 1;

    // Fuzzy match to existing profile
    const matchedProfile = await findProfileByName(name);

    // Generate unique token (retry if collision)
    let token = generateInviteToken();
    for (let i = 0; i < 3; i++) {
      const { data: clash } = await sb.from("co_creators").select("id").eq("invite_token", token).maybeSingle();
      if (!clash) break;
      token = generateInviteToken();
    }

    const { data: created, error } = await sb
      .from("co_creators")
      .insert({
        name: name.trim(),
        invite_token: token,
        member_number: nextNum,
        profile_id: matchedProfile?.id || null,
        email: (matchedProfile as any)?.email || null,
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({
      success: true,
      member: created,
      matchedProfile: matchedProfile ? { id: matchedProfile.id, name: matchedProfile.name } : null,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
