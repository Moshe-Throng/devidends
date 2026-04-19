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

  // Get linked profile claim status for each co_creator
  const profileIds = members.map((m: any) => m.profile_id).filter(Boolean);
  const profileStatus: Record<string, { claimed_at: string | null; has_user: boolean; cv_score: number | null }> = {};
  if (profileIds.length) {
    const { data: profs } = await sb
      .from("profiles")
      .select("id, claimed_at, user_id, cv_score")
      .in("id", profileIds);
    for (const p of profs || []) {
      profileStatus[p.id] = { claimed_at: p.claimed_at, has_user: !!p.user_id, cv_score: p.cv_score };
    }
  }

  // Get all interactions grouped by co_creator_id
  const { data: interactions } = await sb
    .from("co_creator_interactions")
    .select("co_creator_id, interaction_type, direction, created_at")
    .order("created_at", { ascending: false });

  // Get profiles recommended by each co-creator (by name match on recommended_by)
  // Pull ALL profiles with any recommended_by set (so we can fuzzy-match variants)
  const { data: recommendedProfiles } = await sb
    .from("profiles")
    .select("id, name, recommended_by, cv_score, claimed_at, created_at")
    .not("recommended_by", "is", null);

  // Fuzzy match: a profile counts for a Co-Creator if recommended_by contains
  // their first name AND at least one other name part (middle or last).
  // Handles "Petros" CC vs "Petros Mulugeta" recBy vs "Petros Mulugeta Yigzaw" profile,
  // and comma-separated "Mussie Tsegaye, Petros Mulugeta".
  function matches(recBy: string, memberName: string): boolean {
    const rec = recBy.toLowerCase();
    const parts = memberName.toLowerCase().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return false;
    const first = parts[0];
    if (!rec.includes(first)) return false;
    // If member name is single word, first-name match is enough
    if (parts.length === 1) return true;
    // Otherwise require at least one other name part to appear in recBy
    return parts.slice(1).some((p) => p.length >= 3 && rec.includes(p));
  }

  // Build stats per member
  const enriched = members.map((m: any) => {
    const myInteractions = (interactions || []).filter((i: any) => i.co_creator_id === m.id);
    const myRecommended = (recommendedProfiles || []).filter(
      (p: any) => p.recommended_by && matches(p.recommended_by, m.name)
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

    // Profile claim status — derived from linked profile, not the request flag
    const profStatus = m.profile_id ? profileStatus[m.profile_id] : null;
    const profileClaimed = !!profStatus?.claimed_at;
    const profileSignedIn = !!profStatus?.has_user;

    return {
      ...m,
      stats,
      tier,
      score,
      profileClaimed,
      profileSignedIn,
      profileCvScore: profStatus?.cv_score ?? null,
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
