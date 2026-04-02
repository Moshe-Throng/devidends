import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { SampleOpportunity } from "@/lib/types/cv-score";
import {
  processOpportunities,
  type RawOpportunity,
} from "@/lib/opportunity-quality";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

async function loadFromSupabase(): Promise<SampleOpportunity[]> {
  const sb = getSupabase();

  const { data, error } = await sb
    .from("opportunities")
    .select("title, description, deadline, organization, country, source_url, source_domain, type, experience_level, sectors, is_active")
    .eq("is_active", true)
    .order("scraped_at", { ascending: false })
    .limit(1000);

  if (error) {
    console.error("[opportunities/sample] Supabase error:", error.message);
    return [];
  }

  if (!data || data.length === 0) return [];

  const rawItems: RawOpportunity[] = data.map((row) => ({
    title: row.title || "",
    organization: row.organization || "Unknown",
    description: row.description || "",
    deadline: row.deadline || null,
    country: row.country || "Ethiopia",
    source_url: row.source_url || "",
    source_domain: row.source_domain || "",
    type: row.type || "job",
  }));

  return processOpportunities(rawItems);
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    const hideExpired = searchParams.get("hideExpired") !== "false";
    const minQuality = parseInt(searchParams.get("minQuality") || "0", 10);

    const allOpportunities = await loadFromSupabase();

    // Single opportunity lookup (no filtering — show any by ID)
    if (id) {
      const opp = allOpportunities.find((o) => o.id === id);
      if (!opp) {
        return NextResponse.json(
          { success: false, error: "Opportunity not found" },
          { status: 404 }
        );
      }
      return NextResponse.json(
        { success: true, opportunity: opp },
        { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } }
      );
    }

    // Apply quality + expiry filters for feed
    let opportunities = allOpportunities;

    if (hideExpired) {
      opportunities = opportunities.filter((o) => !o.is_expired);
    }

    if (minQuality > 0) {
      opportunities = opportunities.filter(
        (o) => o.quality_score >= minQuality
      );
    }

    // Remove all tenders and procurement-style listings
    const TENDER_RE = /\b(procurement|supply of|rfp|rfq|bid invitation|construction|installation|purchase|provision of goods|civil work|tender)\b/i;
    opportunities = opportunities.filter((o) => {
      const type = (o.classified_type || o.type || "").toLowerCase();
      if (type === "tender") return false;
      if (TENDER_RE.test(o.title)) return false;
      return true;
    });

    return NextResponse.json(
      {
        count: opportunities.length,
        total: allOpportunities.length,
        opportunities,
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
        },
      }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { count: 0, total: 0, opportunities: [], error: message },
      { status: 500 }
    );
  }
}
