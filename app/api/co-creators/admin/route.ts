import { NextRequest, NextResponse } from "next/server";
import { getAdmin, generateInviteToken, findProfileByName } from "@/lib/co-creators";

/**
 * Tier system — computed from contribution metrics:
 *   Architect (Gold):  15+ recommendations OR 3+ placements
 *   Catalyst (Silver): 5-14 recommendations OR 1+ placement
 *   Contributor (Bronze): 0-4 recommendations
 */
function computeTier(stats: { cvsSent: number; placements: number; vouchesGiven: number }) {
  if (stats.cvsSent >= 15 || stats.placements >= 3) return "architect";
  if (stats.cvsSent >= 5 || stats.placements >= 1) return "catalyst";
  return "contributor";
}

/** GET — list all co-creators with enriched stats */
export async function GET() {
  const sb = getAdmin();

  const { data: members, error } = await sb
    .from("co_creators")
    .select("*")
    .order("member_number", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!members?.length) return NextResponse.json({ members: [], stats: {} });

  // Get all interactions grouped by co_creator_id
  const { data: interactions } = await sb
    .from("co_creator_interactions")
    .select("co_creator_id, interaction_type, direction, created_at")
    .order("created_at", { ascending: false });

  // Get profiles recommended by each co-creator (by name match on recommended_by)
  const memberNames = members.map((m: any) => m.name);
  const { data: recommendedProfiles } = await sb
    .from("profiles")
    .select("id, recommended_by, cv_score, claimed_at, created_at")
    .in("recommended_by", memberNames);

  // Build stats per member
  const enriched = members.map((m: any) => {
    const myInteractions = (interactions || []).filter((i: any) => i.co_creator_id === m.id);
    const myRecommended = (recommendedProfiles || []).filter(
      (p: any) => p.recommended_by?.toLowerCase() === m.name.toLowerCase()
    );

    const cvsSent = myRecommended.length;
    const placements = 0; // future: track actual placements
    const vouchesGiven = myInteractions.filter((i: any) => i.interaction_type === "vouch").length;
    const torsShared = myInteractions.filter((i: any) => i.interaction_type === "tor_share").length;
    const lastActive = myInteractions[0]?.created_at || m.joined_at || null;
    const avgCvScore = myRecommended.length > 0
      ? Math.round(myRecommended.filter((p: any) => p.cv_score).reduce((a: number, p: any) => a + (p.cv_score || 0), 0) / Math.max(1, myRecommended.filter((p: any) => p.cv_score).length))
      : null;

    const stats = { cvsSent, placements, vouchesGiven, torsShared, avgCvScore, lastActive };
    const tier = computeTier(stats);
    // Contribution score (for leaderboard ranking)
    const score = cvsSent * 10 + placements * 50 + vouchesGiven * 5 + torsShared * 8;

    return {
      ...m,
      stats,
      tier,
      score,
      recentInteractions: myInteractions.slice(0, 5),
    };
  });

  // Global stats
  const totalCvs = enriched.reduce((a: number, m: any) => a + m.stats.cvsSent, 0);
  const totalPlacements = enriched.reduce((a: number, m: any) => a + m.stats.placements, 0);
  const activeThisMonth = enriched.filter((m: any) => {
    if (!m.stats.lastActive) return false;
    const d = new Date(m.stats.lastActive);
    const now = new Date();
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;
  const tierCounts = { architect: 0, catalyst: 0, contributor: 0 };
  for (const m of enriched) tierCounts[m.tier as keyof typeof tierCounts]++;

  return NextResponse.json({
    members: enriched,
    stats: {
      total: enriched.length,
      joined: enriched.filter((m: any) => m.status === "joined").length,
      invited: enriched.filter((m: any) => m.status === "invited").length,
      activeThisMonth,
      totalCvs,
      totalPlacements,
      tierCounts,
    },
  });
}

/** POST — create a new invite { name } */
export async function POST(req: NextRequest) {
  try {
    const { name } = await req.json();
    if (!name || typeof name !== "string") {
      return NextResponse.json({ error: "name required" }, { status: 400 });
    }

    const sb = getAdmin();

    const { data: existing } = await sb
      .from("co_creators")
      .select("member_number")
      .order("member_number", { ascending: false })
      .limit(1);
    const nextNum = (existing && existing[0]?.member_number) ? existing[0].member_number + 1 : 1;

    const matchedProfile = await findProfileByName(name);

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
