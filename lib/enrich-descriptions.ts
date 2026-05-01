/**
 * Opportunity description enrichment module.
 *
 * Two strategies:
 * 1. Cheerio (fast, for static HTML sites)
 * 2. Puppeteer (slower, for JS-rendered sites)
 *
 * Used by both the API route and the CLI enrichment script.
 */

import { load } from "cheerio";

/* ─── Site-specific extraction rules ─────────────────────── */

interface ExtractionRule {
  selectors: string[];
  removeSelectors?: string[];
  requiresJs?: boolean;
}

const SITE_RULES: Record<string, ExtractionRule> = {
  "unjobs.org": {
    selectors: [".job-description", ".vacancy-description", "article", "body"],
    requiresJs: true,
  },
  "drc.ngo": {
    // Verified live: the SSR'd body sits at .jobPage__body__copy
    selectors: [".jobPage__body__copy", ".jobPage__body", "article", "main"],
    requiresJs: false,
  },
  "jobs.au.int": {
    // The visible body is rendered after a cookie modal rewrites the DOM,
    // so this needs Puppeteer + a wait for the real container.
    selectors: ["#jobdescriptionwrapper", "[data-careersite-propertyid='jobdescription']", "main"],
    requiresJs: true,
  },
  "kifiya.com": {
    selectors: [".job-description", ".entry-content", "article", "main"],
    requiresJs: true,
  },
  "careers.un.org": {
    selectors: [".job-description", "#content", "main"],
    requiresJs: true,
  },
  "reliefweb.int": {
    selectors: [".article__content", ".content", "main"],
    requiresJs: false,
  },
  "careers.gggi.org": {
    selectors: [".col-md-8"],
    removeSelectors: ["script", "style", "nav", "aside", ".col-md-4", ".breadcrumb"],
    requiresJs: false,
  },
  "ilri.org": {
    selectors: [".job-content", ".node__content", "article", "main"],
    requiresJs: true,
  },
  "afdb.org": {
    selectors: [".job-description", ".jobdescription", "article", "main"],
    requiresJs: true,
  },
  "workable.com": {
    selectors: ["[data-ui='job-description']", "section[data-ui='job']", "main"],
    requiresJs: true,
  },
  "phg.tbe.taleo.net": {
    selectors: [".requisitionDescriptionInterface", "[id*='requisitionDescription']", "table.iCIMS_InfoMsg"],
    requiresJs: true,
  },
};

const GENERIC_SELECTORS = [
  ".job-description",
  ".vacancy-description",
  "#job-description",
  ".job-details",
  ".job-content",
  ".posting-description",
  "article .content",
  "article",
  "main .content",
  "main",
];

/* ─── Text cleaning ──────────────────────────────────────── */

function cleanText(text: string): string {
  return text
    .replace(/\s+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const DEFAULT_REMOVE = "script, style, nav, footer, header, .breadcrumb, .sidebar";

function extractTextFromCheerio(
  $: any,
  selectors: string[],
  extraRemove: string[] = []
): string {
  const removeSelector = [DEFAULT_REMOVE, ...extraRemove].join(", ");
  for (const selector of selectors) {
    const el = $(selector).first();
    if (el.length) {
      el.find(removeSelector).remove();
      const text = (el.text() as string)
        .split("\n")
        .map((line: string) => line.trim())
        .filter(Boolean)
        .join("\n");
      const cleaned = cleanText(text);
      if (cleaned.length > 80) {
        const maxLen = 3000;
        return cleaned.length > maxLen ? cleaned.slice(0, maxLen) + "..." : cleaned;
      }
    }
  }
  return "";
}
/* ─── Cheerio-based fetch (fast, static HTML) ────────────── */

/** Block requests to private/internal IP ranges (SSRF prevention) */
function isPrivateUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname;
    // Block private IPs, localhost, metadata endpoints
    if (
      /^(127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|0\.|169\.254\.|fc|fd|fe80|::1|localhost)/i.test(hostname)
    ) {
      return true;
    }
    // Block non-http(s) protocols
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return true;
    }
    return false;
  } catch {
    return true;
  }
}

