"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Shield,
  Briefcase,
  Users,
  Award,
  Database,
  RefreshCw,
  AlertCircle,
  Loader2,
  CheckCircle,
  XCircle,
  Clock,
  FileText,
  TrendingUp,
  BarChart3,
  ChevronRight,
  Copy,
  ExternalLink,
  Activity,
  DollarSign,
  Cpu,
  Zap,
} from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";

/* ─── Types ──────────────────────────────────────────────── */

interface SourceStats {
  name: string;
  count: number;
  sparse: number;
  avgDescLen: number;
  lastModified: string | null;
}

interface UsageStats {
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

interface AdminStats {
  opportunities: {
    total: number;
    sparse_descriptions: number;
    pct_with_descriptions: number;
    sources: SourceStats[];
  };
  subscribers: {
    total: number;
    active: number;
    by_channel: { email: number; telegram: number };
  };
  experts: {
    total: number;
    with_cv_score: number;
    avg_cv_score: number;
    avg_profile_score: number;
  };
  cv_scores: {
    total: number;
    avg_score: number;
  };
  ai_usage?: UsageStats;
  model_pricing?: Record<string, { input: number; output: number }>;
}

/* ─── Helpers ────────────────────────────────────────────── */

function fmtDate(d: string | null) {
  if (!d) return "Never";
  try {
    const date = new Date(d);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHrs = Math.floor(diffMs / (1000 * 60 * 60));
    if (diffHrs < 1) return "Just now";
    if (diffHrs < 24) return `${diffHrs}h ago`;
    const diffDays = Math.floor(diffHrs / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  } catch {
    return "Unknown";
  }
}

function healthColor(sparse: number, total: number) {
  if (total === 0) return { dot: "bg-dark-300", text: "text-dark-400", label: "Empty" };
  const pct = ((total - sparse) / total) * 100;
  if (pct >= 80) return { dot: "bg-emerald-500", text: "text-emerald-600", label: "Good" };
  if (pct >= 50) return { dot: "bg-amber-500", text: "text-amber-600", label: "Fair" };
  return { dot: "bg-red-500", text: "text-red-600", label: "Poor" };
}

/* ─── Component ──────────────────────────────────────────── */

export default function AdminPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loadingStats, setLoadingStats] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [setupGuide, setSetupGuide] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const [enrichResult, setEnrichResult] = useState<string | null>(null);

