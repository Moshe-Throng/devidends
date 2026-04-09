"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  FileText,
  Loader2,
  CheckCircle,
  AlertCircle,
  TrendingUp,
} from "lucide-react";
import { useTelegram } from "@/components/TelegramProvider";
import type { CvScoreResult } from "@/lib/types/cv-score";

export default function TgAppScore() {
  const { profile, refreshProfile, loading } = useTelegram();
  const [phase, setPhase] = useState<"ready" | "scoring" | "results">("ready");
  const [result, setResult] = useState<CvScoreResult | null>(null);
  const [error, setError] = useState("");

  // Gate: no saved CV → redirect to Build CV
  if (!loading && !profile?.cv_structured_data) {
    return (
      <div className="min-h-screen flex flex-col">
        <div className="bg-white border-b border-dark-100 px-4 pt-3 pb-3 sticky top-0 z-30">
          <div className="flex items-center gap-3">
            <Link href="/tg-app" className="text-dark-400"><ArrowLeft className="w-5 h-5" /></Link>
            <h1 className="text-lg font-extrabold text-dark-900">Score CV</h1>
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center px-6">
          <div className="text-center space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-cyan-50 flex items-center justify-center mx-auto">
              <FileText className="w-7 h-7 text-cyan-500" />
            </div>
            <h2 className="text-lg font-bold text-dark-900">Upload your CV first</h2>
            <p className="text-xs text-dark-400">Build and save your CV to unlock scoring.</p>
            <Link href="/tg-app/cv-builder" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-teal-500 text-white font-bold text-sm">
              Build My CV
            </Link>
          </div>
        </div>
      </div>
    );
  }

  async function handleScore() {
    if (!profile?.cv_text) {
      setError("No CV text found. Please update your CV in the Build CV section first.");
      return;
    }

    setPhase("scoring");
    setError("");

    try {
      // Score saved CV text directly (no file upload needed)
      const res = await fetch("/api/cv/score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cv_text: profile.cv_text }),
      });

      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.error || "Scoring failed — please try again");
      }

      setResult(json.data as CvScoreResult);
      setPhase("results");

      // Refresh profile to get updated cv_score
      refreshProfile();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setPhase("ready");
    }
  }

  function dim(name: string): number {
    if (!result) return 0;
    const d = result.dimensions?.find((dd) => dd.name === name);
    return d?.score ?? 0;
  }

  return (
    <div className="pb-6">
      {/* ── Header ── */}
      <div className="bg-white border-b border-dark-100 px-4 pt-3 pb-3 sticky top-0 z-30">
        <div className="flex items-center gap-3">
          <Link href="/tg-app" className="text-dark-400 hover:text-dark-600">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-lg font-extrabold text-dark-900 tracking-tight">
            CV Scorer
          </h1>
        </div>
      </div>

      {/* ── Ready Phase ── */}
      {phase === "ready" && (
        <div className="px-4 mt-6">
          <div className="text-center mb-6">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-cyan-500 to-teal-500 flex items-center justify-center mx-auto mb-3">
              <FileText className="w-8 h-8 text-white" />
            </div>
            <h2 className="text-xl font-bold text-dark-900">
              Score Your CV
            </h2>
            <p className="text-sm text-dark-400 mt-1 max-w-xs mx-auto">
              AI-powered analysis scored against GIZ, World Bank, EU, and UN donor CV standards
            </p>
            <p className="text-[11px] text-dark-300 mt-2 max-w-xs mx-auto">
              Evaluates structure, donor readiness, experience relevance, keywords, and formatting
            </p>
          </div>

          {/* Saved CV info */}
          <div className="bg-cyan-50 border border-cyan-200 rounded-xl px-4 py-3 flex items-center gap-3 mb-4">
            <CheckCircle className="w-5 h-5 text-cyan-600 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-dark-900">
                {profile?.name || "Your"} CV
              </p>
              <p className="text-xs text-dark-400">Saved in your profile</p>
            </div>
          </div>

          {error && (
            <div className="mt-3 bg-red-50 border border-red-200 rounded-lg px-3 py-2 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
              <p className="text-xs text-red-700">{error}</p>
            </div>
          )}

          <button
            onClick={handleScore}
            className="w-full mt-2 py-3.5 rounded-xl bg-gradient-to-r from-cyan-500 to-teal-500 text-white font-bold text-sm"
          >
            Score My CV
          </button>

          <p className="text-center text-[11px] text-dark-300 mt-2">
            Need to update your CV? <Link href="/tg-app/cv-builder" className="text-cyan-500 font-medium">Edit in CV Builder</Link>
          </p>

          {/* Previous score */}
          {profile?.cv_score != null && (
            <div className="mt-6 bg-dark-50 rounded-xl px-4 py-3 flex items-center gap-3">
              <TrendingUp className="w-5 h-5 text-dark-400" />
              <div>
                <p className="text-xs text-dark-400 font-medium">
                  Your latest score
                </p>
                <p className="text-lg font-bold text-dark-900">
                  {profile.cv_score}/100
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Scoring Phase ── */}
      {phase === "scoring" && (
        <div className="px-4 mt-16 text-center">
          <Loader2 className="w-10 h-10 animate-spin text-cyan-500 mx-auto" />
          <h2 className="text-lg font-bold text-dark-900 mt-4">
            Analyzing your CV...
          </h2>
          <p className="text-sm text-dark-400 mt-1">
            This takes about 15-30 seconds
          </p>
          <div className="mt-6 space-y-2 max-w-xs mx-auto text-left">
            {[
              "Checking structure & format",
              "Evaluating experience relevance",
              "Assessing donor readiness",
              "Generating improvements",
            ].map((step, i) => (
              <div
                key={i}
                className="flex items-center gap-2 text-xs text-dark-400"
                style={{ animationDelay: `${i * 0.5}s` }}
              >
                <Loader2 className="w-3 h-3 animate-spin" />
                <span>{step}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Results Phase ── */}
      {phase === "results" && result && (
        <div className="px-4 mt-4">
          {/* Overall Score */}
          <div className="bg-gradient-to-br from-dark-900 to-dark-800 rounded-2xl p-5 text-center relative overflow-hidden">
            <div
              className="absolute inset-0 opacity-5"
              style={{
                backgroundImage:
                  "radial-gradient(circle, rgba(255,255,255,0.5) 1px, transparent 1px)",
                backgroundSize: "14px 14px",
              }}
            />
            <div className="relative z-10">
              <p className="text-xs text-cyan-300 font-medium uppercase tracking-wider">
                Your CV Score
              </p>
              <p className="text-5xl font-extrabold text-white mt-1">
                {result.overall_score}
                <span className="text-lg text-white/40">/100</span>
              </p>
              <div className="flex items-center justify-center gap-1 mt-2">
                <CheckCircle className="w-4 h-4 text-emerald-400" />
                <span className="text-sm text-emerald-300 font-medium">
                  Analysis complete
                </span>
              </div>
            </div>
          </div>

          {/* Dimensions */}
          <div className="mt-4 space-y-2">
            {(result.dimensions || []).map((d) => (
              <div
                key={d.name}
                className="bg-white border border-dark-100 rounded-xl px-4 py-3"
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-bold text-dark-700">
                    {d.name}
                  </span>
                  <span className="text-xs font-bold text-dark-900">
                    {d.score}/100
                  </span>
                </div>
                <div className="h-2 rounded-full bg-dark-100">
                  <div
                    className="h-2 rounded-full transition-all duration-700"
                    style={{
                      width: `${d.score}%`,
                      background:
                        d.score >= 70
                          ? "linear-gradient(to right, #27ABD2, #24CFD6)"
                          : d.score >= 40
                          ? "linear-gradient(to right, #f59e0b, #fbbf24)"
                          : "linear-gradient(to right, #ef4444, #f87171)",
                    }}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Improvements */}
          {result.top_3_improvements &&
            result.top_3_improvements.length > 0 && (
              <div className="mt-4">
                <h3 className="text-xs font-bold text-dark-400 uppercase tracking-wider mb-2">
                  Top Improvements
                </h3>
                <div className="space-y-1.5">
                  {result.top_3_improvements.map((imp, i) => (
                    <div
                      key={i}
                      className="bg-amber-50 border border-amber-100 rounded-lg px-3 py-2.5 flex items-start gap-2"
                    >
                      <span className="text-xs font-bold text-amber-600 mt-0.5">
                        {i + 1}.
                      </span>
                      <p className="text-xs text-amber-800 leading-relaxed">
                        {imp}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

          {/* Score again */}
          <button
            onClick={() => {
              setPhase("ready");
              setResult(null);
            }}
            className="w-full mt-5 py-3 rounded-xl border-2 border-cyan-500 text-cyan-600 font-bold text-sm hover:bg-cyan-50 transition-colors"
          >
            Score Again
          </button>
        </div>
      )}
    </div>
  );
}
