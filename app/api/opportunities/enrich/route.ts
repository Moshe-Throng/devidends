import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { enrichBatch } from "@/lib/enrich-descriptions";

const TEST_OUTPUT_DIR = path.join(process.cwd(), "test-output");

const MIN_DESCRIPTION_LEN = 150;

const ALL_SOURCES = [
  "reliefweb.json",
  "worldbank.json",
  "unjobs.json",
  "drc.json",
  "au.json",
  "workday.json",
  "uncareers.json",
  "kifiya.json",
  "oracle.json",
];

/**
 * POST /api/opportunities/enrich
 *
 * Enriches opportunities with empty OR sparse descriptions by fetching
 * their source URLs and extracting content (Cheerio first, Puppeteer fallback).
 *
 * Query params:
 *   ?source=drc        — only enrich this source file (default: all)
 *   ?limit=20          — max items to enrich per run (default: 30)
 *   ?usePuppeteer=true — enable Puppeteer for JS-rendered sites (default: true)
 */
export async function POST(req: NextRequest) {
  // Vercel has a read-only filesystem — enrichment writes JSON files
  if (process.env.VERCEL) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Enrichment writes to the filesystem and cannot run on Vercel. Run locally or via the daily pipeline instead.",
      },
      { status: 422 }
    );
  }

  try {
    const { searchParams } = new URL(req.url);
    const sourceFilter = searchParams.get("source");
    const limit = parseInt(searchParams.get("limit") || "30", 10);
    const usePuppeteer = searchParams.get("usePuppeteer") !== "false";

    const sourceFiles = sourceFilter
      ? [`${sourceFilter}.json`]
      : ALL_SOURCES;

    let totalEnriched = 0;
    let totalAttempted = 0;
    const fileResults: Record<
      string,
      { attempted: number; enriched: number; total: number; sparse: number }
    > = {};

    for (const file of sourceFiles) {
      const filePath = path.join(TEST_OUTPUT_DIR, file);
      if (!fs.existsSync(filePath)) continue;

      const raw = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      const items: Record<string, unknown>[] = Array.isArray(raw)
        ? raw
        : Array.isArray(raw.opportunities)
          ? raw.opportunities
          : [];

      // Find items with empty OR sparse descriptions and valid source URLs
      const sparseItems = items
        .filter((item) => {
          const desc = ((item.description as string) || "").trim();
          const url = (item.source_url as string) || "";
          return desc.length < MIN_DESCRIPTION_LEN && url.startsWith("http");
        })
        .slice(0, Math.max(0, limit - totalAttempted));

      const sparseCount = items.filter(
        (item) =>
          ((item.description as string) || "").trim().length <
          MIN_DESCRIPTION_LEN
      ).length;

      if (sparseItems.length === 0) {
        fileResults[file] = {
          attempted: 0,
          enriched: 0,
          total: items.length,
          sparse: sparseCount,
        };
        continue;
      }

      totalAttempted += sparseItems.length;

      // Fetch descriptions (Cheerio first, Puppeteer fallback for JS sites)
      const results = await enrichBatch(
        sparseItems.map((item) => ({
          source_url: item.source_url as string,
          source_domain:
            (item.source_domain as string) || file.replace(".json", ""),
        })),
        3,
        800,
        usePuppeteer
      );

      let fileEnriched = 0;

      // Update items in-place
      for (const item of items) {
        const url = item.source_url as string;
        if (url && results.has(url)) {
          item.description = results.get(url);
          fileEnriched++;
        }
      }

      totalEnriched += fileEnriched;
      fileResults[file] = {
        attempted: sparseItems.length,
        enriched: fileEnriched,
        total: items.length,
        sparse: sparseCount,
      };

      // Save updated file
      if (fileEnriched > 0) {
        const data = Array.isArray(raw)
          ? items
          : { ...raw, opportunities: items };
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
      }

      if (totalAttempted >= limit) break;
    }

    return NextResponse.json({
      success: true,
      attempted: totalAttempted,
      enriched: totalEnriched,
      files: fileResults,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
