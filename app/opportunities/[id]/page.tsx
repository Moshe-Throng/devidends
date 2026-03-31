"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Calendar,
  MapPin,
  Building2,
  Target,
  Loader2,
  AlertCircle,
  Briefcase,
  FileText,
  Award,
  Clock,
  TrendingUp,
  ChevronRight,
  Share2,
  PenTool,
} from "lucide-react";
import { useParams } from "next/navigation";

import type { SampleOpportunity } from "@/lib/types/cv-score";

import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { SaveButton } from "@/components/SaveButton";
import { useAuth } from "@/components/AuthProvider";
import { createSupabaseBrowser } from "@/lib/supabase-browser";

/* ─── Helpers ──────────────────────────────────────────────── */

function fmtDate(d: string | null) {
  if (!d) return "Open / Ongoing";
  try {
    const parsed = new Date(d);
    if (isNaN(parsed.getTime())) return "Open / Ongoing";
    return parsed.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return "Open / Ongoing";
  }
}

function deadlineStatus(d: string | null, isExpired: boolean) {
  if (!d)
    return {
      label: "Open",
      daysLeft: null,
      cls: "text-emerald-600 bg-emerald-50 border-emerald-200",
    };
  if (isExpired)
    return {
      label: "Closed",
      daysLeft: null,
      cls: "text-red-600 bg-red-50 border-red-200",
    };
  try {
    const parsed = new Date(d);
    if (isNaN(parsed.getTime())) return { label: "Open", daysLeft: null, cls: "text-dark-500 bg-dark-50 border-dark-100" };
    const diff = parsed.getTime() - Date.now();
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
    if (days <= 3)
      return {
        label: `Closing in ${days} day${days !== 1 ? "s" : ""}`,
        daysLeft: days,
        cls: "text-red-600 bg-red-50 border-red-200",
      };
    if (days <= 7)
      return {
        label: `${days} days remaining`,
        daysLeft: days,
        cls: "text-amber-600 bg-amber-50 border-amber-200",
      };
    return {
      label: `${days} days remaining`,
      daysLeft: days,
      cls: "text-emerald-600 bg-emerald-50 border-emerald-200",
    };
  } catch {
    return {
      label: "Open",
      daysLeft: null,
      cls: "text-dark-500 bg-dark-50 border-dark-100",
    };
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

/** Returns a cleaned description or empty string if it's garbage/sparse */
function cleanDescription(desc: string | null | undefined): string {
  if (!desc) return "";
  const trimmed = desc.trim();
  if (trimmed.length < 150) return "";
  const pipeCount = (trimmed.match(/\|/g) || []).length;
  const words = trimmed.split(/\s+/).length;
  if (pipeCount > 3 && words < 30) return "";
  const upperRatio = (trimmed.match(/[A-Z]/g) || []).length / trimmed.length;
  if (upperRatio > 0.6 && words < 20) return "";
  return trimmed;
}

/** Check if description is too sparse for a detail page (needs enrichment) */
function isSparse(desc: string | null | undefined): boolean {
  return !cleanDescription(desc);
}

/**
 * Professional job description renderer.
 *
 * Handles:
 *  - Section headings (ALL CAPS, "Title:" patterns, short bold lines)
 *  - Bullet lists (-, •, *, numbered)
 *  - Paragraph text with proper spacing
 *  - Inline bold (**text**)
 *
 * Design: clean, generous line-height, clear visual hierarchy.
 */

function renderInline(text: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|__[^_]+__)/g);
  return parts.map((part, i) => {
    if (/^\*\*(.+)\*\*$/.test(part) || /^__(.+)__$/.test(part)) {
      return <strong key={i} className="font-semibold text-dark-800">{part.replace(/^\*\*|\*\*$|^__|__$/g, "")}</strong>;
    }
    return <span key={i}>{part}</span>;
  });
}

function isHeading(line: string): boolean {
  if (line.length > 80 || line.length < 3) return false;
  if (line.endsWith(".")) return false;
  // "ABOUT THE ROLE" or "KEY RESPONSIBILITIES"
  if (/^[A-Z][A-Z\s&/,:\-–]+$/.test(line)) return true;
  // "About the role:" or "You Will:"
  if (/^[A-Z][^.]{2,60}:$/.test(line)) return true;
  // "## Heading" markdown
  if (/^#{1,3}\s/.test(line)) return true;
  return false;
}

function isBullet(line: string): boolean {
  return /^\s*[-•●▪◦*]\s/.test(line) || /^\s*\d+[.)]\s/.test(line);
}

