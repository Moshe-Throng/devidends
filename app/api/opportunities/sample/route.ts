import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import type { SampleOpportunity } from "@/lib/types/cv-score";
import {
  processOpportunities,
  type RawOpportunity,
} from "@/lib/opportunity-quality";

const NORMALIZED_FILE = path.join(
  process.cwd(),
  "test-output",
  "_all_normalized.json"
);

function loadAndProcessOpportunities(): SampleOpportunity[] {
  if (!fs.existsSync(NORMALIZED_FILE)) {
    return [];
  }

  try {
    const raw = JSON.parse(fs.readFileSync(NORMALIZED_FILE, "utf-8"));
    const items: Record<string, unknown>[] = Array.isArray(raw) ? raw : [];

    const rawItems: RawOpportunity[] = [];
    for (const item of items) {
      const title = (item.title as string) || "";
      if (!title) continue;

      rawItems.push({
        title,
        organization:
          (item.organization as string) || (item.source as string) || "Unknown",
        description: (item.description as string) || "",
        deadline: (item.deadline as string) || null,
        country: (item.country as string) || "Ethiopia",
        source_url: (item.source_url as string) || "",
        source_domain: (item.source_domain as string) || "",
        type: (item.content_type as string) || (item.type as string) || "job",
      });
    }

    return processOpportunities(rawItems);
  } catch {
    return [];
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    const hideExpired = searchParams.get("hideExpired") !== "false";
    const minQuality = parseInt(searchParams.get("minQuality") || "40", 10);

    const allOpportunities = loadAndProcessOpportunities();

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

    // Filter out procurement/supply tenders — only keep individual consultant roles
    const PROCUREMENT_RE = /\b(procurement|supply of|rfp|rfq|bid invitation|construction|installation|purchase|provision of goods|civil work)\b/i;
    opportunities = opportunities.filter((o) => {
      const type = (o.classified_type || o.type || "").toLowerCase();
      if (type === "tender") {
        return /\b(consult|advisor|specialist|expert|individual)\b/i.test(o.title);
      }
      if (PROCUREMENT_RE.test(o.title)) return false;
      return true;
    });

    // Cache for 5 minutes (CDN) / 10 minutes (stale-while-revalidate)
    // Opportunities only change after daily scrape, so aggressive caching is safe
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
