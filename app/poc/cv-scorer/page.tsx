"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  Upload,
  FileText,
  Search,
  ChevronDown,
  ChevronRight,
  X,
  Check,
  AlertCircle,
  RotateCcw,
  Edit3,
  ExternalLink,
  Target,
  Zap,
  Award,
  BookOpen,
  Shield,
  BarChart3,
  Globe,
  ArrowLeft,
} from "lucide-react";

/* ─── Types ────────────────────────────────────────────────── */

interface CvDimension {
  name: string;
  score: number;
  weight: number;
  gaps: string[];
  suggestions: string[];
}

interface OpportunityFit {
  match_percentage: number;
  matching_strengths: string[];
  missing_requirements: string[];
  recommendation: string;
}

interface DonorTips {
  [donor: string]: string;
}

interface ScoreData {
  overall_score: number;
  dimensions: CvDimension[];
  top_3_improvements: string[];
  donor_specific_tips: DonorTips;
  opportunity_fit?: OpportunityFit;
  cv_text: string;
}

interface SampleOpportunity {
  title: string;
  organization: string;
  description: string;
  deadline: string | null;
  country: string;
  source_url: string;
  source_domain: string;
  type: string;
}

type Phase = "upload" | "scoring" | "results";

/* ─── Constants ────────────────────────────────────────────── */

const DIMENSION_META = [
  { name: "Structure & Format", icon: BarChart3, weight: 15 },
  { name: "Professional Summary", icon: FileText, weight: 15 },
  { name: "Experience Relevance", icon: Award, weight: 25 },
  { name: "Skills & Keywords", icon: Zap, weight: 15 },
  { name: "Education & Certifications", icon: BookOpen, weight: 10 },
  { name: "Donor Readiness", icon: Shield, weight: 20 },
];

const SCORING_MESSAGES = [
  "Analyzing Structure & Format\u2026",
  "Evaluating Professional Summary\u2026",
  "Assessing Experience Relevance\u2026",
  "Scanning Skills & Keywords\u2026",
  "Reviewing Education & Certifications\u2026",
  "Measuring Donor Readiness\u2026",
];

/* ─── Helpers ──────────────────────────────────────────────── */

function scoreColor(score: number) {
  if (score < 50)
    return {
      text: "text-red-500",
      bg: "bg-red-500",
      hex: "#ef4444",
      light: "bg-red-50",
      border: "border-red-200",
    };
  if (score < 70)
    return {
      text: "text-amber-500",
      bg: "bg-amber-500",
      hex: "#f59e0b",
      light: "bg-amber-50",
      border: "border-amber-200",
    };
  return {
    text: "text-green-500",
    bg: "bg-green-500",
    hex: "#22c55e",
    light: "bg-green-50",
    border: "border-green-200",
  };
}

function scoreVerdict(score: number) {
  if (score < 30) return "Needs significant work";
  if (score < 50) return "Below average \u2014 key gaps to address";
  if (score < 65) return "Moderate \u2014 room for improvement";
  if (score < 80) return "Strong candidate profile";
  return "Excellent \u2014 donor-ready CV";
}

function fmtDeadline(d: string | null) {
  if (!d) return "";
  try {
    return new Date(d).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  } catch {
    return "";
  }
}

function fmtSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(0)} KB`;
}

/* ─── Score Ring ───────────────────────────────────────────── */

function ScoreRing({
  score,
  size = 160,
  stroke = 10,
  animated = true,
  className = "",
}: {
  score: number;
  size?: number;
  stroke?: number;
  animated?: boolean;
  className?: string;
}) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - score / 100);
  const colors = scoreColor(score);

  return (
    <div
      className={`relative inline-flex items-center justify-center ${className}`}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          className="text-dark-100"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={colors.hex}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={animated ? offset : circumference}
          className={animated ? "animate-scoreReveal" : ""}
          style={
            {
              "--circumference": circumference,
              "--target-offset": offset,
              filter: `drop-shadow(0 0 6px ${colors.hex}40)`,
            } as React.CSSProperties
          }
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className={`font-extrabold ${colors.text}`}
          style={{ fontSize: size * 0.22 }}
        >
          {score}
        </span>
        <span className="text-xs text-dark-400 font-medium">/100</span>
      </div>
    </div>
  );
}

/* ─── Main Page ────────────────────────────────────────────── */

export default function PocCvScorerPage() {
  /* Phase */
  const [phase, setPhase] = useState<Phase>("upload");

  /* Upload */
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  /* Opportunities */
  const [opportunities, setOpportunities] = useState<SampleOpportunity[]>([]);
  const [oppsLoading, setOppsLoading] = useState(true);
  const [selectedOpp, setSelectedOpp] = useState<SampleOpportunity | null>(
    null
  );
  const [oppSearch, setOppSearch] = useState("");
  const [oppOpen, setOppOpen] = useState(false);
  const oppRef = useRef<HTMLDivElement>(null);

  /* Scoring animation */
  const [scoringStep, setScoringStep] = useState(0);

  /* Results */
  const [result, setResult] = useState<ScoreData | null>(null);
  const [expandedDim, setExpandedDim] = useState<number | null>(null);
  const [donorTab, setDonorTab] = useState("GIZ");
  const [editMode, setEditMode] = useState(false);
  const [editText, setEditText] = useState("");
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [rescoring, setRescoring] = useState(false);

  /* ─── Effects ──────────────────────────────────────────── */

  useEffect(() => {
    fetch("/api/opportunities/sample")
      .then((r) => r.json())
      .then((d) => {
        setOpportunities(d.opportunities || []);
        setOppsLoading(false);
      })
      .catch(() => setOppsLoading(false));
  }, []);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (oppRef.current && !oppRef.current.contains(e.target as Node)) {
        setOppOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  useEffect(() => {
    if (phase !== "scoring") return;
    const iv = setInterval(
      () => setScoringStep((s) => (s + 1) % SCORING_MESSAGES.length),
      2200
    );
    return () => clearInterval(iv);
  }, [phase]);

  /* ─── Handlers ─────────────────────────────────────────── */

  const validateFile = useCallback((f: File): string | null => {
    const ext = f.name.split(".").pop()?.toLowerCase();
    if (ext !== "pdf" && ext !== "docx")
      return "Only PDF and DOCX files are accepted.";
    if (f.size > 10 * 1024 * 1024) return "File too large. Maximum 10 MB.";
    return null;
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const f = e.dataTransfer.files[0];
      if (!f) return;
      const err = validateFile(f);
      if (err) {
        setError(err);
        return;
      }
      setFile(f);
      setError(null);
    },
    [validateFile]
  );

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const err = validateFile(f);
    if (err) {
      setError(err);
      return;
    }
    setFile(f);
    setError(null);
  };

  const handleScore = async () => {
    if (!file) return;
    setPhase("scoring");
    setScoringStep(0);
    setError(null);

    try {
      const fd = new FormData();
      fd.append("file", file);
      if (selectedOpp) {
        fd.append(
          "opportunity",
          JSON.stringify({
            title: selectedOpp.title,
            organization: selectedOpp.organization,
            description: selectedOpp.description,
            deadline: selectedOpp.deadline,
            source_url: selectedOpp.source_url,
          })
        );
      }

      const res = await fetch("/api/cv/score", { method: "POST", body: fd });
      const json = await res.json();

      if (!json.success) throw new Error(json.error || "Scoring failed");

      setResult(json.data);
      setEditText(json.data.cv_text);
      setDonorTab(Object.keys(json.data.donor_specific_tips || {})[0] || "GIZ");
      setPhase("results");
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "Scoring failed. Please try again."
      );
      setPhase("upload");
    }
  };

  const handleRescore = async () => {
    if (!editText.trim() || rescoring) return;
    setRescoring(true);
    setError(null);

    try {
      const body: Record<string, unknown> = { cv_text: editText };
      if (selectedOpp) {
        body.opportunity = {
          title: selectedOpp.title,
          organization: selectedOpp.organization,
          description: selectedOpp.description,
          deadline: selectedOpp.deadline,
          source_url: selectedOpp.source_url,
        };
      }

      const res = await fetch("/api/cv/score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);

      setResult(json.data);
      setEditText(json.data.cv_text);
      setDismissed(new Set());
      setExpandedDim(null);
      setDonorTab(Object.keys(json.data.donor_specific_tips || {})[0] || "GIZ");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Re-scoring failed.");
    } finally {
      setRescoring(false);
    }
  };

  const handleReset = () => {
    setPhase("upload");
    setFile(null);
    setResult(null);
    setError(null);
    setSelectedOpp(null);
    setOppSearch("");
    setEditMode(false);
    setEditText("");
    setExpandedDim(null);
    setDismissed(new Set());
    if (fileRef.current) fileRef.current.value = "";
  };

  /* ─── Derived ──────────────────────────────────────────── */

  const filteredOpps = opportunities.filter((o) => {
    const q = oppSearch.toLowerCase();
    return (
      o.title.toLowerCase().includes(q) ||
      o.organization.toLowerCase().includes(q)
    );
  });

  const groupedOpps = filteredOpps.reduce<
    Record<string, SampleOpportunity[]>
  >((acc, o) => {
    const k = o.source_domain || "other";
    if (!acc[k]) acc[k] = [];
    acc[k].push(o);
    return acc;
  }, {});

  /* ─── Render ───────────────────────────────────────────── */

  return (
    <div className="min-h-screen bg-white font-sans">
      {/* Accent gradient strip */}
      <div className="h-1 bg-gradient-to-r from-cyan-500 via-teal-400 to-cyan-500" />

      {/* Header */}
      <header className="bg-dark-900 px-6 py-10 lg:py-14">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-cyan-500 to-teal-400 flex items-center justify-center shadow-lg shadow-cyan-500/20">
              <Target className="w-5 h-5 text-white" />
            </div>
            <span className="text-cyan-400 text-xs font-bold tracking-[0.2em] uppercase">
              PoC 2
            </span>
          </div>
          <h1 className="text-3xl lg:text-5xl font-extrabold text-white tracking-tight">
            CV Scorer
          </h1>
          <p className="mt-3 text-dark-300 text-base lg:text-lg max-w-2xl leading-relaxed">
            {phase === "upload" &&
              "AI-powered CV analysis calibrated for GIZ, World Bank, EU, and UNDP consulting assignments. Upload your CV and get actionable feedback in seconds."}
            {phase === "scoring" &&
              "Running your CV through six scoring dimensions\u2026"}
            {phase === "results" && "Your scoring results are ready below."}
          </p>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-5xl mx-auto px-6 py-10 lg:py-14">
        {/* ── UPLOAD ─────────────────────────────────────── */}
        {phase === "upload" && (
          <div className="space-y-10 animate-fadeInUp">
            {/* Error */}
            {error && (
              <div className="flex items-center gap-3 p-4 rounded-xl bg-red-50 border border-red-200 text-red-700">
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
                <span className="text-sm font-medium">{error}</span>
                <button onClick={() => setError(null)} className="ml-auto">
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            <div className="grid lg:grid-cols-2 gap-8">
              {/* Drop zone */}
              <div>
                <p className="text-xs font-bold text-dark-500 uppercase tracking-[0.15em] mb-3">
                  Upload CV
                </p>
                <div
                  className={`relative rounded-2xl border-2 border-dashed p-10 text-center transition-all duration-200 cursor-pointer group ${
                    isDragging
                      ? "border-cyan-500 bg-cyan-50/60 scale-[1.01]"
                      : file
                        ? "border-cyan-400 bg-cyan-50/30"
                        : "border-dark-200 hover:border-cyan-400 hover:bg-cyan-50/10"
                  }`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragEnter={(e) => {
                    e.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={onDrop}
                  onClick={() => fileRef.current?.click()}
                >
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".pdf,.docx"
                    className="hidden"
                    onChange={onFileChange}
                  />

                  {file ? (
                    <div className="space-y-3">
                      <div className="w-16 h-16 mx-auto rounded-2xl bg-cyan-100 flex items-center justify-center">
                        <FileText className="w-8 h-8 text-cyan-600" />
                      </div>
                      <p className="font-bold text-dark-900">{file.name}</p>
                      <p className="text-dark-400 text-sm">
                        {fmtSize(file.size)} &middot; Click to change
                      </p>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setFile(null);
                          if (fileRef.current) fileRef.current.value = "";
                        }}
                        className="inline-flex items-center gap-1 text-xs text-dark-400 hover:text-red-500 transition-colors"
                      >
                        <X className="w-3 h-3" /> Remove file
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="w-16 h-16 mx-auto rounded-2xl bg-dark-50 group-hover:bg-cyan-50 flex items-center justify-center transition-colors">
                        <Upload
                          className={`w-8 h-8 transition-colors ${isDragging ? "text-cyan-500" : "text-dark-300 group-hover:text-cyan-400"}`}
                        />
                      </div>
                      <div>
                        <p className="font-bold text-dark-700">
                          Drop your CV here
                        </p>
                        <p className="text-dark-400 text-sm mt-1">
                          PDF or DOCX &middot; up to 10 MB
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Opportunity selector */}
              <div>
                <p className="text-xs font-bold text-dark-500 uppercase tracking-[0.15em] mb-3">
                  Score Against Opportunity{" "}
                  <span className="text-dark-300 font-medium normal-case tracking-normal">
                    (optional)
                  </span>
                </p>

                <div ref={oppRef} className="relative">
                  <button
                    type="button"
                    onClick={() => setOppOpen(!oppOpen)}
                    className="w-full flex items-center gap-3 p-4 rounded-2xl border border-dark-100 hover:border-cyan-400 transition-colors text-left"
                  >
                    <Globe className="w-5 h-5 text-dark-300 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      {selectedOpp ? (
                        <>
                          <p className="text-sm font-bold text-dark-900 truncate">
                            {selectedOpp.title}
                          </p>
                          <p className="text-xs text-dark-400 truncate">
                            {selectedOpp.organization} &middot;{" "}
                            {selectedOpp.source_domain}
                          </p>
                        </>
                      ) : (
                        <p className="text-sm text-dark-400">
                          {oppsLoading
                            ? "Loading live opportunities\u2026"
                            : `${opportunities.length} opportunities available`}
                        </p>
                      )}
                    </div>
                    {selectedOpp && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedOpp(null);
                        }}
                        className="p-1 hover:bg-dark-50 rounded"
                      >
                        <X className="w-4 h-4 text-dark-400" />
                      </button>
                    )}
                    <ChevronDown
                      className={`w-4 h-4 text-dark-300 transition-transform ${oppOpen ? "rotate-180" : ""}`}
                    />
                  </button>

                  {/* Dropdown */}
                  {oppOpen && (
                    <div className="absolute z-50 top-full mt-2 w-full bg-white rounded-2xl border border-dark-100 shadow-2xl max-h-80 overflow-hidden">
                      <div className="p-3 border-b border-dark-50">
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-300" />
                          <input
                            type="text"
                            value={oppSearch}
                            onChange={(e) => setOppSearch(e.target.value)}
                            placeholder="Search title or organization\u2026"
                            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-dark-100 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                            autoFocus
                          />
                        </div>
                      </div>
                      <div className="overflow-y-auto max-h-56">
                        {Object.keys(groupedOpps).length === 0 ? (
                          <div className="p-6 text-center text-sm text-dark-400">
                            {oppSearch
                              ? "No matches found"
                              : "No opportunities loaded"}
                          </div>
                        ) : (
                          Object.entries(groupedOpps).map(([domain, opps]) => (
                            <div key={domain}>
                              <div className="px-4 py-1.5 bg-dark-50 text-[10px] font-bold text-dark-500 uppercase tracking-[0.15em] sticky top-0">
                                {domain}
                                <span className="ml-2 text-dark-300 font-medium">
                                  ({opps.length})
                                </span>
                              </div>
                              {opps.map((o, i) => (
                                <button
                                  key={`${domain}-${i}`}
                                  onClick={() => {
                                    setSelectedOpp(o);
                                    setOppOpen(false);
                                    setOppSearch("");
                                  }}
                                  className="w-full text-left px-4 py-3 hover:bg-cyan-50/50 transition-colors border-b border-dark-50 last:border-0"
                                >
                                  <p className="text-sm font-semibold text-dark-900 truncate">
                                    {o.title}
                                  </p>
                                  <p className="text-xs text-dark-400 mt-0.5 truncate">
                                    {o.organization}
                                    {o.deadline &&
                                      ` \u00B7 Due ${fmtDeadline(o.deadline)}`}
                                  </p>
                                </button>
                              ))}
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Selected preview */}
                {selectedOpp && (
                  <div className="mt-3 p-4 rounded-xl bg-cyan-50/50 border border-cyan-100">
                    <p className="text-xs text-dark-600 leading-relaxed line-clamp-3">
                      {selectedOpp.description || "No description available."}
                    </p>
                    {selectedOpp.source_url && (
                      <a
                        href={selectedOpp.source_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 mt-2 text-xs text-cyan-600 hover:text-cyan-700 font-semibold"
                      >
                        View original <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Dimension badges */}
            <div>
              <p className="text-xs font-bold text-dark-500 uppercase tracking-[0.15em] mb-3">
                Scoring Dimensions
              </p>
              <div className="flex flex-wrap gap-2">
                {DIMENSION_META.map((d) => {
                  const Icon = d.icon;
                  return (
                    <div
                      key={d.name}
                      className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-dark-50/80 border border-dark-100"
                    >
                      <Icon className="w-4 h-4 text-cyan-500" />
                      <span className="text-xs font-semibold text-dark-700">
                        {d.name}
                      </span>
                      <span className="text-[10px] font-bold text-dark-400 bg-white px-1.5 py-0.5 rounded-md border border-dark-100">
                        {d.weight}%
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* CTA */}
            <div className="flex justify-center pt-2">
              <button
                onClick={handleScore}
                disabled={!file}
                className={`inline-flex items-center gap-3 px-10 py-4 rounded-xl font-bold text-lg transition-all duration-200 ${
                  file
                    ? "bg-cyan-500 hover:bg-cyan-600 text-white shadow-lg shadow-cyan-500/25 hover:shadow-xl hover:shadow-cyan-500/30 hover:-translate-y-0.5"
                    : "bg-dark-100 text-dark-400 cursor-not-allowed"
                }`}
              >
                <Target className="w-5 h-5" />
                Score My CV
              </button>
            </div>
          </div>
        )}

        {/* ── SCORING ────────────────────────────────────── */}
        {phase === "scoring" && (
          <div className="flex flex-col items-center justify-center py-24 animate-fadeInUp">
            <div className="relative mb-10">
              <div className="w-44 h-44 rounded-full border-4 border-dark-100" />
              <div
                className="absolute inset-0 w-44 h-44 rounded-full border-4 border-transparent border-t-cyan-500 border-r-cyan-300 animate-spin"
                style={{ animationDuration: "1.2s" }}
              />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-20 h-20 rounded-full bg-gradient-to-br from-cyan-500 to-teal-400 flex items-center justify-center shadow-xl shadow-cyan-500/30 animate-pulse">
                  <Target className="w-10 h-10 text-white" />
                </div>
              </div>
            </div>

            <p
              key={scoringStep}
              className="text-xl font-bold text-dark-900 animate-fadeInUp"
            >
              {SCORING_MESSAGES[scoringStep]}
            </p>
            <p className="text-sm text-dark-400 mt-2">
              This usually takes 10&ndash;20 seconds
            </p>

            <div className="flex gap-2 mt-10">
              {DIMENSION_META.map((_, i) => (
                <div
                  key={i}
                  className={`h-2 rounded-full transition-all duration-500 ${
                    i === scoringStep
                      ? "bg-cyan-500 w-8"
                      : i < scoringStep
                        ? "bg-cyan-300 w-2"
                        : "bg-dark-200 w-2"
                  }`}
                />
              ))}
            </div>
          </div>
        )}

        {/* ── RESULTS ────────────────────────────────────── */}
        {phase === "results" && result && (
          <div className="space-y-10 animate-fadeInUp">
            {/* Error */}
            {error && (
              <div className="flex items-center gap-3 p-4 rounded-xl bg-red-50 border border-red-200 text-red-700">
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
                <span className="text-sm font-medium">{error}</span>
                <button onClick={() => setError(null)} className="ml-auto">
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Score hero */}
            <div className="text-center py-4">
              <ScoreRing
                score={result.overall_score}
                size={200}
                stroke={14}
              />
              <p
                className={`mt-5 text-xl font-bold ${scoreColor(result.overall_score).text}`}
              >
                {scoreVerdict(result.overall_score)}
              </p>
              {selectedOpp && (
                <p className="text-sm text-dark-400 mt-2">
                  Scored against{" "}
                  <span className="font-semibold text-dark-600">
                    {selectedOpp.title}
                  </span>{" "}
                  at {selectedOpp.organization}
                </p>
              )}
            </div>

            {/* Opportunity Fit */}
            {result.opportunity_fit && (
              <div className="border border-dark-100 rounded-2xl p-6 lg:p-8 bg-gradient-to-br from-white to-cyan-50/30">
                <div className="flex flex-col lg:flex-row items-start gap-6">
                  <div className="flex-shrink-0">
                    <ScoreRing
                      score={result.opportunity_fit.match_percentage}
                      size={110}
                      stroke={8}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-extrabold text-dark-900 mb-2">
                      Opportunity Match
                    </h3>
                    <p className="text-sm text-dark-500 leading-relaxed mb-5">
                      {result.opportunity_fit.recommendation}
                    </p>

                    {result.opportunity_fit.matching_strengths.length > 0 && (
                      <div className="mb-4">
                        <p className="text-[10px] font-bold text-dark-500 uppercase tracking-[0.15em] mb-2">
                          Matching Strengths
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {result.opportunity_fit.matching_strengths.map(
                            (s, i) => (
                              <span
                                key={i}
                                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-green-50 text-green-700 text-xs font-semibold border border-green-200"
                              >
                                <Check className="w-3 h-3" /> {s}
                              </span>
                            )
                          )}
                        </div>
                      </div>
                    )}

                    {result.opportunity_fit.missing_requirements.length > 0 && (
                      <div>
                        <p className="text-[10px] font-bold text-dark-500 uppercase tracking-[0.15em] mb-2">
                          Missing Requirements
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {result.opportunity_fit.missing_requirements.map(
                            (s, i) => (
                              <span
                                key={i}
                                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-50 text-red-700 text-xs font-semibold border border-red-200"
                              >
                                <X className="w-3 h-3" /> {s}
                              </span>
                            )
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Dimensions */}
            <div>
              <p className="text-xs font-bold text-dark-500 uppercase tracking-[0.15em] mb-4">
                Scoring Breakdown
              </p>
              <div className="space-y-3">
                {result.dimensions.map((dim, i) => {
                  const meta = DIMENSION_META[i];
                  const Icon = meta?.icon || BarChart3;
                  const colors = scoreColor(dim.score);
                  const isOpen = expandedDim === i;

                  return (
                    <div
                      key={dim.name}
                      className="border border-dark-100 rounded-2xl overflow-hidden transition-shadow hover:shadow-sm"
                    >
                      <button
                        onClick={() => setExpandedDim(isOpen ? null : i)}
                        className="w-full flex items-center gap-4 p-5 hover:bg-dark-50/30 transition-colors"
                      >
                        <div className="w-10 h-10 rounded-xl bg-dark-50 flex items-center justify-center flex-shrink-0">
                          <Icon className="w-5 h-5 text-cyan-500" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-bold text-dark-900">
                              {dim.name}
                            </span>
                            <div className="flex items-center gap-3">
                              <span className="text-xs text-dark-400 font-medium">
                                {dim.weight}% weight
                              </span>
                              <span
                                className={`text-base font-extrabold ${colors.text}`}
                              >
                                {dim.score}
                              </span>
                            </div>
                          </div>
                          <div className="w-full h-2 bg-dark-100 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${colors.bg}`}
                              style={{
                                width: `${dim.score}%`,
                                transition: "width 1.2s ease-out",
                              }}
                            />
                          </div>
                        </div>
                        <ChevronRight
                          className={`w-5 h-5 text-dark-300 transition-transform duration-200 flex-shrink-0 ${isOpen ? "rotate-90" : ""}`}
                        />
                      </button>

                      {isOpen && (
                        <div className="px-5 pb-5 border-t border-dark-50 animate-fadeInUp">
                          <div className="grid md:grid-cols-2 gap-5 mt-4">
                            {dim.gaps.length > 0 && (
                              <div>
                                <p className="text-[10px] font-bold text-red-500 uppercase tracking-[0.15em] mb-2.5">
                                  Gaps Identified
                                </p>
                                <ul className="space-y-2">
                                  {dim.gaps.map((g, j) => (
                                    <li
                                      key={j}
                                      className="flex items-start gap-2.5 text-sm text-dark-600 leading-relaxed"
                                    >
                                      <span className="w-1.5 h-1.5 rounded-full bg-red-400 mt-2 flex-shrink-0" />
                                      {g}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            {dim.suggestions.length > 0 && (
                              <div>
                                <p className="text-[10px] font-bold text-cyan-600 uppercase tracking-[0.15em] mb-2.5">
                                  Suggestions
                                </p>
                                <ul className="space-y-2">
                                  {dim.suggestions.map((s, j) => (
                                    <li
                                      key={j}
                                      className="flex items-start gap-2.5 text-sm text-dark-600 leading-relaxed"
                                    >
                                      <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 mt-2 flex-shrink-0" />
                                      {s}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Bottom grid */}
            <div className="grid lg:grid-cols-2 gap-6">
              {/* Top 3 improvements */}
              <div className="border border-dark-100 rounded-2xl p-6">
                <p className="text-xs font-bold text-dark-500 uppercase tracking-[0.15em] mb-5">
                  Top 3 Improvements
                </p>
                <ol className="space-y-4">
                  {result.top_3_improvements.map((imp, i) => (
                    <li key={i} className="flex items-start gap-4">
                      <span className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-cyan-500 to-teal-400 flex items-center justify-center text-sm font-bold text-white shadow-md shadow-cyan-500/20">
                        {i + 1}
                      </span>
                      <p className="text-sm text-dark-700 leading-relaxed pt-1.5">
                        {imp}
                      </p>
                    </li>
                  ))}
                </ol>
              </div>

              {/* Donor tips */}
              <div className="border border-dark-100 rounded-2xl p-6">
                <p className="text-xs font-bold text-dark-500 uppercase tracking-[0.15em] mb-5">
                  Donor-Specific Tips
                </p>
                <div className="flex gap-1.5 mb-5">
                  {Object.keys(result.donor_specific_tips || {}).map((donor) => (
                    <button
                      key={donor}
                      onClick={() => setDonorTab(donor)}
                      className={`px-4 py-2 rounded-xl text-xs font-bold transition-all duration-200 ${
                        donorTab === donor
                          ? "bg-cyan-500 text-white shadow-md shadow-cyan-500/20"
                          : "bg-dark-50 text-dark-500 hover:bg-dark-100"
                      }`}
                    >
                      {donor}
                    </button>
                  ))}
                </div>
                <p className="text-sm text-dark-600 leading-relaxed">
                  {(result.donor_specific_tips || {})[donorTab] ||
                    "No tips available for this donor."}
                </p>
              </div>
            </div>

            {/* Edit & Re-score */}
            <div className="border border-dark-100 rounded-2xl overflow-hidden">
              <button
                onClick={() => setEditMode(!editMode)}
                className="w-full flex items-center justify-between p-5 hover:bg-dark-50/30 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-dark-50 flex items-center justify-center">
                    <Edit3 className="w-5 h-5 text-cyan-500" />
                  </div>
                  <div className="text-left">
                    <span className="text-sm font-bold text-dark-900 block">
                      Edit CV Text & Re-score
                    </span>
                    <span className="text-xs text-dark-400">
                      Modify your CV text and run the scorer again
                    </span>
                  </div>
                </div>
                <ChevronDown
                  className={`w-5 h-5 text-dark-300 transition-transform duration-200 ${editMode ? "rotate-180" : ""}`}
                />
              </button>

              {editMode && (
                <div className="border-t border-dark-100 p-5">
                  <div className="grid lg:grid-cols-2 gap-5">
                    <div>
                      <p className="text-[10px] font-bold text-dark-500 uppercase tracking-[0.15em] mb-2">
                        CV Text
                      </p>
                      <textarea
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        className="w-full h-80 p-4 rounded-xl border border-dark-100 text-sm text-dark-700 leading-relaxed resize-none focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 font-mono"
                      />
                    </div>

                    <div>
                      <p className="text-[10px] font-bold text-dark-500 uppercase tracking-[0.15em] mb-2">
                        AI Suggestions
                      </p>
                      <div className="h-80 overflow-y-auto rounded-xl border border-dark-100 p-4 space-y-5">
                        {result.dimensions.map((dim) => {
                          const active = dim.suggestions.filter(
                            (s) => !dismissed.has(`${dim.name}::${s}`)
                          );
                          if (active.length === 0) return null;
                          return (
                            <div key={dim.name}>
                              <p className="text-[10px] font-bold text-cyan-600 uppercase tracking-[0.15em] mb-2">
                                {dim.name}
                              </p>
                              <ul className="space-y-2">
                                {active.map((s, j) => (
                                  <li
                                    key={j}
                                    className="flex items-start gap-2 text-xs text-dark-600 bg-cyan-50/60 rounded-lg p-3 border border-cyan-100"
                                  >
                                    <span className="flex-1 leading-relaxed">
                                      {s}
                                    </span>
                                    <button
                                      onClick={() =>
                                        setDismissed(
                                          (prev) =>
                                            new Set(prev).add(
                                              `${dim.name}::${s}`
                                            )
                                        )
                                      }
                                      className="text-dark-300 hover:text-red-500 transition-colors flex-shrink-0 mt-0.5"
                                    >
                                      <X className="w-3.5 h-3.5" />
                                    </button>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-end mt-5">
                    <button
                      onClick={handleRescore}
                      disabled={rescoring}
                      className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-cyan-500 text-white font-bold text-sm hover:bg-cyan-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-cyan-500/20 hover:shadow-xl hover:shadow-cyan-500/30"
                    >
                      <RotateCcw
                        className={`w-4 h-4 ${rescoring ? "animate-spin" : ""}`}
                      />
                      {rescoring ? "Re-scoring\u2026" : "Re-score CV"}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Reset */}
            <div className="flex justify-center pt-4 pb-8">
              <button
                onClick={handleReset}
                className="inline-flex items-center gap-2 px-8 py-3.5 rounded-xl border-2 border-dark-200 text-dark-600 font-bold hover:bg-dark-50 hover:border-dark-300 transition-all"
              >
                <ArrowLeft className="w-4 h-4" />
                Score Another CV
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