function stripBullet(line: string): string {
  return line.replace(/^\s*[-•●▪◦*]\s+/, "").replace(/^\s*\d+[.)]\s+/, "").replace(/^#{1,3}\s+/, "");
}

function renderDescription(text: string) {
  // Split on double newlines for paragraph blocks, then single newlines for lines
  const blocks = text.split(/\n\n+/);
  const elements: React.ReactNode[] = [];
  let key = 0;

  for (const block of blocks) {
    const lines = block.split(/\n/).map(l => l.trim()).filter(Boolean);
    if (lines.length === 0) continue;

    // Collect consecutive bullets into a list
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];

      if (isHeading(line)) {
        elements.push(
          <h4 key={key++} className="text-[13px] font-bold text-dark-900 tracking-wide uppercase mt-6 mb-2 first:mt-0 border-b border-dark-100 pb-1.5">
            {stripBullet(line).replace(/:$/, "")}
          </h4>
        );
        i++;
      } else if (isBullet(line)) {
        // Collect all consecutive bullets
        const bullets: string[] = [];
        while (i < lines.length && isBullet(lines[i])) {
          bullets.push(stripBullet(lines[i]));
          i++;
        }
        elements.push(
          <ul key={key++} className="mb-4 space-y-2 pl-1">
            {bullets.map((b, bi) => (
              <li key={bi} className="flex gap-3 text-[15px] text-dark-600 leading-relaxed">
                <span className="text-cyan-500 mt-[7px] shrink-0 w-1.5 h-1.5 rounded-full bg-cyan-400" />
                <span>{renderInline(b)}</span>
              </li>
            ))}
          </ul>
        );
      } else {
        // Regular paragraph line
        elements.push(
          <p key={key++} className="text-[15px] text-dark-600 leading-[1.8] mb-3">
            {renderInline(line)}
          </p>
        );
        i++;
      }
    }
  }

  // If there were no line breaks at all (wall of text), split by sentences
  if (elements.length <= 1 && text.length > 300 && !text.includes("\n")) {
    const sentences = text.split(/(?<=\.)\s+/).filter(s => s.trim());
    const paras: string[] = [];
    for (let si = 0; si < sentences.length; si += 3) {
      paras.push(sentences.slice(si, si + 3).join(" "));
    }
    return paras.map((p, pi) => (
      <p key={pi} className="text-[15px] text-dark-600 leading-[1.8] mb-4">
        {p}
      </p>
    ));
  }

  return elements;
}

/* ═══════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════════ */

