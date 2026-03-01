import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import type { SampleOpportunity } from "@/lib/types/cv-score";
import {
  processOpportunities,
  type RawOpportunity,
} from "@/lib/opportunity-quality";

const TEST_OUTPUT_DIR = path.join(process.cwd(), "test-output");

const SOURCE_FILES = [
  "reliefweb.json",
  "worldbank.json",
  "unjobs.json",
  "drc.json",
  "au.json",
  "workday.json",
  "uncareers.json",
  "kifiya.json",
  "oracle.json", // kept in list but excluded by quality layer
];

function parseRawOpportunity(
  raw: Record<string, unknown>,
  sourceDomain: string
): RawOpportunity | null {
  const title = (raw.title as string) || "";
  if (!title) return null;

  return {
    title,
    organization:
      (raw.organization as string) || (raw.source as string) || "Unknown",
    description: (raw.description as string) || "",
    deadline: (raw.deadline as string) || null,
    country: (raw.country as string) || "Ethiopia",
    source_url: (raw.source_url as string) || (raw.url as string) || "",
    source_domain: (raw.source_domain as string) || sourceDomain,
    type: (raw.type as string) || "job",
  };
}

function loadAndProcessOpportunities(): SampleOpportunity[] {
  const rawItems: RawOpportunity[] = [];

  for (const file of SOURCE_FILES) {
    const filePath = path.join(TEST_OUTPUT_DIR, file);
    if (!fs.existsSync(filePath)) continue;

    try {
      const raw = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      const items = Array.isArray(raw)
        ? raw
        : Array.isArray(raw.opportunities)
          ? raw.opportunities
          : [];

      const sourceDomain = file.replace(".json", "");

      for (const item of items) {
        const parsed = parseRawOpportunity(item, sourceDomain);
        if (parsed) rawItems.push(parsed);
      }
    } catch {
      // Skip malformed files
    }
  }

  return processOpportunities(rawItems);
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
