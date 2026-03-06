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
  type?: "reliefweb-api";
  url: string;
  scope: "ethiopia" | "africa" | "global" | "humanitarian";
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

/* ─── Constants ──────────────────────────────────────────── */

const MAX_ARTICLES = 50;
const RSS_TIMEOUT_MS = 30000; // 30s

/* ─── Relevance keywords ─────────────────────────────────── */

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

  // Ethiopia-scoped sources: already filtered by source query
  if (scope === "ethiopia") return true;

  // Humanitarian-scoped sources (e.g. The New Humanitarian): accept all dev/humanitarian content
  if (scope === "humanitarian") {
    return DEV_KEYWORDS.some((kw) => text.includes(kw));
  }

  // Global/Africa sources: must mention Ethiopia specifically
  const mentionsEthiopia = ETHIOPIA_KEYWORDS.some((kw) => text.includes(kw));
  if (!mentionsEthiopia) return false;

  // Must also be dev-sector related
  const hasDevRef = DEV_KEYWORDS.some((kw) => text.includes(kw));
  return hasDevRef;
}

/* ─── Strip HTML tags ────────────────────────────────────── */

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

async function fetchReliefWebApi(
  source: NewsSource,
  seenUrls: Set<string>,
  now: string
): Promise<NewsArticle[]> {
  const appname = "DevidendslWobR5bzg4nrbI2JUvPj";
  const body = {
    filter: { field: "country.name", value: "Ethiopia" },
    sort: ["date.created:desc"],
    limit: 20,
    fields: {
      include: ["title", "url_alias", "date.created", "source.name", "body-html"],
    },
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RSS_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${source.url}?appname=${encodeURIComponent(appname)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  const data: any[] = json.data || [];
  console.log(`  [${source.id}] ${data.length} items (API)`);

  const articles: NewsArticle[] = [];
  for (const item of data) {
    const fields = item.fields || {};
    const alias: string = fields.url_alias || "";
    const url = alias
      ? alias.startsWith("http") ? alias : `https://reliefweb.int${alias}`
      : `https://reliefweb.int/node/${item.id}`;

    if (seenUrls.has(url)) continue;
    seenUrls.add(url);

    const title: string = fields.title || "";
    const bodyHtml: string = fields["body-html"] || "";
    const summary = stripHtml(bodyHtml).slice(0, 500);
    const sourceName: string = fields.source?.[0]?.name || source.name;

    articles.push({
      id: Buffer.from(url).toString("base64url").slice(0, 32),
      title,
      summary,
      url,
      source_name: sourceName,
      source_id: source.id,
      published_at: fields.date?.created || null,
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

  // We use parseString (not parseURL) so we can pre-fetch with native fetch
  // which follows redirects properly (including HTTPS→HTTP downgrade redirects
  // that rss-parser's built-in http client doesn't follow).
  const parser = new Parser({
    customFields: {
      item: [
        ["source", "source"],
        ["content:encoded", "contentEncoded"],
      ],
    },
  });

  /**
   * Fetch RSS feed content as text, following all redirects.
   * Falls back to null on error.
   */
  async function fetchRss(url: string): Promise<string | null> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), RSS_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        redirect: "follow",
        signal: controller.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; Devidends-NewsBot/1.0)",
          "Accept": "application/rss+xml, application/xml, text/xml, */*",
        },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (err) {
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  const allArticles: NewsArticle[] = [];
  const seenUrls = new Set<string>();
  const now = new Date().toISOString();

  const results = await Promise.allSettled(
    enabled.map(async (source) => {
      try {
        console.log(`  [${source.id}] Fetching...`);

        // Special handler for ReliefWeb JSON API
        if (source.type === "reliefweb-api") {
          return await fetchReliefWebApi(source, seenUrls, now);
        }

        const xml = await fetchRss(source.url);
        if (!xml) throw new Error("Empty response");
        const feed = await parser.parseString(xml);
        const items = feed.items || [];
        console.log(`  [${source.id}] ${items.length} items`);

        const articles: NewsArticle[] = [];
        for (const item of items) {
          const rawLink = item.link?.trim();
          if (!rawLink) continue;

          const url = rawLink;
          const descHtml: string = (item as any).contentEncoded || item.content || item.summary || "";

          if (seenUrls.has(url)) continue;

          const title = item.title?.trim() || "";
          const summary = stripHtml(descHtml || item.contentSnippet || "");
          if (!title) continue;

          // Relevance check for non-Ethiopia-scoped sources
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

        console.log(`  [${source.id}] ${articles.length} relevant articles`);
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

  // Deduplicate by URL first, then by title similarity (>60% word overlap)
  const deduped: NewsArticle[] = [];
  const seenTitles = new Set<string>();
  for (const article of allArticles) {
    const words = new Set(article.title.toLowerCase().split(/\s+/).filter((w) => w.length > 3));
    const isDupe = [...seenTitles].some((existing) => {
      const existingWords = new Set(existing.split(" "));
      if (words.size === 0 || existingWords.size === 0) return false;
      let overlap = 0;
      for (const w of words) {
        if (existingWords.has(w)) overlap++;
      }
      return overlap / Math.min(words.size, existingWords.size) > 0.6;
    });
    if (!isDupe) {
      const wordKey = [...words].sort().join(" ");
      seenTitles.add(wordKey);
      deduped.push(article);
    }
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
  // Only overwrite if we got articles — prevents wiping good data on total network failure
  if (articles.length > 0) {
    fs.writeFileSync(outPath, JSON.stringify(articles, null, 2));
  } else {
    console.log("[news] Skipping write — 0 articles (all sources failed). Keeping existing file.");
  }

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
