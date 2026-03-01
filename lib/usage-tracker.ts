/**
 * AI API usage tracking for cost monitoring.
 * Stores usage data in Supabase for persistent tracking.
 */

import { createClient } from "@supabase/supabase-js";

export interface UsageEntry {
  model: string;
  feature: string; // "cv_score", "cv_extract", "profile_extract"
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  cached: boolean;
  created_at?: string;
}

// Model pricing (USD per million tokens) — updated March 2026
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  "claude-sonnet-4-20250514": { input: 3.0, output: 15.0 },
  "claude-haiku-4-5-20251001": { input: 0.80, output: 4.0 },
  "deepseek-chat": { input: 0.27, output: 1.10 },
  "deepseek-reasoner": { input: 0.55, output: 2.19 },
};

export function calculateCost(
  model: string,
  inputTokens: number,
  outputTokens: number
): number {
  const pricing = MODEL_PRICING[model] || { input: 3.0, output: 15.0 };
  return (
    (inputTokens / 1_000_000) * pricing.input +
    (outputTokens / 1_000_000) * pricing.output
  );
}

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

/**
 * Log a single API usage event to Supabase.
 * Non-blocking — errors are logged but don't propagate.
 */
export async function logUsage(entry: UsageEntry): Promise<void> {
  try {
    const supabase = getSupabaseAdmin();
    await supabase.from("api_usage").insert({
      model: entry.model,
      feature: entry.feature,
      input_tokens: entry.input_tokens,
      output_tokens: entry.output_tokens,
      cost_usd: entry.cost_usd,
      cached: entry.cached,
    });
  } catch (err) {
    console.error("[usage-tracker] Failed to log usage:", err);
  }
}

export interface UsageStats {
  total_requests: number;
  total_cost_usd: number;
  total_input_tokens: number;
  total_output_tokens: number;
  by_feature: Record<
    string,
    { count: number; cost: number; input_tokens: number; output_tokens: number }
  >;
  by_model: Record<string, { count: number; cost: number }>;
  daily: Array<{ date: string; count: number; cost: number }>;
  cached_count: number;
}

/**
 * Get aggregated usage stats. Falls back to empty stats if table doesn't exist.
 */
export async function getUsageStats(days = 30): Promise<UsageStats> {
  const empty: UsageStats = {
    total_requests: 0,
    total_cost_usd: 0,
    total_input_tokens: 0,
    total_output_tokens: 0,
    by_feature: {},
    by_model: {},
    daily: [],
    cached_count: 0,
  };

  try {
    const supabase = getSupabaseAdmin();
    const since = new Date(
      Date.now() - days * 24 * 60 * 60 * 1000
    ).toISOString();

    const { data: rows, error } = await supabase
      .from("api_usage")
      .select("*")
      .gte("created_at", since)
      .order("created_at", { ascending: true });

    if (error || !rows) return empty;

    const stats: UsageStats = { ...empty };

    for (const row of rows) {
      stats.total_requests++;
      stats.total_cost_usd += row.cost_usd || 0;
      stats.total_input_tokens += row.input_tokens || 0;
      stats.total_output_tokens += row.output_tokens || 0;
      if (row.cached) stats.cached_count++;

      // By feature
      const f = row.feature || "unknown";
      if (!stats.by_feature[f])
        stats.by_feature[f] = { count: 0, cost: 0, input_tokens: 0, output_tokens: 0 };
      stats.by_feature[f].count++;
      stats.by_feature[f].cost += row.cost_usd || 0;
      stats.by_feature[f].input_tokens += row.input_tokens || 0;
      stats.by_feature[f].output_tokens += row.output_tokens || 0;

      // By model
      const m = row.model || "unknown";
      if (!stats.by_model[m]) stats.by_model[m] = { count: 0, cost: 0 };
      stats.by_model[m].count++;
      stats.by_model[m].cost += row.cost_usd || 0;

      // Daily
      const date = (row.created_at || "").slice(0, 10);
      const dayEntry = stats.daily.find((d) => d.date === date);
      if (dayEntry) {
        dayEntry.count++;
        dayEntry.cost += row.cost_usd || 0;
      } else {
        stats.daily.push({ date, count: 1, cost: row.cost_usd || 0 });
      }
    }

    return stats;
  } catch {
    return empty;
  }
}

/** Model pricing info (for admin display) */
export const MODEL_PRICING_INFO = MODEL_PRICING;
