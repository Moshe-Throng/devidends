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
  Mail,
  Bell,
  ChevronRight,
  ChevronLeft,
} from "lucide-react";

interface ClaimProfile {
  name: string;
  headline: string | null;
  sectors: string[];
  cv_score: number | null;
  profile_type: string | null;
  email: string | null;
  phone: string | null;
}

const ALL_SECTORS = [
  "Economic Development", "Project Management", "Governance",
  "Finance & Banking", "Innovation & ICT", "Gender & Social Inclusion",
  "Agriculture", "Research", "Education", "Global Health",
  "Environment & Natural Resources", "Humanitarian Aid", "Energy", "Legal",
];

type Step = "review" | "email" | "channel" | "sectors" | "claiming" | "done";

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
  const [error, setError] = useState<string | null>(null);

  const [step, setStep] = useState<Step>("review");
  const [email, setEmail] = useState("");
  const [channel, setChannel] = useState<"telegram" | "email" | "both">("telegram");
  const [selectedSectors, setSelectedSectors] = useState<string[]>([]);

  useEffect(() => {
    if (!token) { setError("No claim token provided"); setLoading(false); return; }
    fetch(`/api/claim?token=${token}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.success) {
          setProfile(d.profile);
          setEmail(d.profile.email || "");
          setSelectedSectors(d.profile.sectors || []);
        } else setError(d.error || "Invalid claim link");
      })
      .catch(() => setError("Failed to load profile"))
      .finally(() => setLoading(false));
  }, [token]);

  async function handleFinalClaim() {
    if (!token) return;
    setStep("claiming");
    setError(null);
    try {
      const initData = sessionStorage.getItem("tg_init_data");
      if (!initData) throw new Error("Please open this link from Telegram");
      const res = await fetch("/api/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          initData, claimToken: token,
          email: email || null,
          channel,
          sectors_filter: selectedSectors,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Failed to claim profile");
      setStep("done");
      setTimeout(() => router.push("/tg-app/profile"), 2400);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Claim failed");
      setStep("channel");
    }
  }

  function toggleSector(s: string) {
    setSelectedSectors((prev) => prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]);
  }

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-cyan-500" /></div>;
  }

  if (error && !profile) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6">
        <div className="text-center space-y-3">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto" />
          <h1 className="text-lg font-bold text-dark-900">Cannot Claim</h1>
          <p className="text-sm text-dark-400">{error}</p>
        </div>
      </div>
    );
  }

  if (step === "done") {
    return (
      <div className="min-h-screen flex items-center justify-center px-6">
        <div className="text-center space-y-4 animate-fadeIn">
          <CheckCircle className="w-16 h-16 text-emerald-500 mx-auto" />
          <h1 className="text-2xl font-extrabold text-dark-900">Welcome, {profile?.name?.split(" ")[0]}!</h1>
          <p className="text-sm text-dark-400 max-w-xs mx-auto">Your profile is live. Briefs start on your chosen channel within 24 hours.</p>
        </div>
      </div>
    );
  }

  const progressLabel = {
    review: "Profile", email: "Email", channel: "Channel", sectors: "Sectors", claiming: "", done: "",
  }[step];
  const progressPct = { review: 25, email: 50, channel: 75, sectors: 90, claiming: 100, done: 100 }[step];

  return (
    <div className="min-h-screen bg-dark-50 pb-10">
      {/* Header */}
      <div className="bg-gradient-to-br from-cyan-500 via-cyan-600 to-teal-600 px-5 pt-8 pb-7">
        <div className="flex items-center justify-between text-white mb-3">
          <p className="text-cyan-100 text-xs font-medium uppercase tracking-wider">Devidends · Step {progressLabel}</p>
          <p className="text-cyan-100 text-xs font-bold">{progressPct}%</p>
        </div>
        <div className="h-1 bg-cyan-700/40 rounded-full overflow-hidden">
          <div className="h-full bg-white rounded-full transition-all duration-500" style={{ width: `${progressPct}%` }} />
        </div>
      </div>

      <div className="px-4 -mt-3">
        <div className="bg-white rounded-2xl shadow-lg shadow-dark-900/10 p-5 space-y-5">

          {/* Step 1: Review */}
          {step === "review" && profile && (
            <>
              <div className="flex items-start gap-3">
                <div className="w-12 h-12 rounded-full bg-cyan-50 flex items-center justify-center shrink-0">
                  <User className="w-6 h-6 text-cyan-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-lg font-bold text-dark-900">{profile.name}</h2>
                  {profile.headline && <p className="text-xs text-dark-400 mt-0.5">{profile.headline}</p>}
                  {profile.profile_type && (
                    <span className="inline-block mt-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-50 text-cyan-700 border border-cyan-200">
                      {profile.profile_type}
                    </span>
                  )}
                </div>
              </div>
              {profile.cv_score != null && (
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
                    <p className="text-xs text-dark-400 font-medium">Sectors on your profile</p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {profile.sectors.map((s) => (
                      <span key={s} className="px-2.5 py-1 rounded-full text-xs font-semibold bg-cyan-50 text-cyan-700 border border-cyan-200">{s}</span>
                    ))}
                  </div>
                </div>
              )}
              <button onClick={() => setStep("email")} className="w-full py-3.5 rounded-xl bg-gradient-to-r from-cyan-500 to-teal-500 text-white font-bold text-sm flex items-center justify-center gap-2 active:scale-[0.98]">
                Yes, this is me <ChevronRight className="w-4 h-4" />
              </button>
            </>
          )}

          {/* Step 2: Email */}
          {step === "email" && (
            <>
              <div className="flex items-start gap-3">
                <div className="w-12 h-12 rounded-full bg-cyan-50 flex items-center justify-center shrink-0">
                  <Mail className="w-6 h-6 text-cyan-600" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-dark-900">Confirm your email</h2>
                  <p className="text-xs text-dark-400 mt-0.5">We&apos;ll use it to keep your info synced across Telegram and web.</p>
                </div>
              </div>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full px-4 py-3 rounded-xl border border-dark-200 text-sm focus:border-cyan-400 focus:outline-none"
              />
              {profile?.email && email === profile.email && (
                <p className="text-[11px] text-dark-400">Already on file — confirm or edit.</p>
              )}
              <div className="flex gap-2">
                <button onClick={() => setStep("review")} className="flex-1 py-3 rounded-xl border border-dark-200 text-dark-600 font-semibold text-sm flex items-center justify-center gap-1">
                  <ChevronLeft className="w-4 h-4" /> Back
                </button>
                <button
                  onClick={() => setStep("channel")}
                  disabled={email.length > 0 && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)}
                  className="flex-[2] py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-teal-500 text-white font-bold text-sm disabled:opacity-50 flex items-center justify-center gap-1"
                >
                  Continue <ChevronRight className="w-4 h-4" />
                </button>
              </div>
              <button onClick={() => { setEmail(""); setStep("channel"); }} className="w-full text-xs text-dark-400 underline">
                Skip — no email
              </button>
            </>
          )}

          {/* Step 3: Channel */}
          {step === "channel" && (
            <>
              <div className="flex items-start gap-3">
                <div className="w-12 h-12 rounded-full bg-cyan-50 flex items-center justify-center shrink-0">
                  <Bell className="w-6 h-6 text-cyan-600" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-dark-900">How should we reach you?</h2>
                  <p className="text-xs text-dark-400 mt-0.5">Daily briefs + opportunity matches.</p>
                </div>
              </div>
              <div className="space-y-2">
                {(["telegram", "email", "both"] as const).map((c) => {
                  const disabled = (c === "email" || c === "both") && !email;
                  const label = c === "telegram" ? "Telegram only (fastest)" : c === "email" ? "Email only" : "Both";
                  const sub = c === "telegram" ? "Daily in this chat" : c === "email" ? "Daily digest via email" : "Both channels (recommended for experts)";
                  return (
                    <button
                      key={c}
                      disabled={disabled}
                      onClick={() => setChannel(c)}
                      className={`w-full text-left px-4 py-3.5 rounded-xl border transition-all ${
                        channel === c ? "border-cyan-500 bg-cyan-50/60" : "border-dark-100 bg-white"
                      } disabled:opacity-40`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-bold text-dark-900">{label}</p>
                          <p className="text-[11px] text-dark-400 mt-0.5">{sub}</p>
                        </div>
                        {channel === c && <CheckCircle className="w-5 h-5 text-cyan-600" />}
                      </div>
                    </button>
                  );
                })}
              </div>
              {error && <p className="text-xs text-red-600">{error}</p>}
              <div className="flex gap-2">
                <button onClick={() => setStep("email")} className="flex-1 py-3 rounded-xl border border-dark-200 text-dark-600 font-semibold text-sm flex items-center justify-center gap-1">
                  <ChevronLeft className="w-4 h-4" /> Back
                </button>
                <button onClick={() => setStep("sectors")} className="flex-[2] py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-teal-500 text-white font-bold text-sm flex items-center justify-center gap-1">
                  Continue <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </>
          )}

          {/* Step 4: Sectors */}
          {step === "sectors" && (
            <>
              <div className="flex items-start gap-3">
                <div className="w-12 h-12 rounded-full bg-cyan-50 flex items-center justify-center shrink-0">
                  <Briefcase className="w-6 h-6 text-cyan-600" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-dark-900">Pick your sectors</h2>
                  <p className="text-xs text-dark-400 mt-0.5">We filter briefs to just these.</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {ALL_SECTORS.map((s) => {
                  const on = selectedSectors.includes(s);
                  return (
                    <button
                      key={s}
                      onClick={() => toggleSector(s)}
                      className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                        on ? "bg-cyan-500 text-white border-cyan-500" : "bg-white text-dark-600 border-dark-200"
                      }`}
                    >
                      {s}
                    </button>
                  );
                })}
              </div>
              <p className="text-[11px] text-dark-400">{selectedSectors.length} selected — tap to toggle.</p>
              <div className="flex gap-2">
                <button onClick={() => setStep("channel")} className="flex-1 py-3 rounded-xl border border-dark-200 text-dark-600 font-semibold text-sm flex items-center justify-center gap-1">
                  <ChevronLeft className="w-4 h-4" /> Back
                </button>
                <button onClick={handleFinalClaim} className="flex-[2] py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-teal-500 text-white font-bold text-sm flex items-center justify-center gap-1">
                  <CheckCircle className="w-4 h-4" /> Claim my profile
                </button>
              </div>
            </>
          )}

          {/* Claiming state */}
          {step === "claiming" && (
            <div className="py-8 text-center">
              <Loader2 className="w-10 h-10 animate-spin text-cyan-500 mx-auto mb-3" />
              <p className="text-sm text-dark-400">Linking everything together…</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
