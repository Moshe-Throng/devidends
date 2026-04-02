import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM = `You are a professional job listing formatter. Reformat the raw job page content into a clean, well-structured job description.

Rules:
- Use ## for main section headings (e.g. About the Organization, About the Role, Key Responsibilities, Requirements, How to Apply)
- Use bullet points (- ) for lists of duties, requirements, qualifications
- Keep paragraphs short (2-3 sentences max)
- Remove navigation text, cookie notices, login prompts, footer text, and any non-job content
- Preserve ALL job-relevant content — do not fabricate information
- If salary/grade info is present, keep it
- Do not add commentary
- Output clean markdown only, no code fences`;

/**
 * Fetch the text content of a URL using a simple fetch + HTML stripping.
 * Used when job has no description stored — pulls from source page.
 */
async function fetchSourceText(url: string): Promise<string> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml",
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) return "";
    const html = await res.text();

    // Strip scripts, styles, nav, footer
    let text = html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "");

    // Try to extract main content area first
    const mainMatch = text.match(/<main[\s\S]*?<\/main>/i)
      || text.match(/<article[\s\S]*?<\/article>/i)
      || text.match(/<div[^>]*class="[^"]*content[^"]*"[\s\S]*?<\/div>/i);

    if (mainMatch) {
      text = mainMatch[0];
    }

    // Strip remaining HTML
    text = text
      .replace(/<[^>]+>/g, "\n")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&[a-z]+;/gi, " ")
      .replace(/&#\d+;/g, " ");

    // Keep only lines with substantial content
    const lines = text.split("\n")
      .map(l => l.trim())
      .filter(l => l.length > 20);

    return lines.join("\n").slice(0, 8000);
  } catch (err) {
    console.error("[format] Fetch error:", url, err);
    return "";
  }
}

export async function POST(req: NextRequest) {
  try {
    const { description, title, source_url } = await req.json();

    let text = (description || "").trim();

    // If no description (or too short), try fetching from source URL
    if (text.length < 100 && source_url) {
      // Skip sites that block server-side fetches (Cloudflare-protected)
      const blockedHosts = ["unjobs.org", "csod.com", "devex.com"];
      const isBlocked = blockedHosts.some(h => source_url.includes(h));
      if (!isBlocked) {
        text = await fetchSourceText(source_url);
      }
      if (text.length < 100) {
        return NextResponse.json({ formatted: "" });
      }
    }

    if (text.length < 50) {
      return NextResponse.json({ formatted: text });
    }

    // Send to AI for formatting
    const input = text.slice(0, 8000);

    const msg = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2500,
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: `Format this job listing content for "${title || "this position"}":\n\n${input}`,
        },
      ],
    });

    const formatted =
      msg.content[0].type === "text" ? msg.content[0].text : "";

    return NextResponse.json(
      { formatted },
      { headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" } }
    );
  } catch (err) {
    console.error("[format] Error:", err);
    return NextResponse.json({ formatted: "" }, { status: 500 });
  }
}
