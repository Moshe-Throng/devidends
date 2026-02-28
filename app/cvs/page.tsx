"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  FileText,
  Eye,
  EyeOff,
  Edit3,
  Download,
  Loader2,
  ArrowRight,
  TrendingUp,
  TrendingDown,
  Calendar,
  ChevronRight,
  AlertCircle,
} from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { createSupabaseBrowser } from "@/lib/supabase-browser";
import { getProfile, getCvVersions } from "@/lib/profiles";
import { ScoreRing } from "@/components/ScoreRing";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import type { Profile, CvScore } from "@/lib/database.types";

/* ─── Helpers ──────────────────────────────────────────────── */

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return formatDate(iso);
}

function downloadAsText(text: string, fileName: string) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* ─── Skeleton ─────────────────────────────────────────────── */

function CardSkeleton() {
  return (
    <div className="rounded-xl border border-dark-100 bg-white p-5 animate-pulse">
      <div className="flex items-center gap-5">
        <div className="w-12 h-12 rounded-full bg-dark-100 flex-shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="h-4 bg-dark-100 rounded w-2/5" />
          <div className="h-3 bg-dark-50 rounded w-1/3" />
        </div>
        <div className="flex gap-2">
          <div className="w-8 h-8 bg-dark-50 rounded-lg" />
          <div className="w-8 h-8 bg-dark-50 rounded-lg" />
          <div className="w-8 h-8 bg-dark-50 rounded-lg" />
        </div>
      </div>
    </div>
  );
}

/* ─── CV Card ──────────────────────────────────────────────── */

interface CvCardProps {
  cv: CvScore;
  index: number;
  total: number;
  delta: number | null;
  expanded: boolean;
  onToggle: () => void;
  onRescore: () => void;
}

