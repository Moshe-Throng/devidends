/**
 * crawl-news.ts — Fetch international development news from RSS feeds.
 * Outputs test-output/news.json (same pattern as opportunity crawl engine).
 *
 * Usage:  npx tsx scripts/crawl-news.ts
 */

import fs from "fs";
import path from "path";
import Parser from "rss-parser";

/* ─── Types ──────────────────────────────────────────────── */

interface NewsSource {
  id: string;
  name: string;
  type?: "reliefweb-api"; // special handler for ReliefWeb JSON API
  url: string;
  scope: "ethiopia" | "africa" | "global";
  enabled: boolean;
}

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

/* ─── Relevance keywords ─────────────────────────────────── */

const MAX_ARTICLES = 30;

const ETHIOPIA_KEYWORDS = [
  "ethiopia", "ethiopian", "addis ababa", "tigray", "amhara", "oromia",
  "somali region", "afar", "sidama", "snnpr", "horn of africa",
];

const DEV_KEYWORDS = [
  "development", "humanitarian", "aid", "donor", "usaid", "dfid", "sida",
  "giz", "undp", "unicef", "unhcr", "wfp", "who", "fao", "ifad",
  "world bank", "imf", "african development bank", "afdb", "eu",
  "european commission", "bilateral", "multilateral", "ngo", "ingo",
  "civil society", "capacity building", "resilience", "food security",
  "climate", "gender", "education", "health", "wash", "nutrition",
  "displacement", "refugee", "conflict", "peacebuilding", "governance",
  "funding", "grant", "programme", "project", "cooperation",
];

/* ─── Category classification (keyword-based) ────────────── */

const CATEGORY_RULES: { category: string; keywords: string[] }[] = [
  {
    category: "Humanitarian",
    keywords: ["humanitarian", "refugee", "displacement", "crisis", "emergency", "famine", "drought", "flood", "conflict", "war", "unhcr", "wfp", "ocha", "relief"],
  },
  {
    category: "Policy & Governance",
    keywords: ["policy", "governance", "government", "reform", "regulation", "law", "legislation", "parliament", "election", "democracy", "political", "ministry"],
  },
  {
    category: "Health",
    keywords: ["health", "disease", "covid", "vaccine", "malaria", "hiv", "aids", "nutrition", "maternal", "who", "pandemic", "epidemic", "hospital", "medical"],
  },
  {
    category: "Education",
    keywords: ["education", "school", "university", "literacy", "training", "student", "teacher", "curriculum", "scholarship", "enrolment"],
  },
  {
    category: "Climate & Environment",
    keywords: ["climate", "environment", "green", "carbon", "emission", "renewable", "energy", "deforestation", "biodiversity", "water", "drought", "adaptation", "mitigation"],
  },
  {
    category: "Funding & Donors",
    keywords: ["funding", "grant", "loan", "investment", "donor", "pledge", "billion", "million", "disbursement", "budget", "financing", "partnership", "cooperation"],
  },
  {
    category: "Economy & Trade",
    keywords: ["economy", "trade", "export", "import", "gdp", "inflation", "market", "business", "agriculture", "industry", "infrastructure", "debt"],
  },
];

function classify(text: string): string {
  const lower = text.toLowerCase();
  let best = "General";
  let bestScore = 0;

  for (const rule of CATEGORY_RULES) {
    let score = 0;
    for (const kw of rule.keywords) {
      if (lower.includes(kw)) score++;
    }
    if (score > bestScore) {
      bestScore = score;
      best = rule.category;
    }
  }

  return best;
}

/* ─── Relevance filter ───────────────────────────────────── */

function isRelevant(title: string, summary: string, scope: string): boolean {
  const text = `${title} ${summary}`.toLowerCase();

  // Ethiopia-scoped sources: already filtered by query, just sanity check title exists
  if (scope === "ethiopia") return true;

  // Global sources: must mention Ethiopia specifically
  const mentionsEthiopia = ETHIOPIA_KEYWORDS.some((kw) => text.includes(kw));
  if (!mentionsEthiopia) return false;

  // Must also be dev-sector related
  const hasDevRef = DEV_KEYWORDS.some((kw) => text.includes(kw));
  return hasDevRef;
}

/* ─── Strip HTML tags from summaries ─────────────────────── */

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/* ─── ReliefWeb JSON API handler ──────────────────────────── */

