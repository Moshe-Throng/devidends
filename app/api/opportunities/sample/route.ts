import { NextRequest, NextResponse } from "next/server";
import {
  processOpportunities,
  type RawOpportunity,
} from "@/lib/opportunity-quality";
import type { SampleOpportunity } from "@/lib/types/cv-score";

export const runtime = "edge";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

// In-memory cache
let _cache: { data: SampleOpportunity[]; ts: number } | null = null;
const CACHE_TTL = 5 * 60 * 1000;

async function loadFromSupabase(): Promise<SampleOpportunity[]> {
  if (_cache && Date.now() - _cache.ts < CACHE_TTL) return _cache.data;

  // Direct REST call — no SDK, edge-compatible
  const url = `${SUPABASE_URL}/rest/v1/opportunities?is_active=eq.true&order=scraped_at.desc&limit=1000&select=title,description,deadline,organization,country,source_url,source_domain,type,experience_level,sectors,is_active`;
  const res = await fetch(url, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
    },
  });

  if (!res.ok) {
    console.error("[opportunities/sample] Supabase error:", res.status);
    return _cache?.data || [];
  }

  const data = await res.json();
  if (!data || data.length === 0) return [];

  const rawItems: RawOpportunity[] = data.map((row: any) => ({
    title: row.title || "",
    organization: row.organization || "Unknown",
    description: row.description || "",
    deadline: row.deadline || null,
    country: row.country || "Ethiopia",
    source_url: row.source_url || "",
    source_domain: row.source_domain || "",
    type: row.type || "job",
    sectors: Array.isArray(row.sectors) ? row.sectors : [],
    experience_level: row.experience_level ?? null,
  }));

  const result = processOpportunities(rawItems);
  _cache = { data: result, ts: Date.now() };
  return result;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    const hideExpired = searchParams.get("hideExpired") !== "false";
    const minQuality = parseInt(searchParams.get("minQuality") || "0", 10);

    // Single opportunity lookup — loads all but only returns one (with description)
    if (id) {
      const allOpportunities = await loadFromSupabase();
      const opp = allOpportunities.find((o) => o.id === id);
      if (!opp) {
        return NextResponse.json({ success: false, error: "Opportunity not found" }, { status: 404 });
      }
      return NextResponse.json(
        { success: true, opportunity: opp },
        { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } }
      );
    }

    const allOpportunities = await loadFromSupabase();

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

    // Strip descriptions from feed response (saves ~150KB)
    // Descriptions are only needed on detail pages (?id=X)
    const lightweight = opportunities.map(({ description, ...rest }) => rest);

    return NextResponse.json(
      {
        count: lightweight.length,
        total: allOpportunities.length,
        opportunities: lightweight,
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