function CvCard({
  cv,
  index,
  total,
  delta,
  expanded,
  onToggle,
  onRescore,
}: CvCardProps) {
  const score = cv.overall_score ?? 0;
  const versionNumber = total - index;
  const displayName = cv.file_name || `CV Version ${versionNumber}`;
  const downloadFileName = cv.file_name
    ? cv.file_name.replace(/\.[^.]+$/, ".txt")
    : `cv-version-${versionNumber}.txt`;

  return (
    <div
      className="animate-fadeInUp rounded-xl border bg-white shadow-sm hover:shadow-md transition-all duration-200"
      style={{
        animationDelay: `${index * 80}ms`,
        animationFillMode: "both",
        borderColor: expanded ? "#27ABD2" : undefined,
        borderLeftWidth: expanded ? "3px" : undefined,
      }}
    >
      {/* Main row */}
      <div className="flex items-center gap-4 sm:gap-5 p-4 sm:p-5">
        {/* Score ring */}
        <div className="flex-shrink-0">
          <ScoreRing
            score={score}
            size={48}
            stroke={3}
            animated
            label={`v${versionNumber}`}
          />
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-bold text-dark-900 truncate">
              {displayName}
            </h3>
            {delta !== null && delta !== 0 && (
              <span
                className={`inline-flex items-center gap-0.5 text-xs font-semibold px-1.5 py-0.5 rounded-full ${
                  delta > 0
                    ? "text-emerald-600 bg-emerald-50"
                    : "text-red-500 bg-red-50"
                }`}
              >
                {delta > 0 ? (
                  <TrendingUp className="w-3 h-3" />
                ) : (
                  <TrendingDown className="w-3 h-3" />
                )}
                {delta > 0 ? `+${delta}` : delta}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 mt-1 text-xs text-dark-400">
            <Calendar className="w-3 h-3" />
            <span title={formatDate(cv.scored_at)}>
              {formatRelative(cv.scored_at)}
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {cv.cv_text && (
            <button
              onClick={onToggle}
              className={`p-2 rounded-lg transition-colors ${
                expanded
                  ? "text-cyan-600 bg-cyan-50"
                  : "text-dark-300 hover:text-cyan-600 hover:bg-cyan-50"
              }`}
              title={expanded ? "Hide preview" : "Preview CV"}
            >
              {expanded ? (
                <EyeOff className="w-4 h-4" />
              ) : (
                <Eye className="w-4 h-4" />
              )}
            </button>
          )}

          {cv.cv_text && (
            <button
              onClick={onRescore}
              className="p-2 rounded-lg text-dark-300 hover:text-cyan-600 hover:bg-cyan-50 transition-colors"
              title="Edit & re-score"
            >
              <Edit3 className="w-4 h-4" />
            </button>
          )}

          {cv.cv_text && (
            <button
              onClick={() => downloadAsText(cv.cv_text!, downloadFileName)}
              className="p-2 rounded-lg text-dark-300 hover:text-cyan-600 hover:bg-cyan-50 transition-colors"
              title="Download as TXT"
            >
              <Download className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Expandable preview */}
      {expanded && cv.cv_text && (
        <div className="border-t border-dark-100 bg-dark-50/50">
          <div className="p-4 sm:p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-dark-400 uppercase tracking-wider">
                CV Content Preview
              </span>
              <span className="text-xs text-dark-300">
                {cv.cv_text.length.toLocaleString()} characters
              </span>
            </div>
            <div className="max-h-80 overflow-y-auto rounded-lg bg-white border border-dark-100 p-4">
              <pre className="whitespace-pre-wrap text-sm text-dark-700 font-sans leading-relaxed">
                {cv.cv_text}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Page Component ───────────────────────────────────────── */

export default function MyCvsPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [cvVersions, setCvVersions] = useState<CvScore[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  /* Auth guard */
  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push("/login");
    }
  }, [user, authLoading, router]);

  /* Fetch data */
  useEffect(() => {
    if (authLoading || !user) return;

    const supabase = createSupabaseBrowser();

    async function loadCvs() {
      try {
        setLoading(true);
        setError(null);

        const userProfile = await getProfile(supabase, user!.id);
        if (!userProfile) {
          setProfile(null);
          setCvVersions([]);
          setLoading(false);
          return;
        }

        setProfile(userProfile);
        const versions = await getCvVersions(supabase, userProfile.id);
        setCvVersions(versions);
      } catch (err) {
        console.error("Failed to load CV versions:", err);
        setError("Failed to load your CV history. Please try again.");
      } finally {
        setLoading(false);
      }
    }

    loadCvs();
  }, [user, authLoading]);

  /* Pre-compute deltas (score difference from previous version) */
  const deltas = useMemo(() => {
    const map = new Map<string, number | null>();
    // cvVersions is ordered newest-first
    for (let i = 0; i < cvVersions.length; i++) {
      const current = cvVersions[i].overall_score ?? 0;
      const older = cvVersions[i + 1]; // next in array = older version
      if (older && older.overall_score != null) {
        map.set(cvVersions[i].id, current - older.overall_score);
      } else {
        map.set(cvVersions[i].id, null); // first version, no delta
      }
    }
    return map;
  }, [cvVersions]);

  /* Best score */
  const bestScore = useMemo(() => {
    if (cvVersions.length === 0) return 0;
    return Math.max(...cvVersions.map((cv) => cv.overall_score ?? 0));
  }, [cvVersions]);

  /* Latest score */
  const latestScore = useMemo(() => {
    if (cvVersions.length === 0) return 0;
    return cvVersions[0]?.overall_score ?? 0;
  }, [cvVersions]);

  /* Handlers */
  function handleTogglePreview(id: string) {
    setExpandedId((prev) => (prev === id ? null : id));
  }

  function handleRescore(cvText: string) {
    sessionStorage.setItem("rescore_cv_text", cvText);
    router.push("/score");
  }

  /* ─── Render ─── */

  // Auth loading / redirect state
  if (authLoading || (!user && !authLoading)) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-cyan-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <SiteHeader activeHref="/cvs" />

      {/* Hero section */}
      <section
        className="relative bg-dark-900 overflow-hidden"
        style={{
          backgroundImage:
            "radial-gradient(circle, rgba(39,171,210,0.08) 1px, transparent 1px)",
          backgroundSize: "24px 24px",
        }}
      >
        <div className="max-w-5xl mx-auto px-5 sm:px-8 py-12 sm:py-16">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-6">
            <div>
              <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
                My CVs
              </h1>
              <p className="mt-2 text-dark-400 text-sm sm:text-base max-w-lg">
                Track your CV versions and improvements over time
              </p>
            </div>

            {/* Summary stats */}
            {!loading && cvVersions.length > 0 && (
              <div className="flex items-center gap-6 sm:gap-8">
                <div className="text-center">
                  <p className="text-2xl font-extrabold text-white">
                    {cvVersions.length}
                  </p>
                  <p className="text-xs text-dark-400 mt-0.5">
                    {cvVersions.length === 1 ? "Version" : "Versions"}
                  </p>
                </div>
                <div className="w-px h-10 bg-dark-700" />
                <div className="text-center">
                  <p className="text-2xl font-extrabold text-cyan-400">
                    {latestScore}
                  </p>
                  <p className="text-xs text-dark-400 mt-0.5">Latest</p>
                </div>
                <div className="w-px h-10 bg-dark-700" />
                <div className="text-center">
                  <p className="text-2xl font-extrabold text-emerald-400">
                    {bestScore}
                  </p>
                  <p className="text-xs text-dark-400 mt-0.5">Best</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Main content */}
      <main className="flex-1 max-w-5xl mx-auto w-full px-5 sm:px-8 py-8 sm:py-10">
        {/* Error state */}
        {error && (
          <div className="mb-6 flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <p>{error}</p>
            <button
              onClick={() => window.location.reload()}
              className="ml-auto text-xs font-semibold text-red-600 hover:text-red-800 underline"
            >
              Retry
            </button>
          </div>
        )}

        {/* Loading state */}
        {loading && (
          <div className="space-y-4">
            <CardSkeleton />
            <CardSkeleton />
            <CardSkeleton />
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && cvVersions.length === 0 && (
          <div className="text-center py-20">
            <div className="w-20 h-20 rounded-2xl bg-dark-50 flex items-center justify-center mx-auto mb-6">
              <FileText className="w-10 h-10 text-dark-200" />
            </div>
            <h2 className="text-xl font-bold text-dark-700 mb-2">
              No CV versions yet
            </h2>
            <p className="text-sm text-dark-400 mb-8 max-w-md mx-auto leading-relaxed">
              Score your first CV to start building your history. Each time you
              score, we save a snapshot so you can track your improvements.
            </p>
            <Link
              href="/score"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-teal-500 text-white font-bold text-sm hover:shadow-lg hover:shadow-cyan-500/20 transition-all"
            >
              Score Your First CV
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        )}

        {/* CV version cards */}
        {!loading && !error && cvVersions.length > 0 && (
          <>
            {/* Breadcrumb hint */}
            <div className="flex items-center gap-1.5 text-xs text-dark-400 mb-6">
              <Link href="/profile" className="hover:text-cyan-600 transition-colors">
                Profile
              </Link>
              <ChevronRight className="w-3 h-3" />
              <span className="text-dark-600 font-medium">My CVs</span>
            </div>

            <div className="space-y-3">
              {cvVersions.map((cv, i) => (
                <CvCard
                  key={cv.id}
                  cv={cv}
                  index={i}
                  total={cvVersions.length}
                  delta={deltas.get(cv.id) ?? null}
                  expanded={expandedId === cv.id}
                  onToggle={() => handleTogglePreview(cv.id)}
                  onRescore={() => {
                    if (cv.cv_text) handleRescore(cv.cv_text);
                  }}
                />
              ))}
            </div>

            {/* Footer count + CTA */}
            <div className="mt-8 flex flex-col sm:flex-row items-center justify-between gap-4 pt-6 border-t border-dark-100">
              <p className="text-xs text-dark-300">
                {cvVersions.length}{" "}
                {cvVersions.length === 1 ? "version" : "versions"} scored
              </p>
              <Link
                href="/score"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-teal-500 text-white font-semibold text-sm hover:shadow-lg hover:shadow-cyan-500/20 transition-all"
              >
                Score New Version
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </>
        )}
      </main>

      <SiteFooter />
    </div>
  );
}