export async function fetchWithCheerio(
  sourceUrl: string,
  selectors: string[],
  removeSelectors: string[] = []
): Promise<string> {
  if (isPrivateUrl(sourceUrl)) return "";

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const res = await fetch(sourceUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
      },
      signal: controller.signal,
      redirect: "follow",
    });

    clearTimeout(timeout);
    if (!res.ok) return "";

    const html = await res.text();
    const $ = load(html);
    return extractTextFromCheerio($, selectors, removeSelectors);
  } catch {
    clearTimeout(timeout);
    return "";
  }
}

/* ─── Puppeteer-based fetch (slower, JS-rendered) ────────── */

export async function fetchWithPuppeteer(
  sourceUrl: string,
  selectors: string[],
  removeSelectors: string[] = []
): Promise<string> {
  if (isPrivateUrl(sourceUrl)) return "";

  let browser;
  try {
    let puppeteer;
    try {
      puppeteer = await import("puppeteer");
    } catch {
      console.warn("[enrich] Puppeteer not available — skipping JS-rendered fetch");
      return "";
    }
    browser = await puppeteer.default.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    const page = await browser.newPage();
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36"
    );
    await page.goto(sourceUrl, { waitUntil: "networkidle2", timeout: 20000 });

    // Try each selector
    const removeQuery = ["script", "style", "nav", "footer", "header", ...removeSelectors].join(", ");
    for (const selector of selectors) {
      const text = await page.evaluate(
        (sel: string, rmQ: string) => {
          const el = document.querySelector(sel);
          if (!el) return "";
          el.querySelectorAll(rmQ).forEach((e) => e.remove());
          return el.textContent || "";
        },
        selector,
        removeQuery,
      );

      const cleaned = cleanText(text);
      if (cleaned.length > 80) {
        const maxLen = 3000;
        return cleaned.length > maxLen ? cleaned.slice(0, maxLen) + "..." : cleaned;
      }
    }

    return "";
  } catch {
    return "";
  } finally {
    if (browser) await browser.close();
  }
}

/* ─── Main fetch with strategy selection ─────────────────── */

export async function fetchDescription(
  sourceUrl: string,
  sourceDomain?: string,
  usePuppeteer = false
): Promise<{ description: string; success: boolean }> {
  if (!sourceUrl) return { description: "", success: false };

  const domain =
    sourceDomain ||
    (() => {
      try {
        return new URL(sourceUrl).hostname.replace(/^www\./, "");
      } catch {
        return "";
      }
    })();

  const rule = Object.entries(SITE_RULES).find(([key]) =>
    domain.includes(key)
  )?.[1];

  const selectors = rule ? rule.selectors : GENERIC_SELECTORS;
  const removeSelectors = rule?.removeSelectors ?? [];
  const needsJs = rule?.requiresJs ?? false;

  // Try Cheerio first (fast)
  const cheerioResult = await fetchWithCheerio(sourceUrl, selectors, removeSelectors);
  if (cheerioResult) {
    return { description: cheerioResult, success: true };
  }

  // Fall back to Puppeteer if needed and allowed
  if ((needsJs || usePuppeteer) && typeof window === "undefined") {
    const puppeteerResult = await fetchWithPuppeteer(sourceUrl, selectors, removeSelectors);
    if (puppeteerResult) {
      return { description: puppeteerResult, success: true };
    }
  }

  return { description: "", success: false };
}

/* ─── Batch enrichment ───────────────────────────────────── */

export async function enrichBatch(
  items: { source_url: string; source_domain?: string }[],
  concurrency = 3,
  delayMs = 500,
  usePuppeteer = false
): Promise<Map<string, string>> {
  const results = new Map<string, string>();
  const queue = [...items];

  async function worker() {
    while (queue.length > 0) {
      const item = queue.shift();
      if (!item) break;

      const { description, success } = await fetchDescription(
        item.source_url,
        item.source_domain,
        usePuppeteer
      );

      if (success && description) {
        results.set(item.source_url, description);
      }

      if (delayMs > 0) {
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }
  }

  // Use lower concurrency for Puppeteer (heavy)
  const actualConcurrency = usePuppeteer ? Math.min(concurrency, 2) : concurrency;
  const workers = Array.from({ length: actualConcurrency }, () => worker());
  await Promise.all(workers);

  return results;
}
