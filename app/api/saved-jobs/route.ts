import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase-server";

/**
 * GET /api/saved-jobs — list user's saved opportunities
 * POST /api/saved-jobs — save a new opportunity
 * DELETE /api/saved-jobs?id=<opp_id> — unsave an opportunity
 */

export async function GET() {
  const supabase = await createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  const { data, error } = await supabase
    .from("saved_opportunities")
    .select("*")
    .eq("user_id", user.id)
    .order("saved_at", { ascending: false });

  if (error) {
    return NextResponse.json(
      { error: "Failed to fetch saved jobs" },
      { status: 500 }
    );
  }

  return NextResponse.json({ saved: data || [] });
}

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  const body = await req.json();
  const {
    opportunity_id,
    opportunity_title,
    opportunity_org,
    opportunity_deadline,
    opportunity_url,
  } = body;

  if (!opportunity_id || !opportunity_title) {
    return NextResponse.json(
      { error: "Missing required fields" },
      { status: 400 }
    );
  }

  // Check if already saved
  const { data: existing } = await supabase
    .from("saved_opportunities")
    .select("id")
    .eq("user_id", user.id)
    .eq("opportunity_id", opportunity_id)
    .single();

  if (existing) {
    return NextResponse.json(
      { message: "Already saved", alreadySaved: true },
      { status: 200 }
    );
  }

  const { error } = await supabase.from("saved_opportunities").insert({
    user_id: user.id,
    opportunity_id,
    opportunity_title,
    opportunity_org: opportunity_org || "Unknown",
    opportunity_deadline: opportunity_deadline || null,
    opportunity_url: opportunity_url || "",
    notes: null,
  });

  if (error) {
    console.error("Save error:", error);
    return NextResponse.json(
      { error: "Failed to save opportunity" },
      { status: 500 }
    );
  }

  return NextResponse.json(
    { message: "Opportunity saved!" },
    { status: 201 }
  );
}

export async function DELETE(req: NextRequest) {
  const supabase = await createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  const { searchParams } = new URL(req.url);
  const opportunityId = searchParams.get("id");

  if (!opportunityId) {
    return NextResponse.json(
      { error: "Missing opportunity ID" },
      { status: 400 }
    );
  }

  const { error } = await supabase
    .from("saved_opportunities")
    .delete()
    .eq("user_id", user.id)
    .eq("opportunity_id", opportunityId);

  if (error) {
    return NextResponse.json(
      { error: "Failed to remove saved job" },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: "Removed from saved" });
}