export default function OpportunityDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const { user } = useAuth();

  const [opportunity, setOpportunity] = useState<SampleOpportunity | null>(
    null
  );
  const [related, setRelated] = useState<SampleOpportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [hasCv, setHasCv] = useState(false);

  // Check if user has a saved CV
  useEffect(() => {
    if (!user) { setHasCv(false); return; }
    const sb = createSupabaseBrowser();
    sb.from("profiles")
      .select("cv_structured_data")
      .eq("user_id", user.id)
      .single()
      .then(({ data }) => {
        setHasCv(!!data?.cv_structured_data);
      });
  }, [user]);

  useEffect(() => {
    // Fetch this opportunity + all opportunities for related
    Promise.all([
      fetch(`/api/opportunities/sample?id=${encodeURIComponent(id)}`).then(
        (r) => r.json()
      ),
      fetch("/api/opportunities/sample?hideExpired=true&minQuality=40").then(
        (r) => r.json()
      ),
    ])
      .then(([detail, feed]) => {
        if (detail.success && detail.opportunity) {
          setOpportunity(detail.opportunity);
          const org = detail.opportunity.organization?.toLowerCase();
          const others = (feed.opportunities || [])
            .filter(
              (o: SampleOpportunity) =>
                o.id !== id && o.organization?.toLowerCase() === org
            )
            .slice(0, 4);
          setRelated(others);
        } else {
          setError(detail.error || "Opportunity not found");
        }
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message || "Failed to load opportunity");
        setLoading(false);
      });
  }, [id]);

  function handleShareLink() {
    const url = window.location.href;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

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

        <div className="relative max-w-5xl mx-auto px-6 py-10 lg:py-14">
          {/* Breadcrumb navigation */}
          <nav className="flex items-center gap-1.5 text-sm mb-6">
            <Link
              href="/opportunities"
              className="text-dark-400 hover:text-cyan-400 font-semibold transition-colors"
            >
              Opportunities
            </Link>
            <ChevronRight className="w-3.5 h-3.5 text-dark-500" />
            <span className="text-dark-300 font-medium truncate max-w-[300px]">
              {loading
                ? "Loading..."
                : error
                  ? "Not Found"
                  : opportunity?.title ?? "Detail"}
            </span>
          </nav>

          {loading ? (
            <div className="h-20" />
          ) : error ? (
            <h1 className="text-2xl font-extrabold text-white">
              Opportunity Not Found
            </h1>
          ) : opportunity ? (
            <>
              {/* Badge row */}
              <div className="flex flex-wrap items-center gap-2 mb-3">
                {/* Type badge */}
                <span
                  className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-[0.1em] border ${typeColor(opportunity.classified_type)}`}
                >
                  {opportunity.classified_type}
                </span>

                {/* Seniority badge */}
                {opportunity.seniority && (
                  <span
                    className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-[0.1em] border ${seniorityBadge(opportunity.seniority)}`}
                  >
                    <Award className="w-3 h-3" />
                    {opportunity.seniority}
                  </span>
                )}

                {/* Expired badge */}
                {opportunity.is_expired && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-[0.1em] border bg-red-50 text-red-500 border-red-200">
                    <Clock className="w-3 h-3" />
                    Expired
                  </span>
                )}

                <span className="text-dark-400 text-xs font-medium">
                  via {opportunity.source_domain}
                </span>
              </div>

              {/* Title */}
              <h1 className="text-2xl lg:text-4xl font-extrabold text-white tracking-tight leading-tight">
                {opportunity.title}
              </h1>

              {/* Meta row */}
              <div className="flex flex-wrap items-center gap-4 mt-4 text-sm text-dark-300">
                <span className="inline-flex items-center gap-1.5">
                  <Building2 className="w-4 h-4" />
                  {opportunity.organization}
                </span>
                {opportunity.country && (
                  <span className="inline-flex items-center gap-1.5">
                    <MapPin className="w-4 h-4" />
                    {opportunity.country}
                  </span>
                )}
                {opportunity.experience_years && (
                  <span className="inline-flex items-center gap-1.5 text-teal-400">
                    <TrendingUp className="w-4 h-4" />
                    {opportunity.experience_years}+ years experience
                  </span>
                )}
              </div>

              {/* Action buttons row in hero */}
              <div className="flex flex-wrap items-center gap-3 mt-6">
                <SaveButton
                  opportunityId={opportunity.id}
                  opportunityTitle={opportunity.title}
                  opportunityOrg={opportunity.organization}
                  opportunityDeadline={opportunity.deadline}
                  opportunityUrl={opportunity.source_url}
                  variant="button"
                />
                <button
                  onClick={handleShareLink}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-white/10 text-dark-200 border border-white/10 hover:bg-white/20 hover:text-white transition-all"
                >
                  <Share2 className="w-4 h-4" />
                  {copied ? "Link Copied!" : "Share"}
                </button>
              </div>
            </>
          ) : null}
        </div>
      </section>

      {/* Content */}
      <main className="flex-1 max-w-5xl mx-auto w-full px-6 py-10 lg:py-14">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24">
            <Loader2 className="w-10 h-10 text-cyan-500 animate-spin mb-4" />
            <p className="text-dark-400 font-medium">
              Loading opportunity details...
            </p>
          </div>
        ) : error ? (
          /* ── 404 State ──────────────────────────────────────── */
          <div className="text-center py-20">
            <div className="w-20 h-20 rounded-2xl bg-dark-50 flex items-center justify-center mx-auto mb-6">
              <AlertCircle className="w-10 h-10 text-dark-200" />
            </div>
            <h2 className="text-xl font-extrabold text-dark-700 mb-2">
              Opportunity Not Found
            </h2>
            <p className="text-sm text-dark-400 max-w-md mx-auto">
              This opportunity may have been removed, or the link may be
              incorrect. Try browsing all available opportunities.
            </p>
            <Link
              href="/opportunities"
              className="mt-6 inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-teal-500 text-white font-bold text-sm hover:from-cyan-600 hover:to-teal-600 transition-all shadow-lg shadow-cyan-500/20"
            >
              <ArrowLeft className="w-4 h-4" />
              Browse All Opportunities
            </Link>
          </div>
        ) : opportunity ? (
          <div className="space-y-8 animate-fadeInUp">
            {/* ── Info cards ───────────────────────────────── */}
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Deadline */}
              <div className="p-5 rounded-2xl border border-dark-100">
                <p className="text-[10px] font-bold text-dark-500 uppercase tracking-[0.15em] mb-2">
                  Deadline
                </p>
                <div className="flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-dark-300" />
                  <span className="text-sm font-bold text-dark-900">
                    {fmtDate(opportunity.deadline)}
                  </span>
                </div>
                {opportunity.deadline && (
                  <span
                    className={`inline-flex items-center mt-2 px-2.5 py-1 rounded-lg text-xs font-semibold border ${deadlineStatus(opportunity.deadline, opportunity.is_expired).cls}`}
                  >
                    {
                      deadlineStatus(opportunity.deadline, opportunity.is_expired)
                        .label
                    }
                  </span>
                )}
              </div>

              {/* Location */}
              <div className="p-5 rounded-2xl border border-dark-100">
                <p className="text-[10px] font-bold text-dark-500 uppercase tracking-[0.15em] mb-2">
                  Location
                </p>
                <div className="flex items-center gap-2">
                  <MapPin className="w-5 h-5 text-dark-300" />
                  <span className="text-sm font-bold text-dark-900">
                    {opportunity.country || "Not specified"}
                  </span>
                </div>
              </div>

              {/* Seniority & Experience */}
              <div className="p-5 rounded-2xl border border-dark-100">
                <p className="text-[10px] font-bold text-dark-500 uppercase tracking-[0.15em] mb-2">
                  Level
                </p>
                <div className="flex items-center gap-2">
                  <Award className="w-5 h-5 text-dark-300" />
                  <span className="text-sm font-bold text-dark-900">
                    {opportunity.seniority || "Not specified"}
                  </span>
                </div>
                {opportunity.experience_years && (
                  <span className="inline-flex items-center gap-1 mt-2 text-xs text-dark-500 font-medium">
                    <Briefcase className="w-3.5 h-3.5" />
                    {opportunity.experience_years}+ years required
                  </span>
                )}
              </div>

            </div>

            {/* ── Description ──────────────────────────────── */}
            {cleanDescription(opportunity.description) ? (
              <div className="border border-dark-100 rounded-2xl p-6 lg:p-8">
                <p className="text-xs font-bold text-dark-500 uppercase tracking-[0.15em] mb-5">
                  <FileText className="w-4 h-4 inline-block mr-1.5 -mt-0.5 text-cyan-500" />
                  Full Description
                </p>
                <div className="max-w-none">
                  {renderDescription(cleanDescription(opportunity.description))}
                </div>
              </div>
            ) : (
              <div className="border border-dark-100 rounded-2xl p-6 lg:p-8 text-center">
                <FileText className="w-8 h-8 text-dark-200 mx-auto mb-3" />
                <p className="text-sm text-dark-500 font-medium">
                  Full details available on the application page
                </p>
                {opportunity.source_url && (
                  <a
                    href={opportunity.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 mt-3 text-sm text-cyan-600 font-semibold hover:text-cyan-700"
                  >
                    View original posting <ChevronRight className="w-3.5 h-3.5" />
                  </a>
                )}
              </div>
            )}

            {/* ── Apply / View Original ────────────────────── */}
            {opportunity.source_url && !opportunity.is_expired && (
              <div className="flex flex-col sm:flex-row gap-4">
                <a
                  href={opportunity.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl bg-gradient-to-r from-cyan-500 to-teal-500 text-white font-bold text-base hover:from-cyan-600 hover:to-teal-600 transition-all shadow-lg shadow-cyan-500/25 hover:shadow-xl hover:shadow-cyan-500/30 hover:-translate-y-0.5"
                >
                  <Briefcase className="w-5 h-5" />
                  Apply Now
                </a>
                <SaveButton
                  opportunityId={opportunity.id}
                  opportunityTitle={opportunity.title}
                  opportunityOrg={opportunity.organization}
                  opportunityDeadline={opportunity.deadline}
                  opportunityUrl={opportunity.source_url}
                  variant="button"
                />
                {hasCv ? (
                  <Link
                    href={`/score?oppId=${opportunity.id}`}
                    className="inline-flex items-center justify-center gap-2 px-6 py-4 rounded-xl border-2 border-cyan-200 text-cyan-700 font-bold text-base hover:bg-cyan-50 transition-all"
                  >
                    <Target className="w-5 h-5" />
                    Score My CV
                  </Link>
                ) : (
                  <Link
                    href="/cv-builder"
                    className="inline-flex items-center justify-center gap-2 px-6 py-4 rounded-xl border-2 border-cyan-200 text-cyan-700 font-bold text-base hover:bg-cyan-50 transition-all"
                  >
                    <PenTool className="w-5 h-5" />
                    Build Your CV
                  </Link>
                )}
              </div>
            )}

            {/* ── Expired banner ─────────────────────────────── */}
            {opportunity.is_expired && (
              <div className="flex items-center gap-3 p-4 rounded-xl bg-red-50 border border-red-200">
                <Clock className="w-5 h-5 text-red-500 flex-shrink-0" />
                <div>
                  <p className="text-sm font-bold text-red-700">
                    This opportunity has expired
                  </p>
                  <p className="text-xs text-red-500 mt-0.5">
                    The deadline for this listing has passed. Check the source
                    site for similar openings.
                  </p>
                </div>
              </div>
            )}

            {/* ── CTA: Score or Build CV ──── */}
            {!opportunity.is_expired && (
              <div className="relative rounded-2xl overflow-hidden border border-dark-100">
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
                      {hasCv ? <Target className="w-6 h-6 text-white" /> : <PenTool className="w-6 h-6 text-white" />}
                    </div>
                    <div>
                      <p className="font-bold text-dark-900">
                        {hasCv ? "Score your CV for this opportunity" : "Build your CV first"}
                      </p>
                      <p className="text-sm text-dark-400 mt-0.5">
                        {hasCv
                          ? "See how well your profile matches this role and get actionable feedback"
                          : "Create your CV to score it against opportunities, edit, and export in any format"}
                      </p>
                    </div>
                  </div>
                  {hasCv ? (
                    <Link
                      href={`/score?oppId=${encodeURIComponent(opportunity.id)}`}
                      className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-teal-500 text-white font-bold text-sm hover:from-cyan-600 hover:to-teal-600 transition-all shadow-lg shadow-cyan-500/20 hover:shadow-xl hover:shadow-cyan-500/30 hover:-translate-y-0.5 whitespace-nowrap"
                    >
                      Score My CV
                      <Target className="w-4 h-4" />
                    </Link>
                  ) : (
                    <Link
                      href="/cv-builder"
                      className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-teal-500 text-white font-bold text-sm hover:from-cyan-600 hover:to-teal-600 transition-all shadow-lg shadow-cyan-500/20 hover:shadow-xl hover:shadow-cyan-500/30 hover:-translate-y-0.5 whitespace-nowrap"
                    >
                      Build Your CV
                      <PenTool className="w-4 h-4" />
                    </Link>
                  )}
                </div>
              </div>
            )}

            {/* ── Related Opportunities ──────────────────────── */}
            {related.length > 0 && (
              <div>
                <h2 className="text-lg font-extrabold text-dark-900 mb-4">
                  More from {opportunity.organization}
                </h2>
                <div className="grid sm:grid-cols-2 gap-4">
                  {related.map((rel) => (
                    <Link
                      key={rel.id}
                      href={`/opportunities/${rel.id}`}
                      className="block p-4 rounded-xl border border-dark-100 hover:border-cyan-300 hover:shadow-md hover:shadow-cyan-500/5 transition-all group"
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-[0.1em] border ${typeColor(rel.classified_type)}`}
                        >
                          {rel.classified_type}
                        </span>
                        {rel.seniority && (
                          <span className="text-[10px] text-dark-400 font-medium">
                            {rel.seniority}
                          </span>
                        )}
                      </div>
                      <h3 className="text-sm font-bold text-dark-900 group-hover:text-cyan-600 transition-colors line-clamp-2">
                        {rel.title}
                      </h3>
                      {rel.deadline && (
                        <p className="mt-2 text-xs text-dark-400 flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {fmtDate(rel.deadline)}
                        </p>
                      )}
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* ── Back link ────────────────────────────────── */}
            <div className="flex justify-center pt-4 pb-8">
              <Link
                href="/opportunities"
                className="inline-flex items-center gap-2 px-8 py-3.5 rounded-xl border-2 border-dark-200 text-dark-600 font-bold hover:bg-dark-50 hover:border-dark-300 transition-all"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to Opportunities
              </Link>
            </div>
          </div>
        ) : null}
      </main>

      <SiteFooter />
    </div>
  );
}
