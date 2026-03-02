import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

interface NewsArticle {
  id: string;
  title: string;
  summary: string;
  url: string;
  source_name: string;
  source_id: string;
  published_at: string | null;
  category: string;
  fetched_at: string;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const category = searchParams.get("category");
    const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 200);
    const offset = parseInt(searchParams.get("offset") || "0");

    // Read from file (same pattern as opportunities API)
    const filePath = path.join(process.cwd(), "test-output", "news.json");
    if (!fs.existsSync(filePath)) {
      return NextResponse.json(
        { articles: [], total: 0 },
        {
          headers: {
            "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
          },
        }
      );
    }

    const raw = fs.readFileSync(filePath, "utf-8");
    let articles: NewsArticle[] = JSON.parse(raw);

    // Filter by category
    if (category && category !== "All") {
      articles = articles.filter((a) => a.category === category);
    }

    const total = articles.length;

    // Paginate
    articles = articles.slice(offset, offset + limit);

    return NextResponse.json(
      { articles, total },
      {
        headers: {
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
        },
      }
    );
  } catch (err) {
    console.error("[api/news] Error:", err);
    return NextResponse.json(
      { articles: [], total: 0, error: "Failed to load news" },
      { status: 500 }
    );
  }
}
