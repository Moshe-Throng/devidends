"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Edit3,
  MapPin,
  GraduationCap,
  Globe,
  Calendar,
  Building2,
  ExternalLink,
  Target,
  ArrowRight,
  AlertCircle,
  Zap,
  Clock,
  Award,
  ChevronRight,
  Loader2,
} from "lucide-react";

import { useAuth } from "@/components/AuthProvider";
import { createSupabaseBrowser } from "@/lib/supabase-browser";
import {
  getProfile,
  getMatchedOpportunities,
} from "@/lib/profiles";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import type { Profile } from "@/lib/database.types";
import type { SampleOpportunity } from "@/lib/types/cv-score";

/* ─── Helpers ──────────────────────────────────────────────── */

function fmtDate(d: string) {
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

function fmtDeadline(d: string | null) {
  if (!d) return "Open";
  try {
    return new Date(d).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  } catch {
    return d;
  }
}

function profileTypeColor(
  type: string | null
): { bg: string; text: string; border: string } {
  switch (type) {
    case "Expert":
      return {
        bg: "bg-amber-50",
        text: "text-amber-700",
        border: "border-amber-200",
      };
    case "Senior":
      return {
        bg: "bg-cyan-50",
        text: "text-cyan-700",
        border: "border-cyan-200",
      };
    case "Mid-level":
      return {
        bg: "bg-teal-50",
        text: "text-teal-700",
        border: "border-teal-200",
      };
    case "Junior":
      return {
        bg: "bg-indigo-50",
        text: "text-indigo-700",
        border: "border-indigo-200",
      };
    case "Entry":
      return {
        bg: "bg-violet-50",
        text: "text-violet-700",
        border: "border-violet-200",
      };
    default:
      return {
        bg: "bg-dark-50",
        text: "text-dark-500",
        border: "border-dark-200",
      };
  }
}

function getMissingFields(profile: Profile): { label: string; field: string }[] {
  const missing: { label: string; field: string }[] = [];
  if (!profile.headline?.trim())
    missing.push({ label: "Add a professional headline", field: "headline" });
  if (!profile.sectors?.length)
    missing.push({ label: "Select your sectors of expertise", field: "sectors" });
  if (!profile.donors?.length)
    missing.push({ label: "Add your donor experience", field: "donors" });
  if (!profile.countries?.length)
    missing.push({ label: "List your countries of work", field: "countries" });
  if (!profile.skills || profile.skills.length < 3)
    missing.push({ label: "Add at least 3 skills", field: "skills" });
  if (!profile.qualifications?.trim())
    missing.push({ label: "Add your qualifications", field: "qualifications" });
  if (profile.years_of_experience == null)
    missing.push({ label: "Set your years of experience", field: "experience" });
  if (!profile.linkedin_url?.trim())
    missing.push({ label: "Connect your LinkedIn profile", field: "linkedin" });
  if (!profile.cv_score)
    missing.push({ label: "Score your CV for insights", field: "cv_score" });
  return missing;
}

/* ─── Chip subcomponents ───────────────────────────────────── */

function ChipGroup({
  items,
  colorClass,
  emptyLabel,
}: {
  items: string[];
  colorClass: string;
  emptyLabel: string;
}) {
  if (!items || items.length === 0) {
    return (
      <p className="text-sm text-dark-400 italic">{emptyLabel}</p>
    );
  }
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => (
        <span
          key={item}
          className={`inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-semibold border ${colorClass}`}
        >
          {item}
        </span>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════════ */

export default function ProfilePage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [profile, setProfile] = useState<Profile | null>(null);
  // CV score history removed (scores now only accessible after explicit CV save)
  const [matchedOpps, setMatchedOpps] = useState<SampleOpportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [oppsLoading, setOppsLoading] = useState(true);

  // Auth guard
  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push("/login");
      return;
    }

    const supabase = createSupabaseBrowser();
    getProfile(supabase, user.id)
      .then((p) => {
        setProfile(p);
        if (p) {
          // Score history removed from profile page
          getMatchedOpportunities(p, 8).then((opps) => {
            setMatchedOpps(opps);
            setOppsLoading(false);
          });
        } else {
          setOppsLoading(false);
        }
      })
      .finally(() => setLoading(false));
  }, [user, authLoading, router]);

  /* ─── Loading skeleton ─────────────────────────────────── */
  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-white flex flex-col">
        <SiteHeader activeHref="/profile" />
        <div className="h-1 bg-gradient-to-r from-cyan-500 via-teal-400 to-cyan-500" />
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="w-8 h-8 text-cyan-500 animate-spin" />
            <p className="text-sm text-dark-400 font-medium">
              Loading your profile...
            </p>
          </div>
        </div>
        <SiteFooter />
      </div>
    );
  }

  /* ─── No profile yet ───────────────────────────────────── */
  if (!profile) {
    return (
      <div className="min-h-screen bg-white flex flex-col">
        <SiteHeader activeHref="/profile" />
        <div className="h-1 bg-gradient-to-r from-cyan-500 via-teal-400 to-cyan-500" />
        <div className="flex-1 flex items-center justify-center px-6">
          <div className="text-center max-w-md animate-fadeInUp">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-cyan-500 to-teal-400 flex items-center justify-center mx-auto mb-6 shadow-xl shadow-cyan-500/20">
              <Target className="w-10 h-10 text-white" />
            </div>
            <h1 className="text-2xl font-extrabold text-dark-900 mb-3">
              No profile yet
            </h1>
            <p className="text-dark-500 mb-8 leading-relaxed">
              Upload your CV or build one from scratch to get started.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link
                href="/cv-builder"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-teal-500 text-white font-bold text-sm hover:from-cyan-600 hover:to-teal-600 transition-all shadow-lg shadow-cyan-500/20 hover:shadow-xl hover:shadow-cyan-500/30"
              >
                Build Your CV
                <ArrowRight className="w-4 h-4" />
              </Link>
              <Link
                href="/profile/edit"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl border-2 border-dark-200 text-dark-600 font-bold text-sm hover:bg-dark-50 hover:border-dark-300 transition-all"
              >
                Edit Profile
              </Link>
            </div>
          </div>
        </div>
        <SiteFooter />
      </div>
    );
  }

  /* ─── Derived values ───────────────────────────────────── */
  const missingFields = getMissingFields(profile);
  const typeColors = profileTypeColor(profile.profile_type);
  const initials = profile.name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  /* ─── Render ───────────────────────────────────────────── */
  return (
    <div className="min-h-screen bg-white flex flex-col">
      <SiteHeader activeHref="/profile" />

      {/* Gradient accent strip */}
      <div className="h-1 bg-gradient-to-r from-cyan-500 via-teal-400 to-cyan-500" />

      {/* ══ HERO ═════════════════════════════════════════════════ */}
      <section className="relative bg-dark-900 overflow-hidden">
        {/* Dot grid */}
        <div
          className="absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage:
              "radial-gradient(circle, #27ABD2 1px, transparent 1px)",
            backgroundSize: "24px 24px",
          }}
        />
        {/* Glow accents */}
        <div className="absolute -top-40 -right-40 w-[500px] h-[500px] rounded-full bg-cyan-500/10 blur-3xl animate-blobMove" />
        <div
          className="absolute -bottom-32 -left-32 w-[400px] h-[400px] rounded-full bg-teal-500/[0.08] blur-3xl animate-blobMove"
          style={{ animationDelay: "-4s" }}
        />

        {/* Floating accents */}
        <div className="hidden lg:block absolute top-16 right-[12%] w-12 h-12 border-2 border-cyan-400/20 rounded-xl rotate-12 animate-float" />
        <div
          className="hidden lg:block absolute top-32 right-[20%] w-6 h-6 rounded-full bg-teal-400/15 animate-float"
          style={{ animationDelay: "-2s" }}
        />

        <div className="relative max-w-5xl mx-auto px-6 py-12 lg:py-16">
          <div className="flex flex-col lg:flex-row items-start lg:items-center gap-8">
            {/* Avatar + Info */}
            <div className="flex items-start gap-5 flex-1 min-w-0">
              {/* Avatar ring */}
              <div className="relative flex-shrink-0 animate-scaleReveal">
                <div className="w-20 h-20 lg:w-24 lg:h-24 rounded-2xl bg-gradient-to-br from-cyan-500 to-teal-400 flex items-center justify-center shadow-xl shadow-cyan-500/25">
                  <span className="text-2xl lg:text-3xl font-extrabold text-white">
                    {initials}
                  </span>
                </div>
                {/* Profile type badge on avatar */}
                {profile.profile_type && (
                  <span
                    className={`absolute -bottom-2 -right-2 px-2 py-0.5 rounded-lg text-[10px] font-bold border ${typeColors.bg} ${typeColors.text} ${typeColors.border} shadow-sm`}
                  >
                    {profile.profile_type}
                  </span>
                )}
              </div>

              {/* Name & headline */}
              <div className="min-w-0 animate-staggerFadeUp">
                <h1 className="text-2xl lg:text-3xl font-extrabold text-white tracking-tight truncate">
                  {profile.name}
                </h1>
                {profile.headline ? (
                  <p className="text-dark-300 mt-1 text-sm lg:text-base leading-relaxed line-clamp-2">
                    {profile.headline}
                  </p>
                ) : (
                  <p className="text-dark-500 mt-1 text-sm italic">
                    Add a headline to stand out
                  </p>
                )}
              </div>
            </div>

            {/* Edit button */}
            <div
              className="animate-staggerFadeUp"
              style={{ animationDelay: "0.2s" }}
            >
              <Link
                href="/profile/edit"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white/10 backdrop-blur-sm border border-white/20 text-white text-sm font-bold hover:bg-white/20 transition-all"
              >
                <Edit3 className="w-4 h-4" />
                Edit
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ══ MAIN CONTENT ═════════════════════════════════════════ */}
      <main className="flex-1 max-w-5xl mx-auto w-full px-6 py-10 lg:py-14 space-y-10">
        {/* ── Telegram-only: connect email ─────────────────── */}
        {user?.email?.endsWith("@users.devidends.app") && (
          <div className="border border-cyan-200 rounded-2xl p-5 bg-cyan-50/50 animate-fadeInUp">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-cyan-100 flex items-center justify-center flex-shrink-0">
                <AlertCircle className="w-5 h-5 text-cyan-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-dark-900">Connect your email</p>
                <p className="text-xs text-dark-500 mt-0.5">
                  You signed in via Telegram. Add an email to access your account from any browser.
                </p>
              </div>
              <Link
                href="/settings"
                className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-500 text-white text-xs font-bold hover:bg-cyan-600 transition-colors"
              >
                Add email
              </Link>
            </div>
          </div>
        )}

        {/* ── Profile Completeness Nudges ─────────────────── */}

        {missingFields.length > 0 && profile.profile_score_pct < 80 && (
          <div className="border border-amber-200 rounded-2xl p-5 bg-amber-50/50 animate-fadeInUp">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
                <Zap className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <p className="text-sm font-bold text-dark-900">
                  Complete your profile to {profile.profile_score_pct < 50 ? "unlock" : "strengthen"} opportunity matching
                </p>
                <p className="text-xs text-dark-500 mt-0.5">
                  Currently {profile.profile_score_pct}% complete &mdash; reach
                  80% for best results
                </p>
              </div>
            </div>
            <div className="grid sm:grid-cols-2 gap-2">
              {missingFields.slice(0, 4).map((f) => (
                <Link
                  key={f.field}
                  href="/profile/edit"
                  className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white border border-amber-200 text-sm text-dark-700 hover:border-cyan-300 hover:bg-cyan-50/50 transition-all group"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 group-hover:bg-cyan-500 transition-colors" />
                  {f.label}
                  <ChevronRight className="w-3.5 h-3.5 text-dark-300 ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* ── Profile Details Grid ────────────────────────── */}
        <div className="grid lg:grid-cols-2 gap-6">
          {/* Sectors */}
          <div
            className="border border-dark-100 rounded-2xl p-6 animate-staggerFadeUp"
            style={{ animationDelay: "0.1s" }}
          >
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg bg-cyan-50 flex items-center justify-center">
                <Globe className="w-4 h-4 text-cyan-500" />
              </div>
              <p className="text-xs font-bold text-dark-500 uppercase tracking-[0.15em]">
                Sectors
              </p>
            </div>
            <ChipGroup
              items={profile.sectors}
              colorClass="bg-cyan-50 text-cyan-700 border-cyan-200"
              emptyLabel="Add sectors to get matched opportunities"
            />
          </div>

          {/* Donors */}
          <div
            className="border border-dark-100 rounded-2xl p-6 animate-staggerFadeUp"
            style={{ animationDelay: "0.15s" }}
          >
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg bg-teal-50 flex items-center justify-center">
                <Building2 className="w-4 h-4 text-teal-500" />
              </div>
              <p className="text-xs font-bold text-dark-500 uppercase tracking-[0.15em]">
                Donor Experience
              </p>
            </div>
            <ChipGroup
              items={profile.donors}
              colorClass="bg-teal-50 text-teal-700 border-teal-200"
              emptyLabel="Add your donor experience to strengthen your profile"
            />
          </div>

          {/* Skills */}
          <div
            className="border border-dark-100 rounded-2xl p-6 animate-staggerFadeUp"
            style={{ animationDelay: "0.2s" }}
          >
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg bg-dark-50 flex items-center justify-center">
                <Zap className="w-4 h-4 text-dark-500" />
              </div>
              <p className="text-xs font-bold text-dark-500 uppercase tracking-[0.15em]">
                Skills
              </p>
            </div>
            <ChipGroup
              items={profile.skills}
              colorClass="bg-dark-50 text-dark-600 border-dark-200"
              emptyLabel="Add at least 3 skills for better matching"
            />
          </div>

          {/* Qualifications & Experience */}
          <div
            className="border border-dark-100 rounded-2xl p-6 animate-staggerFadeUp"
            style={{ animationDelay: "0.25s" }}
          >
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg bg-dark-50 flex items-center justify-center">
                <GraduationCap className="w-4 h-4 text-dark-500" />
              </div>
              <p className="text-xs font-bold text-dark-500 uppercase tracking-[0.15em]">
                Qualifications
              </p>
            </div>
            {profile.qualifications ? (
              <p className="text-sm text-dark-700 leading-relaxed">
                {profile.qualifications}
              </p>
            ) : (
              <p className="text-sm text-dark-400 italic">
                Add your qualifications and education
              </p>
            )}

            {/* Experience + type badges */}
            <div className="flex flex-wrap items-center gap-2 mt-4 pt-4 border-t border-dark-50">
              {profile.years_of_experience != null && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-dark-50 text-dark-600 text-xs font-semibold border border-dark-100">
                  <Clock className="w-3.5 h-3.5" />
                  {profile.years_of_experience} years experience
                </span>
              )}
              {profile.profile_type && (
                <span
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border ${typeColors.bg} ${typeColors.text} ${typeColors.border}`}
                >
                  <Award className="w-3.5 h-3.5" />
                  {profile.profile_type}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* ── Matched Opportunities ───────────────────────── */}
        <div>
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-cyan-50 flex items-center justify-center">
                <Target className="w-4 h-4 text-cyan-500" />
              </div>
              <p className="text-xs font-bold text-dark-500 uppercase tracking-[0.15em]">
                Opportunities For You
              </p>
            </div>
            <Link
              href="/opportunities"
              className="text-xs font-bold text-cyan-600 hover:text-cyan-700 transition-colors"
            >
              View all &rarr;
            </Link>
          </div>

          {oppsLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 text-cyan-500 animate-spin" />
            </div>
          ) : matchedOpps.length > 0 ? (
            <div className="grid sm:grid-cols-2 gap-4">
              {matchedOpps.map((opp, i) => (
                <a
                  key={opp.id}
                  href={opp.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group border border-dark-100 rounded-2xl p-5 hover:border-cyan-200 hover:shadow-md hover:shadow-cyan-500/5 transition-all animate-staggerFadeUp"
                  style={{ animationDelay: `${0.1 + i * 0.05}s` }}
                >
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <h3 className="text-sm font-bold text-dark-900 line-clamp-2 group-hover:text-cyan-700 transition-colors">
                      {opp.title}
                    </h3>
                    <ExternalLink className="w-4 h-4 text-dark-300 flex-shrink-0 group-hover:text-cyan-500 transition-colors" />
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-dark-500">
                    <span className="inline-flex items-center gap-1">
                      <Building2 className="w-3 h-3" />
                      {opp.organization}
                    </span>
                    {opp.country && (
                      <>
                        <span className="text-dark-200">|</span>
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          {opp.country}
                        </span>
                      </>
                    )}
                    {opp.deadline && (
                      <>
                        <span className="text-dark-200">|</span>
                        <span className="inline-flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {fmtDeadline(opp.deadline)}
                        </span>
                      </>
                    )}
                  </div>
                  {opp.classified_type && (
                    <span className="inline-block mt-3 px-2.5 py-1 rounded-md bg-dark-50 text-[10px] font-bold text-dark-500 uppercase tracking-wider border border-dark-100">
                      {opp.classified_type}
                    </span>
                  )}
                </a>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 border border-dashed border-dark-200 rounded-2xl">
              <Target className="w-8 h-8 text-dark-300 mx-auto mb-3" />
              <p className="text-sm text-dark-500 font-medium">
                {profile.sectors?.length
                  ? "No matching opportunities right now"
                  : "Complete your profile sectors to get personalized matches"}
              </p>
              {!profile.sectors?.length && (
                <Link
                  href="/profile/edit"
                  className="inline-flex items-center gap-1.5 mt-3 text-xs font-bold text-cyan-600 hover:text-cyan-700"
                >
                  Add sectors <ArrowRight className="w-3 h-3" />
                </Link>
              )}
            </div>
          )}
        </div>

        {/* ── My CV (only shown after explicit save with consent) ── */}
        {(profile as any).cv_structured_data && (
          <div className="border border-dark-100 rounded-2xl p-5 bg-white animate-fadeInUp">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg bg-cyan-50 flex items-center justify-center">
                <GraduationCap className="w-4 h-4 text-cyan-600" />
              </div>
              <p className="text-xs font-bold text-dark-500 uppercase tracking-[0.15em]">
                My CV
              </p>
            </div>
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-bold text-dark-900">
                  {(profile as any).cv_structured_data?.personal?.full_name || profile.name}
                </p>
                {(profile as any).cv_structured_data?.personal?.headline && (
                  <p className="text-xs text-dark-400 mt-0.5 line-clamp-1">
                    {(profile as any).cv_structured_data.personal.headline}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Link
                  href="/cv-builder"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-50 border border-cyan-200 text-xs font-semibold text-cyan-700 hover:bg-cyan-100 transition-all"
                >
                  View &amp; Edit
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* ── Profile Meta ───────────────────────────────── */}
        <div className="flex items-center justify-between text-xs text-dark-400 pt-4 border-t border-dark-100">
          <span>
            Member since {fmtDate(profile.created_at)} &middot; v{profile.version}
          </span>
          <span>
            {profile.is_public ? "Public profile" : "Private profile"}
          </span>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
