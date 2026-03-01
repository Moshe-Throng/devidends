/**
 * Shared HTTP utilities — fetch with retry, rate limiting, user-agent rotation.
 */

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0",
];

export function randomUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

export function defaultHeaders(): Record<string, string> {
  return {
    "User-Agent": randomUserAgent(),
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
  };
}

interface FetchWithRetryOptions {
  maxRetries?: number;
  delayMs?: number;
  timeoutMs?: number;
  headers?: Record<string, string>;
}

/**
 * Fetch with automatic retry on transient errors (5xx, network errors).
 */
export async function fetchWithRetry(
  url: string,
  init?: RequestInit & { timeout?: number },
  opts: FetchWithRetryOptions = {}
): Promise<Response> {
  const { maxRetries = 2, delayMs = 2000, timeoutMs = 30000 } = opts;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      const res = await fetch(url, {
        ...init,
        signal: controller.signal,
        headers: {
          ...defaultHeaders(),
          ...init?.headers,
        },
      });
      clearTimeout(timer);

      // Retry on server errors (5xx)
      if (res.status >= 500 && attempt < maxRetries) {
        await sleep(delayMs * (attempt + 1));
        continue;
      }

      return res;
    } catch (err: unknown) {
      if (attempt < maxRetries) {
        await sleep(delayMs * (attempt + 1));
        continue;
      }
      throw err;
    }
  }

  // Should never reach here
  throw new Error(`fetchWithRetry: exhausted ${maxRetries} retries for ${url}`);
}

/** Strip HTML tags from a string */
export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#\d+;/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
