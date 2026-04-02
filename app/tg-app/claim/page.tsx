"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useTelegram } from "@/components/TelegramProvider";
import {
  Loader2,
  CheckCircle,
  AlertCircle,
  User,
  Briefcase,
  BarChart3,
} from "lucide-react";

interface ClaimProfile {
  name: string;
  headline: string | null;
  sectors: string[];
  cv_score: number | null;
  profile_type: string | null;
}

export default function ClaimPageWrapper() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-cyan-500" /></div>}>
      <ClaimPage />
    </Suspense>
  );
}

function ClaimPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { tgUser } = useTelegram();

  const token = searchParams.get("token");
  const [profile, setProfile] = useState<ClaimProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [claimed, setClaimed] = useState(false);

  // Fetch profile preview
  useEffect(() => {
    if (!token) {
      setError("No claim token provided");
      setLoading(false);
      return;
    }

    fetch(`/api/claim?token=${token}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setProfile(data.profile);
        } else {
          setError(data.error || "Invalid claim link");
        }
      })
      .catch(() => setError("Failed to load profile"))
      .finally(() => setLoading(false));
  }, [token]);

  async function handleClaim() {
    if (claiming || !token) return;
    setClaiming(true);
    setError(null);

    try {
      const initData = sessionStorage.getItem("tg_init_data");
      if (!initData) {
        throw new Error("Please open this link from Telegram");
      }

      const res = await fetch("/api/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initData, claimToken: token }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to claim profile");
      }

      setClaimed(true);
      // Redirect to profile after short delay
      setTimeout(() => router.push("/tg-app/cv-builder"), 2000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Claim failed");
    } finally {
      setClaiming(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-cyan-500" />
      </div>
    );
  }

  if (claimed) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6">
        <div className="text-center space-y-4">
          <CheckCircle className="w-16 h-16 text-emerald-500 mx-auto" />
          <h1 className="text-2xl font-extrabold text-dark-900">Profile Claimed!</h1>
          <p className="text-sm text-dark-400">
            Your professional profile is now linked to your Telegram account. Redirecting...
          </p>
        </div>
      </div>
    );
  }

  if (error && !profile) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6">
        <div className="text-center space-y-4">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto" />
          <h1 className="text-lg font-bold text-dark-900">Cannot Claim</h1>
          <p className="text-sm text-dark-400">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-dark-50 pb-8">
      {/* Header */}
      <div className="bg-gradient-to-br from-cyan-500 via-cyan-600 to-teal-600 px-5 pt-8 pb-10 text-center">
        <p className="text-cyan-100 text-xs font-medium uppercase tracking-wider mb-1">
          Devidends
        </p>
        <h1 className="text-xl font-extrabold text-white">
          Your profile is ready
        </h1>
        <p className="text-sm text-cyan-100/70 mt-1">
          Review and claim your professional profile
        </p>
      </div>

      {/* Profile card */}
      {profile && (
        <div className="px-4 -mt-6">
          <div className="bg-white rounded-2xl shadow-lg shadow-dark-900/10 p-5 space-y-4">
            {/* Name + type */}
            <div className="flex items-start gap-3">
              <div className="w-12 h-12 rounded-full bg-cyan-50 flex items-center justify-center shrink-0">
                <User className="w-6 h-6 text-cyan-600" />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-lg font-bold text-dark-900">{profile.name}</h2>
                {profile.headline && (
                  <p className="text-xs text-dark-400 mt-0.5">{profile.headline}</p>
                )}
                {profile.profile_type && (
                  <span className="inline-block mt-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-50 text-cyan-700 border border-cyan-200">
                    {profile.profile_type}
                  </span>
                )}
              </div>
            </div>

            {/* Score */}
            {profile.cv_score && (
              <div className="flex items-center gap-3 p-3 bg-dark-50 rounded-xl">
                <BarChart3 className="w-5 h-5 text-cyan-500" />
                <div>
                  <p className="text-xs text-dark-400">CV Score</p>
                  <p className="text-lg font-bold text-dark-900">{profile.cv_score}/100</p>
                </div>
              </div>
            )}

            {/* Sectors */}
            {profile.sectors && profile.sectors.length > 0 && (
              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  <Briefcase className="w-3.5 h-3.5 text-dark-400" />
                  <p className="text-xs text-dark-400 font-medium">Sectors</p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {profile.sectors.map((s) => (
                    <span key={s} className="px-2.5 py-1 rounded-full text-xs font-semibold bg-cyan-50 text-cyan-700 border border-cyan-200">
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700">
                {error}
              </div>
            )}

            {/* Claim button */}
            <button
              onClick={handleClaim}
              disabled={claiming}
              className="w-full py-3.5 rounded-xl bg-gradient-to-r from-cyan-500 to-teal-500 text-white font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.98] transition-transform"
            >
              {claiming ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Claiming...
                </>
              ) : (
                <>
                  <CheckCircle className="w-4 h-4" />
                  Claim This Profile
                </>
              )}
            </button>

            <p className="text-center text-[10px] text-dark-300">
              This will link your Telegram account to this profile
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
