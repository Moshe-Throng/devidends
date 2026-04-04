// @ts-nocheck
"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import {
  Search,
  Filter,
  Calendar,
  Building2,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Globe,
  AlertCircle,
  ChevronDown,
  Target,
  Clock,
  Radar,
  TrendingUp,
  Shield,
  DollarSign,
  Radio,
  Zap,
  FileSearch,
  ArrowRight,
  X,
} from "lucide-react";

import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";

/* ─── Constants ────────────────────────────────────────────── */

const PAGE_SIZE = 20;

const VIEW_TABS = [
  { value: "all", label: "All Signals", icon: Radar },
  { value: "pipeline", label: "Pipeline", icon: TrendingUp },
  { value: "tenders", label: "Live Tenders", icon: FileSearch },
];

const SIGNAL_TYPE_LABELS: Record<string, { label: string; color: string }> = {
  iati_planned: { label: "Planned Activity", color: "bg-blue-50 text-blue-700 border-blue-200" },
  iati_winding_down: { label: "Winding Down", color: "bg-amber-50 text-amber-700 border-amber-200" },
  donor_hiring: { label: "Donor Hiring", color: "bg-purple-50 text-purple-700 border-purple-200" },
  usaid_forecast: { label: "USAID Forecast", color: "bg-indigo-50 text-indigo-700 border-indigo-200" },
  tender_published: { label: "Published", color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  tender_reoi: { label: "REOI", color: "bg-teal-50 text-teal-700 border-teal-200" },
};

const CONFIDENCE_STYLES: Record<string, { label: string; dot: string; bg: string }> = {
  high: { label: "High", dot: "bg-emerald-500", bg: "text-emerald-700" },
  medium: { label: "Medium", dot: "bg-amber-500", bg: "text-amber-700" },
  low: { label: "Low", dot: "bg-dark-300", bg: "text-dark-500" },
};

const STAGE_LABELS: Record<string, string> = {
  forecast: "Early Signal",
  pipeline: "In Pipeline",
  published: "Published",
  awarded: "Awarded",
};

const SOURCE_LABELS: Record<string, string> = {
  "iatistandard.org": "IATI",
  "sam.gov": "SAM.gov",
  "ted.europa.eu": "EU TED",
  "ungm.org": "UNGM",
  "trademarkafrica.com": "TMA",
  "step.worldbank.org": "WB STEP",
  "worldbank.org": "World Bank",
  "usaid.gov": "USAID",
};

/* ─── Helpers ──────────────────────────────────────────────── */

function formatBudget(min: number | null | undefined, max: number | null | undefined): string | null {
  if (!min && !max) return null;
  const fmt = (n: number) => {
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
    return `$${n.toFixed(0)}`;
  };
  if (min && max && min !== max) return `${fmt(min)} – ${fmt(max)}`;
  return fmt(min || max || 0);
}

function daysUntil(deadline: string | null): number | null {
  if (!deadline) return null;
  const d = new Date(deadline);
  if (isNaN(d.getTime())) return null;
  return Math.ceil((d.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

function deadlineBadge(deadline: string | null): { label: string; cls: string } | null {
  const days = daysUntil(deadline);
  if (days === null) return null;
  if (days < 0) return { label: "Expired", cls: "bg-dark-100 text-dark-400 border-dark-200" };
  if (days <= 3) return { label: `${days}d left`, cls: "bg-red-50 text-red-600 border-red-200" };
  if (days <= 7) return { label: `${days}d left`, cls: "bg-amber-50 text-amber-600 border-amber-200" };
  if (days <= 30) return { label: `${days}d left`, cls: "bg-emerald-50 text-emerald-600 border-emerald-200" };
  const d = new Date(deadline!);
  return {
    label: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    cls: "bg-dark-50 text-dark-600 border-dark-100",
  };
}

function sourceName(domain: string): string {
  return SOURCE_LABELS[domain] || domain.replace(/^www\./, "").split(".")[0];
}

/* ─── Types ────────────────────────────────────────────────── */

interface DevisorItem {
  title: string;
  organization: string;
  description: string;
  deadline: string | null;
  published: string | null;
  country: string;
  source_url: string;
  source_domain: string;
  content_type: string;
  sector_norm?: string;
  raw_fields?: {
    budget_min?: number | null;
    budget_max?: number | null;
    procurement_method?: string | null;
    pipeline_stage?: string | null;
    donor_ref?: string | null;
    signal_type?: string | null;
    signal_confidence?: string | null;
    [key: string]: unknown;
  };
}

/* ─── Component ────────────────────────────────────────────── */

export default function DevisorPage() {
  const [items, setItems] = useState<DevisorItem[]>([]);
  const [total, setTotal] = useState(0);
  const [sectors, setSectors] = useState<string[]>([]);
  const [signalTypes, setSignalTypes] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  // Filters
  const [tab, setTab] = useState("all");
  const [search, setSearch] = useState("");
  const [sectorFilter, setSectorFilter] = useState("");
  const [signalFilter, setSignalFilter] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  // Fetch data
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          tab,
          limit: String(PAGE_SIZE),
          offset: String((page - 1) * PAGE_SIZE),
        });
        if (search) params.set("q", search);
        if (sectorFilter) params.set("sector", sectorFilter);
        if (signalFilter) params.set("signal_type", signalFilter);

        const res = await fetch(`/api/devisor?${params}`);
        const data = await res.json();
        setItems(data.items || []);
        setTotal(data.total || 0);
        setSectors(data.sectors || []);
        setSignalTypes(data.signalTypes || []);
      } catch (err) {
        console.error("Failed to fetch devisor data:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [tab, page, search, sectorFilter, signalFilter]);

  // Reset page on filter change
  useEffect(() => {
    setPage(1);
  }, [tab, search, sectorFilter, signalFilter]);

  // Debounced search
  const [searchInput, setSearchInput] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const activeFilterCount = [sectorFilter, signalFilter].filter(Boolean).length;

  // Stats
  const stats = useMemo(() => {
    const pipeline = items.filter((i) => ["forecast", "pipeline"].includes(i.raw_fields?.pipeline_stage || "")).length;
    const tenders = items.filter((i) => i.raw_fields?.pipeline_stage === "published").length;
    const highConf = items.filter((i) => i.raw_fields?.signal_confidence === "high").length;
    return { pipeline, tenders, highConf };
  }, [items]);

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <SiteHeader activeHref="/devisor" />

      {/* Gradient accent */}
      <div className="h-[3px] bg-gradient-to-r from-cyan-500 via-teal-400 to-cyan-500" />

      {/* Header */}
      <section className="border-b border-dark-50">
        <div className="max-w-6xl mx-auto px-5 sm:px-8 py-6 lg:py-8">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
            <div>
              <div className="flex items-center gap-2.5 mb-1.5">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-teal-500 flex items-center justify-center">
                  <Radar className="w-4 h-4 text-white" />
                </div>
                <h1 className="text-2xl lg:text-3xl font-bold text-dark-900 tracking-tight">
                  Devisor
                </h1>
              </div>
              <p className="text-sm text-dark-400 max-w-lg">
                Early intelligence on donor pipelines, upcoming tenders, and procurement signals — before they become public.
              </p>
            </div>
            <div className="flex items-center gap-3 text-xs font-semibold text-dark-500">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-dark-50">
                <Radio className="w-3 h-3 text-cyan-500" />
                {total} signals
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Main content */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-5 sm:px-8 py-6">
        {/* Tabs + Search + Filters */}
        <div className="flex flex-col gap-4 mb-6">
          {/* Tabs row */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            {VIEW_TABS.map((t) => {
              const Icon = t.icon;
              const isActive = tab === t.value;
              return (
                <button
                  key={t.value}
                  onClick={() => setTab(t.value)}
                  className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all whitespace-nowrap ${
                    isActive
                      ? "bg-gradient-to-r from-cyan-500 to-teal-500 text-white shadow-md shadow-cyan-500/20"
                      : "border border-dark-100 text-dark-600 hover:border-dark-200 hover:bg-dark-50"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {t.label}
                </button>
              );
            })}
          </div>

          {/* Search + filter toggle */}
          <div className="flex items-center gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-300" />
              <input
                type="text"
                placeholder="Search signals by title, organization..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="w-full pl-11 pr-4 py-3 rounded-xl border border-dark-100 text-sm focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 placeholder:text-dark-300"
              />
              {searchInput && (
                <button
                  onClick={() => setSearchInput("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-md hover:bg-dark-50"
                >
                  <X className="w-3.5 h-3.5 text-dark-400" />
                </button>
              )}
            </div>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`inline-flex items-center gap-2 px-4 py-3 rounded-xl border text-sm font-semibold transition-colors ${
                showFilters || activeFilterCount > 0
                  ? "border-cyan-500 bg-cyan-50 text-cyan-700"
                  : "border-dark-100 text-dark-600 hover:border-dark-200"
              }`}
            >
              <Filter className="w-4 h-4" />
              Filters
              {activeFilterCount > 0 && (
                <span className="w-5 h-5 rounded-full bg-cyan-500 text-white text-[10px] font-bold flex items-center justify-center">
                  {activeFilterCount}
                </span>
              )}
            </button>
          </div>

          {/* Filter panel */}
          {showFilters && (
            <div className="p-4 rounded-2xl border border-dark-100 bg-dark-50/30 animate-fadeInUp">
              <div className="flex flex-wrap gap-3">
                <select
                  value={sectorFilter}
                  onChange={(e) => setSectorFilter(e.target.value)}
                  className="appearance-none px-3 pr-8 py-2.5 rounded-xl border border-dark-100 text-sm text-dark-600 font-medium focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 bg-white cursor-pointer"
                >
                  <option value="">All Sectors</option>
                  {sectors.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
                <select
                  value={signalFilter}
                  onChange={(e) => setSignalFilter(e.target.value)}
                  className="appearance-none px-3 pr-8 py-2.5 rounded-xl border border-dark-100 text-sm text-dark-600 font-medium focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 bg-white cursor-pointer"
                >
                  <option value="">All Signal Types</option>
                  {signalTypes.map((st) => (
                    <option key={st} value={st}>
                      {SIGNAL_TYPE_LABELS[st]?.label || st}
                    </option>
                  ))}
                </select>
                {activeFilterCount > 0 && (
                  <button
                    onClick={() => { setSectorFilter(""); setSignalFilter(""); }}
                    className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-medium text-dark-500 hover:text-dark-700 hover:bg-dark-100 transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                    Clear
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Results */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-cyan-500" />
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-20">
            <AlertCircle className="w-10 h-10 text-dark-200 mx-auto mb-3" />
            <p className="text-sm font-semibold text-dark-500">No signals found</p>
            <p className="text-xs text-dark-400 mt-1">Try adjusting your filters or search terms</p>
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((item, idx) => (
              <SignalCard key={`${item.source_url}-${idx}`} item={item} />
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 pt-6">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="p-2.5 rounded-xl border border-dark-100 text-dark-500 hover:bg-dark-50 disabled:opacity-30 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
              let p: number;
              if (totalPages <= 7) {
                p = i + 1;
              } else if (page <= 4) {
                p = i + 1;
              } else if (page >= totalPages - 3) {
                p = totalPages - 6 + i;
              } else {
                p = page - 3 + i;
              }
              return (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className={`w-10 h-10 rounded-xl text-sm font-semibold transition-all ${
                    page === p
                      ? "bg-gradient-to-r from-cyan-500 to-teal-500 text-white shadow-md shadow-cyan-500/20"
                      : "border border-dark-100 text-dark-600 hover:bg-dark-50"
                  }`}
                >
                  {p}
                </button>
              );
            })}
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="p-2.5 rounded-xl border border-dark-100 text-dark-500 hover:bg-dark-50 disabled:opacity-30 transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </main>

      <SiteFooter />
    </div>
  );
}

/* ─── Signal Card ──────────────────────────────────────────── */

function SignalCard({ item }: { item: DevisorItem }) {
  const rf = item.raw_fields || {};
  const signalType = SIGNAL_TYPE_LABELS[rf.signal_type || ""] || null;
  const confidence = CONFIDENCE_STYLES[rf.signal_confidence || "low"] || CONFIDENCE_STYLES.low;
  const stage = STAGE_LABELS[rf.pipeline_stage || ""] || null;
  const budget = formatBudget(rf.budget_min as number, rf.budget_max as number);
  const dl = deadlineBadge(item.deadline);
  const source = sourceName(item.source_domain);
  const isPipeline = rf.pipeline_stage === "forecast" || rf.pipeline_stage === "pipeline";

  return (
    <a
      href={item.source_url}
      target="_blank"
      rel="noopener noreferrer"
      className={`block p-5 lg:p-6 rounded-2xl border transition-all group ${
        isPipeline
          ? "border-dark-100 hover:border-blue-300 hover:shadow-md hover:shadow-blue-500/5"
          : "border-dark-100 hover:border-cyan-300 hover:shadow-md hover:shadow-cyan-500/5"
      }`}
    >
      <div className="flex flex-col lg:flex-row lg:items-start gap-4">
        {/* Left content */}
        <div className="flex-1 min-w-0">
          {/* Badges row */}
          <div className="flex flex-wrap items-center gap-2 mb-2">
            {/* Confidence dot */}
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${confidence.dot}`} title={`${confidence.label} confidence`} />

            {/* Signal type badge */}
            {signalType && (
              <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider border ${signalType.color}`}>
                {signalType.label}
              </span>
            )}

            {/* Stage badge */}
            {stage && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider border bg-dark-50 text-dark-500 border-dark-200">
                {stage}
              </span>
            )}

            {/* Procurement method */}
            {rf.procurement_method && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider border bg-violet-50 text-violet-600 border-violet-200">
                {rf.procurement_method}
              </span>
            )}

            {/* Envest relevance */}
            {rf.relevance === "high" && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider border bg-cyan-50 text-cyan-700 border-cyan-200">
                Envest Match
              </span>
            )}

            {/* Sector */}
            {item.sector_norm && item.sector_norm !== "Other" && (
              <span className="text-[10px] font-medium text-dark-400 uppercase tracking-wider">
                {item.sector_norm}
              </span>
            )}
          </div>

          {/* Title */}
          <h3 className="text-base font-bold text-dark-900 group-hover:text-cyan-600 transition-colors line-clamp-2">
            {String(item.title || "")}
          </h3>

          {/* Meta row */}
          <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-dark-400">
            {item.organization && (
              <span className="inline-flex items-center gap-1">
                <Building2 className="w-3.5 h-3.5" />
                {item.organization}
              </span>
            )}
            {budget && (
              <span className="inline-flex items-center gap-1 font-semibold text-dark-600">
                <DollarSign className="w-3.5 h-3.5" />
                {budget}
              </span>
            )}
            <span className="inline-flex items-center gap-1">
              <Globe className="w-3.5 h-3.5" />
              {source}
            </span>
            {rf.donor_ref && (
              <span className="text-dark-300 font-mono text-[10px]">
                {(rf.donor_ref as string).slice(0, 30)}
              </span>
            )}
          </div>

          {/* Action note — the "so what" */}
          {rf.action_note && (
            <p className="mt-2 text-sm font-medium text-cyan-700 bg-cyan-50 border border-cyan-100 rounded-lg px-3 py-2 leading-relaxed">
              <Zap className="w-3.5 h-3.5 inline mr-1 -mt-0.5" />
              {rf.action_note as string}
            </p>
          )}

          {/* Description */}
          {item.description && !rf.action_note && (
            <p className="mt-2 text-sm text-dark-500 leading-relaxed line-clamp-2">
              {item.description.slice(0, 200)}
            </p>
          )}
        </div>

        {/* Right side */}
        <div className="flex lg:flex-col items-center lg:items-end gap-3 lg:gap-2 flex-shrink-0">
          {/* Deadline badge */}
          {dl && (
            <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border ${dl.cls}`}>
              <Calendar className="w-3 h-3" />
              {dl.label}
            </span>
          )}

          {/* Confidence label */}
          <span className={`text-[10px] font-bold uppercase tracking-wider ${confidence.bg}`}>
            {confidence.label} confidence
          </span>

          {/* Link */}
          <span className="text-xs text-dark-300 group-hover:text-cyan-500 transition-colors inline-flex items-center gap-1">
            View source <ExternalLink className="w-3 h-3" />
          </span>
        </div>
      </div>
    </a>
  );
}