async function fetchReliefWeb(
  source: NewsSource,
  seenUrls: Set<string>,
  now: string
): Promise<NewsArticle[]> {
  // Use POST with JSON body (same pattern as the jobs adapter — more reliable than GET bracket notation)
  const appname = "DevidendslWobR5bzg4nrbI2JUvPj";
  const apiBase = "https://api.reliefweb.int/v1/reports";
  const body = {
    filter: { field: "country.name", value: "Ethiopia" },
    sort: ["date.created:desc"],
    limit: 20,
    fields: {
      include: ["title", "url_alias", "date.created", "source.name", "body-html"],
    },
  };
  const res = await fetch(`${apiBase}?appname=${encodeURIComponent(appname)}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "Mozilla/5.0 (compatible; Devidends/1.0)",
      "Accept": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Status ${res.status}: ${await res.text().then(t => t.slice(0, 200))}`);
  const json = await res.json();
  const data = json.data || [];
  console.log(`  [${source.id}] ${data.length} items (API)`);

  const articles: NewsArticle[] = [];
  for (const item of data) {
    const fields = item.fields || {};
    const url = fields.url_alias
      ? `https://reliefweb.int${fields.url_alias}`
      : `https://reliefweb.int/node/${item.id}`;

    if (seenUrls.has(url)) continue;
    seenUrls.add(url);

    const title = fields.title || "";
    const body = fields["body-html"] || "";
    const summary = stripHtml(body).slice(0, 500);
    const sourceName = fields.source?.[0]?.name || source.name;

    articles.push({
      id: Buffer.from(url).toString("base64url").slice(0, 32),
      title,
      summary,
      url,
      source_name: sourceName,
      source_id: source.id,
      published_at: fields.date?.created || fields.date?.original || null,
      category: classify(`${title} ${summary}`),
      fetched_at: now,
    });
  }

  return articles;
}

/* ─── Main crawl function ────────────────────────────────── */

async function crawlNews(): Promise<NewsArticle[]> {
  const sourcesPath = path.join(__dirname, "crawl-engine", "news-sources.json");
  const sources: NewsSource[] = JSON.parse(fs.readFileSync(sourcesPath, "utf-8"));
  const enabled = sources.filter((s) => s.enabled);

  console.log(`[news] Crawling ${enabled.length} RSS sources...`);

  const parser = new Parser({
    timeout: 15000,
    headers: {
      "User-Agent": "Devidends-NewsBot/1.0 (+https://devidends.vercel.app)",
    },
  });

  const allArticles: NewsArticle[] = [];
  const seenUrls = new Set<string>();
  const now = new Date().toISOString();

  const results = await Promise.allSettled(
    enabled.map(async (source) => {
      try {
        console.log(`  [${source.id}] Fetching...`);

        // Special handler for ReliefWeb JSON API
        if (source.type === "reliefweb-api") {
          return await fetchReliefWeb(source, seenUrls, now);
        }

        const feed = await parser.parseURL(source.url);
        const items = feed.items || [];
        console.log(`  [${source.id}] ${items.length} items`);

        const articles: NewsArticle[] = [];
        for (const item of items) {
          const url = item.link?.trim();
          if (!url || seenUrls.has(url)) continue;

          const title = item.title?.trim() || "";
          const summary = stripHtml(item.contentSnippet || item.content || item.summary || "");
          if (!title) continue;

          // Relevance check for global sources
          if (!isRelevant(title, summary, source.scope)) continue;

          seenUrls.add(url);
          articles.push({
            id: Buffer.from(url).toString("base64url").slice(0, 32),
            title,
            summary: summary.slice(0, 500),
            url,
            source_name: source.name,
            source_id: source.id,
            published_at: item.isoDate || item.pubDate || null,
            category: classify(`${title} ${summary}`),
            fetched_at: now,
          });
        }
        return articles;
      } catch (err) {
        console.error(`  [${source.id}] FAILED:`, (err as Error).message);
        return [] as NewsArticle[];
      }
    })
  );

  for (const result of results) {
    if (result.status === "fulfilled") {
      allArticles.push(...result.value);
    }
  }

  // Deduplicate by title similarity (>60% word overlap = duplicate)
  const deduped: NewsArticle[] = [];
  for (const article of allArticles) {
    const words = new Set(article.title.toLowerCase().split(/\s+/).filter((w) => w.length > 3));
    const isDupe = deduped.some((existing) => {
      const existingWords = new Set(existing.title.toLowerCase().split(/\s+/).filter((w) => w.length > 3));
      if (words.size === 0 || existingWords.size === 0) return false;
      let overlap = 0;
      for (const w of words) {
        if (existingWords.has(w)) overlap++;
      }
      return overlap / Math.min(words.size, existingWords.size) > 0.6;
    });
    if (!isDupe) deduped.push(article);
  }

  console.log(`[news] Deduped: ${allArticles.length} → ${deduped.length}`);

  // Sort by published date (newest first), cap at MAX_ARTICLES
  deduped.sort((a, b) => {
    const da = a.published_at ? new Date(a.published_at).getTime() : 0;
    const db = b.published_at ? new Date(b.published_at).getTime() : 0;
    return db - da;
  });

  return deduped.slice(0, MAX_ARTICLES);
}

/* ─── Entry point ────────────────────────────────────────── */

async function main() {
  const start = Date.now();
  const articles = await crawlNews();

  // Write output
  const outDir = path.join(__dirname, "..", "test-output");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const outPath = path.join(outDir, "news.json");
  fs.writeFileSync(outPath, JSON.stringify(articles, null, 2));

  // Summary
  const categories = new Map<string, number>();
  for (const a of articles) {
    categories.set(a.category, (categories.get(a.category) || 0) + 1);
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`\n[news] Done in ${elapsed}s — ${articles.length} articles`);
  console.log(`[news] Categories:`);
  for (const [cat, count] of [...categories.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${cat}: ${count}`);
  }
  console.log(`[news] Output: ${outPath}`);
}

main().catch((err) => {
  console.error("[news] Fatal:", err);
  process.exit(1);
});
