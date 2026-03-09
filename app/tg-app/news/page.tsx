"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Loader2,
  ExternalLink,
  Globe,
  Clock,
  Newspaper,
  Bell,
  ChevronRight,
} from "lucide-react";

/* ─── Types ──────────────────────────────────────────────── */

interface Article {
  id: string;
  title: string;
  summary: string;
  url: string;
  source_name: string;
  published_at: string | null;
  category: string;
}

/* ─── Constants ──────────────────────────────────────────── */

const CATEGORIES = [
  "All",
  "Humanitarian",
  "Policy & Governance",
  "Economy & Trade",
  "Health",
  "Education",
  "Climate & Environment",
  "Funding & Donors",
];

const CATEGORY_COLORS: Record<string, string> = {
  Humanitarian: "bg-red-50 text-red-700 border-red-200",
  "Policy & Governance": "bg-indigo-50 text-indigo-700 border-indigo-200",
  "Economy & Trade": "bg-emerald-50 text-emerald-700 border-emerald-200",
  Health: "bg-pink-50 text-pink-700 border-pink-200",
  Education: "bg-violet-50 text-violet-700 border-violet-200",
  "Climate & Environment": "bg-lime-50 text-lime-700 border-lime-200",
  "Funding & Donors": "bg-amber-50 text-amber-700 border-amber-200",
  General: "bg-dark-50 text-dark-600 border-dark-200",
};

/* ─── Helpers ────────────────────────────────────────────── */

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  return new Date(dateStr).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
}

/* ═══════════════════════════════════════════════════════════════
   COMPONENT
   ═══════════════════════════════════════════════════════════════ */

export default function TgNewsPage() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [category, setCategory] = useState("All");
  const [offset, setOffset] = useState(0);

  async function fetchArticles(cat: string, off: number, append = false) {
    if (append) setLoadingMore(true);
    else setLoading(true);

    try {
      const params = new URLSearchParams({ limit: "30", offset: String(off) });
      if (cat !== "All") params.set("category", cat);
      const res = await fetch(`/api/news?${params}`);
      const json = await res.json();

      if (append) {
        setArticles((prev) => [...prev, ...(json.articles || [])]);
      } else {
        setArticles(json.articles || []);
      }
      setTotal(json.total || 0);
    } catch {
      // Silent fail
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }

  useEffect(() => {
    setOffset(0);
    fetchArticles(category, 0);
  }, [category]);

  function loadMore() {
    const newOffset = offset + 30;
    setOffset(newOffset);
    fetchArticles(category, newOffset, true);
  }

  return (
    <div className="pb-6">
      {/* ── Sticky Header ── */}
      <div className="bg-white border-b border-dark-100 px-4 pt-3 pb-3 sticky top-0 z-30">
        <div className="flex items-center gap-3">
          <Link href="/tg-app" className="text-dark-400 hover:text-dark-600">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-lg font-extrabold text-dark-900 tracking-tight">
            Dev News
          </h1>
        </div>
      </div>

      {/* ── Category chips ── */}
      <div className="px-4 pt-3 pb-2 overflow-x-auto no-scrollbar">
        <div className="flex gap-1.5 min-w-max">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-[11px] font-bold border transition-colors ${
                category === cat
                  ? "bg-dark-900 text-white border-dark-900"
                  : "bg-white text-dark-500 border-dark-200"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* ── Articles ── */}
      <div className="px-4 mt-2">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-cyan-500" />
          </div>
        ) : articles.length === 0 ? (
          <div className="text-center py-16">
            <Newspaper className="w-10 h-10 text-dark-200 mx-auto mb-3" />
            <p className="text-sm font-semibold text-dark-500">No articles yet</p>
            <p className="text-xs text-dark-400 mt-1">
              Check back soon for development news.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {articles.map((article) => (
              <a
                key={article.id}
                href={article.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block"
              >
                <div className="bg-white border border-dark-100 rounded-xl px-4 py-3 active:bg-dark-50 transition-colors">
                  <h3 className="text-sm font-bold text-dark-900 leading-snug line-clamp-2">
                    {article.title}
                  </h3>
                  {article.summary && (
                    <p className="mt-1 text-xs text-dark-400 leading-relaxed line-clamp-2">
                      {article.summary}
                    </p>
                  )}
                  <div className="flex items-center gap-2.5 mt-2 flex-wrap">
                    <span className="flex items-center gap-1 text-[10px] text-dark-400">
                      <Globe className="w-3 h-3" />
                      {article.source_name}
                    </span>
                    {article.published_at && (
                      <span className="flex items-center gap-1 text-[10px] text-dark-400">
                        <Clock className="w-3 h-3" />
                        {timeAgo(article.published_at)}
                      </span>
                    )}
                    <span
                      className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold border ${
                        CATEGORY_COLORS[article.category] || CATEGORY_COLORS.General
                      }`}
                    >
                      {article.category}
                    </span>
                  </div>
                </div>
              </a>
            ))}

            {/* Load more */}
            {articles.length < total && (
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="w-full py-2.5 mt-2 rounded-xl border border-dark-200 text-dark-500 font-bold text-xs disabled:opacity-50"
              >
                {loadingMore ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin inline mr-1.5" />
                ) : null}
                Load more
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Subscribe strip ── */}
      <div className="px-4 mt-4 mb-6">
        <Link href="/tg-app/alerts">
          <div className="bg-gradient-to-r from-cyan-500 to-teal-500 rounded-2xl px-4 py-3.5 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
              <Bell className="w-4.5 h-4.5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-white">Get this in your daily digest</p>
              <p className="text-[11px] text-cyan-100 mt-0.5">Customise job &amp; news alerts →</p>
            </div>
            <ChevronRight className="w-4 h-4 text-white/70 shrink-0" />
          </div>
        </Link>
      </div>

      <style jsx global>{`
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
    </div>
  );
}
