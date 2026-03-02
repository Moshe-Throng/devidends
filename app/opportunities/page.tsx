"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import {
  Search,
  Filter,
  Calendar,
  MapPin,
  Building2,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Briefcase,
  X,
  Loader2,
  Globe,
  AlertCircle,
  ChevronDown,
  Target,
  Clock,
  Award,
  Eye,
  EyeOff,
  Flame,
  Sparkles,
  ArrowRight,
} from "lucide-react";

import type { SampleOpportunity } from "@/lib/types/cv-score";

import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { SaveButton } from "@/components/SaveButton";

/* ─── Constants ────────────────────────────────────────────── */

const PAGE_SIZE = 20;

const TYPE_OPTIONS = [
  { value: "", label: "All Types" },
  { value: "job", label: "Jobs" },
  { value: "tender", label: "Tenders" },
  { value: "consulting", label: "Consulting" },
  { value: "internship", label: "Internships" },
];

const SENIORITY_OPTIONS = [
  { value: "", label: "All Levels" },
  { value: "Director", label: "Director" },
  { value: "Senior", label: "Senior" },
  { value: "Mid-level", label: "Mid-level" },
  { value: "Junior", label: "Junior" },
  { value: "Entry", label: "Entry Level" },
];

const SORT_OPTIONS = [
  { value: "deadline", label: "Deadline (soonest)" },
  { value: "quality", label: "Quality (highest)" },
  { value: "title", label: "Title (A-Z)" },
  { value: "organization", label: "Organization (A-Z)" },
];

/* ─── Helpers ──────────────────────────────────────────────── */

/** Returns a cleaned description or empty string if it's garbage/sparse */
function cleanDescription(desc: string | null | undefined): string {
  if (!desc) return "";
  const trimmed = desc.trim();
  // Too short to be useful
  if (trimmed.length < 40) return "";
  // Detect garbage patterns (pipe-separated metadata, all-caps codes, etc.)
  const pipeCount = (trimmed.match(/\|/g) || []).length;
  const words = trimmed.split(/\s+/).length;
  if (pipeCount > 3 && words < 20) return "";
  // If mostly uppercase codes like "CON, CONSULTANTS, FT"
  const upperRatio = (trimmed.match(/[A-Z]/g) || []).length / trimmed.length;
  if (upperRatio > 0.6 && words < 15) return "";
  return trimmed;
}

function fmtDeadline(d: string | null) {
  if (!d) return "Open";
  try {
    return new Date(d).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return d;
  }
}

function deadlineBadge(d: string | null, isExpired: boolean) {
  if (!d) return { label: "Open", cls: "bg-dark-50 text-dark-500 border-dark-100" };
  if (isExpired) return { label: "Closed", cls: "bg-red-50 text-red-600 border-red-200" };
  try {
    const diff = new Date(d).getTime() - Date.now();
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
    if (days <= 3) return { label: `${days}d left`, cls: "bg-red-50 text-red-600 border-red-200" };
    if (days <= 7) return { label: `${days}d left`, cls: "bg-amber-50 text-amber-600 border-amber-200" };
    return { label: fmtDeadline(d), cls: "bg-emerald-50 text-emerald-600 border-emerald-200" };
  } catch {
    return { label: d, cls: "bg-dark-50 text-dark-500 border-dark-100" };
  }
}

function typeColor(type: string) {
  switch (type.toLowerCase()) {
    case "job":
      return "bg-cyan-50 text-cyan-700 border-cyan-200";
    case "tender":
      return "bg-violet-50 text-violet-700 border-violet-200";
    case "consulting":
      return "bg-teal-50 text-teal-700 border-teal-200";
    case "internship":
      return "bg-amber-50 text-amber-700 border-amber-200";
    case "grant":
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
    default:
      return "bg-dark-50 text-dark-600 border-dark-200";
  }
}

function qualityDot(score: number) {
  if (score >= 70) return { color: "bg-emerald-400", label: "High quality" };
  if (score >= 50) return { color: "bg-amber-400", label: "Partial info" };
  return { color: "bg-dark-300", label: "Limited info" };
}

