"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  Calendar,
  MapPin,
  Building2,
  Award,
  Clock,
  Briefcase,
  FileText,
  ExternalLink,
  Loader2,
  AlertCircle,
  TrendingUp,
  Target,
} from "lucide-react";
import type { SampleOpportunity } from "@/lib/types/cv-score";

/* ─── Helpers ────────────────────────────────────────────── */

function fmtDate(d: string | null) {
  if (!d) return "Open / Ongoing";
  try {
    return new Date(d).toLocaleDateString("en-GB", {
      weekday: "short",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return d;
  }
}

function deadlineStatus(d: string | null, isExpired: boolean) {
  if (!d) return { label: "Open", cls: "text-emerald-700 bg-emerald-50" };
  if (isExpired) return { label: "Closed", cls: "text-red-700 bg-red-50" };
  const diff = new Date(d).getTime() - Date.now();
  const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
  if (days <= 0) return { label: "Closed", cls: "text-red-700 bg-red-50" };
  if (days <= 3) return { label: `Closing in ${days}d`, cls: "text-red-700 bg-red-50" };
  if (days <= 7) return { label: `${days} days left`, cls: "text-amber-700 bg-amber-50" };
  return { label: `${days} days left`, cls: "text-emerald-700 bg-emerald-50" };
}

function cleanDescription(desc: string | null | undefined): string {
  if (!desc) return "";
  const trimmed = desc.trim();
  if (trimmed.length < 100) return "";
  const pipeCount = (trimmed.match(/\|/g) || []).length;
  const words = trimmed.split(/\s+/).length;
  if (pipeCount > 3 && words < 30) return "";
  return trimmed;
}

/**
 * Render description — handles both markdown (from AI formatter) and plain text.
 * Markdown patterns: ## Heading, - bullet, **bold**, regular paragraphs
 */
function renderFormattedDescription(text: string) {
  const lines = text.split(/\n/);
  const elements: React.ReactNode[] = [];
  let key = 0;
  let i = 0;

  while (i < lines.length) {
    const line = lines[i].trim();

    // Skip empty lines
    if (!line) { i++; continue; }

    // Markdown heading: ## Title or ### Title
    if (/^#{1,3}\s+/.test(line)) {
      elements.push(
        <h4 key={key++} className="text-[13px] font-bold text-dark-900 tracking-wide uppercase mt-5 mb-2 first:mt-0 pb-1 border-b border-dark-100">
          {line.replace(/^#{1,3}\s+/, "")}
        </h4>
      );
      i++; continue;
    }

    // ALL CAPS heading or "Title:" heading (plain text)
    if (
      line.length < 80 && !line.endsWith(".") &&
      (/^[A-Z][A-Z\s&/,:\-–]+$/.test(line) || /^[A-Z][^.]{2,60}:$/.test(line))
    ) {
      elements.push(
        <h4 key={key++} className="text-[13px] font-bold text-dark-900 tracking-wide uppercase mt-5 mb-2 first:mt-0 pb-1 border-b border-dark-100">
          {line.replace(/:$/, "")}
        </h4>
      );
      i++; continue;
    }

    // Bullet: - item, * item, • item, 1. item
    if (/^\s*[-•●▪◦*]\s/.test(line) || /^\s*\d+[.)]\s/.test(line)) {
      const bullets: string[] = [];
      while (i < lines.length) {
        const l = lines[i].trim();
        if (/^\s*[-•●▪◦*]\s/.test(l) || /^\s*\d+[.)]\s/.test(l)) {
          bullets.push(l.replace(/^\s*[-•●▪◦*]\s+/, "").replace(/^\s*\d+[.)]\s+/, ""));
          i++;
        } else break;
      }
      elements.push(
        <ul key={key++} className="mb-4 space-y-2 pl-1">
          {bullets.map((b, bi) => (
            <li key={bi} className="flex gap-3 text-[13px] text-dark-600 leading-relaxed">
              <span className="mt-[7px] shrink-0 w-1.5 h-1.5 rounded-full bg-cyan-400" />
              <span>{renderInlineBold(b)}</span>
            </li>
          ))}
        </ul>
      );
      continue;
    }

    // Regular paragraph
    elements.push(
      <p key={key++} className="text-[13px] text-dark-600 leading-[1.75] mb-3">
        {renderInlineBold(line)}
      </p>
    );
    i++;
  }

  return elements;
}

/** Handle **bold** in text */
function renderInlineBold(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  if (parts.length === 1) return text;
  return parts.map((part, i) => {
    if (/^\*\*(.+)\*\*$/.test(part)) {
      return <strong key={i} className="font-semibold text-dark-800">{part.replace(/\*\*/g, "")}</strong>;
    }
    return <span key={i}>{part}</span>;
  });
}

/** Open URL in external browser (not TG WebView) */
function openExternalLink(url: string) {
  try {
    const tg = (window as Record<string, any>).Telegram?.WebApp;
    if (tg?.openLink) {
      tg.openLink(url);
      return;
    }
  } catch {}
  window.open(url, "_blank", "noopener,noreferrer");
}

/* ─── Component ──────────────────────────────────────────── */

export default function TgOpportunityDetail() {
  const params = useParams();
  const id = params.id as string;

  const [opp, setOpp] = useState<SampleOpportunity | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/opportunities/sample?id=${encodeURIComponent(id)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.success && data.opportunity) {
          setOpp(data.opportunity);
          // Track opportunity viewed
          fetch("/api/events", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ event: "opportunity_viewed", metadata: { opportunity_id: id, title: data.opportunity.title?.slice(0, 100) } }),
          }).catch(() => {});
        } else {
          setError("Opportunity not found");
        }
      })
      .catch(() => setError("Failed to load"))
      .finally(() => setLoading(false));
  }, [id]);

  /* ── Loading ── */
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-7 h-7 animate-spin text-cyan-500" />
      </div>
    );
  }

  /* ── Error / Not Found ── */
  if (error || !opp) {
    return (
      <div className="pb-6">
        <div className="bg-white border-b border-dark-100 px-4 pt-3 pb-3 sticky top-0 z-30">
          <div className="flex items-center gap-3">
            <Link href="/tg-app/opportunities" className="text-dark-400">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <h1 className="text-lg font-extrabold text-dark-900">Not Found</h1>
          </div>
        </div>
        <div className="flex flex-col items-center justify-center py-20 px-6">
          <AlertCircle className="w-10 h-10 text-dark-200 mb-3" />
          <p className="text-sm font-semibold text-dark-600 mb-1">
            Opportunity not found
          </p>
          <p className="text-xs text-dark-400 text-center mb-4">
            It may have been removed or the link is incorrect.
          </p>
          <Link
            href="/tg-app/opportunities"
            className="text-sm font-semibold text-cyan-600"
          >
            Browse all opportunities
          </Link>
        </div>
      </div>
    );
  }

  const deadline = deadlineStatus(opp.deadline, opp.is_expired);
  const description = cleanDescription(opp.description);

  return (
    <div className="pb-6">
      {/* ── Header ── */}
      <div className="bg-white border-b border-dark-100 px-4 pt-3 pb-3 sticky top-0 z-30">
        <div className="flex items-center gap-3">
          <Link href="/tg-app/opportunities" className="text-dark-400">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-lg font-extrabold text-dark-900 truncate">
            Details
          </h1>
        </div>
      </div>

      {/* ── Title Card ── */}
      <div className="mx-4 mt-4 bg-gradient-to-br from-cyan-500 to-teal-600 rounded-2xl p-5 relative overflow-hidden">
        <div
          className="absolute inset-0 opacity-10"
          style={{
            backgroundImage:
              "radial-gradient(circle, rgba(255,255,255,0.4) 1px, transparent 1px)",
            backgroundSize: "14px 14px",
          }}
        />
        <div className="relative z-10">
          {/* Badges */}
          <div className="flex flex-wrap items-center gap-1.5 mb-3">
            {opp.classified_type && (
              <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-white/20 text-white">
                {opp.classified_type}
              </span>
            )}
            {opp.seniority && (
              <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-white/20 text-white flex items-center gap-1">
                <Award className="w-3 h-3" />
                {opp.seniority}
              </span>
            )}
            <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${deadline.cls}`}>
              {deadline.label}
            </span>
          </div>

          {/* Title */}
          <h2 className="text-lg font-extrabold text-white leading-snug">
            {opp.title}
          </h2>

          {/* Org + location */}
          <div className="flex flex-wrap items-center gap-3 mt-3 text-sm text-white/80">
            <span className="flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5" />
              {opp.organization}
            </span>
            {opp.country && (
              <span className="flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5" />
                {opp.country}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── Info Cards ── */}
      <div className="grid grid-cols-2 gap-3 mx-4 mt-4">
        {/* Deadline */}
        <div className="bg-white border border-dark-100 rounded-xl p-3.5">
          <p className="text-[10px] font-bold text-dark-400 uppercase tracking-wider mb-1.5">
            Deadline
          </p>
          <div className="flex items-center gap-1.5">
            <Calendar className="w-4 h-4 text-dark-300" />
            <span className="text-xs font-semibold text-dark-900">
              {fmtDate(opp.deadline)}
            </span>
          </div>
        </div>

        {/* Level */}
        <div className="bg-white border border-dark-100 rounded-xl p-3.5">
          <p className="text-[10px] font-bold text-dark-400 uppercase tracking-wider mb-1.5">
            Level
          </p>
          <div className="flex items-center gap-1.5">
            <Award className="w-4 h-4 text-dark-300" />
            <span className="text-xs font-semibold text-dark-900">
              {opp.seniority || "Not specified"}
            </span>
          </div>
        </div>

        {/* Experience */}
        {opp.experience_years && (
          <div className="bg-white border border-dark-100 rounded-xl p-3.5">
            <p className="text-[10px] font-bold text-dark-400 uppercase tracking-wider mb-1.5">
              Experience
            </p>
            <div className="flex items-center gap-1.5">
              <TrendingUp className="w-4 h-4 text-dark-300" />
              <span className="text-xs font-semibold text-dark-900">
                {opp.experience_years}+ years
              </span>
            </div>
          </div>
        )}

        {/* Source */}
        <div className="bg-white border border-dark-100 rounded-xl p-3.5">
          <p className="text-[10px] font-bold text-dark-400 uppercase tracking-wider mb-1.5">
            Source
          </p>
          <div className="flex items-center gap-1.5">
            <Briefcase className="w-4 h-4 text-dark-300" />
            <span className="text-xs font-semibold text-dark-900">
              {opp.source_domain}
            </span>
          </div>
        </div>
      </div>

      {/* ── Description ── */}
      <div className="mx-4 mt-4">
        {(description) ? (
          <div className="bg-white border border-dark-100 rounded-xl p-4">
            <p className="text-[10px] font-bold text-dark-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-cyan-500" />
              Description
            </p>
            <div>
              {renderFormattedDescription(description)}
            </div>
          </div>
        ) : !opp.description ? (
          <div className="bg-dark-50 border border-dark-100 rounded-xl p-5 text-center">
            <Loader2 className="w-5 h-5 text-dark-300 mx-auto mb-2 animate-spin" />
            <p className="text-xs font-semibold text-dark-500">
              Loading description...
            </p>
          </div>
        ) : (
          <div className="bg-dark-50 border border-dark-100 rounded-xl p-5 text-center">
            <FileText className="w-7 h-7 text-dark-200 mx-auto mb-2" />
            <p className="text-xs font-semibold text-dark-500">
              Full details on the application page
            </p>
            <p className="text-[11px] text-dark-400 mt-0.5">
              Tap &quot;View & Apply&quot; below to see the complete listing
            </p>
          </div>
        )}
      </div>

      {/* ── Expired Banner ── */}
      {opp.is_expired && (
        <div className="mx-4 mt-4 flex items-center gap-3 p-3.5 rounded-xl bg-red-50 border border-red-200">
          <Clock className="w-5 h-5 text-red-500 shrink-0" />
          <div>
            <p className="text-xs font-bold text-red-700">This opportunity has expired</p>
            <p className="text-[11px] text-red-500 mt-0.5">
              The deadline has passed. Check the source site for similar openings.
            </p>
          </div>
        </div>
      )}

      {/* ── Action Buttons ── */}
      <div className="mx-4 mt-5 space-y-3">
        {/* Primary: View & Apply */}
        {opp.source_url && !opp.is_expired && (
          <button
            type="button"
            onClick={() => openExternalLink(opp.source_url)}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-gradient-to-r from-cyan-500 to-teal-500 text-white font-bold text-sm active:from-cyan-600 active:to-teal-600 transition-all shadow-lg shadow-cyan-500/25"
          >
            <ExternalLink className="w-4 h-4" />
            View & Apply
          </button>
        )}

        {/* Secondary: Score CV for this opportunity */}
        {!opp.is_expired && (
          <Link
            href={`/tg-app/score?oppId=${opp.id}`}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl border-2 border-cyan-200 text-cyan-700 font-bold text-sm active:bg-cyan-50 transition-colors"
          >
            <Target className="w-4 h-4" />
            Score My CV for This Role
          </Link>
        )}

        {/* Expired: still allow viewing */}
        {opp.source_url && opp.is_expired && (
          <button
            type="button"
            onClick={() => openExternalLink(opp.source_url)}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl border border-dark-200 text-dark-500 font-semibold text-sm active:bg-dark-50 transition-colors"
          >
            <ExternalLink className="w-4 h-4" />
            View Original Listing
          </button>
        )}
      </div>

      {/* ── Back ── */}
      <div className="flex justify-center mt-6">
        <Link
          href="/tg-app/opportunities"
          className="text-xs font-semibold text-dark-400"
        >
          Back to all opportunities
        </Link>
      </div>
    </div>
  );
}
