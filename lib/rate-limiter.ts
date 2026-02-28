/**
 * In-memory rate limiter for API routes.
 *
 * Design: Module-level Map survives across warm serverless invocations.
 * In Vercel, each Lambda instance has its own Map — a user routed to a
 * different instance gets fresh quota. This is acceptable: the goal is
 * preventing runaway costs from bugs/scripts, not enforcing strict
 * per-user business limits. Upgrade to Redis (Upstash) if needed later.
 */

interface RateLimitEntry {
  count: number;
  resetAt: number; // unix ms
}

const store = new Map<string, RateLimitEntry>();

const MAX_STORE_SIZE = 1000;

function cleanup() {
  if (store.size <= MAX_STORE_SIZE) return;
  const now = Date.now();
  for (const [key, entry] of store) {
    if (entry.resetAt <= now) store.delete(key);
  }
}

export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number
): { allowed: boolean; remaining: number; resetAt: number } {
  cleanup();

  const now = Date.now();
  const entry = store.get(key);

  if (!entry || entry.resetAt <= now) {
    // Fresh window
    const resetAt = now + windowMs;
    store.set(key, { count: 1, resetAt });
    return { allowed: true, remaining: limit - 1, resetAt };
  }

  if (entry.count < limit) {
    entry.count++;
    return { allowed: true, remaining: limit - entry.count, resetAt: entry.resetAt };
  }

  // Over limit
  return { allowed: false, remaining: 0, resetAt: entry.resetAt };
}

/** Extract client IP from Next.js request headers */
export function getClientIp(headers: Headers): string {
  return (
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    headers.get("x-real-ip") ??
    "unknown"
  );
}