  // Auth guard
  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
    }
  }, [user, authLoading, router]);

  // Fetch stats
  useEffect(() => {
    if (!user) return;

    const fetchStats = async () => {
      setLoadingStats(true);
      setError(null);
      try {
        const res = await fetch("/api/admin/stats");
        const json = await res.json();

        if (json.setup_guide) {
          setSetupGuide(true);
          setUserId(json.user_id);
          setLoadingStats(false);
          return;
        }

        if (!res.ok) {
          setError(json.error || "Failed to load admin stats");
          setLoadingStats(false);
          return;
        }

        setStats(json);
      } catch {
        setError("Failed to connect to admin API");
      } finally {
        setLoadingStats(false);
      }
    };

    fetchStats();
  }, [user]);

  const handleEnrich = async (source?: string) => {
    setEnriching(true);
    setEnrichResult(null);
    try {
      const url = source
        ? `/api/opportunities/enrich?source=${source}&limit=10`
        : "/api/opportunities/enrich?limit=50";
      const res = await fetch(url, { method: "POST" });
      const json = await res.json();
      if (json.enriched != null) {
        setEnrichResult(
          `Enriched ${json.enriched}/${json.attempted} opportunities`
        );
      } else {
        setEnrichResult(json.error || "Enrichment completed");
      }
    } catch {
      setEnrichResult("Enrichment request failed");
    } finally {
      setEnriching(false);
    }
  };

  const copyUserId = () => {
    if (userId) {
      navigator.clipboard.writeText(userId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Loading
  if (authLoading) {
    return (
      <div className="min-h-screen bg-white flex flex-col">
        <SiteHeader />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-8 h-8 text-cyan-500 animate-spin" />
        </div>
        <SiteFooter />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-dark-50/30 flex flex-col">
      <SiteHeader />

      {/* Hero */}
      <section className="relative bg-dark-900 overflow-hidden">
        <div
          className="absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage:
              "radial-gradient(circle, #27ABD2 1px, transparent 1px)",
            backgroundSize: "24px 24px",
          }}
        />
        <div className="relative max-w-7xl mx-auto px-6 py-10 lg:py-12">
          <div className="flex items-center gap-3 mb-3 animate-staggerFadeUp">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-teal-400 flex items-center justify-center shadow-lg shadow-cyan-500/25">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <span className="text-cyan-400 text-xs font-bold tracking-[0.2em] uppercase">
              Staff Only
            </span>
          </div>
          <h1
            className="text-3xl lg:text-4xl font-extrabold text-white tracking-tight animate-staggerFadeUp"
            style={{ animationDelay: "0.1s" }}
          >
            Admin Dashboard
          </h1>
          <p
            className="mt-2 text-dark-300 text-sm lg:text-base animate-staggerFadeUp"
            style={{ animationDelay: "0.2s" }}
          >
            Scraper health, subscriber metrics, expert database overview
          </p>
        </div>
      </section>

      <main className="flex-1 max-w-7xl mx-auto w-full px-6 py-8 space-y-8">
        {/* Setup Guide */}
        {setupGuide && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 animate-fadeInUp">
            <div className="flex items-start gap-4">
              <AlertCircle className="w-6 h-6 text-amber-500 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <h2 className="text-lg font-bold text-dark-900 mb-2">
                  Admin Setup Required
                </h2>
                <p className="text-sm text-dark-600 mb-4 leading-relaxed">
                  Add your Supabase user ID to the{" "}
                  <code className="px-1.5 py-0.5 bg-dark-100 rounded text-xs font-mono">
                    ADMIN_USER_IDS
                  </code>{" "}
                  environment variable in your{" "}
                  <code className="px-1.5 py-0.5 bg-dark-100 rounded text-xs font-mono">
                    .env.local
                  </code>{" "}
                  file.
                </p>

                <div className="bg-white rounded-xl border border-amber-200 p-4 mb-4">
                  <p className="text-xs font-bold text-dark-500 uppercase tracking-wider mb-2">
                    Your User ID
                  </p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-sm font-mono text-dark-700 bg-dark-50 rounded-lg px-3 py-2 truncate">
                      {userId}
                    </code>
                    <button
                      onClick={copyUserId}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-dark-900 text-white text-xs font-bold hover:bg-dark-800 transition-colors"
                    >
                      {copied ? (
                        <CheckCircle className="w-3.5 h-3.5" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                      {copied ? "Copied" : "Copy"}
                    </button>
                  </div>
                </div>

                <div className="bg-dark-900 rounded-xl p-4 font-mono text-sm text-dark-300">
                  <p className="text-cyan-400 mb-1"># Add to .env.local:</p>
                  <p className="text-white">ADMIN_USER_IDS={userId}</p>
                </div>

                <p className="text-xs text-dark-400 mt-3">
                  After adding the variable, restart your development server.
                  For multiple admins, separate IDs with commas.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Error */}
        {error && !setupGuide && (
          <div className="flex items-center gap-3 p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 animate-fadeInUp">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <span className="text-sm font-medium">{error}</span>
          </div>
        )}

        {/* Loading skeletons */}
        {loadingStats && !setupGuide && (
          <div className="space-y-6">
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="h-28 rounded-xl bg-white animate-pulse"
                />
              ))}
            </div>
            <div className="h-80 rounded-xl bg-white animate-pulse" />
          </div>
        )}

        {/* Dashboard content */}
        {stats && (
          <>
            {/* ── Summary Cards ─────────────────────────────── */}
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white rounded-xl border border-dark-100 p-5 animate-fadeInUp">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-9 h-9 rounded-lg bg-cyan-50 flex items-center justify-center">
                    <Briefcase className="w-4.5 h-4.5 text-cyan-600" />
                  </div>
                  <span className="text-xs font-bold text-dark-400 uppercase tracking-wider">
                    Opportunities
                  </span>
                </div>
                <p className="text-3xl font-extrabold text-dark-900">
                  {stats.opportunities.total}
                </p>
                <p className="text-xs text-dark-400 mt-1">
                  {stats.opportunities.pct_with_descriptions}% have descriptions
                </p>
              </div>

              <div
                className="bg-white rounded-xl border border-dark-100 p-5 animate-fadeInUp"
                style={{ animationDelay: "0.05s" }}
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-9 h-9 rounded-lg bg-teal-50 flex items-center justify-center">
                    <Users className="w-4.5 h-4.5 text-teal-600" />
                  </div>
                  <span className="text-xs font-bold text-dark-400 uppercase tracking-wider">
                    Subscribers
                  </span>
                </div>
                <p className="text-3xl font-extrabold text-dark-900">
                  {stats.subscribers.total}
                </p>
                <p className="text-xs text-dark-400 mt-1">
                  {stats.subscribers.active} active
                </p>
              </div>

              <div
                className="bg-white rounded-xl border border-dark-100 p-5 animate-fadeInUp"
                style={{ animationDelay: "0.1s" }}
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-9 h-9 rounded-lg bg-emerald-50 flex items-center justify-center">
                    <Award className="w-4.5 h-4.5 text-emerald-600" />
                  </div>
                  <span className="text-xs font-bold text-dark-400 uppercase tracking-wider">
                    Expert Profiles
                  </span>
                </div>
                <p className="text-3xl font-extrabold text-dark-900">
                  {stats.experts.total}
                </p>
                <p className="text-xs text-dark-400 mt-1">
                  {stats.experts.with_cv_score} with CV scores
                </p>
              </div>

              <div
                className="bg-white rounded-xl border border-dark-100 p-5 animate-fadeInUp"
                style={{ animationDelay: "0.15s" }}
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-9 h-9 rounded-lg bg-amber-50 flex items-center justify-center">
                    <TrendingUp className="w-4.5 h-4.5 text-amber-600" />
                  </div>
                  <span className="text-xs font-bold text-dark-400 uppercase tracking-wider">
                    Avg CV Score
                  </span>
                </div>
                <p className="text-3xl font-extrabold text-dark-900">
                  {stats.cv_scores.avg_score || "—"}
                </p>
                <p className="text-xs text-dark-400 mt-1">
                  {stats.cv_scores.total} total scores
                </p>
              </div>
            </div>

            {/* ── Scraper Health Table ───────────────────────── */}
            <div className="bg-white rounded-xl border border-dark-100 overflow-hidden animate-fadeInUp" style={{ animationDelay: "0.2s" }}>
              <div className="flex items-center justify-between p-5 border-b border-dark-50">
                <div className="flex items-center gap-3">
                  <Database className="w-5 h-5 text-cyan-500" />
                  <h2 className="text-sm font-bold text-dark-900">
                    Scraper Health
                  </h2>
                </div>
                <div className="flex items-center gap-3">
                  {enrichResult && (
                    <span className="text-xs text-emerald-600 font-medium animate-fadeInUp">
                      {enrichResult}
                    </span>
                  )}
                  <button
                    onClick={() => handleEnrich()}
                    disabled={enriching}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-cyan-500 to-teal-500 text-white text-xs font-bold hover:from-cyan-600 hover:to-teal-600 disabled:opacity-50 transition-all"
                  >
                    {enriching ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <RefreshCw className="w-3.5 h-3.5" />
                    )}
                    {enriching ? "Enriching..." : "Enrich All"}
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-dark-50/50">
                      <th className="text-left px-5 py-3 text-[10px] font-bold text-dark-500 uppercase tracking-wider">
                        Source
                      </th>
                      <th className="text-right px-5 py-3 text-[10px] font-bold text-dark-500 uppercase tracking-wider">
                        Jobs
                      </th>
                      <th className="text-right px-5 py-3 text-[10px] font-bold text-dark-500 uppercase tracking-wider">
                        Sparse
                      </th>
                      <th className="text-right px-5 py-3 text-[10px] font-bold text-dark-500 uppercase tracking-wider">
                        Avg Desc
                      </th>
                      <th className="text-left px-5 py-3 text-[10px] font-bold text-dark-500 uppercase tracking-wider">
                        Last Updated
                      </th>
                      <th className="text-center px-5 py-3 text-[10px] font-bold text-dark-500 uppercase tracking-wider">
                        Health
                      </th>
                      <th className="px-5 py-3"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-dark-50">
                    {stats.opportunities.sources.map((source) => {
                      const health = healthColor(source.sparse, source.count);
                      return (
                        <tr
                          key={source.name}
                          className="hover:bg-dark-50/50 transition-colors"
                        >
                          <td className="px-5 py-3.5">
                            <span className="text-sm font-semibold text-dark-900 capitalize">
                              {source.name}
                            </span>
                          </td>
                          <td className="px-5 py-3.5 text-right">
                            <span className="text-sm font-bold text-dark-700 tabular-nums">
                              {source.count}
                            </span>
                          </td>
                          <td className="px-5 py-3.5 text-right">
                            <span
                              className={`text-sm font-medium tabular-nums ${
                                source.sparse > 0
                                  ? "text-red-500"
                                  : "text-dark-300"
                              }`}
                            >
                              {source.sparse}
                            </span>
                          </td>
                          <td className="px-5 py-3.5 text-right">
                            <span className="text-sm text-dark-500 tabular-nums">
                              {source.avgDescLen > 0
                                ? `${source.avgDescLen}`
                                : "—"}
                            </span>
                          </td>
                          <td className="px-5 py-3.5">
                            <span className="text-sm text-dark-500 flex items-center gap-1.5">
                              <Clock className="w-3.5 h-3.5 text-dark-300" />
                              {fmtDate(source.lastModified)}
                            </span>
                          </td>
                          <td className="px-5 py-3.5 text-center">
                            <span
                              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${health.text} bg-opacity-10`}
                            >
                              <span
                                className={`w-2 h-2 rounded-full ${health.dot}`}
                              />
                              {health.label}
                            </span>
                          </td>
                          <td className="px-5 py-3.5">
                            {source.sparse > 0 && (
                              <button
                                onClick={() => handleEnrich(source.name)}
                                disabled={enriching}
                                className="text-xs text-cyan-600 font-semibold hover:text-cyan-700 disabled:opacity-50"
                              >
                                Enrich
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Totals row */}
              <div className="flex items-center justify-between px-5 py-3 bg-dark-50/30 border-t border-dark-100">
                <span className="text-xs font-bold text-dark-500">
                  Total: {stats.opportunities.total} opportunities across{" "}
                  {stats.opportunities.sources.length} sources
                </span>
                <span className="text-xs text-dark-400">
                  {stats.opportunities.sparse_descriptions} need enrichment
                </span>
              </div>
            </div>

            {/* ── Bottom Grid: Subscribers + Experts ─────────── */}
            <div className="grid lg:grid-cols-2 gap-6">
              {/* Subscribers */}
              <div
                className="bg-white rounded-xl border border-dark-100 p-6 animate-fadeInUp"
                style={{ animationDelay: "0.25s" }}
              >
                <div className="flex items-center gap-3 mb-5">
                  <Users className="w-5 h-5 text-teal-500" />
                  <h2 className="text-sm font-bold text-dark-900">
                    Subscriber Breakdown
                  </h2>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-dark-600">Total</span>
                    <span className="text-sm font-bold text-dark-900">
                      {stats.subscribers.total}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-dark-600">Active</span>
                    <span className="text-sm font-bold text-emerald-600">
                      {stats.subscribers.active}
                    </span>
                  </div>
                  <div className="border-t border-dark-50 pt-3">
                    <p className="text-[10px] font-bold text-dark-400 uppercase tracking-wider mb-2">
                      By Channel
                    </p>
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full bg-cyan-500" />
                        <span className="text-sm text-dark-600">
                          Email: {stats.subscribers.by_channel.email}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full bg-teal-500" />
                        <span className="text-sm text-dark-600">
                          Telegram: {stats.subscribers.by_channel.telegram}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Experts */}
              <div
                className="bg-white rounded-xl border border-dark-100 p-6 animate-fadeInUp"
                style={{ animationDelay: "0.3s" }}
              >
                <div className="flex items-center gap-3 mb-5">
                  <Award className="w-5 h-5 text-emerald-500" />
                  <h2 className="text-sm font-bold text-dark-900">
                    Expert Database
                  </h2>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-dark-600">
                      Total Profiles
                    </span>
                    <span className="text-sm font-bold text-dark-900">
                      {stats.experts.total}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-dark-600">
                      With CV Score
                    </span>
                    <span className="text-sm font-bold text-dark-900">
                      {stats.experts.with_cv_score}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-dark-600">
                      Avg CV Score
                    </span>
                    <span className="text-sm font-bold text-dark-900">
                      {stats.experts.avg_cv_score || "—"}/100
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-dark-600">
                      Avg Profile Completeness
                    </span>
                    <span className="text-sm font-bold text-dark-900">
                      {stats.experts.avg_profile_score || "—"}%
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* ── AI Cost Tracking ──────────────────────────── */}
            {stats.ai_usage && (
              <div
                className="bg-white rounded-xl border border-dark-100 overflow-hidden animate-fadeInUp"
                style={{ animationDelay: "0.32s" }}
              >
                <div className="flex items-center justify-between p-5 border-b border-dark-50">
                  <div className="flex items-center gap-3">
                    <DollarSign className="w-5 h-5 text-cyan-500" />
                    <h2 className="text-sm font-bold text-dark-900">
                      AI Cost Tracking
                    </h2>
                    <span className="text-[10px] font-medium text-dark-400 bg-dark-50 px-2 py-0.5 rounded-full">
                      Last 30 days
                    </span>
                  </div>
                </div>

                <div className="p-5 space-y-5">
                  {/* Summary cards */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="bg-dark-50/50 rounded-xl p-4">
                      <p className="text-[10px] font-bold text-dark-400 uppercase tracking-wider mb-1">
                        Total Spend
                      </p>
                      <p className="text-2xl font-extrabold text-dark-900">
                        ${stats.ai_usage.total_cost_usd.toFixed(2)}
                      </p>
                    </div>
                    <div className="bg-dark-50/50 rounded-xl p-4">
                      <p className="text-[10px] font-bold text-dark-400 uppercase tracking-wider mb-1">
                        API Calls
                      </p>
                      <p className="text-2xl font-extrabold text-dark-900">
                        {stats.ai_usage.total_requests}
                      </p>
                    </div>
                    <div className="bg-dark-50/50 rounded-xl p-4">
                      <p className="text-[10px] font-bold text-dark-400 uppercase tracking-wider mb-1">
                        Avg Cost/Call
                      </p>
                      <p className="text-2xl font-extrabold text-dark-900">
                        ${stats.ai_usage.total_requests > 0
                          ? (stats.ai_usage.total_cost_usd / stats.ai_usage.total_requests).toFixed(3)
                          : "0.000"}
                      </p>
                    </div>
                    <div className="bg-dark-50/50 rounded-xl p-4">
                      <p className="text-[10px] font-bold text-dark-400 uppercase tracking-wider mb-1">
                        Cache Hits
                      </p>
                      <p className="text-2xl font-extrabold text-emerald-600">
                        {stats.ai_usage.cached_count}
                      </p>
                    </div>
                  </div>

                  {/* Cost by feature */}
                  {Object.keys(stats.ai_usage?.by_feature || {}).length > 0 && (
                    <div>
                      <p className="text-[10px] font-bold text-dark-400 uppercase tracking-wider mb-3">
                        Cost by Feature
                      </p>
                      <div className="space-y-2">
                        {Object.entries(stats.ai_usage?.by_feature || {}).map(
                          ([feature, data]) => {
                            const pct =
                              stats.ai_usage!.total_cost_usd > 0
                                ? (data.cost / stats.ai_usage!.total_cost_usd) * 100
                                : 0;
                            const featureLabel: Record<string, string> = {
                              cv_score: "CV Scoring",
                              cv_extract: "CV Extraction",
                              profile_extract: "Profile Extract",
                            };
                            return (
                              <div key={feature}>
                                <div className="flex items-center justify-between mb-1">
                                  <div className="flex items-center gap-2">
                                    <Cpu className="w-3.5 h-3.5 text-cyan-500" />
                                    <span className="text-sm font-semibold text-dark-700">
                                      {featureLabel[feature] || feature}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-4 text-xs text-dark-500">
                                    <span>{data.count} calls</span>
                                    <span className="font-bold text-dark-900">
                                      ${data.cost.toFixed(3)}
                                    </span>
                                  </div>
                                </div>
                                <div className="h-2 bg-dark-100 rounded-full overflow-hidden">
                                  <div
                                    className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-teal-500"
                                    style={{ width: `${Math.max(pct, 2)}%` }}
                                  />
                                </div>
                              </div>
                            );
                          }
                        )}
                      </div>
                    </div>
                  )}

                  {/* Token usage */}
                  <div className="flex items-center gap-6 p-4 bg-dark-50/50 rounded-xl">
                    <div>
                      <p className="text-[10px] font-bold text-dark-400 uppercase tracking-wider">
                        Input Tokens
                      </p>
                      <p className="text-lg font-bold text-dark-900">
                        {(stats.ai_usage.total_input_tokens / 1000).toFixed(1)}K
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-dark-400 uppercase tracking-wider">
                        Output Tokens
                      </p>
                      <p className="text-lg font-bold text-dark-900">
                        {(stats.ai_usage.total_output_tokens / 1000).toFixed(1)}K
                      </p>
                    </div>
                    <div className="flex-1" />
                    <div className="text-right">
                      <p className="text-[10px] font-bold text-dark-400 uppercase tracking-wider">
                        Current Model
                      </p>
                      <p className="text-sm font-bold text-cyan-600">
                        Claude Sonnet 4
                      </p>
                      <p className="text-[10px] text-dark-400">
                        $3/M in · $15/M out
                      </p>
                    </div>
                  </div>

                  {/* Model pricing comparison */}
                  {stats.model_pricing && (
                    <div>
                      <p className="text-[10px] font-bold text-dark-400 uppercase tracking-wider mb-3">
                        <Zap className="w-3.5 h-3.5 inline-block mr-1 -mt-0.5" />
                        Model Cost Comparison (per 1M tokens)
                      </p>
                      <div className="grid sm:grid-cols-2 gap-2">
                        {Object.entries(stats.model_pricing || {}).map(
                          ([model, pricing]) => {
                            const isActive = model === "claude-sonnet-4-20250514";
                            const shortName: Record<string, string> = {
                              "claude-sonnet-4-20250514": "Claude Sonnet 4",
                              "claude-haiku-4-5-20251001": "Claude Haiku 4.5",
                              "deepseek-chat": "Deepseek V3",
                              "deepseek-reasoner": "Deepseek R1",
                            };
                            return (
                              <div
                                key={model}
                                className={`flex items-center justify-between p-3 rounded-lg border ${
                                  isActive
                                    ? "border-cyan-200 bg-cyan-50/50"
                                    : "border-dark-100"
                                }`}
                              >
                                <div className="flex items-center gap-2">
                                  {isActive && (
                                    <span className="w-2 h-2 rounded-full bg-cyan-500" />
                                  )}
                                  <span
                                    className={`text-xs font-semibold ${
                                      isActive ? "text-cyan-700" : "text-dark-600"
                                    }`}
                                  >
                                    {shortName[model] || model}
                                  </span>
                                  {isActive && (
                                    <span className="text-[9px] font-bold text-cyan-600 bg-cyan-100 px-1.5 py-0.5 rounded">
                                      ACTIVE
                                    </span>
                                  )}
                                </div>
                                <span className="text-xs text-dark-500 tabular-nums">
                                  ${pricing.input} in / ${pricing.output} out
                                </span>
                              </div>
                            );
                          }
                        )}
                      </div>
                    </div>
                  )}

                  {stats.ai_usage.total_requests === 0 && (
                    <div className="text-center py-6">
                      <DollarSign className="w-8 h-8 text-dark-200 mx-auto mb-2" />
                      <p className="text-sm text-dark-400">
                        No AI API calls tracked yet. Cost data will appear after
                        the first CV scoring.
                      </p>
                      <p className="text-xs text-dark-300 mt-1">
                        Create the{" "}
                        <code className="px-1 py-0.5 bg-dark-100 rounded text-[10px] font-mono">
                          api_usage
                        </code>{" "}
                        table in Supabase to enable tracking.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── Quick Actions ──────────────────────────────── */}
            <div
              className="bg-white rounded-xl border border-dark-100 p-6 animate-fadeInUp"
              style={{ animationDelay: "0.35s" }}
            >
              <div className="flex items-center gap-3 mb-5">
                <Activity className="w-5 h-5 text-cyan-500" />
                <h2 className="text-sm font-bold text-dark-900">
                  Quick Actions
                </h2>
              </div>

              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <Link
                  href="/admin/test"
                  className="flex items-center gap-3 p-4 rounded-xl border border-dark-100 hover:border-cyan-300 hover:bg-cyan-50/30 transition-all group"
                >
                  <BarChart3 className="w-5 h-5 text-dark-400 group-hover:text-cyan-500 transition-colors" />
                  <div>
                    <p className="text-sm font-semibold text-dark-700">
                      Connection Tests
                    </p>
                    <p className="text-xs text-dark-400">API health checks</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-dark-300 ml-auto" />
                </Link>

                <Link
                  href="/opportunities"
                  className="flex items-center gap-3 p-4 rounded-xl border border-dark-100 hover:border-cyan-300 hover:bg-cyan-50/30 transition-all group"
                >
                  <Briefcase className="w-5 h-5 text-dark-400 group-hover:text-cyan-500 transition-colors" />
                  <div>
                    <p className="text-sm font-semibold text-dark-700">
                      View Opportunities
                    </p>
                    <p className="text-xs text-dark-400">Browse all listings</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-dark-300 ml-auto" />
                </Link>

                <a
                  href="https://supabase.com/dashboard/project/ysrzmvsrvtovmiqtokqu"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 p-4 rounded-xl border border-dark-100 hover:border-cyan-300 hover:bg-cyan-50/30 transition-all group"
                >
                  <Database className="w-5 h-5 text-dark-400 group-hover:text-cyan-500 transition-colors" />
                  <div>
                    <p className="text-sm font-semibold text-dark-700">
                      Supabase
                    </p>
                    <p className="text-xs text-dark-400">Database dashboard</p>
                  </div>
                  <ExternalLink className="w-4 h-4 text-dark-300 ml-auto" />
                </a>

                <Link
                  href="/score"
                  className="flex items-center gap-3 p-4 rounded-xl border border-dark-100 hover:border-cyan-300 hover:bg-cyan-50/30 transition-all group"
                >
                  <FileText className="w-5 h-5 text-dark-400 group-hover:text-cyan-500 transition-colors" />
                  <div>
                    <p className="text-sm font-semibold text-dark-700">
                      CV Scorer
                    </p>
                    <p className="text-xs text-dark-400">Test the scorer</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-dark-300 ml-auto" />
                </Link>
              </div>
            </div>

            {/* ── Crawl4AI Note ──────────────────────────────── */}
            <div
              className="bg-dark-900 rounded-xl p-5 animate-fadeInUp"
              style={{ animationDelay: "0.4s" }}
            >
              <div className="flex items-start gap-3">
                <RefreshCw className="w-5 h-5 text-cyan-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-bold text-white mb-1">
                    Full Crawl4AI Enrichment
                  </p>
                  <p className="text-xs text-dark-300 leading-relaxed mb-3">
                    For comprehensive enrichment of all sparse descriptions
                    (JS-rendered sites like DRC, AU, Kifiya), run the Python
                    script directly:
                  </p>
                  <div className="bg-dark-800 rounded-lg px-4 py-3 font-mono text-sm text-cyan-400">
                    python tools/enrich_descriptions.py --limit 20
                  </div>
                  <p className="text-xs text-dark-400 mt-2">
                    The &ldquo;Enrich All&rdquo; button above uses the TS-based
                    enrichment (Cheerio + Puppeteer). For sites that block
                    simple requests, use the Crawl4AI script.
                  </p>
                </div>
              </div>
            </div>
          </>
        )}
      </main>

      <SiteFooter />
    </div>
  );
}
