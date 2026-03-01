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

  // Error state
  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6">
        <div className="text-center space-y-3">
          <AlertCircle className="w-8 h-8 text-red-400 mx-auto" />
          <p className="text-sm text-red-600">{error}</p>
          <p className="text-xs text-dark-400">
            Please close and reopen the app.
          </p>
        </div>
      </div>
    );
  }

  const firstName = tgUser?.first_name || profile?.name?.split(" ")[0] || "there";
  const profilePct = profile?.profile_score_pct ?? 0;
  const cvScore = profile?.cv_score;

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
            {tgUser?.photo_url ? (
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
          </div>

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
                CV Score
              </p>
              <p className="text-lg font-bold text-white">
                {cvScore != null ? `${cvScore}/100` : "—"}
              </p>
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
              <p className="text-[11px] text-dark-400 mt-0.5">
                Browse & apply
              </p>
            </div>
          </Link>

          <Link href="/tg-app/cv-builder">
            <div className="bg-white border border-dark-100 rounded-xl p-4 hover:border-teal-300 transition-colors">
              <div className="w-10 h-10 rounded-lg bg-teal-50 flex items-center justify-center mb-2.5">
                <FileText className="w-5 h-5 text-teal-600" />
              </div>
              <p className="text-sm font-bold text-dark-900">Build CV</p>
              <p className="text-[11px] text-dark-400 mt-0.5">
                Donor-ready format
              </p>
            </div>
          </Link>

          <Link href="/tg-app/profile">
            <div className="bg-white border border-dark-100 rounded-xl p-4 hover:border-cyan-300 transition-colors">
              <div className="w-10 h-10 rounded-lg bg-cyan-50 flex items-center justify-center mb-2.5">
                <User className="w-5 h-5 text-cyan-600" />
              </div>
              <p className="text-sm font-bold text-dark-900">My Profile</p>
              <p className="text-[11px] text-dark-400 mt-0.5">
                View & edit
              </p>
            </div>
          </Link>

          <Link href="/tg-app/alerts">
            <div className="bg-white border border-dark-100 rounded-xl p-4 hover:border-teal-300 transition-colors">
              <div className="w-10 h-10 rounded-lg bg-teal-50 flex items-center justify-center mb-2.5">
                <Bell className="w-5 h-5 text-teal-600" />
              </div>
              <p className="text-sm font-bold text-dark-900">Alerts</p>
              <p className="text-[11px] text-dark-400 mt-0.5">
                Sector preferences
              </p>
            </div>
          </Link>
        </div>
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
