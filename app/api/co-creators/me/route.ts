import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createClient as createAdmin } from "@supabase/supabase-js";

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "sheklave@gmail.com,mussietsegg@gmail.com")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

function computeTier(stats: { cvsSent: number; placements: number }) {
  if (stats.cvsSent >= 15 || stats.placements >= 3) return "architect";
  if (stats.cvsSent >= 5 || stats.placements >= 1) return "catalyst";
  return "contributor";
}

/**
 * Returns the logged-in user's own co-creator stats. Currently gated to
 * admin emails only — once the personal dashboard is hardened, this gate
 * can drop and any signed-in co-creator will see their own data.
 */
export async function GET() {
  const cookieStore = await cookies();
  const supa = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: () => {},
      },
    }
  );
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  // Admin-only gate (initial rollout)
  if (!ADMIN_EMAILS.includes((user.email || "").toLowerCase())) {
    return NextResponse.json({ error: "Not enabled for your account yet" }, { status: 403 });
  }

  const sb = createAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Find the co_creator linked to this user via profile.user_id
  const { data: profile } = await sb
    .from("profiles")
    .select("id, name, cv_score, claimed_at, user_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!profile) return NextResponse.json({ error: "No profile linked to your account" }, { status: 404 });

  const { data: cc } = await sb
    .from("co_creators")
    .select("*")
    .eq("profile_id", profile.id)
    .maybeSingle();
  if (!cc) return NextResponse.json({ error: "You're not a Co-Creator yet" }, { status: 404 });

  // Profiles they've recommended (fuzzy match on recommended_by)
  const { data: recommendedProfiles } = await sb
    .from("profiles")
    .select("id, name, recommended_by, cv_score, claimed_at, created_at, sectors, profile_type")
    .not("recommended_by", "is", null);

  const memberName = (cc.name || "").toLowerCase();
  const parts = memberName.split(/\s+/).filter(Boolean);
  const first = parts[0];
  function matches(recBy: string): boolean {
    const rec = recBy.toLowerCase();
    if (!first || !rec.includes(first)) return false;
    if (parts.length === 1) return true;
    return parts.slice(1).some((p: string) => p.length >= 3 && rec.includes(p));
  }
  const myRecommended = ((recommendedProfiles || []) as any[])
    .filter((p) => p.recommended_by && matches(p.recommended_by))
    .sort((a, b) => (new Date(b.created_at).getTime()) - (new Date(a.created_at).getTime()));

  // Interactions
  const { data: interactions } = await sb
    .from("co_creator_interactions")
    .select("interaction_type, direction, created_at, content")
    .eq("co_creator_id", cc.id)
    .order("created_at", { ascending: false })
    .limit(20);

  // Network: total co-creators + the user's rank by score
  const { count: totalCcs } = await sb.from("co_creators").select("*", { count: "exact", head: true });

  // CV scores history for the recommended pool
  const scored = myRecommended.filter((p: any) => p.cv_score != null);
  const avgCvScore = scored.length > 0
    ? Math.round(scored.reduce((a: number, p: any) => a + (p.cv_score || 0), 0) / scored.length)
    : null;

  const claimedCount = myRecommended.filter((p: any) => p.claimed_at).length;
  const expertCount = myRecommended.filter((p: any) => p.profile_type === "Expert").length;

  const cvsSent = myRecommended.length;
  const placements = 0; // placeholder
  const vouchesGiven = (interactions || []).filter((i: any) => i.interaction_type === "vouch").length;
  const torsShared = (interactions || []).filter((i: any) => i.interaction_type === "tor_share").length;
  const tier = computeTier({ cvsSent, placements });
  const score = cvsSent * 10 + placements * 50 + vouchesGiven * 5 + torsShared * 8;

  return NextResponse.json({
    coCreator: {
      id: cc.id,
      name: cc.name,
      member_number: cc.member_number,
      joined_at: cc.joined_at,
      role_title: cc.role_title,
      preferred_sectors: cc.preferred_sectors,
      preferred_channel: cc.preferred_channel,
      invite_token: cc.invite_token,
    },
    profile: {
      id: profile.id,
      name: profile.name,
      cv_score: profile.cv_score,
    },
    stats: {
      cvsSent,
      claimedCount,
      expertCount,
      placements,
      vouchesGiven,
      torsShared,
      avgCvScore,
      score,
      tier,
      networkSize: totalCcs || 0,
    },
    recommended: myRecommended.map((p: any) => ({
      id: p.id,
      name: p.name,
      cv_score: p.cv_score,
      claimed: !!p.claimed_at,
      sectors: (p.sectors || []).slice(0, 3),
      profile_type: p.profile_type,
      created_at: p.created_at,
    })),
    interactions: interactions || [],
  });
}
