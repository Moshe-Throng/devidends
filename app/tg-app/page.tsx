"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Briefcase,
  FileText,
  User,
  Bell,
  ChevronRight,
  Loader2,
  AlertCircle,
  TrendingUp,
  MapPin,
  Clock,
  Newspaper,
  BarChart3,
} from "lucide-react";
import { useTelegram } from "@/components/TelegramProvider";
import type { SampleOpportunity } from "@/lib/types/cv-score";

export default function TgAppHome() {
  const { tgUser, profile, loading, error } = useTelegram();
  const [recentOpps, setRecentOpps] = useState<SampleOpportunity[]>([]);
  const [oppsLoading, setOppsLoading] = useState(true);

  // Fetch latest opportunities
  useEffect(() => {
    async function fetchOpps() {
      try {
        const res = await fetch(
          "/api/opportunities/sample?hideExpired=true&minQuality=40"
        );
        if (res.ok) {
          const data = await res.json();
          setRecentOpps((data.opportunities || []).slice(0, 5));
        }
      } catch {
        // Silent fail
      } finally {
        setOppsLoading(false);
      }
    }
    fetchOpps();
  }, []);

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-3">
          <Loader2 className="w-8 h-8 animate-spin text-cyan-500 mx-auto" />
          <p className="text-sm text-dark-400">Loading your profile...</p>
        </div>
      </div>
    );
  }

  const isTelegram = !!tgUser;
  const firstName = tgUser?.first_name || profile?.name?.split(" ")[0] || "there";
  const profilePct = profile?.profile_score_pct ?? 0;

  return (
    <div className="pb-6">
      {/* ── Header ── */}
      <div className="bg-gradient-to-br from-cyan-500 via-cyan-600 to-teal-600 px-5 pt-6 pb-8 relative overflow-hidden">
        {/* Dot grid overlay */}
        <div
          className="absolute inset-0 opacity-10"
          style={{
            backgroundImage:
              "radial-gradient(circle, rgba(255,255,255,0.4) 1px, transparent 1px)",
            backgroundSize: "16px 16px",
          }}
        />

        <div className="relative z-10">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-cyan-100 text-xs font-medium uppercase tracking-wider">
                Welcome back
              </p>
              <h1 className="text-2xl font-extrabold text-white tracking-tight">
                {firstName}
              </h1>
            </div>
            <div className="flex flex-col items-center gap-1.5">
              <Link href="/tg-app/profile">
                {(profile as any)?.photo_file_id ? (
                  <img
                    src={`/api/img/${(profile as any).photo_file_id}`}
                    alt=""
                    className="w-12 h-12 rounded-full border-2 border-white/30 object-cover"
                  />
                ) : tgUser?.photo_url ? (
                  <img
                    src={tgUser.photo_url}
                    alt=""
                    className="w-12 h-12 rounded-full border-2 border-white/30"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center">
                    <User className="w-6 h-6 text-white" />
                  </div>
                )}
              </Link>
              {profile?.cv_structured_data && (
                <Link href="/tg-app/cv-builder">
                  <span className="flex items-center gap-1 bg-white/20 hover:bg-white/30 transition-colors px-2 py-0.5 rounded-full text-[10px] font-bold text-white whitespace-nowrap">
                    <FileText className="w-2.5 h-2.5" />
                    My CV
                  </span>
                </Link>
              )}
            </div>
          </div>

          {/* PWA/browser login prompt — shown when not inside Telegram */}
          {!isTelegram && !profile && (
            <div className="bg-white/20 backdrop-blur-sm rounded-xl p-3 mb-3">
              <p className="text-xs text-white/90 font-medium mb-2">Sign in to save your CV, set alerts, and score opportunities</p>
              <div className="flex gap-2">
                <a
                  href="https://t.me/Devidends_Bot?start=login"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-white text-cyan-700 font-bold text-xs"
                >
                  <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="currentColor"><path d="M9.78 18.65l.28-4.23 7.68-6.92c.34-.31-.07-.46-.52-.19L7.74 13.3 3.64 12c-.88-.25-.89-.86.2-1.3l15.97-6.16c.73-.33 1.43.18 1.15 1.3l-2.72 12.81c-.19.91-.74 1.13-1.5.71L12.6 16.3l-1.99 1.93c-.23.23-.42.42-.83.42z"/></svg>
                  Sign in with Telegram
                </a>
                <Link
                  href="/login"
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg border border-white/30 text-white font-bold text-xs"
                >
                  Email Sign In
                </Link>
              </div>
            </div>
          )}

          {/* Quick stats */}
          <div className="flex gap-3">
            <div className="flex-1 bg-white/15 backdrop-blur-sm rounded-xl px-3 py-2.5">
              <p className="text-[10px] text-cyan-100 font-medium uppercase tracking-wider">
                Profile
              </p>
              <p className="text-lg font-bold text-white">{profilePct}%</p>
            </div>
            <div className="flex-1 bg-white/15 backdrop-blur-sm rounded-xl px-3 py-2.5">
              <p className="text-[10px] text-cyan-100 font-medium uppercase tracking-wider">
                Sectors
              </p>
              <p className="text-lg font-bold text-white">
                {profile?.sectors?.length || 0}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Profile Nudge ── */}
      {profilePct < 60 && (
        <div className="mx-4 -mt-4 relative z-20">
          <Link href="/tg-app/profile">
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center gap-3">
              <TrendingUp className="w-5 h-5 text-amber-600 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-amber-800">
                  Complete your profile to {profilePct < 40 ? "40" : "80"}%
                </p>
                <p className="text-[11px] text-amber-600">
                  Add sectors and skills to get matched opportunities
                </p>
              </div>
              <ChevronRight className="w-4 h-4 text-amber-400 shrink-0" />
            </div>
          </Link>
        </div>
      )}

      {/* ── Quick Actions ── */}
      <div className="px-4 mt-5">
        <h2 className="text-xs font-bold text-dark-400 uppercase tracking-wider mb-3">
          Quick Actions
        </h2>
        <div className="grid grid-cols-2 gap-3">
          <Link href="/tg-app/opportunities">
            <div className="bg-white border border-dark-100 rounded-xl p-4 hover:border-cyan-300 transition-colors">
              <div className="w-10 h-10 rounded-lg bg-cyan-50 flex items-center justify-center mb-2.5">
                <Briefcase className="w-5 h-5 text-cyan-600" />
              </div>
              <p className="text-sm font-bold text-dark-900">Opportunities</p>
              <p className="text-[11px] text-dark-400 mt-0.5">Browse & apply</p>
            </div>
          </Link>

          {profile?.cv_structured_data ? (
            /* Has CV — single "My CV" card */
            <Link href="/tg-app/cv-builder">
              <div className="bg-white border border-teal-200 rounded-xl p-4 hover:border-teal-400 transition-colors">
                <div className="w-10 h-10 rounded-lg bg-teal-50 flex items-center justify-center mb-2.5">
                  <FileText className="w-5 h-5 text-teal-600" />
                </div>
                <p className="text-sm font-bold text-dark-900">My CV</p>
                <p className="text-[11px] text-teal-600 mt-0.5 font-medium">View &amp; edit</p>
              </div>
            </Link>
          ) : (
            /* No CV — Build + Score side by side */
            <>
              <Link href="/tg-app/cv-builder">
                <div className="bg-white border border-dark-100 rounded-xl p-4 hover:border-teal-300 transition-colors">
                  <div className="w-10 h-10 rounded-lg bg-teal-50 flex items-center justify-center mb-2.5">
                    <FileText className="w-5 h-5 text-teal-600" />
                  </div>
                  <p className="text-sm font-bold text-dark-900">Build CV</p>
                  <p className="text-[11px] text-dark-400 mt-0.5">Donor-ready format</p>
                </div>
              </Link>
            </>
          )}

          <Link href="/tg-app/profile">
            <div className="bg-white border border-dark-100 rounded-xl p-4 hover:border-cyan-300 transition-colors">
              <div className="w-10 h-10 rounded-lg bg-cyan-50 flex items-center justify-center mb-2.5">
                <User className="w-5 h-5 text-cyan-600" />
              </div>
              <p className="text-sm font-bold text-dark-900">My Profile</p>
              <p className="text-[11px] text-dark-400 mt-0.5">View & edit</p>
            </div>
          </Link>

          {!profile?.cv_structured_data && (
            <Link href="/tg-app/score">
              <div className="bg-white border border-dark-100 rounded-xl p-4 hover:border-indigo-300 transition-colors">
                <div className="w-10 h-10 rounded-lg bg-indigo-50 flex items-center justify-center mb-2.5">
                  <BarChart3 className="w-5 h-5 text-indigo-500" />
                </div>
                <p className="text-sm font-bold text-dark-900">Score CV</p>
                <p className="text-[11px] text-dark-400 mt-0.5">ATS & donor match</p>
              </div>
            </Link>
          )}

          <Link href="/tg-app/news" className={!profile?.cv_structured_data ? "" : "col-span-1"}>
            <div className="bg-white border border-dark-100 rounded-xl p-4 hover:border-teal-300 transition-colors">
              <div className="w-10 h-10 rounded-lg bg-teal-50 flex items-center justify-center mb-2.5">
                <Newspaper className="w-5 h-5 text-teal-600" />
              </div>
              <p className="text-sm font-bold text-dark-900">Dev News</p>
              <p className="text-[11px] text-dark-400 mt-0.5">Latest updates</p>
            </div>
          </Link>
        </div>

        {/* Alerts — full-width row */}
        <Link href="/tg-app/alerts" className="block mt-3">
          <div className="bg-gradient-to-r from-cyan-50 to-teal-50 border border-cyan-200 rounded-xl px-4 py-3.5 flex items-center gap-3 hover:border-cyan-300 transition-colors">
            <div className="w-10 h-10 rounded-lg bg-cyan-100 flex items-center justify-center shrink-0">
              <Bell className="w-5 h-5 text-cyan-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-dark-900">Job Alerts</p>
              <p className="text-[11px] text-dark-400 mt-0.5">
                Choose sectors to get notified
              </p>
            </div>
            <ChevronRight className="w-4 h-4 text-cyan-400 shrink-0" />
          </div>
        </Link>
      </div>

      {/* ── Latest Opportunities ── */}
      <div className="px-4 mt-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-bold text-dark-400 uppercase tracking-wider">
            Latest Opportunities
          </h2>
          <Link
            href="/tg-app/opportunities"
            className="text-xs font-semibold text-cyan-600"
          >
            See all
          </Link>
        </div>

        {oppsLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-dark-300" />
          </div>
        ) : recentOpps.length === 0 ? (
          <div className="bg-dark-50 rounded-xl px-4 py-6 text-center">
            <p className="text-sm text-dark-400">
              No opportunities found. Check back soon!
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {recentOpps.map((opp, i) => (
              <Link
                key={i}
                href={`/tg-app/opportunities/${opp.id}`}
                className="block bg-white border border-dark-100 rounded-xl px-4 py-3 hover:border-cyan-200 transition-colors"
              >
                <p className="text-sm font-bold text-dark-900 leading-snug line-clamp-2">
                  {opp.title}
                </p>
                <p className="text-xs text-dark-500 mt-1">
                  {opp.organization}
                </p>
                <div className="flex items-center gap-3 mt-2">
                  {opp.country && (
                    <span className="flex items-center gap-1 text-[11px] text-dark-400">
                      <MapPin className="w-3 h-3" />
                      {opp.country}
                    </span>
                  )}
                  {opp.deadline && (
                    <span className="flex items-center gap-1 text-[11px] text-dark-400">
                      <Clock className="w-3 h-3" />
                      {new Date(opp.deadline).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                      })}
                    </span>
                  )}
                  {opp.type && (
                    <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-cyan-50 text-cyan-700">
                      {opp.type}
                    </span>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* ── Footer ── */}
      <div className="mt-8 px-4 text-center">
        <p className="text-[10px] text-dark-300 uppercase tracking-wider font-medium">
          Powered by Devidends
        </p>
      </div>
    </div>
  );
}
