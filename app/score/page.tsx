"use client";

import { useState, useEffect, useRef, useCallback, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
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
  ArrowRight,
  Loader2,
  Sparkles,
  TrendingUp,
  Lock,
  User,
  CheckCircle,
  Link2,
  ClipboardList,
} from "lucide-react";

import type {
  CvScoreResult,
  SampleOpportunity,
  ScoreResponse,
  ScoreErrorResponse,
} from "@/lib/types/cv-score";

import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { ScoreRing, scoreColor } from "@/components/ScoreRing";
import { useAuth } from "@/components/AuthProvider";
import { createSupabaseBrowser } from "@/lib/supabase-browser";
import {
  getProfile,
  createProfile,
  saveCvScore,
  calculateProfileScore,
} from "@/lib/profiles";
import type { Profile } from "@/lib/database.types";
import type { ExtractedProfile } from "@/lib/extract-profile";

/* ─── Types ────────────────────────────────────────────────── */

type Phase = "upload" | "scoring" | "results";

interface ScoreData extends CvScoreResult {
  cv_text: string;
}

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
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/* ─── sessionStorage score cache ──────────────────────────── */

const SCORE_CACHE_PREFIX = "dv_cv_score_";
const SCORE_CACHE_TTL = 30 * 60 * 1000;

