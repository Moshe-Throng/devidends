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
  Mail,
  Bell,
  ChevronRight,
  ChevronLeft,
  Users,
  Handshake,
} from "lucide-react";

interface ClaimProfile {
  name: string;
  headline: string | null;
  sectors: string[];
  profile_type: string | null;
  email: string | null;
  phone: string | null;
  is_recommender: boolean;
  recommended_count: number;
  cc_interests: string[];
  cc_ask_frequency: string;
}

const ALL_SECTORS = [
  "Economic Development", "Project Management", "Governance",
  "Finance & Banking", "Innovation & ICT", "Gender & Social Inclusion",
  "Agriculture", "Research", "Education", "Global Health",
  "Environment & Natural Resources", "Humanitarian Aid", "Energy", "Legal",
];

const ENGAGEMENT_OPTIONS: { id: string; label: string; blurb: string }[] = [
  { id: "recommend_cvs",   label: "Recommend CVs",           blurb: "Bring people I trust into the pool" },
  { id: "share_tors",      label: "Share ToRs / tenders",    blurb: "Forward live opportunities I come across" },
  { id: "get_candidates",  label: "Request candidates",      blurb: "Ask the network when I'm building a team" },
  { id: "vouch_for_peers", label: "Vouch for peers",         blurb: "Add credibility to profiles I know" },
  { id: "sector_news",     label: "Sector intelligence",     blurb: "Get briefed on donor + tender trends" },
  { id: "events",          label: "Events + meetups",        blurb: "Occasional private Co-Creator gatherings" },
];

type Step = "review" | "email" | "channel" | "sectors" | "engagement" | "claiming" | "done";

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
  const [interests, setInterests] = useState<string[]>([]);
  const [askFrequency, setAskFrequency] = useState<"daily" | "weekly" | "biweekly" | "monthly">("weekly");

  useEffect(() => {
    if (!token) { setError("No claim token provided"); setLoading(false); return; }
    fetch(`/api/claim?token=${token}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.success) {
          setProfile(d.profile);
          setEmail(d.profile.email || "");
          setSelectedSectors(d.profile.sectors || []);
          setInterests(d.profile.cc_interests || []);
          setAskFrequency((d.profile.cc_ask_frequency || "weekly") as any);
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
          ...(profile?.is_recommender ? { interests, ask_frequency: askFrequency } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Failed to claim profile");
      setStep("done");
      // Land on the home page with the tour kicked off (forced for first claim)
      setTimeout(() => router.push("/tg-app?tour=1"), 2400);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Claim failed");
      setStep(isRecommender ? "engagement" : "sectors");
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

  const isRecommender = !!profile?.is_recommender;
  const totalSteps = isRecommender ? 5 : 4;
  const stepNum: Record<Step, number> = {
    review: 1, email: 2, channel: 3, sectors: 4, engagement: 5, claiming: totalSteps, done: totalSteps,
  };
  const progressLabel = { review: "Profile", email: "Email", channel: "Channel", sectors: "Sectors", engagement: "How you engage", claiming: "", done: "" }[step];
  const progressPct = Math.round((stepNum[step] / totalSteps) * 100);

  function onSectorsContinue() {
    if (isRecommender) setStep("engagement");
    else handleFinalClaim();
  }
  function toggleInterest(id: string) {
    setInterests((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  }

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
                  <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                    {profile.profile_type && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-50 text-cyan-700 border border-cyan-200">
                        {profile.profile_type}
                      </span>
                    )}
                    {isRecommender && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                        Co-Creator
                      </span>
                    )}
                  </div>
                </div>
              </div>
              {isRecommender && (
                <div className="flex items-center gap-3 p-3 bg-amber-50/60 border border-amber-200 rounded-xl">
                  <Users className="w-5 h-5 text-amber-600" />
                  <div>
                    <p className="text-xs text-amber-700">People you&apos;ve brought to the network so far</p>
                    <p className="text-lg font-bold text-dark-900">{profile.recommended_count}</p>
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
                <button onClick={onSectorsContinue} className="flex-[2] py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-teal-500 text-white font-bold text-sm flex items-center justify-center gap-1">
                  {isRecommender ? (
                    <>Continue <ChevronRight className="w-4 h-4" /></>
                  ) : (
                    <><CheckCircle className="w-4 h-4" /> Claim my profile</>
                  )}
                </button>
              </div>
            </>
          )}

          {/* Step 5: Engagement (recommenders only) */}
          {step === "engagement" && (
            <>
              <div className="flex items-start gap-3">
                <div className="w-12 h-12 rounded-full bg-amber-50 flex items-center justify-center shrink-0">
                  <Handshake className="w-6 h-6 text-amber-600" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-dark-900">How do you want to engage?</h2>
                  <p className="text-xs text-dark-400 mt-0.5">As a Co-Creator — pick what fits you. Change anytime.</p>
                </div>
              </div>

              <div className="space-y-2">
                {ENGAGEMENT_OPTIONS.map((opt) => {
                  const on = interests.includes(opt.id);
                  return (
                    <button
                      key={opt.id}
                      onClick={() => toggleInterest(opt.id)}
                      className={`w-full text-left px-3.5 py-3 rounded-xl border transition-all ${
                        on ? "border-amber-500 bg-amber-50/60" : "border-dark-100 bg-white"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-dark-900">{opt.label}</p>
                          <p className="text-[11px] text-dark-400 mt-0.5">{opt.blurb}</p>
                        </div>
                        {on && <CheckCircle className="w-5 h-5 text-amber-600 shrink-0" />}
                      </div>
                    </button>
                  );
                })}
              </div>

              <div>
                <p className="text-xs text-dark-400 font-medium mb-2">How often should we reach out?</p>
                <div className="grid grid-cols-4 gap-1.5">
                  {(["daily", "weekly", "biweekly", "monthly"] as const).map((f) => (
                    <button
                      key={f}
                      onClick={() => setAskFrequency(f)}
                      className={`py-2 rounded-lg text-xs font-bold border transition-all capitalize ${
                        askFrequency === f ? "border-amber-500 bg-amber-500 text-white" : "border-dark-200 text-dark-500 bg-white"
                      }`}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-2">
                <button onClick={() => setStep("sectors")} className="flex-1 py-3 rounded-xl border border-dark-200 text-dark-600 font-semibold text-sm flex items-center justify-center gap-1">
                  <ChevronLeft className="w-4 h-4" /> Back
                </button>
                <button onClick={handleFinalClaim} className="flex-[2] py-3 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 text-white font-bold text-sm flex items-center justify-center gap-1">
                  <CheckCircle className="w-4 h-4" /> Claim + set preferences
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
