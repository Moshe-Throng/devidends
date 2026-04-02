"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { SiteHeader } from "@/components/SiteHeader";
import {
  Loader2,
  CheckCircle,
  AlertCircle,
  User,
  Briefcase,
  BarChart3,
  Mail,
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
  const { user, loading: authLoading, signInWithEmail } = useAuth();

  const token = searchParams.get("token");
  const [profile, setProfile] = useState<ClaimProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [claimed, setClaimed] = useState(false);

  // Auth form state
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [authSubmitting, setAuthSubmitting] = useState(false);

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
        if (data.success) setProfile(data.profile);
        else setError(data.error || "Invalid claim link");
      })
      .catch(() => setError("Failed to load profile"))
      .finally(() => setLoading(false));
  }, [token]);

  async function handleEmailAuth(e: React.FormEvent) {
    e.preventDefault();
    setAuthSubmitting(true);
    setAuthError("");
    const { error } = await signInWithEmail(email, password);
    if (error) setAuthError(error);
    setAuthSubmitting(false);
  }

  async function handleClaim() {
    if (claiming || !token || !user) return;
    setClaiming(true);
    setError(null);

    try {
      const res = await fetch("/api/claim/web", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ claimToken: token, userId: user.id }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Claim failed");
      setClaimed(true);
      setTimeout(() => router.push("/profile"), 2000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Claim failed");
    } finally {
      setClaiming(false);
    }
  }

  return (
    <>
      <SiteHeader />
      <main className="min-h-screen bg-dark-50 pt-20 pb-12">
        <div className="max-w-md mx-auto px-5">
          {loading ? (
            <div className="text-center py-20">
              <Loader2 className="w-8 h-8 animate-spin text-cyan-500 mx-auto" />
            </div>
          ) : claimed ? (
            <div className="text-center py-16 space-y-4">
              <CheckCircle className="w-16 h-16 text-emerald-500 mx-auto" />
              <h1 className="text-2xl font-extrabold text-dark-900">Profile Claimed!</h1>
              <p className="text-sm text-dark-400">Redirecting to your profile...</p>
            </div>
          ) : error && !profile ? (
            <div className="text-center py-16 space-y-4">
              <AlertCircle className="w-12 h-12 text-red-400 mx-auto" />
              <h1 className="text-lg font-bold text-dark-900">Cannot Claim</h1>
              <p className="text-sm text-dark-400">{error}</p>
            </div>
          ) : profile ? (
            <div className="space-y-6">
              {/* Header */}
              <div className="text-center">
                <h1 className="text-2xl font-extrabold text-dark-900">Your profile is ready</h1>
                <p className="text-sm text-dark-400 mt-1">Review and claim your professional profile on Devidends</p>
              </div>

              {/* Profile card */}
              <div className="bg-white rounded-2xl border border-dark-100 shadow-sm p-5 space-y-4">
                <div className="flex items-start gap-3">
                  <div className="w-12 h-12 rounded-full bg-cyan-50 flex items-center justify-center shrink-0">
                    <User className="w-6 h-6 text-cyan-600" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-dark-900">{profile.name}</h2>
                    {profile.headline && <p className="text-xs text-dark-400">{profile.headline}</p>}
                    {profile.profile_type && (
                      <span className="inline-block mt-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-50 text-cyan-700 border border-cyan-200">
                        {profile.profile_type}
                      </span>
                    )}
                  </div>
                </div>

                {profile.cv_score && (
                  <div className="flex items-center gap-3 p-3 bg-dark-50 rounded-xl">
                    <BarChart3 className="w-5 h-5 text-cyan-500" />
                    <div>
                      <p className="text-xs text-dark-400">CV Score</p>
                      <p className="text-lg font-bold text-dark-900">{profile.cv_score}/100</p>
                    </div>
                  </div>
                )}

                {profile.sectors?.length > 0 && (
                  <div>
                    <div className="flex items-center gap-1.5 mb-2">
                      <Briefcase className="w-3.5 h-3.5 text-dark-400" />
                      <p className="text-xs text-dark-400 font-medium">Sectors</p>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {profile.sectors.map((s) => (
                        <span key={s} className="px-2.5 py-1 rounded-full text-xs font-semibold bg-cyan-50 text-cyan-700 border border-cyan-200">{s}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Auth + claim */}
              {user ? (
                <div className="space-y-3">
                  {error && (
                    <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700">{error}</div>
                  )}
                  <button
                    onClick={handleClaim}
                    disabled={claiming}
                    className="w-full py-3.5 rounded-xl bg-gradient-to-r from-cyan-500 to-teal-500 text-white font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {claiming ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                    {claiming ? "Claiming..." : "Claim This Profile"}
                  </button>
                  <p className="text-center text-[10px] text-dark-300">Signed in as {user.email}</p>
                </div>
              ) : (
                <div className="bg-white rounded-2xl border border-dark-100 p-5 space-y-4">
                  <div className="flex items-center gap-2">
                    <Mail className="w-4 h-4 text-cyan-500" />
                    <p className="text-sm font-bold text-dark-800">Sign in to claim</p>
                  </div>
                  <form onSubmit={handleEmailAuth} className="space-y-3">
                    <input
                      type="email"
                      placeholder="Email address"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      className="w-full px-4 py-3 rounded-xl border border-dark-200 text-sm focus:border-cyan-500 focus:outline-none"
                    />
                    <input
                      type="password"
                      placeholder="Password (min 6 characters)"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      minLength={6}
                      className="w-full px-4 py-3 rounded-xl border border-dark-200 text-sm focus:border-cyan-500 focus:outline-none"
                    />
                    {authError && <p className="text-xs text-red-500">{authError}</p>}
                    <button
                      type="submit"
                      disabled={authSubmitting}
                      className="w-full py-3 rounded-xl bg-cyan-500 text-white font-bold text-sm disabled:opacity-50"
                    >
                      {authSubmitting ? "Signing in..." : "Sign In & Claim"}
                    </button>
                  </form>
                  <p className="text-center text-[10px] text-dark-300">
                    Or use Telegram: open the link from your Telegram app
                  </p>
                </div>
              )}
            </div>
          ) : null}
        </div>
      </main>
    </>
  );
}