async function hashText(text: string): Promise<string> {
  const encoded = new TextEncoder().encode(text);
  const hashBuf = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(hashBuf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
}

interface CachedScore {
  data: ScoreData;
  cachedAt: number;
}

function getCachedScore(hash: string): CachedScore | null {
  try {
    const raw = sessionStorage.getItem(SCORE_CACHE_PREFIX + hash);
    if (!raw) return null;
    const entry = JSON.parse(raw) as CachedScore;
    if (Date.now() - entry.cachedAt > SCORE_CACHE_TTL) {
      sessionStorage.removeItem(SCORE_CACHE_PREFIX + hash);
      return null;
    }
    return entry;
  } catch {
    return null;
  }
}

function setCachedScore(hash: string, data: ScoreData) {
  try {
    sessionStorage.setItem(
      SCORE_CACHE_PREFIX + hash,
      JSON.stringify({ data, cachedAt: Date.now() })
    );
  } catch {
    // Storage full
  }
}

/* ═══════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════════ */

export default function CvScorerPageWrapper() {
  return (
    <Suspense>
      <CvScorerPage />
    </Suspense>
  );
}

function CvScorerPage() {
  /* ─── Phase ─────────────────────────────────────────────── */
  const [phase, setPhase] = useState<Phase>("upload");

  /* ─── Upload state ──────────────────────────────────────── */
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  /* ─── Opportunities ─────────────────────────────────────── */
  const [opportunities, setOpportunities] = useState<SampleOpportunity[]>([]);
  const [oppsLoading, setOppsLoading] = useState(true);
  const [selectedOpp, setSelectedOpp] = useState<SampleOpportunity | null>(
    null
  );
  const [oppSearch, setOppSearch] = useState("");
  const [oppOpen, setOppOpen] = useState(false);
  const oppRef = useRef<HTMLDivElement>(null);

  /* ─── Score limit tracking ─────────────────────────────── */
  const [scoresRemaining, setScoresRemaining] = useState<number | null>(null);

  /* ─── Custom opportunity (URL / ToR paste) ─────────────── */
  const [oppMode, setOppMode] = useState<"browse" | "custom">("browse");
  const [customUrl, setCustomUrl] = useState("");
  const [customTor, setCustomTor] = useState("");

  /* ─── Scoring animation ─────────────────────────────────── */
  const [scoringStep, setScoringStep] = useState(0);

  /* ─── Results ───────────────────────────────────────────── */
  const [result, setResult] = useState<ScoreData | null>(null);
  const [expandedDim, setExpandedDim] = useState<number | null>(null);
  const [donorTab, setDonorTab] = useState("GIZ");
  const [editMode, setEditMode] = useState(false);
  const [editText, setEditText] = useState("");
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [rescoring, setRescoring] = useState(false);

  /* ─── Profile / Auth state ────────────────────────────────── */
  const { user, loading: authLoading, signInWithEmail } = useAuth();
  const [existingProfile, setExistingProfile] = useState<Profile | null>(null);
  const [profileChecked, setProfileChecked] = useState(false);
  const [autoSaving, setAutoSaving] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  /* ─── URL params (deep link from opportunity detail) ─────── */
  const searchParams = useSearchParams();

  /* ─── Auth modal state ────────────────────────────────────── */
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signup");
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  /* ─── Effects ───────────────────────────────────────────── */

  // Restore state from sessionStorage after Google OAuth redirect
  useEffect(() => {
    if (authLoading) return;
    if (!user) return;
    try {
      const saved = sessionStorage.getItem("devidends_score_state");
      if (!saved) return;
      const parsed = JSON.parse(saved);
      if (parsed.result) {
        setResult(parsed.result);
        setPhase("results");
        sessionStorage.removeItem("devidends_score_state");
      }
    } catch {
      sessionStorage.removeItem("devidends_score_state");
    }
  }, [user, authLoading]);

  useEffect(() => {
    fetch("/api/opportunities/sample?hideExpired=true&minQuality=40")
      .then((r) => r.json())
      .then((d) => {
        // Only show jobs and consulting — exclude tenders/ToRs
        const opps = (d.opportunities || []).filter(
          (o: SampleOpportunity) => {
            const t = (o.classified_type || "").toLowerCase();
            return t !== "tender";
          }
        );
        setOpportunities(opps);
        setOppsLoading(false);
      })
      .catch(() => setOppsLoading(false));
  }, []);

  // Auto-select opportunity from URL param (deep link from opportunity detail page)
  useEffect(() => {
    const oppId = searchParams.get("oppId");
    if (!oppId || opportunities.length === 0 || selectedOpp) return;
    const match = opportunities.find((o) => String(o.id) === oppId);
    if (match) setSelectedOpp(match);
  }, [searchParams, opportunities, selectedOpp]);

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

  // Don't auto-show auth modal — let users see their results without interruption.
  // They can sign in manually if they want to save or access full features.

  // Check for existing profile when user changes
  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setExistingProfile(null);
      setProfileChecked(true);
      setProfileSaved(false);
      return;
    }
    const supabase = createSupabaseBrowser();
    getProfile(supabase, user.id)
      .then((p) => {
        setExistingProfile(p);
        setProfileChecked(true);
      })
      .catch(() => setProfileChecked(true));
  }, [user, authLoading]);

  // Auto-save profile when user signs in AND results are available
  useEffect(() => {
    if (!user || !result || !profileChecked || autoSaving || profileSaved) return;

    const doAutoSave = async () => {
      setAutoSaving(true);
      setProfileError(null);
      try {
        const supabase = createSupabaseBrowser();

        if (existingProfile) {
          // Profile exists — just save the new score
          await saveCvScore(supabase, user.id, existingProfile.id, result, result.cv_text, file?.name);
          setProfileSaved(true);
          return;
        }

        // Extract profile from CV text
        const extractRes = await fetch("/api/profile/extract", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cv_text: result.cv_text }),
        });

        let extracted: ExtractedProfile | null = null;
        if (extractRes.ok) {
          const json = await extractRes.json();
          if (json.success) extracted = json.data;
        }

        // Create profile
        const profileData: Partial<Profile> = {
          name: extracted?.name || user.user_metadata?.full_name || user.email?.split("@")[0] || "User",
          headline: extracted?.headline || null,
          email: user.email || null,
          cv_text: result.cv_text,
          cv_score: result.overall_score,
          sectors: extracted?.sectors || [],
          donors: extracted?.donors || [],
          countries: extracted?.countries || [],
          skills: extracted?.skills || [],
          qualifications: extracted?.qualifications || null,
          years_of_experience: extracted?.years_of_experience || null,
          profile_type: extracted?.profile_type || null,
          source: "cv_scorer",
        };

        const newProfile = await createProfile(supabase, user.id, profileData);
        await saveCvScore(supabase, user.id, newProfile.id, result, result.cv_text, file?.name);

        setExistingProfile(newProfile);
        setProfileSaved(true);
      } catch (err) {
        console.error("Auto-save profile failed:", err);
        setProfileError(
          err instanceof Error ? err.message : "Failed to save profile"
        );
      } finally {
        setAutoSaving(false);
      }
    };

    doAutoSave();
  }, [user, result, profileChecked, existingProfile, autoSaving, profileSaved]);

  /* ─── Inline auth handler ─────────────────────────────────── */

  const handleInlineAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthSubmitting(true);
    setAuthError(null);

    const fn = authMode === "signin" ? signInWithEmail : async (email: string, password: string) => {
      const supabase = createSupabaseBrowser();
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      });
      return { error: error?.message ?? null };
    };

    const { error } = await fn(authEmail, authPassword);
    if (error) setAuthError(error);
    setAuthSubmitting(false);
  };

  /* ─── Handlers ──────────────────────────────────────────── */

  const validateFile = useCallback((f: File): string | null => {
    const ext = f.name.split(".").pop()?.toLowerCase();
    if (!["pdf", "docx", "doc", "txt", "rtf"].includes(ext || ""))
      return "Unsupported file type. Upload a PDF, DOCX, DOC, or TXT file.";
    if (f.size > 15 * 1024 * 1024) return "File too large. Maximum 15 MB.";
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
    if (!file || isProcessing) return;
    setIsProcessing(true);
    setPhase("scoring");
    setScoringStep(0);
    setError(null);

    try {
      const fd = new FormData();
      fd.append("file", file);
      if (oppMode === "browse" && selectedOpp) {
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
      } else if (oppMode === "custom" && (customUrl.trim() || customTor.trim())) {
        fd.append(
          "opportunity",
          JSON.stringify({
            title: customUrl.trim() ? "Custom opportunity" : "Pasted ToR",
            organization: "",
            description: customTor.trim() || "",
            source_url: customUrl.trim() || "",
          })
        );
      }

      const res = await fetch("/api/cv/score", { method: "POST", body: fd });
      const json = await res.json();

      // Track remaining scores
      if (typeof json.scores_remaining === "number") {
        setScoresRemaining(json.scores_remaining);
      }

      if (!json.success) throw new Error(json.error || "Scoring failed");

      const scoreData = json.data as ScoreData;
      setResult(scoreData);
      setEditText(scoreData.cv_text);
      setDonorTab(Object.keys(scoreData.donor_specific_tips)[0] || "GIZ");
      setPhase("results");

      // Cache result
      const cacheHash = await hashText(scoreData.cv_text);
      setCachedScore(cacheHash, scoreData);
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "Scoring failed. Please try again."
      );
      setPhase("upload");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRescore = async () => {
    if (!editText.trim() || rescoring) return;
    setRescoring(true);
    setError(null);

    try {
      // Check cache first
      const cacheHash = await hashText(editText);
      const cached = getCachedScore(cacheHash);
      if (cached) {
        setResult(cached.data);
        setEditText(cached.data.cv_text);
        setDismissed(new Set());
        setExpandedDim(null);
        setDonorTab(
          Object.keys(cached.data.donor_specific_tips)[0] || "GIZ"
        );
        setRescoring(false);
        return;
      }

      const body: Record<string, unknown> = { cv_text: editText };
      if (oppMode === "browse" && selectedOpp) {
        body.opportunity = {
          title: selectedOpp.title,
          organization: selectedOpp.organization,
          description: selectedOpp.description,
          deadline: selectedOpp.deadline,
          source_url: selectedOpp.source_url,
        };
      } else if (oppMode === "custom" && (customUrl.trim() || customTor.trim())) {
        body.opportunity = {
          title: customUrl.trim() ? "Custom opportunity" : "Pasted ToR",
          organization: "",
          description: customTor.trim() || "",
          source_url: customUrl.trim() || "",
        };
      }

      const res = await fetch("/api/cv/score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as ScoreResponse | ScoreErrorResponse;
      if (!json.success) throw new Error(json.error);

      const scoreData = json.data as ScoreData;
      setResult(scoreData);
      setEditText(scoreData.cv_text);
      setDismissed(new Set());
      setExpandedDim(null);
      setDonorTab(Object.keys(scoreData.donor_specific_tips)[0] || "GIZ");

      // Cache
      setCachedScore(cacheHash, scoreData);
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
    setIsProcessing(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  /* ─── Derived ───────────────────────────────────────────── */

  const hasOpportunity = oppMode === "browse"
    ? !!selectedOpp
    : !!(customUrl.trim() || customTor.trim());

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

  /* ─── Render ────────────────────────────────────────────── */

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <SiteHeader activeHref="/score" />

      {/* Gradient accent strip */}
      <div className="h-1 bg-gradient-to-r from-cyan-500 via-teal-400 to-cyan-500" />

      {/* Hero area with dot-grid background */}
      <section className="relative bg-dark-900 overflow-hidden">
        {/* Dot grid pattern */}
        <div
          className="absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage:
              "radial-gradient(circle, #27ABD2 1px, transparent 1px)",
            backgroundSize: "24px 24px",
          }}
        />
        {/* Gradient glow accents */}
        <div className="absolute -top-40 -right-40 w-[500px] h-[500px] rounded-full bg-cyan-500/10 blur-3xl animate-blobMove" />
        <div className="absolute -bottom-32 -left-32 w-[400px] h-[400px] rounded-full bg-teal-500/[0.08] blur-3xl animate-blobMove" style={{ animationDelay: "-4s" }} />

        {/* Floating geometric accents */}
        <div className="hidden lg:block absolute top-16 right-[12%] w-12 h-12 border-2 border-cyan-400/20 rounded-xl rotate-12 animate-float" />
        <div className="hidden lg:block absolute top-32 right-[20%] w-6 h-6 rounded-full bg-teal-400/15 animate-float" style={{ animationDelay: "-2s" }} />
        <div className="hidden lg:block absolute bottom-12 right-[8%] w-8 h-8 border-2 border-teal-300/20 rounded-full animate-float" style={{ animationDelay: "-1s" }} />

        <div className="relative max-w-5xl mx-auto px-6 py-12 lg:py-16">
          <div className="flex items-center gap-3 mb-4 animate-staggerFadeUp">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-teal-400 flex items-center justify-center shadow-lg shadow-cyan-500/25">
              <Target className="w-5 h-5 text-white" />
            </div>
            <span className="text-cyan-400 text-xs font-bold tracking-[0.2em] uppercase">
              CV Scorer
            </span>
          </div>
          <h1 className="text-3xl lg:text-5xl font-extrabold text-white tracking-tight animate-staggerFadeUp" style={{ animationDelay: "0.1s" }}>
            Score Your CV
          </h1>
          <p className="mt-3 text-dark-300 text-base lg:text-lg max-w-2xl leading-relaxed animate-staggerFadeUp" style={{ animationDelay: "0.2s" }}>
            {phase === "upload" &&
              "AI-powered CV analysis calibrated for GIZ, World Bank, EU, and UNDP consulting assignments. Upload your CV and get actionable feedback in seconds."}
            {phase === "scoring" &&
              "Running your CV through six scoring dimensions\u2026"}
            {phase === "results" && "Your scoring results are ready below."}
          </p>
        </div>
      </section>

      {/* Content */}
      <main className="flex-1 max-w-5xl mx-auto w-full px-6 py-10 lg:py-14">
        {/* ══ PHASE 1: UPLOAD ═══════════════════════════════════ */}
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
                  className={`relative rounded-2xl border-2 border-dashed p-10 text-center transition-all duration-300 cursor-pointer group ${
                    isDragging
                      ? "border-cyan-500 bg-cyan-50/60 scale-[1.02] shadow-lg shadow-cyan-500/10"
                      : file
                        ? "border-cyan-400 bg-cyan-50/30 shadow-md shadow-cyan-500/5"
                        : "border-dark-200 hover:border-cyan-400 hover:bg-cyan-50/10 hover:shadow-lg hover:shadow-cyan-500/5"
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
                    accept=".pdf,.docx,.doc,.txt,.rtf"
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
                          PDF, DOCX, DOC, or TXT &middot; up to 15 MB
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

                {/* Tab selector */}
                <div className="grid grid-cols-2 gap-2 mb-4">
                  <button
                    type="button"
                    onClick={() => setOppMode("browse")}
                    className={`flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold transition-all border-2 ${
                      oppMode === "browse"
                        ? "border-cyan-500 bg-cyan-50/60 text-cyan-700 shadow-sm shadow-cyan-500/10"
                        : "border-dark-100 text-dark-400 hover:border-dark-200 hover:text-dark-600"
                    }`}
                  >
                    <Globe className="w-4 h-4" />
                    Browse Live
                  </button>
                  <button
                    type="button"
                    onClick={() => setOppMode("custom")}
                    className={`flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold transition-all border-2 ${
                      oppMode === "custom"
                        ? "border-cyan-500 bg-cyan-50/60 text-cyan-700 shadow-sm shadow-cyan-500/10"
                        : "border-dark-100 text-dark-400 hover:border-dark-200 hover:text-dark-600"
                    }`}
                  >
                    <ClipboardList className="w-4 h-4" />
                    Paste URL / ToR
                  </button>
                </div>

                {oppMode === "browse" ? (
                  <>
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
                  </>
                ) : (
                  /* ─── Custom URL / ToR mode ─── */
                  <div className="space-y-3">
                    {/* URL input */}
                    <div>
                      <label className="flex items-center gap-2 text-xs font-semibold text-dark-600 mb-1.5">
                        <Link2 className="w-3.5 h-3.5" />
                        Opportunity URL
                      </label>
                      <input
                        type="url"
                        value={customUrl}
                        onChange={(e) => setCustomUrl(e.target.value)}
                        placeholder="https://careers.un.org/job/..."
                        className="w-full px-4 py-3 rounded-xl border border-dark-100 text-sm focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500 placeholder:text-dark-300"
                      />
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="flex-1 h-px bg-dark-100" />
                      <span className="text-[10px] font-bold text-dark-300 uppercase tracking-wider">and / or</span>
                      <div className="flex-1 h-px bg-dark-100" />
                    </div>

                    {/* ToR textarea */}
                    <div>
                      <label className="flex items-center gap-2 text-xs font-semibold text-dark-600 mb-1.5">
                        <ClipboardList className="w-3.5 h-3.5" />
                        Paste Terms of Reference / Job Description
                      </label>
                      <textarea
                        value={customTor}
                        onChange={(e) => setCustomTor(e.target.value)}
                        placeholder="Paste the full ToR, job description, or key requirements here..."
                        rows={5}
                        className="w-full px-4 py-3 rounded-xl border border-dark-100 text-sm focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500 placeholder:text-dark-300 resize-none leading-relaxed"
                      />
                      {customTor.length > 0 && (
                        <p className="text-[10px] text-dark-300 mt-1 text-right">
                          {customTor.length.toLocaleString()} characters
                        </p>
                      )}
                    </div>

                    {(customUrl.trim() || customTor.trim()) && (
                      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-cyan-50/50 border border-cyan-100">
                        <CheckCircle className="w-3.5 h-3.5 text-cyan-500 shrink-0" />
                        <p className="text-xs text-cyan-700">
                          Your CV will be scored against this{" "}
                          {customUrl.trim() && customTor.trim()
                            ? "URL + ToR"
                            : customUrl.trim()
                            ? "opportunity URL"
                            : "ToR"}
                        </p>
                      </div>
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
                {DIMENSION_META.map((d, i) => {
                  const Icon = d.icon;
                  return (
                    <div
                      key={d.name}
                      className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-dark-50/80 border border-dark-100 animate-staggerFadeUp hover:border-cyan-200 hover:bg-cyan-50/30 transition-colors"
                      style={{ animationDelay: `${0.3 + i * 0.08}s` }}
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

            {/* Daily limit info */}
            {scoresRemaining !== null && (
              <div className={`flex items-center gap-2.5 p-3.5 rounded-xl border ${
                scoresRemaining === 0
                  ? "bg-red-50 border-red-200"
                  : scoresRemaining <= 2
                    ? "bg-amber-50 border-amber-200"
                    : "bg-dark-50 border-dark-100"
              }`}>
                <Lock className={`w-4 h-4 shrink-0 ${
                  scoresRemaining === 0 ? "text-red-500" : scoresRemaining <= 2 ? "text-amber-500" : "text-dark-400"
                }`} />
                <p className={`text-xs font-medium ${
                  scoresRemaining === 0 ? "text-red-700" : scoresRemaining <= 2 ? "text-amber-700" : "text-dark-500"
                }`}>
                  {scoresRemaining === 0
                    ? "Daily limit reached (5/5 used). Try again tomorrow."
                    : `${scoresRemaining} of 5 daily scores remaining`}
                </p>
              </div>
            )}

            {/* CTA */}
            <div className="flex justify-center pt-2">
              <button
                onClick={handleScore}
                disabled={!file || isProcessing || scoresRemaining === 0 || !user || !hasOpportunity}
                className={`inline-flex items-center gap-3 px-8 sm:px-10 py-4 rounded-xl font-bold text-base sm:text-lg transition-all duration-300 ${
                  file && !isProcessing && scoresRemaining !== 0 && user && hasOpportunity
                    ? "bg-gradient-to-r from-cyan-500 to-teal-500 hover:from-cyan-600 hover:to-teal-600 text-white shadow-lg shadow-cyan-500/25 hover:shadow-xl hover:shadow-cyan-500/30 hover:-translate-y-1 animate-pulseGlow"
                    : "bg-dark-100 text-dark-400 cursor-not-allowed"
                }`}
              >
                {isProcessing ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : !user ? (
                  <Lock className="w-5 h-5" />
                ) : (
                  <Target className="w-5 h-5" />
                )}
                {isProcessing ? "Scoring\u2026" : !user ? "Sign in to Score" : !hasOpportunity ? "Select an Opportunity First" : "Score My CV"}
              </button>
              {!user && (
                <p className="text-xs text-dark-400 mt-3 text-center">
                  <Link href="/login" className="text-cyan-600 font-semibold hover:text-cyan-700">Sign in</Link>
                  {" "}or{" "}
                  <Link href="/login" className="text-cyan-600 font-semibold hover:text-cyan-700">create an account</Link>
                  {" "}to score your CV
                </p>
              )}
            </div>
          </div>
        )}

        {/* ══ PHASE 2: SCORING ANIMATION ═══════════════════════ */}
        {phase === "scoring" && (
          <div className="flex flex-col items-center justify-center py-20 animate-fadeInUp">
            {/* Multi-ring concentric spinner */}
            <div className="relative mb-10 sm:mb-12 w-40 h-40 sm:w-52 sm:h-52">
              {/* Outer ring — slowest */}
              <div
                className="absolute inset-0 rounded-full border-[3px] border-dark-100 border-t-cyan-400/60 border-r-teal-400/40 animate-spin"
                style={{ animationDuration: "3s" }}
              />
              {/* Middle ring */}
              <div
                className="absolute inset-4 rounded-full border-[3px] border-dark-100/60 border-t-teal-400 border-l-cyan-500/60 animate-spin"
                style={{ animationDuration: "2s", animationDirection: "reverse" }}
              />
              {/* Inner ring — fastest */}
              <div
                className="absolute inset-8 rounded-full border-[3px] border-dark-100/40 border-b-cyan-500 border-r-teal-500/50 animate-spin"
                style={{ animationDuration: "1.4s" }}
              />
              {/* Center content */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-24 h-24 rounded-full bg-gradient-to-br from-cyan-500 to-teal-400 flex items-center justify-center shadow-xl shadow-cyan-500/30">
                  <span className="text-2xl font-extrabold text-white tabular-nums">
                    {Math.round(((scoringStep + 1) / SCORING_MESSAGES.length) * 100)}%
                  </span>
                </div>
              </div>
            </div>

            {/* Rotating messages */}
            <p
              key={scoringStep}
              className="text-xl font-bold text-dark-900 animate-fadeInUp"
            >
              {SCORING_MESSAGES[scoringStep]}
            </p>
            <p className="text-sm text-dark-400 mt-2">
              This usually takes 10&ndash;20 seconds
            </p>

            {/* Step progress cards */}
            <div className="flex flex-wrap justify-center gap-2 sm:gap-3 mt-10 px-4">
              {DIMENSION_META.map((d, i) => {
                const Icon = d.icon;
                return (
                  <div
                    key={i}
                    className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-500 ${
                      i === scoringStep
                        ? "bg-gradient-to-r from-cyan-500 to-teal-500 text-white shadow-md shadow-cyan-500/20 scale-105"
                        : i < scoringStep
                          ? "bg-cyan-50 text-cyan-600 border border-cyan-200"
                          : "bg-dark-50 text-dark-300 border border-dark-100"
                    }`}
                  >
                    {i < scoringStep ? (
                      <Check className="w-3 h-3" />
                    ) : (
                      <Icon className="w-3 h-3" />
                    )}
                    <span className="hidden sm:inline">{d.name.split(" ")[0]}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ══ PHASE 3: RESULTS ═════════════════════════════════ */}
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

            {/* ══════════════════════════════════════════════════
               TIER 1: SUMMARY (everyone, no login required)
               ══════════════════════════════════════════════════ */}

            {/* ── Score Hero ───────────────────────────────── */}
            <div className="text-center py-6 animate-scaleReveal">
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
              {oppMode === "browse" && selectedOpp && (
                <p className="text-sm text-dark-400 mt-2">
                  Scored against{" "}
                  <span className="font-semibold text-dark-600">
                    {selectedOpp.title}
                  </span>{" "}
                  at {selectedOpp.organization}
                </p>
              )}
              {oppMode === "custom" && (customUrl.trim() || customTor.trim()) && (
                <p className="text-sm text-dark-400 mt-2">
                  Scored against{" "}
                  <span className="font-semibold text-dark-600">
                    {customUrl.trim() ? "custom opportunity" : "pasted ToR"}
                  </span>
                </p>
              )}
            </div>

            {/* ── Dimension Bars (collapsed, no expand for non-auth) ── */}
            <div>
              <p className="text-xs font-bold text-dark-500 uppercase tracking-[0.15em] mb-4">
                Scoring Breakdown
              </p>
              <div className="space-y-3">
                {result.dimensions.map((dim, i) => {
                  const meta = DIMENSION_META[i];
                  const Icon = meta?.icon || BarChart3;
                  const colors = scoreColor(dim.score);

                  return (
                    <div
                      key={dim.name}
                      className="border border-dark-100 rounded-2xl overflow-hidden animate-staggerFadeUp"
                      style={{ animationDelay: `${0.2 + i * 0.08}s` }}
                    >
                      <div className="flex items-center gap-4 p-5">
                        <div className="w-10 h-10 rounded-xl bg-dark-50 flex items-center justify-center flex-shrink-0">
                          <Icon className="w-5 h-5 text-cyan-500" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-bold text-dark-900">
                              {dim.name}
                            </span>
                            <div className="flex items-center gap-3">
                              <span className="text-xs text-dark-400 font-medium hidden sm:inline">
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
                        {!user && (
                          <Lock className="w-4 h-4 text-dark-300 flex-shrink-0" />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ── Top 3 Improvements (brief, everyone) ───── */}
            <div className="border border-dark-100 rounded-2xl p-6">
              <p className="text-xs font-bold text-dark-500 uppercase tracking-[0.15em] mb-5">
                <TrendingUp className="w-4 h-4 inline-block mr-1.5 -mt-0.5 text-cyan-500" />
                Top 3 Improvements
              </p>
              <ol className="space-y-4">
                {result.top_3_improvements.map((imp, i) => (
                  <li key={i} className="flex items-start gap-4">
                    <span className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-cyan-500 to-teal-400 flex items-center justify-center text-sm font-bold text-white shadow-md shadow-cyan-500/20">
                      {i + 1}
                    </span>
                    <p className="text-sm text-dark-700 leading-relaxed pt-1.5">
                      {user ? imp : imp.split(".")[0] + "."}
                    </p>
                  </li>
                ))}
              </ol>
              {!user && (
                <p className="text-xs text-dark-400 mt-4 flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5" />
                  Sign in for detailed improvement steps
                </p>
              )}
            </div>

            {/* Inline CTA for non-authenticated users (below Tier 1) */}
            {!user && (
              <button
                onClick={() => setShowAuthModal(true)}
                className="w-full flex items-center justify-center gap-3 py-4 rounded-2xl border-2 border-dashed border-cyan-300 bg-cyan-50/50 text-cyan-700 font-bold text-sm hover:bg-cyan-50 hover:border-cyan-400 transition-all"
              >
                <Lock className="w-4 h-4" />
                Sign in to unlock full results — 100% free
              </button>
            )}

            {/* ══════════════════════════════════════════════════
               TIER 3: FULL RESULTS (authenticated only)
               ══════════════════════════════════════════════════ */}
            {user && (
              <>
                {/* Profile save status */}
                {autoSaving && (
                  <div className="flex items-center gap-3 p-4 rounded-xl bg-cyan-50 border border-cyan-200 text-cyan-700 animate-fadeInUp">
                    <Loader2 className="w-5 h-5 animate-spin flex-shrink-0" />
                    <span className="text-sm font-medium">
                      Saving your profile and score\u2026
                    </span>
                  </div>
                )}
                {profileSaved && !autoSaving && (
                  <div className="flex items-center justify-between p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 animate-fadeInUp">
                    <div className="flex items-center gap-3">
                      <CheckCircle className="w-5 h-5 flex-shrink-0" />
                      <div>
                        <span className="text-sm font-bold">
                          {existingProfile ? "Score saved!" : "Profile created!"}
                        </span>
                        {existingProfile && (
                          <span className="text-xs text-emerald-600 ml-2">
                            Completeness: {existingProfile.profile_score_pct}%
                          </span>
                        )}
                      </div>
                    </div>
                    <Link
                      href="/profile"
                      className="text-sm font-bold text-emerald-700 hover:text-emerald-800 underline underline-offset-2"
                    >
                      View profile &rarr;
                    </Link>
                  </div>
                )}
                {profileError && (
                  <div className="flex items-center gap-3 p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 animate-fadeInUp">
                    <AlertCircle className="w-5 h-5 flex-shrink-0" />
                    <span className="text-sm font-medium">
                      Could not save profile: {profileError}
                    </span>
                  </div>
                )}

                {/* ── Opportunity Fit (auth only) ────────────── */}
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
                                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 text-xs font-semibold border border-emerald-200"
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

                {/* ── Detailed Dimensions (expandable, auth only) ── */}
                <div>
                  <p className="text-xs font-bold text-dark-500 uppercase tracking-[0.15em] mb-4">
                    Detailed Gap Analysis
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
                      className="border border-dark-100 rounded-2xl overflow-hidden transition-all duration-300 hover:shadow-md hover:border-dark-200 animate-staggerFadeUp"
                      style={{ animationDelay: `${0.2 + i * 0.08}s` }}
                    >
                      <button
                        onClick={() => setExpandedDim(isOpen ? null : i)}
                        className="w-full flex items-center gap-4 p-5 hover:bg-dark-50/30 transition-colors"
                      >
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-all duration-300 ${isOpen ? "bg-cyan-50 rotate-6 scale-110" : "bg-dark-50"}`}>
                          <Icon className="w-5 h-5 text-cyan-500" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-bold text-dark-900">
                              {dim.name}
                            </span>
                            <div className="flex items-center gap-3">
                              <span className="text-xs text-dark-400 font-medium hidden sm:inline">
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

            {/* ── Bottom Grid: Improvements + Donor Tips ──── */}
            <div className="grid lg:grid-cols-2 gap-6">
              {/* Top 3 improvements */}
              <div className="border border-dark-100 rounded-2xl p-6">
                <p className="text-xs font-bold text-dark-500 uppercase tracking-[0.15em] mb-5">
                  <TrendingUp className="w-4 h-4 inline-block mr-1.5 -mt-0.5 text-cyan-500" />
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
                  <Globe className="w-4 h-4 inline-block mr-1.5 -mt-0.5 text-cyan-500" />
                  Donor-Specific Tips
                </p>
                <div className="relative flex flex-wrap gap-1.5 mb-5 p-1 bg-dark-50 rounded-xl">
                  {Object.keys(result.donor_specific_tips).map((donor) => (
                    <button
                      key={donor}
                      onClick={() => setDonorTab(donor)}
                      className={`relative z-10 px-3 sm:px-5 py-2 rounded-lg text-xs font-bold transition-all duration-300 ${
                        donorTab === donor
                          ? "text-white"
                          : "text-dark-500 hover:text-dark-700"
                      }`}
                    >
                      {donorTab === donor && (
                        <span className="absolute inset-0 bg-gradient-to-r from-cyan-500 to-teal-500 rounded-lg shadow-md shadow-cyan-500/20 transition-all duration-300" />
                      )}
                      <span className="relative z-10">{donor}</span>
                    </button>
                  ))}
                </div>
                <p key={donorTab} className="text-sm text-dark-600 leading-relaxed animate-fadeInUp">
                  {result.donor_specific_tips[donorTab] ||
                    "No tips available for this donor."}
                </p>
              </div>
            </div>

            {/* ── Edit & Re-score ──────────────────────────── */}
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
                      className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-teal-500 text-white font-bold text-sm hover:from-cyan-600 hover:to-teal-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-cyan-500/20 hover:shadow-xl hover:shadow-cyan-500/30"
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

                {/* ── CTA: Build a Better CV (auth only) ──────── */}
                <div className="relative rounded-2xl overflow-hidden border border-dark-100">
                  <div
                    className="absolute inset-0 opacity-[0.03]"
                    style={{
                      backgroundImage:
                        "radial-gradient(circle, #27ABD2 1px, transparent 1px)",
                      backgroundSize: "20px 20px",
                    }}
                  />
                  <div className="relative flex flex-col sm:flex-row items-center justify-between gap-4 p-6 lg:p-8">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-500 to-teal-400 flex items-center justify-center shadow-lg shadow-cyan-500/20">
                        <Sparkles className="w-6 h-6 text-white" />
                      </div>
                      <div>
                        <p className="font-bold text-dark-900">
                          Ready to improve your score?
                        </p>
                        <p className="text-sm text-dark-400 mt-0.5">
                          Generate a donor-ready CV in World Bank format
                        </p>
                      </div>
                    </div>
                    <Link
                      href="/cv-builder"
                      className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-teal-500 text-white font-bold text-sm hover:from-cyan-600 hover:to-teal-600 transition-all shadow-lg shadow-cyan-500/20 hover:shadow-xl hover:shadow-cyan-500/30 hover:-translate-y-0.5 whitespace-nowrap"
                    >
                      Build a Better CV
                      <ArrowRight className="w-4 h-4" />
                    </Link>
                  </div>
                </div>
              </>
            )}

            {/* ── Mobile CTA: Edit CV on desktop ─────────── */}
            <div className="sm:hidden bg-cyan-50 border border-cyan-200 rounded-xl p-4 text-center">
              <p className="text-sm font-semibold text-cyan-800">
                Want to improve your score?
              </p>
              <p className="text-xs text-cyan-600 mt-1">
                Use the CV Builder on desktop to tailor your CV for this role
              </p>
              <Link
                href="/cv-builder"
                className="inline-flex items-center gap-2 mt-3 px-5 py-2.5 rounded-lg bg-cyan-500 text-white text-sm font-bold"
              >
                <Edit3 className="w-3.5 h-3.5" />
                Open CV Builder
              </Link>
            </div>

            {/* ── Score Another CV (everyone) ─────────────── */}
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

      {/* ══════════════════════════════════════════════════
         AUTH MODAL POPUP (appears after scoring for non-authenticated users)
         ══════════════════════════════════════════════════ */}
      {showAuthModal && !user && result && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-dark-900/60 backdrop-blur-sm"
            onClick={() => setShowAuthModal(false)}
          />

          {/* Modal */}
          <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl shadow-dark-900/20 overflow-hidden animate-scaleReveal">
            {/* Top gradient strip */}
            <div className="h-1 bg-gradient-to-r from-cyan-500 via-teal-400 to-cyan-500" />

            <div className="p-7 sm:p-8">
              {/* Score preview */}
              <div className="flex items-center gap-4 mb-5">
                <ScoreRing score={result.overall_score} size={72} stroke={6} label="/100" />
                <div>
                  <h3 className="text-lg font-extrabold text-dark-900">
                    Unlock Your Full Results
                  </h3>
                  <p className="text-sm text-dark-500 mt-0.5">
                    100% free &middot; takes 10 seconds
                  </p>
                </div>
              </div>

              {/* Benefits */}
              <div className="grid grid-cols-2 gap-2 mb-6">
                {[
                  "Detailed gap analysis",
                  "Donor-specific tips",
                  "Opportunity matching",
                  "Save & re-score anytime",
                ].map((b) => (
                  <div key={b} className="flex items-center gap-1.5 text-xs text-dark-600">
                    <CheckCircle className="w-3.5 h-3.5 text-cyan-500 flex-shrink-0" />
                    {b}
                  </div>
                ))}
              </div>

              {/* Divider */}
              <div className="flex items-center gap-3 mb-4">
                <div className="flex-1 h-px bg-dark-200" />
                <span className="text-xs text-dark-400 font-medium">sign in with email</span>
                <div className="flex-1 h-px bg-dark-200" />
              </div>

              {/* Email form */}
              <form onSubmit={handleInlineAuth} className="space-y-3">
                <input
                  type="email"
                  placeholder="Email address"
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                  required
                  className="w-full px-4 py-3 rounded-xl border border-dark-200 text-sm focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
                />
                <input
                  type="password"
                  placeholder="Password (min 6 characters)"
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  required
                  minLength={6}
                  className="w-full px-4 py-3 rounded-xl border border-dark-200 text-sm focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
                />
                {authError && (
                  <p className="text-xs text-red-500 font-medium">{authError}</p>
                )}
                <button
                  type="submit"
                  disabled={authSubmitting}
                  className="w-full px-6 py-3.5 rounded-xl bg-gradient-to-r from-cyan-500 to-teal-500 text-white font-bold text-sm hover:from-cyan-600 hover:to-teal-600 disabled:opacity-50 transition-all shadow-lg shadow-cyan-500/20"
                >
                  {authSubmitting
                    ? "Please wait\u2026"
                    : authMode === "signin"
                      ? "Sign In & Unlock"
                      : "Create Free Account"}
                </button>
                <button
                  type="button"
                  onClick={() => setAuthMode(authMode === "signin" ? "signup" : "signin")}
                  className="w-full text-xs text-dark-500 hover:text-cyan-600 transition-colors"
                >
                  {authMode === "signin"
                    ? "Don\u2019t have an account? Sign up free"
                    : "Already have an account? Sign in"}
                </button>
              </form>

              {/* Skip link */}
              <button
                onClick={() => setShowAuthModal(false)}
                className="w-full mt-4 text-xs text-dark-400 hover:text-dark-600 transition-colors"
              >
                Skip for now
              </button>
            </div>
          </div>
        </div>
      )}

      <SiteFooter />
    </div>
  );
}
