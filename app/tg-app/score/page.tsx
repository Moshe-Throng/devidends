"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Upload,
  FileText,
  Loader2,
  CheckCircle,
  AlertCircle,
  TrendingUp,
  X,
} from "lucide-react";
import { useTelegram } from "@/components/TelegramProvider";
import type { CvScoreResult } from "@/lib/types/cv-score";

export default function TgAppScore() {
  const { profile, refreshProfile } = useTelegram();
  const fileRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<"upload" | "scoring" | "results">(
    "upload"
  );
  const [result, setResult] = useState<CvScoreResult | null>(null);
  const [error, setError] = useState("");

  async function handleScore() {
    if (!file) return;

    setPhase("scoring");
    setError("");

    try {
      // Step 1: Extract text
      const formData = new FormData();
      formData.append("file", file);

      const extractRes = await fetch("/api/cv/extract", {
        method: "POST",
        body: formData,
      });

      if (!extractRes.ok) {
        throw new Error("Failed to read your CV file");
      }

      const extractData = await extractRes.json();
      const text = extractData.raw_text || extractData.text;

      // Step 2: Score
      const scoreRes = await fetch("/api/cv/score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cvText: text }),
      });

      if (!scoreRes.ok) {
        throw new Error("Scoring failed — please try again");
      }

      const scoreData: CvScoreResult = await scoreRes.json();
      setResult(scoreData);
      setPhase("results");

      // Refresh profile to get updated cv_score
      refreshProfile();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setPhase("upload");
    }
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;

    const ext = f.name.toLowerCase().split(".").pop();
    if (!["pdf", "docx", "doc", "txt", "rtf"].includes(ext || "")) {
      setError("Please upload a PDF, DOCX, DOC, or TXT file");
      return;
    }

    if (f.size > 10 * 1024 * 1024) {
      setError("File must be under 10MB");
      return;
    }

    setFile(f);
    setError("");
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

      {/* ── Upload Phase ── */}
      {phase === "upload" && (
        <div className="px-4 mt-6">
          <div className="text-center mb-6">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-cyan-500 to-teal-500 flex items-center justify-center mx-auto mb-3">
              <FileText className="w-8 h-8 text-white" />
            </div>
            <h2 className="text-xl font-bold text-dark-900">
              Score Your CV
            </h2>
            <p className="text-sm text-dark-400 mt-1 max-w-xs mx-auto">
              Upload your CV and get an AI-powered analysis against
              international development standards
            </p>
          </div>

          {/* File picker */}
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.docx,.doc,.txt,.rtf"
            onChange={handleFileSelect}
            className="hidden"
          />

          {!file ? (
            <button
              onClick={() => fileRef.current?.click()}
              className="w-full border-2 border-dashed border-dark-200 rounded-xl py-8 flex flex-col items-center gap-2 hover:border-cyan-400 hover:bg-cyan-50/30 transition-colors"
            >
              <Upload className="w-8 h-8 text-dark-300" />
              <p className="text-sm font-semibold text-dark-600">
                Tap to upload your CV
              </p>
              <p className="text-xs text-dark-400">PDF, DOCX, DOC, or TXT — up to 10MB</p>
            </button>
          ) : (
            <div className="bg-cyan-50 border border-cyan-200 rounded-xl px-4 py-3 flex items-center gap-3">
              <FileText className="w-5 h-5 text-cyan-600 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-dark-900 truncate">
                  {file.name}
                </p>
                <p className="text-xs text-dark-400">
                  {(file.size / 1024).toFixed(0)} KB
                </p>
              </div>
              <button
                onClick={() => {
                  setFile(null);
                  if (fileRef.current) fileRef.current.value = "";
                }}
                className="text-dark-400 hover:text-dark-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {error && (
            <div className="mt-3 bg-red-50 border border-red-200 rounded-lg px-3 py-2 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
              <p className="text-xs text-red-700">{error}</p>
            </div>
          )}

          {file && (
            <button
              onClick={handleScore}
              className="w-full mt-4 py-3.5 rounded-xl bg-gradient-to-r from-cyan-500 to-teal-500 text-white font-bold text-sm"
            >
              Score My CV
            </button>
          )}

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
              setPhase("upload");
              setFile(null);
              setResult(null);
              if (fileRef.current) fileRef.current.value = "";
            }}
            className="w-full mt-5 py-3 rounded-xl border-2 border-cyan-500 text-cyan-600 font-bold text-sm hover:bg-cyan-50 transition-colors"
          >
            Score Another CV
          </button>
        </div>
      )}
    </div>
  );
}
