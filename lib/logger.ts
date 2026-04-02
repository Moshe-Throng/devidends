/**
 * Centralized error + event logging.
 * Writes to Supabase error_log and events tables.
 * Fire-and-forget — never blocks the caller.
 */

import { createClient } from "@supabase/supabase-js";

let _sb: ReturnType<typeof createClient> | null = null;
function getSb() {
  if (_sb) return _sb;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  _sb = createClient(url, key);
  return _sb;
}

// ─── Error Logging ───────────────────────────────────────────

interface ErrorLogInput {
  source: string;           // e.g. "cv-scorer", "ingest", "crawler", "claim"
  message: string;
  severity?: "error" | "warn" | "critical";
  stack?: string;
  metadata?: Record<string, unknown>;
  user_id?: string;
  telegram_id?: string;
  url?: string;
}

export function logError(input: ErrorLogInput) {
  const sb = getSb();
  if (!sb) { console.error(`[${input.source}]`, input.message); return; }

  const row = {
    source: input.source,
    severity: input.severity || "error",
    message: input.message.slice(0, 2000),
    stack: input.stack?.slice(0, 5000) || null,
    metadata: input.metadata || {},
    user_id: input.user_id || null,
    telegram_id: input.telegram_id || null,
    url: input.url || null,
  };

  // Fire and forget — cast to any to bypass typed schema (error_log is a new table)
  (sb.from("error_log") as any).insert(row).then(({ error }: any) => {
    if (error) console.error("[logger] Failed to write error_log:", error.message);
  });

  // Also console.error for Vercel logs
  console.error(`[${input.source}] ${input.severity || "error"}: ${input.message}`);
}

/** Convenience: log an Error object */
export function logException(source: string, err: unknown, meta?: Record<string, unknown>) {
  const e = err instanceof Error ? err : new Error(String(err));
  logError({
    source,
    message: e.message,
    stack: e.stack,
    metadata: meta,
  });
}

// ─── Event Tracking ──────────────────────────────────────────

interface EventInput {
  event: string;            // e.g. "cv_scored", "opportunity_viewed", "claim_completed"
  profile_id?: string;
  telegram_id?: string;
  metadata?: Record<string, unknown>;
}

export function trackEvent(input: EventInput) {
  const sb = getSb();
  if (!sb) return;

  const row = {
    event: input.event,
    profile_id: input.profile_id || null,
    telegram_id: input.telegram_id || null,
    metadata: input.metadata || {},
  };

  (sb.from("events") as any).insert(row).then(({ error }: any) => {
    if (error) console.error("[logger] Failed to write event:", error.message);
  });
}