function seniorityBadge(seniority: string) {
  switch (seniority) {
    case "Director":
      return "bg-violet-50 text-violet-700 border-violet-200";
    case "Senior":
      return "bg-blue-50 text-blue-700 border-blue-200";
    case "Mid-level":
      return "bg-teal-50 text-teal-700 border-teal-200";
    case "Junior":
      return "bg-amber-50 text-amber-700 border-amber-200";
    case "Entry":
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
    default:
      return "bg-dark-50 text-dark-600 border-dark-200";
  }
}

/* ═══════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════════ */

export default function OpportunitiesPage() {
  /* ─── Data state ────────────────────────────────────────── */
  const [opportunities, setOpportunities] = useState<SampleOpportunity[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /* ─── View mode ────────────────────────────────────────── */
  const [viewMode, setViewMode] = useState<"overview" | "browse">("overview");

  /* ─── Filter state ──────────────────────────────────────── */
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [seniorityFilter, setSeniorityFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [countryFilter, setCountryFilter] = useState("");
  const [sortBy, setSortBy] = useState("deadline");
  const [showExpired, setShowExpired] = useState(false);
  const [page, setPage] = useState(1);
  const [filtersOpen, setFiltersOpen] = useState(false);

  /* ─── Fetch data ────────────────────────────────────────── */
  useEffect(() => {
    const params = new URLSearchParams({
      hideExpired: showExpired ? "false" : "true",
      minQuality: "40",
    });
    fetch(`/api/opportunities/sample?${params}`)
      .then((r) => r.json())
      .then((d) => {
        setOpportunities(d.opportunities || []);
        setTotalCount(d.total || 0);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message || "Failed to load opportunities");
        setLoading(false);
      });
  }, [showExpired]);

  /* ─── Derived data ──────────────────────────────────────── */

  const sources = useMemo(() => {
    const set = new Set(opportunities.map((o) => o.source_domain));
    return Array.from(set).sort();
  }, [opportunities]);

  const countries = useMemo(() => {
    const set = new Set(opportunities.map((o) => o.country).filter(Boolean));
    return Array.from(set).sort();
  }, [opportunities]);

  const filtered = useMemo(() => {
    let result = [...opportunities];

    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (o) =>
          o.title.toLowerCase().includes(q) ||
          o.organization.toLowerCase().includes(q) ||
          o.description.toLowerCase().includes(q)
      );
    }

    // Type filter — use classified_type
    if (typeFilter) {
      result = result.filter(
        (o) => o.classified_type.toLowerCase() === typeFilter.toLowerCase()
      );
    }

    // Seniority filter
    if (seniorityFilter) {
      result = result.filter((o) => o.seniority === seniorityFilter);
    }

    // Source filter
    if (sourceFilter) {
      result = result.filter((o) => o.source_domain === sourceFilter);
    }

    // Country filter
    if (countryFilter) {
      result = result.filter((o) => o.country === countryFilter);
    }

    // Sort
    result.sort((a, b) => {
      switch (sortBy) {
        case "quality":
          return b.quality_score - a.quality_score;
        case "title":
          return a.title.localeCompare(b.title);
        case "organization":
          return a.organization.localeCompare(b.organization);
        case "deadline":
        default:
          if (!a.deadline && !b.deadline) return 0;
          if (!a.deadline) return 1;
          if (!b.deadline) return -1;
          return (
            new Date(a.deadline).getTime() - new Date(b.deadline).getTime()
          );
      }
    });

    return result;
  }, [opportunities, searchQuery, typeFilter, seniorityFilter, sourceFilter, countryFilter, sortBy]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const activeFilters =
    (typeFilter ? 1 : 0) +
    (seniorityFilter ? 1 : 0) +
    (sourceFilter ? 1 : 0) +
    (countryFilter ? 1 : 0);

  /* ─── Overview sections ──────────────────────────────────── */
  const closingSoon = useMemo(() => {
    const now = Date.now();
    const weekMs = 7 * 24 * 60 * 60 * 1000;
    return opportunities
      .filter((o) => o.deadline && !o.is_expired && new Date(o.deadline).getTime() - now < weekMs && new Date(o.deadline).getTime() > now)
      .sort((a, b) => new Date(a.deadline!).getTime() - new Date(b.deadline!).getTime())
      .slice(0, 8);
  }, [opportunities]);

  const latestOpps = useMemo(() => {
    return opportunities
      .filter((o) => !o.is_expired)
      .sort((a, b) => b.quality_score - a.quality_score)
      .slice(0, 10);
  }, [opportunities]);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [searchQuery, typeFilter, seniorityFilter, sourceFilter, countryFilter, sortBy, showExpired]);

  const clearFilters = () => {
    setSearchQuery("");
    setTypeFilter("");
    setSeniorityFilter("");
    setSourceFilter("");
    setCountryFilter("");
    setSortBy("deadline");
  };

  /* ─── Render ────────────────────────────────────────────── */

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <SiteHeader activeHref="/opportunities" />

      {/* Gradient accent strip */}
      <div className="h-1 bg-gradient-to-r from-cyan-500 via-teal-400 to-cyan-500" />

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
        <div className="absolute -top-40 -right-40 w-[500px] h-[500px] rounded-full bg-cyan-500/10 blur-3xl" />

        <div className="relative max-w-6xl mx-auto px-6 py-12 lg:py-16">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-teal-400 flex items-center justify-center shadow-lg shadow-cyan-500/25">
              <Globe className="w-5 h-5 text-white" />
            </div>
            <span className="text-cyan-400 text-xs font-bold tracking-[0.2em] uppercase">
              Opportunities
            </span>
          </div>
          <h1 className="text-3xl lg:text-5xl font-extrabold text-white tracking-tight">
            Find Your Next Assignment
          </h1>
          <p className="mt-3 text-dark-300 text-base lg:text-lg max-w-2xl leading-relaxed">
            Browse live opportunities from GIZ, World Bank, UNDP, African Union,
            and more. Filter by source, type, seniority, and location.
          </p>
          {!loading && (
            <div className="flex flex-wrap items-center gap-4 mt-4">
              <p className="text-cyan-400 text-sm font-semibold">
                {opportunities.length} active opportunities from {sources.length} sources
              </p>
              {totalCount > opportunities.length && (
                <p className="text-dark-500 text-xs">
                  ({totalCount - opportunities.length} expired / low-quality hidden)
                </p>
              )}
            </div>
          )}
        </div>
      </section>

      {/* Content */}
      <main className="flex-1 max-w-6xl mx-auto w-full px-6 py-10 lg:py-14">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24">
            <Loader2 className="w-10 h-10 text-cyan-500 animate-spin mb-4" />
            <p className="text-dark-400 font-medium">
              Loading opportunities...
            </p>
          </div>
        ) : error ? (
          <div className="flex items-center gap-3 p-4 rounded-xl bg-red-50 border border-red-200 text-red-700">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <span className="text-sm font-medium">{error}</span>
          </div>
        ) : viewMode === "overview" ? (
          /* ═══════════ OVERVIEW MODE ═══════════ */
          <div className="space-y-10">
            {/* Closing Soon */}
            {closingSoon.length > 0 && (
              <section>
                <div className="flex items-center gap-2.5 mb-4">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-red-500 to-amber-500 flex items-center justify-center">
                    <Flame className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <h2 className="text-lg font-extrabold text-dark-900 tracking-tight">
                      Closing Soon
                    </h2>
                    <p className="text-[11px] text-dark-400">Deadlines within 7 days</p>
                  </div>
                </div>
                <div className="space-y-3">
                  {closingSoon.map((opp) => {
                    const badge = deadlineBadge(opp.deadline, opp.is_expired);
                    return (
                      <Link
                        key={opp.id}
                        href={`/opportunities/${opp.id}`}
                        className="block p-4 rounded-xl border border-dark-100 hover:border-red-300 hover:shadow-md hover:shadow-red-500/5 transition-all group"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <h3 className="text-sm font-bold text-dark-900 group-hover:text-red-600 transition-colors line-clamp-1">
                              {opp.title}
                            </h3>
                            <div className="flex flex-wrap items-center gap-2.5 mt-1.5 text-xs text-dark-400">
                              <span className="inline-flex items-center gap-1">
                                <Building2 className="w-3 h-3" />
                                {opp.organization}
                              </span>
                              {opp.country && (
                                <span className="inline-flex items-center gap-1">
                                  <MapPin className="w-3 h-3" />
                                  {opp.country}
                                </span>
                              )}
                            </div>
                          </div>
                          <span className={`shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border ${badge.cls}`}>
                            <Clock className="w-3 h-3" />
                            {badge.label}
                          </span>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Latest / Top Quality */}
            <section>
              <div className="flex items-center gap-2.5 mb-4">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-teal-500 flex items-center justify-center">
                  <Sparkles className="w-4 h-4 text-white" />
                </div>
                <div>
                  <h2 className="text-lg font-extrabold text-dark-900 tracking-tight">
                    Top Opportunities
                  </h2>
                  <p className="text-[11px] text-dark-400">Highest quality listings</p>
                </div>
              </div>
              <div className="space-y-3">
                {latestOpps.map((opp) => {
                  const badge = deadlineBadge(opp.deadline, opp.is_expired);
                  return (
                    <Link
                      key={opp.id}
                      href={`/opportunities/${opp.id}`}
                      className="block p-4 rounded-xl border border-dark-100 hover:border-cyan-300 hover:shadow-md hover:shadow-cyan-500/5 transition-all group"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2 mb-1">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-[0.1em] border ${typeColor(opp.classified_type)}`}>
                              {opp.classified_type}
                            </span>
                            {opp.seniority && (
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-[0.1em] border ${seniorityBadge(opp.seniority)}`}>
                                {opp.seniority}
                              </span>
                            )}
                          </div>
                          <h3 className="text-sm font-bold text-dark-900 group-hover:text-cyan-600 transition-colors line-clamp-1">
                            {opp.title}
                          </h3>
                          <div className="flex flex-wrap items-center gap-2.5 mt-1.5 text-xs text-dark-400">
                            <span className="inline-flex items-center gap-1">
                              <Building2 className="w-3 h-3" />
                              {opp.organization}
                            </span>
                            {opp.country && (
                              <span className="inline-flex items-center gap-1">
                                <MapPin className="w-3 h-3" />
                                {opp.country}
                              </span>
                            )}
                          </div>
                        </div>
                        <span className={`shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border ${badge.cls}`}>
                          <Calendar className="w-3 h-3" />
                          {badge.label}
                        </span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </section>

            {/* Browse All CTA */}
            <div className="text-center pt-4">
              <button
                onClick={() => setViewMode("browse")}
                className="inline-flex items-center gap-2.5 px-8 py-4 rounded-xl bg-dark-900 text-white font-bold text-base transition-all hover:bg-dark-800 hover:shadow-lg hover:-translate-y-0.5"
              >
                Browse All {opportunities.length} Opportunities
                <ArrowRight className="w-4 h-4" />
              </button>
              <p className="text-xs text-dark-400 mt-2">
                Search, filter by type, seniority, source, and country
              </p>
            </div>
          </div>
        ) : (
          /* ═══════════ BROWSE MODE ═══════════ */
          <div className="space-y-6">
            {/* Back to overview */}
            <button
              onClick={() => { setViewMode("overview"); clearFilters(); }}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-dark-400 hover:text-dark-600 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
              Back to overview
            </button>

            {/* ── Search + Filter Bar ──────────────────────── */}
            <div className="flex flex-col lg:flex-row gap-4">
              {/* Search */}
              <div className="relative flex-1">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-dark-300" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by title, organization, or keywords..."
                  className="w-full pl-12 pr-4 py-3.5 rounded-xl border border-dark-100 text-sm focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 placeholder:text-dark-300"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-dark-300 hover:text-dark-500"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Filter toggle + expired toggle + sort */}
              <div className="flex flex-wrap gap-2 sm:gap-3">
                <button
                  onClick={() => setFiltersOpen(!filtersOpen)}
                  className={`inline-flex items-center gap-2 px-3.5 sm:px-5 py-3 sm:py-3.5 rounded-xl border text-sm font-semibold transition-colors ${
                    filtersOpen || activeFilters > 0
                      ? "border-cyan-500 bg-cyan-50 text-cyan-700"
                      : "border-dark-100 text-dark-600 hover:border-dark-200"
                  }`}
                >
                  <Filter className="w-4 h-4" />
                  Filters
                  {activeFilters > 0 && (
                    <span className="w-5 h-5 rounded-full bg-cyan-500 text-white text-[10px] font-bold flex items-center justify-center">
                      {activeFilters}
                    </span>
                  )}
                </button>

                {/* Show expired toggle */}
                <button
                  onClick={() => setShowExpired(!showExpired)}
                  className={`inline-flex items-center gap-1.5 px-3 sm:px-4 py-3 sm:py-3.5 rounded-xl border text-sm font-semibold transition-colors ${
                    showExpired
                      ? "border-amber-400 bg-amber-50 text-amber-700"
                      : "border-dark-100 text-dark-400 hover:border-dark-200"
                  }`}
                  title={showExpired ? "Showing expired — click to hide" : "Expired hidden — click to show"}
                >
                  {showExpired ? (
                    <Eye className="w-4 h-4" />
                  ) : (
                    <EyeOff className="w-4 h-4" />
                  )}
                  <span className="hidden sm:inline">Expired</span>
                </button>

                <div className="relative">
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                    className="appearance-none px-3 sm:px-4 pr-8 sm:pr-10 py-3 sm:py-3.5 rounded-xl border border-dark-100 text-sm text-dark-600 font-medium focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 bg-white cursor-pointer"
                  >
                    {SORT_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-300 pointer-events-none" />
                </div>
              </div>
            </div>

            {/* ── Filter Panel ─────────────────────────────── */}
            {filtersOpen && (
              <div className="p-5 rounded-2xl border border-dark-100 bg-dark-50/30 animate-fadeInUp">
                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div>
                    <label className="text-[10px] font-bold text-dark-500 uppercase tracking-[0.15em] mb-1.5 block">
                      Type
                    </label>
                    <div className="relative">
                      <select
                        value={typeFilter}
                        onChange={(e) => setTypeFilter(e.target.value)}
                        className="w-full appearance-none px-3 py-2.5 pr-8 rounded-lg border border-dark-100 text-sm bg-white focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                      >
                        {TYPE_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-300 pointer-events-none" />
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-dark-500 uppercase tracking-[0.15em] mb-1.5 block">
                      Seniority
                    </label>
                    <div className="relative">
                      <select
                        value={seniorityFilter}
                        onChange={(e) => setSeniorityFilter(e.target.value)}
                        className="w-full appearance-none px-3 py-2.5 pr-8 rounded-lg border border-dark-100 text-sm bg-white focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                      >
                        {SENIORITY_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-300 pointer-events-none" />
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-dark-500 uppercase tracking-[0.15em] mb-1.5 block">
                      Source
                    </label>
                    <div className="relative">
                      <select
                        value={sourceFilter}
                        onChange={(e) => setSourceFilter(e.target.value)}
                        className="w-full appearance-none px-3 py-2.5 pr-8 rounded-lg border border-dark-100 text-sm bg-white focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                      >
                        <option value="">All Sources</option>
                        {sources.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-300 pointer-events-none" />
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-dark-500 uppercase tracking-[0.15em] mb-1.5 block">
                      Country
                    </label>
                    <div className="relative">
                      <select
                        value={countryFilter}
                        onChange={(e) => setCountryFilter(e.target.value)}
                        className="w-full appearance-none px-3 py-2.5 pr-8 rounded-lg border border-dark-100 text-sm bg-white focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                      >
                        <option value="">All Countries</option>
                        {countries.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-300 pointer-events-none" />
                    </div>
                  </div>
                </div>

                {activeFilters > 0 && (
                  <button
                    onClick={clearFilters}
                    className="mt-4 inline-flex items-center gap-1.5 text-xs text-dark-400 hover:text-red-500 font-semibold transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                    Clear all filters
                  </button>
                )}
              </div>
            )}

            {/* ── Results count + active filter chips ─────── */}
            <div className="flex items-center justify-between">
              <p className="text-sm text-dark-400">
                Showing{" "}
                <span className="font-semibold text-dark-700">
                  {filtered.length}
                </span>{" "}
                {filtered.length === 1 ? "opportunity" : "opportunities"}
                {activeFilters > 0 && " (filtered)"}
              </p>
              {activeFilters > 0 && (
                <div className="flex flex-wrap gap-2">
                  {typeFilter && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-cyan-50 text-cyan-700 text-xs font-semibold border border-cyan-200">
                      {typeFilter}
                      <button onClick={() => setTypeFilter("")}>
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  )}
                  {seniorityFilter && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-violet-50 text-violet-700 text-xs font-semibold border border-violet-200">
                      {seniorityFilter}
                      <button onClick={() => setSeniorityFilter("")}>
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  )}
                  {sourceFilter && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-cyan-50 text-cyan-700 text-xs font-semibold border border-cyan-200">
                      {sourceFilter}
                      <button onClick={() => setSourceFilter("")}>
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  )}
                  {countryFilter && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-cyan-50 text-cyan-700 text-xs font-semibold border border-cyan-200">
                      {countryFilter}
                      <button onClick={() => setCountryFilter("")}>
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* ── Cards ─────────────────────────────────────── */}
            {paginated.length === 0 ? (
              <div className="text-center py-20">
                <Briefcase className="w-12 h-12 text-dark-200 mx-auto mb-4" />
                <p className="text-lg font-bold text-dark-700">
                  No opportunities found
                </p>
                <p className="text-sm text-dark-400 mt-1">
                  Try adjusting your filters or search query
                </p>
                {activeFilters > 0 && (
                  <button
                    onClick={clearFilters}
                    className="mt-4 text-sm text-cyan-600 hover:text-cyan-700 font-semibold"
                  >
                    Clear all filters
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                {paginated.map((opp) => {
                  const badge = deadlineBadge(opp.deadline, opp.is_expired);
                  const quality = qualityDot(opp.quality_score);
                  return (
                    <Link
                      key={opp.id}
                      href={`/opportunities/${opp.id}`}
                      className={`block p-5 lg:p-6 rounded-2xl border hover:shadow-md transition-all group ${
                        opp.is_expired
                          ? "border-dark-100 bg-dark-50/40 opacity-70 hover:opacity-90 hover:border-dark-200"
                          : "border-dark-100 hover:border-cyan-300 hover:shadow-cyan-500/5"
                      }`}
                    >
                      <div className="flex flex-col lg:flex-row lg:items-start gap-4">
                        <div className="flex-1 min-w-0">
                          {/* Top row: badges */}
                          <div className="flex flex-wrap items-center gap-2 mb-2">
                            {/* Quality dot */}
                            <span
                              className={`w-2 h-2 rounded-full ${quality.color} flex-shrink-0`}
                              title={quality.label}
                            />

                            {/* Type badge — use classified_type */}
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-[0.1em] border ${typeColor(opp.classified_type)}`}
                            >
                              {opp.classified_type}
                            </span>

                            {/* Seniority badge */}
                            {opp.seniority && (
                              <span
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-[0.1em] border ${seniorityBadge(opp.seniority)}`}
                              >
                                <Award className="w-3 h-3" />
                                {opp.seniority}
                              </span>
                            )}

                            {/* Expired badge */}
                            {opp.is_expired && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-[0.1em] border bg-red-50 text-red-500 border-red-200">
                                <Clock className="w-3 h-3" />
                                Expired
                              </span>
                            )}

                            <span className="text-[10px] text-dark-300 font-medium uppercase tracking-[0.1em]">
                              {opp.source_domain}
                            </span>
                          </div>

                          {/* Title */}
                          <h3 className={`text-base font-bold transition-colors line-clamp-2 ${
                            opp.is_expired
                              ? "text-dark-500"
                              : "text-dark-900 group-hover:text-cyan-600"
                          }`}>
                            {opp.title}
                          </h3>

                          {/* Meta row */}
                          <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-dark-400">
                            <span className="inline-flex items-center gap-1">
                              <Building2 className="w-3.5 h-3.5" />
                              {opp.organization}
                            </span>
                            {opp.country && (
                              <span className="inline-flex items-center gap-1">
                                <MapPin className="w-3.5 h-3.5" />
                                {opp.country}
                              </span>
                            )}
                            {opp.experience_years && (
                              <span className="inline-flex items-center gap-1 text-dark-500 font-medium">
                                <Briefcase className="w-3.5 h-3.5" />
                                {opp.experience_years}+ years
                              </span>
                            )}
                          </div>

                          {/* Description or fallback */}
                          {cleanDescription(opp.description) ? (
                            <p className="mt-2 text-sm text-dark-500 leading-relaxed line-clamp-2">
                              {cleanDescription(opp.description)}
                            </p>
                          ) : opp.source_url ? (
                            <p className="mt-2 text-sm text-dark-400 italic">
                              Full details available on application page
                            </p>
                          ) : null}
                        </div>

                        {/* Right side: deadline + save + link */}
                        <div className="flex lg:flex-col items-center lg:items-end gap-3 lg:gap-2 flex-shrink-0">
                          <div className="flex items-center gap-2">
                            <span
                              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border ${badge.cls}`}
                            >
                              <Calendar className="w-3.5 h-3.5" />
                              {badge.label}
                            </span>
                            <SaveButton
                              opportunityId={opp.id}
                              opportunityTitle={opp.title}
                              opportunityOrg={opp.organization}
                              opportunityDeadline={opp.deadline}
                              opportunityUrl={opp.source_url}
                            />
                          </div>
                          {opp.source_url && !opp.is_expired && (
                            <span className="text-xs text-dark-300 group-hover:text-cyan-500 transition-colors inline-flex items-center gap-1">
                              View details
                              <ExternalLink className="w-3 h-3" />
                            </span>
                          )}
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}

            {/* ── Pagination ────────────────────────────────── */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 pt-6">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="p-2.5 rounded-xl border border-dark-100 text-dark-500 hover:bg-dark-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>

                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter((p) => {
                    if (totalPages <= 7) return true;
                    if (p === 1 || p === totalPages) return true;
                    if (Math.abs(p - page) <= 1) return true;
                    return false;
                  })
                  .reduce<(number | "...")[]>((acc, p, i, arr) => {
                    if (i > 0 && p - (arr[i - 1] as number) > 1) {
                      acc.push("...");
                    }
                    acc.push(p);
                    return acc;
                  }, [])
                  .map((p, i) =>
                    p === "..." ? (
                      <span
                        key={`dots-${i}`}
                        className="px-2 text-dark-300 text-sm"
                      >
                        ...
                      </span>
                    ) : (
                      <button
                        key={p}
                        onClick={() => setPage(p as number)}
                        className={`w-10 h-10 rounded-xl text-sm font-semibold transition-all ${
                          page === p
                            ? "bg-gradient-to-r from-cyan-500 to-teal-500 text-white shadow-md shadow-cyan-500/20"
                            : "border border-dark-100 text-dark-600 hover:bg-dark-50"
                        }`}
                      >
                        {p}
                      </button>
                    )
                  )}

                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="p-2.5 rounded-xl border border-dark-100 text-dark-500 hover:bg-dark-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* ── CTA: Score My CV ──────────────────────────── */}
            <div className="relative rounded-2xl overflow-hidden border border-dark-100 mt-8">
              <div
                className="absolute inset-0 opacity-[0.03]"
                style={{
                  backgroundImage:
                    "radial-gradient(circle, #27ABD2 1px, transparent 1px)",
                  backgroundSize: "20px 20px",
                }}
              />
              <div className="relative flex flex-col sm:flex-row items-center justify-between gap-4 p-6 lg:p-8">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-500 to-teal-400 flex items-center justify-center shadow-lg shadow-cyan-500/20">
                    <Target className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <p className="font-bold text-dark-900">
                      Found an interesting opportunity?
                    </p>
                    <p className="text-sm text-dark-400 mt-0.5">
                      Score your CV against it to see how well you match
                    </p>
                  </div>
                </div>
                <Link
                  href="/score"
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-teal-500 text-white font-bold text-sm hover:from-cyan-600 hover:to-teal-600 transition-all shadow-lg shadow-cyan-500/20 hover:shadow-xl hover:shadow-cyan-500/30 hover:-translate-y-0.5 whitespace-nowrap"
                >
                  Score My CV
                  <Target className="w-4 h-4" />
                </Link>
              </div>
            </div>
          </div>
        )}
      </main>

      <SiteFooter />
    </div>
  );
}
