"use client";

import { useState, useEffect } from "react";
import {
  Loader2,
  ExternalLink,
  Newspaper,
  Clock,
  Globe,
  AlertCircle,
} from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";

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
  "General",
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

const PAGE_SIZE = 30;

/* ─── Helpers ────────────────────────────────────────────── */

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
}

function domain(url: string): string {
  try {
    return new URL(url).hostname.replace("www.", "");
  } catch {
    return "";
  }
}

/* ═══════════════════════════════════════════════════════════════
   COMPONENT
   ═══════════════════════════════════════════════════════════════ */

export default function NewsPage() {
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
      const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(off) });
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
    const newOffset = offset + PAGE_SIZE;
    setOffset(newOffset);
    fetchArticles(category, newOffset, true);
  }

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <SiteHeader activeHref="/news" />

      {/* Gradient accent */}
      <div className="h-[3px] bg-gradient-to-r from-cyan-500 via-teal-400 to-cyan-500" />

      {/* Hero */}
      <section className="relative overflow-hidden border-b border-dark-50">
        <div className="absolute inset-0 opacity-[0.025]">
          <div
            className="absolute inset-0"
            style={{
              backgroundImage:
                "radial-gradient(circle at 1px 1px, #212121 1px, transparent 0)",
              backgroundSize: "28px 28px",
            }}
          />
        </div>
        <div className="absolute -top-20 -right-20 w-[300px] h-[300px] rounded-full bg-teal-500/5 blur-3xl" />

        <div className="relative max-w-5xl mx-auto px-5 sm:px-8 py-8 lg:py-10">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-teal-400 flex items-center justify-center shadow-lg shadow-cyan-500/15">
              <Newspaper className="w-5 h-5 text-white" strokeWidth={2} />
            </div>
            <span className="text-cyan-600 text-xs font-bold tracking-[0.2em] uppercase">
              Intel Feed
            </span>
          </div>
          <h1 className="text-2xl lg:text-3xl font-extrabold text-dark-900 tracking-tight">
            Development News
          </h1>
          <p className="mt-1.5 text-dark-400 text-sm lg:text-base max-w-2xl leading-relaxed">
            International development news and updates relevant to Africa and Ethiopia.
          </p>
        </div>
      </section>

      {/* Category chips */}
      <div className="border-b border-dark-50 bg-white sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-5 sm:px-8 py-3">
          <div className="flex gap-2 overflow-x-auto no-scrollbar">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                onClick={() => setCategory(cat)}
                className={`shrink-0 px-3.5 py-1.5 rounded-full text-xs font-bold border transition-colors ${
                  category === cat
                    ? "bg-dark-900 text-white border-dark-900"
                    : "bg-white text-dark-500 border-dark-200 hover:border-dark-400"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-5 sm:px-8 py-8">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-cyan-500" />
          </div>
        ) : articles.length === 0 ? (
          <div className="text-center py-20">
            <AlertCircle className="w-10 h-10 text-dark-200 mx-auto mb-3" />
            <p className="text-sm font-semibold text-dark-500">No articles found</p>
            <p className="text-xs text-dark-400 mt-1">
              {category !== "All"
                ? `No ${category} articles available. Try a different category.`
                : "News feed is being populated. Check back soon."}
            </p>
          </div>
        ) : (
          <>
            <div className="space-y-3">
              {articles.map((article) => (
                <a
                  key={article.id}
                  href={article.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block group"
                >
                  <div className="border border-dark-100 rounded-xl px-5 py-4 hover:border-cyan-300 hover:shadow-md hover:shadow-cyan-500/5 transition-all duration-200">
                    <div className="flex items-start gap-4">
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-bold text-dark-900 leading-snug group-hover:text-cyan-700 transition-colors line-clamp-2">
                          {article.title}
                        </h3>
                        {article.summary && (
                          <p className="mt-1.5 text-xs text-dark-400 leading-relaxed line-clamp-2">
                            {article.summary}
                          </p>
                        )}
                        <div className="flex items-center gap-3 mt-2.5 flex-wrap">
                          <span className="flex items-center gap-1 text-[11px] text-dark-400">
                            <Globe className="w-3 h-3" />
                            {article.source_name}
                          </span>
                          {article.published_at && (
                            <span className="flex items-center gap-1 text-[11px] text-dark-400">
                              <Clock className="w-3 h-3" />
                              {timeAgo(article.published_at)}
                            </span>
                          )}
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                              CATEGORY_COLORS[article.category] || CATEGORY_COLORS.General
                            }`}
                          >
                            {article.category}
                          </span>
                        </div>
                      </div>
                      <ExternalLink className="w-4 h-4 text-dark-200 group-hover:text-cyan-500 shrink-0 mt-1 transition-colors" />
                    </div>
                  </div>
                </a>
              ))}
            </div>

            {/* Load more */}
            {articles.length < total && (
              <div className="mt-6 text-center">
                <button
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="px-6 py-2.5 rounded-xl border-2 border-dark-200 text-dark-600 font-bold text-sm hover:border-cyan-400 hover:text-cyan-700 transition-colors disabled:opacity-50"
                >
                  {loadingMore ? (
                    <Loader2 className="w-4 h-4 animate-spin inline mr-2" />
                  ) : null}
                  Load more
                </button>
              </div>
            )}

            <p className="mt-4 text-center text-[11px] text-dark-300">
              Showing {articles.length} of {total} articles
            </p>
          </>
        )}
      </main>

      <SiteFooter />

      <style jsx global>{`
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
    </div>
  );
}
