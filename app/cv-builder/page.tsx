"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import Link from "next/link";
import {
  Upload,
  PenTool,
  FileText,
  ChevronDown,
  X,
  Check,
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Download,
  User,
  Briefcase,
  GraduationCap,
  Languages,
  Globe,
  BookOpen,
  Award,
  FileCheck,
  Plus,
  Trash2,
  Loader2,
  ShieldCheck,
  Sparkles,
  BarChart3,
  RefreshCw,
} from "lucide-react";

import type {
  StructuredCvData,
  BuilderPhase,
  ProficiencyLevel,
  Education,
  Employment,
  Language,
} from "@/lib/types/cv-data";

import {
  emptyCvData,
  newEducation,
  newEmployment,
  newLanguage,
} from "@/lib/types/cv-data";

import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { useAuth } from "@/components/AuthProvider";
import { Lock, CheckCircle } from "lucide-react";

/* ─── Constants ────────────────────────────────────────────── */

const PROFICIENCY: ProficiencyLevel[] = ["Excellent", "Good", "Fair", "None"];

const EXTRACT_MESSAGES = [
  "Parsing document…",
  "Extracting personal information…",
  "Identifying work history…",
  "Mapping education…",
  "Analyzing certifications…",
  "Finalizing…",
];

const SECTIONS = [
  { key: "personal", label: "Personal Information", icon: User },
  { key: "summary", label: "Professional Summary", icon: FileText },
  { key: "education", label: "Education", icon: GraduationCap },
  { key: "employment", label: "Employment Record", icon: Briefcase },
  { key: "languages", label: "Languages", icon: Languages },
  { key: "qualifications", label: "Key Qualifications", icon: Award },
  { key: "certifications", label: "Certifications", icon: ShieldCheck },
  { key: "countries", label: "Countries of Experience", icon: Globe },
  { key: "optional", label: "Associations & Publications", icon: BookOpen },
] as const;

/* ─── Styling tokens ───────────────────────────────────────── */

const INPUT =
  "w-full px-4 py-3 rounded-xl border border-dark-100 bg-white text-sm text-dark-900 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:shadow-md focus:shadow-cyan-500/5 placeholder:text-dark-300 transition-all duration-300";
const TEXTAREA = `${INPUT} resize-none`;
const SELECT = `${INPUT} appearance-none`;

/* ─── Section filled check ─────────────────────────────────── */

function isFilled(data: StructuredCvData, key: string): boolean {
  switch (key) {
    case "personal":
      return !!data.personal.full_name.trim();
    case "summary":
      return !!data.professional_summary.trim();
    case "education":
      return data.education.some((e) => !!e.degree.trim());
    case "employment":
      return data.employment.some((e) => !!e.employer.trim());
    case "languages":
      return data.languages.some((l) => !!l.language.trim());
    case "qualifications":
      return !!data.key_qualifications.trim();
    case "certifications":
      return data.certifications.length > 0;
    case "countries":
      return data.countries_of_experience.length > 0;
    case "optional":
      return true;
    default:
      return false;
  }
}

function filledCount(data: StructuredCvData): number {
  return SECTIONS.filter((s) => isFilled(data, s.key)).length;
}

/* ─── sessionStorage extraction cache ──────────────────────── */

const CACHE_KEY_PREFIX = "dv_cv_extract_";
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

async function hashFile(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const hashBuf = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hashBuf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

interface CachedExtraction {
  data: StructuredCvData;
  raw_text: string;
  confidence: number;
  cachedAt: number;
}

function getCachedExtraction(hash: string): CachedExtraction | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY_PREFIX + hash);
    if (!raw) return null;
    const entry = JSON.parse(raw) as CachedExtraction;
    if (Date.now() - entry.cachedAt > CACHE_TTL) {
      sessionStorage.removeItem(CACHE_KEY_PREFIX + hash);
      return null;
    }
    return entry;
  } catch {
    return null;
  }
}

function setCachedExtraction(hash: string, entry: CachedExtraction) {
  try {
    sessionStorage.setItem(CACHE_KEY_PREFIX + hash, JSON.stringify(entry));
  } catch {
    // Storage full — silently ignore
  }
}

/* ─── Formatted file size ──────────────────────────────────── */

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/* ═══════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════════ */

export default function CvBuilderPage() {
  /* ─── State ─────────────────────────────────────────────── */
  const [phase, setPhase] = useState<BuilderPhase>("entry");
  const [cvData, setCvData] = useState<StructuredCvData>(emptyCvData());
  const [confidence, setConfidence] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [extractStep, setExtractStep] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [openSections, setOpenSections] = useState<Set<string>>(
    new Set(["personal", "summary", "education", "employment"])
  );
  const [countryInput, setCountryInput] = useState("");
  const [certInput, setCertInput] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState<
    "wb-standard" | "custom"
  >("wb-standard");
  const [docxResult, setDocxResult] = useState<{
    filename: string;
    docx_base64: string;
  } | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);

  /* ─── Auth state ─────────────────────────────────────────── */
  const { user, loading: authLoading, signInWithGoogle, signInWithEmail } = useAuth();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signup");
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Restore state from sessionStorage after Google OAuth redirect
  useEffect(() => {
    if (authLoading) return;
    if (!user) return;
    try {
      const saved = sessionStorage.getItem("devidends_builder_state");
      if (!saved) return;
      const parsed = JSON.parse(saved);
      if (parsed.docxResult) {
        setDocxResult(parsed.docxResult);
        if (parsed.cvData) setCvData(parsed.cvData);
        setPhase("download");
        sessionStorage.removeItem("devidends_builder_state");
      }
    } catch {
      sessionStorage.removeItem("devidends_builder_state");
    }
  }, [user, authLoading]);

  // Show auth modal when reaching download phase without auth
  useEffect(() => {
    if (phase === "download" && docxResult && !user && !authLoading) {
      setShowAuthModal(true);
    }
  }, [phase, docxResult, user, authLoading]);

  const handleBuilderAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthSubmitting(true);
    setAuthError(null);

    if (authMode === "signin") {
      const { error } = await signInWithEmail(authEmail, authPassword);
      if (error) setAuthError(error);
      else setShowAuthModal(false);
    } else {
      const { createSupabaseBrowser } = await import("@/lib/supabase-browser");
      const supabase = createSupabaseBrowser();
      const { error } = await supabase.auth.signUp({
        email: authEmail,
        password: authPassword,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=/cv-builder` },
      });
      if (error) setAuthError(error.message);
      else setShowAuthModal(false);
    }
    setAuthSubmitting(false);
  };

  /* ─── Handlers ──────────────────────────────────────────── */

  const validateFile = useCallback((f: File): string | null => {
    const ext = f.name.split(".").pop()?.toLowerCase();
    if (ext !== "pdf" && ext !== "docx")
      return "Only PDF and DOCX files accepted.";
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

  const handleExtract = async () => {
    if (!file || isProcessing) return;
    setIsProcessing(true);
    setPhase("extracting");
    setExtractStep(0);
    setError(null);

    const iv = setInterval(
      () => setExtractStep((s) => (s + 1) % EXTRACT_MESSAGES.length),
      2000
    );

    try {
      // Check sessionStorage cache first
      const fileHash = await hashFile(file);
      const cached = getCachedExtraction(fileHash);
      if (cached) {
        clearInterval(iv);
        setCvData(cached.data);
        setConfidence(cached.confidence);
        setOpenSections(
          new Set(["personal", "summary", "education", "employment"])
        );
        setPhase("editing");
        setIsProcessing(false);
        return;
      }

      const fd = new FormData();
      fd.append("file", file);

      const res = await fetch("/api/cv/extract", {
        method: "POST",
        body: fd,
      });
      const json = await res.json();
      clearInterval(iv);

      if (!json.success) throw new Error(json.error || "Extraction failed");

      // Cache result
      setCachedExtraction(fileHash, {
        data: json.data,
        raw_text: json.raw_text,
        confidence: json.confidence || 0.5,
        cachedAt: Date.now(),
      });

      setCvData(json.data);
      setConfidence(json.confidence || 0.5);
      setOpenSections(
        new Set(["personal", "summary", "education", "employment"])
      );
      setPhase("editing");
    } catch (err: unknown) {
      clearInterval(iv);
      setError(
        err instanceof Error
          ? err.message
          : "Extraction failed. Please try again."
      );
      setPhase("uploading");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleGenerate = async () => {
    if (isProcessing) return;
    setIsProcessing(true);
    setPhase("generating");
    setError(null);

    try {
      const res = await fetch("/api/cv/generate-docx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cv_data: cvData, template: selectedTemplate }),
      });
      const json = await res.json();

      if (!json.success) throw new Error(json.error || "Generation failed");

      setDocxResult({
        filename: json.filename,
        docx_base64: json.docx_base64,
      });
      setPhase("download");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Generation failed.");
      setPhase("template");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDownload = () => {
    if (!docxResult) return;
    const blob = new Blob(
      [Uint8Array.from(atob(docxResult.docx_base64), (c) => c.charCodeAt(0))],
      {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      }
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = docxResult.filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const toggleSection = (key: string) => {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  /* ─── Data updaters ─────────────────────────────────────── */

  const updatePersonal = (field: string, value: string) => {
    setCvData((d) => ({
      ...d,
      personal: { ...d.personal, [field]: value },
    }));
  };

  const updateEducation = (
    id: string,
    field: keyof Education,
    value: string | number
  ) => {
    setCvData((d) => ({
      ...d,
      education: d.education.map((e) =>
        e.id === id ? { ...e, [field]: value } : e
      ),
    }));
  };

  const updateEmployment = (
    id: string,
    field: keyof Employment,
    value: string
  ) => {
    setCvData((d) => ({
      ...d,
      employment: d.employment.map((e) =>
        e.id === id ? { ...e, [field]: value } : e
      ),
    }));
  };

  const updateLanguage = (
    id: string,
    field: keyof Language,
    value: string
  ) => {
    setCvData((d) => ({
      ...d,
      languages: d.languages.map((l) =>
        l.id === id ? { ...l, [field]: value } : l
      ),
    }));
  };

  const addTag = (
    field: "countries_of_experience" | "certifications",
    value: string,
    setter: (v: string) => void
  ) => {
    const trimmed = value.trim();
    if (!trimmed || cvData[field].includes(trimmed)) return;
    setCvData((d) => ({ ...d, [field]: [...d[field], trimmed] }));
    setter("");
  };

  const removeTag = (
    field: "countries_of_experience" | "certifications",
    val: string
  ) => {
    setCvData((d) => ({
      ...d,
      [field]: d[field].filter((x: string) => x !== val),
    }));
  };

  /* ─── Computed ──────────────────────────────────────────── */

  const filled = filledCount(cvData);
  const total = SECTIONS.length;

  /* ─── Extracting message cycle with key for animation ──── */

  const [msgKey, setMsgKey] = useState(0);
  useEffect(() => {
    if (phase !== "extracting") return;
    const iv = setInterval(() => {
      setExtractStep((s) => (s + 1) % EXTRACT_MESSAGES.length);
      setMsgKey((k) => k + 1);
    }, 2500);
    return () => clearInterval(iv);
  }, [phase]);

  /* ─── Personal fields config ────────────────────────────── */

  const PERSONAL_FIELDS: {
    field: string;
    label: string;
    ph: string;
    type?: string;
  }[] = [
    { field: "full_name", label: "Full Name", ph: "e.g. Abebe Tadesse" },
    { field: "nationality", label: "Nationality", ph: "e.g. Ethiopian" },
    {
      field: "date_of_birth",
      label: "Date of Birth",
      ph: "e.g. 1985-03-15",
      type: "date",
    },
    { field: "email", label: "Email", ph: "e.g. abebe@example.com" },
    { field: "phone", label: "Phone", ph: "e.g. +251 911 123 456" },
    {
      field: "address",
      label: "Address",
      ph: "e.g. Bole Sub City, Addis Ababa",
    },
    {
      field: "country_of_residence",
      label: "Country of Residence",
      ph: "e.g. Ethiopia",
    },
  ];

  /* ═══════════════════════════════════════════════════════════
     RENDER
     ═══════════════════════════════════════════════════════════ */

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <SiteHeader activeHref="/cv-builder" />

      {/* Gradient accent strip */}
      <div className="h-[3px] bg-gradient-to-r from-cyan-500 via-teal-400 to-cyan-500" />

      {/* Hero area */}
      <section className="relative overflow-hidden border-b border-dark-50">
        <div className="absolute inset-0 opacity-[0.025]">
          <div
            className="absolute inset-0"
            style={{
              backgroundImage:
                "radial-gradient(circle at 1px 1px, #212121 1px, transparent 0)",
              backgroundSize: "28px 28px",
            }}
          />
        </div>
        {/* Floating decorative elements */}
        <div className="absolute -top-20 -right-20 w-[300px] h-[300px] rounded-full bg-teal-500/5 blur-3xl animate-blobMove" />
        <div className="hidden lg:block absolute top-12 right-[14%] w-10 h-10 border-2 border-teal-300/20 rounded-lg rotate-12 animate-float" />
        <div className="hidden lg:block absolute bottom-8 right-[20%] w-6 h-6 rounded-full bg-cyan-400/10 animate-float" style={{ animationDelay: "-2s" }} />

        <div className="relative max-w-5xl mx-auto px-5 sm:px-8 py-10 lg:py-14">
          <div className="flex items-center gap-3 mb-3 animate-staggerFadeUp">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-teal-400 flex items-center justify-center shadow-lg shadow-cyan-500/15">
              <FileCheck className="w-5 h-5 text-white" strokeWidth={2} />
            </div>
            <span className="text-cyan-600 text-xs font-bold tracking-[0.2em] uppercase">
              CV Builder
            </span>
          </div>
          <h1 className="text-3xl lg:text-4xl font-extrabold text-dark-900 tracking-tight animate-staggerFadeUp" style={{ animationDelay: "0.1s" }}>
            Build a Donor-Ready CV
          </h1>
          <p className="mt-2 text-dark-400 text-base lg:text-lg max-w-2xl leading-relaxed animate-staggerFadeUp" style={{ animationDelay: "0.2s" }}>
            {phase === "entry" &&
              "Transform your CV into World Bank / UN standard format. Upload for AI extraction or start fresh."}
            {(phase === "uploading" || phase === "extracting") &&
              "AI is analyzing your CV to extract every detail…"}
            {phase === "editing" &&
              "Review and refine your extracted data. Every detail has been preserved."}
            {phase === "template" && "Choose a template for your final document."}
            {phase === "generating" && "Building your document…"}
            {phase === "download" && "Your CV is ready for download."}
          </p>
        </div>
      </section>

      {/* Main content */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-5 sm:px-8 py-10 lg:py-14">
        {/* Error banner */}
        {error && (
          <div className="flex items-center gap-3 p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 mb-8 animate-fadeInUp">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <span className="text-sm font-medium flex-1">{error}</span>
            <button
              onClick={() => setError(null)}
              className="p-1 hover:bg-red-100 rounded-lg transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* ─────────────── ENTRY PHASE ─────────────── */}
        {phase === "entry" && (
          <div>
            <div className="grid md:grid-cols-2 gap-6 max-w-3xl mx-auto">
              <button
                onClick={() => setPhase("uploading")}
                className="group text-left p-8 rounded-2xl border-2 border-dark-100 hover:border-cyan-400 hover:shadow-[0_12px_40px_-12px_rgba(39,171,210,0.18)] transition-all duration-500 hover:-translate-y-1 animate-slideInLeft"
              >
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-cyan-50 to-teal-50 group-hover:from-cyan-100 group-hover:to-teal-100 flex items-center justify-center mb-6 transition-all duration-300 group-hover:scale-105">
                  <Upload className="w-7 h-7 text-cyan-600" strokeWidth={1.8} />
                </div>
                <h3 className="text-xl font-extrabold text-dark-900 mb-2">
                  Upload Existing CV
                </h3>
                <p className="text-sm text-dark-400 leading-relaxed">
                  AI extracts your data into a structured format — every detail
                  preserved verbatim. Supports PDF and DOCX.
                </p>
                <div className="mt-5 flex items-center text-cyan-500 text-sm font-semibold opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300">
                  Get started <ArrowRight className="w-4 h-4 ml-1" />
                </div>
              </button>

              <button
                onClick={() => {
                  setCvData(emptyCvData());
                  setPhase("editing");
                }}
                className="group text-left p-8 rounded-2xl border-2 border-dark-100 hover:border-teal-400 hover:shadow-[0_12px_40px_-12px_rgba(36,207,214,0.18)] transition-all duration-500 hover:-translate-y-1 animate-slideInRight"
              >
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-teal-50 to-cyan-50 group-hover:from-teal-100 group-hover:to-cyan-100 flex items-center justify-center mb-6 transition-all duration-300 group-hover:scale-105">
                  <PenTool className="w-7 h-7 text-teal-600" strokeWidth={1.8} />
                </div>
                <h3 className="text-xl font-extrabold text-dark-900 mb-2">
                  Start from Scratch
                </h3>
                <p className="text-sm text-dark-400 leading-relaxed">
                  Fill in your details manually using the guided WB/UN format
                  editor with 9 structured sections.
                </p>
                <div className="mt-5 flex items-center text-teal-500 text-sm font-semibold opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300">
                  Get started <ArrowRight className="w-4 h-4 ml-1" />
                </div>
              </button>
            </div>
          </div>
        )}

        {/* ─────────────── UPLOADING PHASE ─────────────── */}
        {phase === "uploading" && (
          <div className="max-w-xl mx-auto animate-fadeInUp space-y-6">
            <button
              onClick={() => {
                setPhase("entry");
                setFile(null);
                setError(null);
              }}
              className="flex items-center gap-1.5 text-sm text-dark-400 hover:text-dark-700 font-medium transition-colors"
            >
              <ArrowLeft className="w-4 h-4" /> Back
            </button>

            <div
              className={`relative rounded-2xl border-2 border-dashed p-12 text-center transition-all duration-200 cursor-pointer ${
                isDragging
                  ? "border-cyan-500 bg-cyan-50/60 scale-[1.02] shadow-lg shadow-cyan-500/10"
                  : file
                    ? "border-cyan-400 bg-cyan-50/20 shadow-md shadow-cyan-500/5"
                    : "border-dark-200 hover:border-cyan-400 hover:bg-cyan-50/10 hover:shadow-lg hover:shadow-cyan-500/5"
              }`}
              onDragOver={(e) => {
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

              {!file ? (
                <>
                  <div className="w-16 h-16 mx-auto rounded-2xl bg-dark-50 flex items-center justify-center mb-4">
                    <Upload className="w-7 h-7 text-dark-300" />
                  </div>
                  <p className="text-sm font-semibold text-dark-700">
                    Drop your CV here or click to browse
                  </p>
                  <p className="text-xs text-dark-300 mt-1.5">
                    PDF or DOCX — up to 15 MB
                  </p>
                </>
              ) : (
                <div className="flex items-center gap-4 text-left">
                  <div className="w-12 h-12 rounded-xl bg-cyan-50 flex items-center justify-center flex-shrink-0">
                    <FileText className="w-6 h-6 text-cyan-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-dark-900 truncate">
                      {file.name}
                    </p>
                    <p className="text-xs text-dark-400 mt-0.5">
                      {fmtSize(file.size)}
                    </p>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setFile(null);
                    }}
                    className="p-2 hover:bg-dark-100 rounded-lg transition-colors"
                  >
                    <X className="w-4 h-4 text-dark-400" />
                  </button>
                </div>
              )}
            </div>

            <button
              onClick={handleExtract}
              disabled={!file || isProcessing}
              className={`w-full flex items-center justify-center gap-2.5 bg-gradient-to-r from-cyan-500 to-teal-500 text-white font-bold py-3.5 rounded-xl transition-all duration-300 hover:from-cyan-600 hover:to-teal-600 hover:shadow-lg hover:shadow-cyan-500/25 hover:-translate-y-0.5 disabled:opacity-40 disabled:pointer-events-none ${file ? "animate-pulseGlow" : ""}`}
            >
              <Sparkles className="w-4 h-4" />
              Extract CV Data
            </button>
          </div>
        )}

        {/* ─────────────── EXTRACTING PHASE ─────────────── */}
        {phase === "extracting" && (
          <div className="max-w-lg mx-auto text-center py-16 animate-fadeInUp">
            {/* Multi-ring teal-focused spinner */}
            <div className="relative w-40 h-40 mx-auto mb-10">
              {/* Outer ring */}
              <div
                className="absolute inset-0 rounded-full border-[3px] border-dark-100/60 border-t-teal-400/50 border-r-cyan-400/40 animate-spin"
                style={{ animationDuration: "3s" }}
              />
              {/* Middle ring */}
              <div
                className="absolute inset-4 rounded-full border-[3px] border-dark-100/40 border-t-cyan-500 border-l-teal-400/60 animate-spin"
                style={{ animationDuration: "2s", animationDirection: "reverse" }}
              />
              {/* Inner ring */}
              <div
                className="absolute inset-8 rounded-full border-[3px] border-dark-100/30 border-b-teal-500 border-r-cyan-500/50 animate-spin"
                style={{ animationDuration: "1.5s" }}
              />
              {/* Center icon */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-16 h-16 rounded-full bg-gradient-to-br from-teal-500 to-cyan-500 flex items-center justify-center shadow-xl shadow-teal-500/25">
                  <FileCheck className="w-8 h-8 text-white" />
                </div>
              </div>
            </div>

            {/* Rotating message */}
            <p
              key={msgKey}
              className="text-lg font-bold text-dark-800 animate-fadeInUp"
            >
              {EXTRACT_MESSAGES[extractStep]}
            </p>
            <p className="text-sm text-dark-400 mt-2">
              Preserving every detail from your CV…
            </p>

            {/* Step timeline */}
            <div className="flex justify-center gap-3 mt-10">
              {EXTRACT_MESSAGES.map((msg, i) => (
                <div
                  key={i}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-bold transition-all duration-500 ${
                    i === extractStep
                      ? "bg-gradient-to-r from-teal-500 to-cyan-500 text-white shadow-md shadow-teal-500/20 scale-110"
                      : i < extractStep
                        ? "bg-teal-50 text-teal-600 border border-teal-200"
                        : "bg-dark-50 text-dark-300 border border-dark-100"
                  }`}
                >
                  {i < extractStep ? (
                    <Check className="w-3 h-3" />
                  ) : (
                    <span>{i + 1}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ─────────────── EDITING PHASE ─────────────── */}
        {phase === "editing" && (
          <div className="animate-fadeInUp space-y-8">
            {/* Confidence badge */}
            {confidence > 0 && (
              <div className="flex items-center gap-3 p-4 rounded-xl bg-cyan-50/60 border border-cyan-100">
                <Sparkles className="w-5 h-5 text-cyan-600 flex-shrink-0" />
                <p className="text-sm text-dark-700">
                  AI extracted your data with{" "}
                  <span className="font-bold text-cyan-600">
                    {Math.round(confidence * 100)}% confidence
                  </span>
                  . Review each section below.
                </p>
              </div>
            )}

            {/* Progress bar */}
            <div className="flex items-center gap-4">
              <div className="flex-1 h-2 rounded-full bg-dark-100 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-teal-400 transition-all duration-500"
                  style={{ width: `${(filled / total) * 100}%` }}
                />
              </div>
              <span className="text-sm font-bold text-dark-600 tabular-nums whitespace-nowrap">
                {filled} / {total} sections
              </span>
            </div>

            {/* Accordion sections */}
            <div className="border border-dark-100 rounded-2xl overflow-hidden divide-y divide-dark-100">
              {SECTIONS.map((sec, idx) => {
                const isOpen = openSections.has(sec.key);
                const done = isFilled(cvData, sec.key);
                const SIcon = sec.icon;
                const isOptional = sec.key === "optional";

                return (
                  <div key={sec.key}>
                    {/* Section header */}
                    <button
                      onClick={() => toggleSection(sec.key)}
                      className="w-full flex items-center gap-4 px-6 py-4 hover:bg-dark-50/40 transition-all duration-300"
                    >
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 transition-all duration-500 ${
                          done
                            ? "bg-gradient-to-br from-cyan-500 to-teal-400 text-white shadow-md shadow-cyan-500/20 scale-105"
                            : "bg-dark-50 text-dark-400 border border-dark-100"
                        }`}
                      >
                        {done ? <Check className="w-3.5 h-3.5 animate-scaleReveal" /> : idx + 1}
                      </div>
                      <SIcon className={`w-4.5 h-4.5 flex-shrink-0 transition-colors duration-300 ${isOpen ? "text-cyan-500" : "text-dark-300"}`} />
                      <span className="text-sm font-bold text-dark-900 flex-1 text-left">
                        {sec.label}
                      </span>
                      {isOptional && (
                        <span className="text-[10px] font-bold text-dark-300 uppercase tracking-wider mr-2">
                          Optional
                        </span>
                      )}
                      <ChevronDown
                        className={`w-4 h-4 text-dark-300 transition-transform duration-200 ${
                          isOpen ? "rotate-180" : ""
                        }`}
                      />
                    </button>

                    {/* Section content */}
                    {isOpen && (
                      <div className="px-6 pb-6 pt-2">
                        {/* Personal */}
                        {sec.key === "personal" && (
                          <div className="grid sm:grid-cols-2 gap-4">
                            {PERSONAL_FIELDS.map(({ field, label, ph, type }) => (
                              <div key={field}>
                                <label className="block text-xs font-semibold text-dark-500 mb-1.5 uppercase tracking-wider">
                                  {label}
                                </label>
                                <input
                                  className={INPUT}
                                  type={type || "text"}
                                  value={
                                    (
                                      cvData.personal as unknown as Record<
                                        string,
                                        string
                                      >
                                    )[field]
                                  }
                                  onChange={(e) =>
                                    updatePersonal(field, e.target.value)
                                  }
                                  placeholder={ph}
                                />
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Professional Summary */}
                        {sec.key === "summary" && (
                          <div>
                            <label className="block text-xs font-semibold text-dark-500 mb-1.5 uppercase tracking-wider">
                              Summary
                            </label>
                            <textarea
                              className={TEXTAREA}
                              rows={5}
                              value={cvData.professional_summary}
                              onChange={(e) =>
                                setCvData((d) => ({
                                  ...d,
                                  professional_summary: e.target.value,
                                }))
                              }
                              placeholder="A comprehensive overview of your professional experience and expertise…"
                            />
                            <p className="text-xs text-dark-300 mt-1.5 text-right tabular-nums">
                              {cvData.professional_summary.length} chars
                            </p>
                          </div>
                        )}

                        {/* Education */}
                        {sec.key === "education" && (
                          <div className="space-y-4">
                            {cvData.education.map((edu) => (
                              <div
                                key={edu.id}
                                className="p-4 rounded-xl border border-dark-100 bg-dark-50/20 space-y-3"
                              >
                                <div className="flex justify-between items-start">
                                  <span className="text-xs font-bold text-dark-400 uppercase tracking-wider">
                                    {edu.degree || "New Entry"}
                                  </span>
                                  <button
                                    onClick={() =>
                                      setCvData((d) => ({
                                        ...d,
                                        education: d.education.filter(
                                          (e) => e.id !== edu.id
                                        ),
                                      }))
                                    }
                                    className="p-1.5 hover:bg-red-50 rounded-lg text-dark-300 hover:text-red-500 transition-colors"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                                <div className="grid sm:grid-cols-2 gap-3">
                                  <input
                                    className={INPUT}
                                    placeholder="Degree (e.g. Master of Public Health)"
                                    value={edu.degree}
                                    onChange={(e) =>
                                      updateEducation(
                                        edu.id,
                                        "degree",
                                        e.target.value
                                      )
                                    }
                                  />
                                  <input
                                    className={INPUT}
                                    placeholder="Field of Study"
                                    value={edu.field_of_study}
                                    onChange={(e) =>
                                      updateEducation(
                                        edu.id,
                                        "field_of_study",
                                        e.target.value
                                      )
                                    }
                                  />
                                  <input
                                    className={INPUT}
                                    placeholder="Institution"
                                    value={edu.institution}
                                    onChange={(e) =>
                                      updateEducation(
                                        edu.id,
                                        "institution",
                                        e.target.value
                                      )
                                    }
                                  />
                                  <input
                                    className={INPUT}
                                    placeholder="Country"
                                    value={edu.country}
                                    onChange={(e) =>
                                      updateEducation(
                                        edu.id,
                                        "country",
                                        e.target.value
                                      )
                                    }
                                  />
                                  <input
                                    className={INPUT}
                                    type="number"
                                    placeholder="Year Graduated"
                                    value={edu.year_graduated || ""}
                                    onChange={(e) =>
                                      updateEducation(
                                        edu.id,
                                        "year_graduated",
                                        parseInt(e.target.value) || 0
                                      )
                                    }
                                  />
                                </div>
                              </div>
                            ))}
                            <button
                              onClick={() =>
                                setCvData((d) => ({
                                  ...d,
                                  education: [...d.education, newEducation()],
                                }))
                              }
                              className="flex items-center gap-2 text-sm font-semibold text-cyan-600 hover:text-cyan-700 transition-colors"
                            >
                              <Plus className="w-4 h-4" /> Add Education
                            </button>
                          </div>
                        )}

                        {/* Employment */}
                        {sec.key === "employment" && (
                          <div className="space-y-4">
                            {cvData.employment.map((emp) => (
                              <div
                                key={emp.id}
                                className="p-4 rounded-xl border border-dark-100 bg-dark-50/20 space-y-3"
                              >
                                <div className="flex justify-between items-start">
                                  <span className="text-xs font-bold text-dark-400 uppercase tracking-wider">
                                    {emp.position || emp.employer || "New Entry"}
                                  </span>
                                  <button
                                    onClick={() =>
                                      setCvData((d) => ({
                                        ...d,
                                        employment: d.employment.filter(
                                          (e) => e.id !== emp.id
                                        ),
                                      }))
                                    }
                                    className="p-1.5 hover:bg-red-50 rounded-lg text-dark-300 hover:text-red-500 transition-colors"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                                <div className="grid sm:grid-cols-2 gap-3">
                                  <input
                                    className={INPUT}
                                    placeholder="From (e.g. 2018-01)"
                                    value={emp.from_date}
                                    onChange={(e) =>
                                      updateEmployment(
                                        emp.id,
                                        "from_date",
                                        e.target.value
                                      )
                                    }
                                  />
                                  <div className="flex items-center gap-2">
                                    <input
                                      className={`${INPUT} ${emp.to_date === "Present" ? "text-cyan-600 font-semibold" : ""}`}
                                      placeholder="To (e.g. 2021-06)"
                                      value={emp.to_date}
                                      onChange={(e) =>
                                        updateEmployment(
                                          emp.id,
                                          "to_date",
                                          e.target.value
                                        )
                                      }
                                    />
                                    <label className="flex items-center gap-1.5 flex-shrink-0 cursor-pointer">
                                      <input
                                        type="checkbox"
                                        checked={emp.to_date === "Present"}
                                        onChange={(e) =>
                                          updateEmployment(
                                            emp.id,
                                            "to_date",
                                            e.target.checked ? "Present" : ""
                                          )
                                        }
                                        className="w-4 h-4 rounded border-dark-200 text-cyan-500 focus:ring-cyan-500"
                                      />
                                      <span className="text-xs text-dark-500 font-medium whitespace-nowrap">
                                        Present
                                      </span>
                                    </label>
                                  </div>
                                  <input
                                    className={INPUT}
                                    placeholder="Employer"
                                    value={emp.employer}
                                    onChange={(e) =>
                                      updateEmployment(
                                        emp.id,
                                        "employer",
                                        e.target.value
                                      )
                                    }
                                  />
                                  <input
                                    className={INPUT}
                                    placeholder="Position"
                                    value={emp.position}
                                    onChange={(e) =>
                                      updateEmployment(
                                        emp.id,
                                        "position",
                                        e.target.value
                                      )
                                    }
                                  />
                                  <input
                                    className={INPUT}
                                    placeholder="Country"
                                    value={emp.country}
                                    onChange={(e) =>
                                      updateEmployment(
                                        emp.id,
                                        "country",
                                        e.target.value
                                      )
                                    }
                                  />
                                </div>
                                <div>
                                  <label className="block text-xs font-semibold text-dark-500 mb-1.5 uppercase tracking-wider">
                                    Description of Duties
                                  </label>
                                  <textarea
                                    className={TEXTAREA}
                                    rows={6}
                                    value={emp.description_of_duties}
                                    onChange={(e) =>
                                      updateEmployment(
                                        emp.id,
                                        "description_of_duties",
                                        e.target.value
                                      )
                                    }
                                    placeholder="Full description of responsibilities and achievements…"
                                  />
                                </div>
                              </div>
                            ))}
                            <button
                              onClick={() =>
                                setCvData((d) => ({
                                  ...d,
                                  employment: [
                                    ...d.employment,
                                    newEmployment(),
                                  ],
                                }))
                              }
                              className="flex items-center gap-2 text-sm font-semibold text-cyan-600 hover:text-cyan-700 transition-colors"
                            >
                              <Plus className="w-4 h-4" /> Add Employment
                            </button>
                          </div>
                        )}

                        {/* Languages */}
                        {sec.key === "languages" && (
                          <div className="space-y-3">
                            {cvData.languages.map((lang) => (
                              <div
                                key={lang.id}
                                className="flex items-center gap-3 flex-wrap"
                              >
                                <input
                                  className={`${INPUT} flex-1 min-w-[140px]`}
                                  placeholder="Language"
                                  value={lang.language}
                                  onChange={(e) =>
                                    updateLanguage(
                                      lang.id,
                                      "language",
                                      e.target.value
                                    )
                                  }
                                />
                                {(
                                  ["reading", "writing", "speaking"] as const
                                ).map((skill) => (
                                  <div
                                    key={skill}
                                    className="flex flex-col gap-0.5"
                                  >
                                    <span className="text-[10px] font-bold text-dark-300 uppercase tracking-wider">
                                      {skill}
                                    </span>
                                    <select
                                      className={`${SELECT} w-28`}
                                      value={lang[skill]}
                                      onChange={(e) =>
                                        updateLanguage(
                                          lang.id,
                                          skill,
                                          e.target.value
                                        )
                                      }
                                    >
                                      {PROFICIENCY.map((p) => (
                                        <option key={p} value={p}>
                                          {p}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                ))}
                                <button
                                  onClick={() =>
                                    setCvData((d) => ({
                                      ...d,
                                      languages: d.languages.filter(
                                        (l) => l.id !== lang.id
                                      ),
                                    }))
                                  }
                                  className="p-2 hover:bg-red-50 rounded-lg text-dark-300 hover:text-red-500 transition-colors self-end"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ))}
                            <button
                              onClick={() =>
                                setCvData((d) => ({
                                  ...d,
                                  languages: [...d.languages, newLanguage()],
                                }))
                              }
                              className="flex items-center gap-2 text-sm font-semibold text-cyan-600 hover:text-cyan-700 transition-colors"
                            >
                              <Plus className="w-4 h-4" /> Add Language
                            </button>
                          </div>
                        )}

                        {/* Key Qualifications */}
                        {sec.key === "qualifications" && (
                          <div>
                            <label className="block text-xs font-semibold text-dark-500 mb-1.5 uppercase tracking-wider">
                              Qualifications & Competencies
                            </label>
                            <textarea
                              className={TEXTAREA}
                              rows={5}
                              value={cvData.key_qualifications}
                              onChange={(e) =>
                                setCvData((d) => ({
                                  ...d,
                                  key_qualifications: e.target.value,
                                }))
                              }
                              placeholder="Technical skills, methodologies, and core competencies…"
                            />
                          </div>
                        )}

                        {/* Certifications (tag input) */}
                        {sec.key === "certifications" && (
                          <div>
                            <div className="flex gap-2 mb-3">
                              <input
                                className={`${INPUT} flex-1`}
                                placeholder="e.g. PMP, PRINCE2, CPA…"
                                value={certInput}
                                onChange={(e) => setCertInput(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    e.preventDefault();
                                    addTag(
                                      "certifications",
                                      certInput,
                                      setCertInput
                                    );
                                  }
                                }}
                              />
                              <button
                                onClick={() =>
                                  addTag(
                                    "certifications",
                                    certInput,
                                    setCertInput
                                  )
                                }
                                className="px-4 py-2 bg-cyan-50 text-cyan-600 rounded-xl text-sm font-semibold hover:bg-cyan-100 transition-colors"
                              >
                                Add
                              </button>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {cvData.certifications.map((c) => (
                                <span
                                  key={c}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-cyan-50 text-cyan-700 rounded-full text-sm font-medium"
                                >
                                  {c}
                                  <button
                                    onClick={() =>
                                      removeTag("certifications", c)
                                    }
                                    className="hover:text-cyan-900"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Countries of Experience (tag input) */}
                        {sec.key === "countries" && (
                          <div>
                            <div className="flex gap-2 mb-3">
                              <input
                                className={`${INPUT} flex-1`}
                                placeholder="e.g. Ethiopia, Kenya, Rwanda…"
                                value={countryInput}
                                onChange={(e) =>
                                  setCountryInput(e.target.value)
                                }
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    e.preventDefault();
                                    addTag(
                                      "countries_of_experience",
                                      countryInput,
                                      setCountryInput
                                    );
                                  }
                                }}
                              />
                              <button
                                onClick={() =>
                                  addTag(
                                    "countries_of_experience",
                                    countryInput,
                                    setCountryInput
                                  )
                                }
                                className="px-4 py-2 bg-cyan-50 text-cyan-600 rounded-xl text-sm font-semibold hover:bg-cyan-100 transition-colors"
                              >
                                Add
                              </button>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {cvData.countries_of_experience.map((c) => (
                                <span
                                  key={c}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-teal-50 text-teal-700 rounded-full text-sm font-medium"
                                >
                                  <Globe className="w-3 h-3" />
                                  {c}
                                  <button
                                    onClick={() =>
                                      removeTag("countries_of_experience", c)
                                    }
                                    className="hover:text-teal-900"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Associations & Publications */}
                        {sec.key === "optional" && (
                          <div className="space-y-5">
                            <div>
                              <label className="block text-xs font-semibold text-dark-500 mb-1.5 uppercase tracking-wider">
                                Professional Associations
                              </label>
                              <textarea
                                className={TEXTAREA}
                                rows={3}
                                value={cvData.professional_associations.join(
                                  "\n"
                                )}
                                onChange={(e) =>
                                  setCvData((d) => ({
                                    ...d,
                                    professional_associations: e.target.value
                                      .split("\n")
                                      .filter((l) => l.trim()),
                                  }))
                                }
                                placeholder="One association per line…"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-semibold text-dark-500 mb-1.5 uppercase tracking-wider">
                                Publications
                              </label>
                              <textarea
                                className={TEXTAREA}
                                rows={3}
                                value={cvData.publications.join("\n")}
                                onChange={(e) =>
                                  setCvData((d) => ({
                                    ...d,
                                    publications: e.target.value
                                      .split("\n")
                                      .filter((l) => l.trim()),
                                  }))
                                }
                                placeholder="One publication per line (full citation)…"
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* CTA: Continue to Template */}
            <div className="flex items-center justify-between pt-4">
              <button
                onClick={() => {
                  setPhase("entry");
                  setFile(null);
                }}
                className="flex items-center gap-1.5 text-sm text-dark-400 hover:text-dark-700 font-medium transition-colors"
              >
                <ArrowLeft className="w-4 h-4" /> Start Over
              </button>
              <button
                onClick={() => setPhase("template")}
                disabled={!cvData.personal.full_name.trim()}
                className="flex items-center gap-2.5 bg-dark-900 text-white font-semibold px-7 py-3.5 rounded-xl transition-all duration-200 hover:bg-dark-800 hover:shadow-xl hover:shadow-dark-900/10 disabled:opacity-40 disabled:pointer-events-none"
              >
                Continue to Template
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* ─────────────── TEMPLATE PHASE ─────────────── */}
        {phase === "template" && (
          <div className="max-w-2xl mx-auto animate-fadeInUp space-y-6">
            <button
              onClick={() => setPhase("editing")}
              className="flex items-center gap-1.5 text-sm text-dark-400 hover:text-dark-700 font-medium transition-colors"
            >
              <ArrowLeft className="w-4 h-4" /> Back to Editor
            </button>

            <h2 className="text-xl font-extrabold text-dark-900">
              Select Template
            </h2>

            <div className="space-y-3">
              {/* WB Standard */}
              <button
                onClick={() => setSelectedTemplate("wb-standard")}
                className={`w-full text-left p-5 rounded-xl border-2 transition-all duration-200 ${
                  selectedTemplate === "wb-standard"
                    ? "border-cyan-500 bg-cyan-50/30 shadow-md shadow-cyan-500/10"
                    : "border-dark-100 hover:border-dark-200"
                }`}
              >
                <div className="flex items-start gap-4">
                  <div
                    className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-0.5 ${
                      selectedTemplate === "wb-standard"
                        ? "border-cyan-500"
                        : "border-dark-200"
                    }`}
                  >
                    {selectedTemplate === "wb-standard" && (
                      <div className="w-2.5 h-2.5 rounded-full bg-cyan-500" />
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-dark-900">
                      World Bank / UN Standard
                    </p>
                    <p className="text-xs text-dark-400 mt-0.5">
                      Standard consulting proposal CV format used by WB, UNDP,
                      GIZ, and other major donors.
                    </p>
                  </div>
                </div>
              </button>

              {/* Custom (disabled) */}
              <div className="relative w-full text-left p-5 rounded-xl border-2 border-dark-100 opacity-50 cursor-not-allowed">
                <div className="flex items-start gap-4">
                  <div className="w-5 h-5 rounded-full border-2 border-dark-200 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-bold text-dark-900">
                      Upload Custom Template
                      <span className="ml-2 inline-flex items-center px-2 py-0.5 text-[10px] font-bold rounded-full bg-dark-100 text-dark-400 uppercase tracking-wider">
                        Coming Soon
                      </span>
                    </p>
                    <p className="text-xs text-dark-400 mt-0.5">
                      Upload a DOCX file with {"{{placeholder}}"} tags for
                      custom formatting.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <button
              onClick={handleGenerate}
              disabled={isProcessing}
              className="w-full flex items-center justify-center gap-2.5 bg-cyan-500 text-white font-semibold py-3.5 rounded-xl transition-all duration-200 hover:bg-cyan-600 hover:shadow-lg hover:shadow-cyan-500/20 disabled:opacity-40 disabled:pointer-events-none"
            >
              {isProcessing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <FileCheck className="w-4 h-4" />
              )}
              Generate CV
            </button>
          </div>
        )}

        {/* ─────────────── GENERATING PHASE ─────────────── */}
        {phase === "generating" && (
          <div className="max-w-md mx-auto text-center py-16 animate-fadeInUp">
            <div className="w-16 h-16 mx-auto mb-6">
              <Loader2 className="w-16 h-16 text-cyan-500 animate-spin" />
            </div>
            <p className="text-base font-semibold text-dark-700">
              Building your CV…
            </p>
            <p className="text-xs text-dark-300 mt-2">
              Formatting in WB / UN standard layout
            </p>
          </div>
        )}

        {/* ─────────────── DOWNLOAD PHASE ─────────────── */}
        {phase === "download" && docxResult && (
          <div className="max-w-lg mx-auto text-center animate-fadeInUp space-y-8">
            <div className="w-20 h-20 mx-auto rounded-full bg-gradient-to-br from-cyan-500 to-teal-400 flex items-center justify-center shadow-xl shadow-cyan-500/20">
              <Check className="w-9 h-9 text-white" strokeWidth={2.5} />
            </div>

            <div>
              <h2 className="text-2xl font-extrabold text-dark-900">
                Your CV is Ready
              </h2>
              <div className="mt-3 inline-block px-4 py-2 rounded-lg bg-dark-50 border border-dark-100">
                <code className="text-sm text-dark-600 font-mono">
                  {docxResult.filename}
                </code>
              </div>
            </div>

            {user ? (
              <>
                <div className="space-y-3">
                  <button
                    onClick={handleDownload}
                    className="w-full flex items-center justify-center gap-2.5 bg-cyan-500 text-white font-semibold py-4 rounded-xl transition-all duration-200 hover:bg-cyan-600 hover:shadow-lg hover:shadow-cyan-500/20"
                  >
                    <Download className="w-5 h-5" />
                    Download DOCX
                  </button>

                  <button
                    onClick={() => setPhase("editing")}
                    className="w-full flex items-center justify-center gap-2.5 bg-white text-dark-700 font-semibold py-3.5 rounded-xl border-2 border-dark-100 transition-all duration-200 hover:border-dark-200 hover:bg-dark-50"
                  >
                    <RefreshCw className="w-4 h-4" />
                    Edit & Regenerate
                  </button>
                </div>

                <Link
                  href="/score"
                  className="inline-flex items-center gap-2 text-sm font-semibold text-cyan-600 hover:text-cyan-700 transition-colors"
                >
                  <BarChart3 className="w-4 h-4" />
                  Score This CV
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </>
            ) : (
              <div className="space-y-3">
                <button
                  onClick={() => setShowAuthModal(true)}
                  className="w-full flex items-center justify-center gap-2.5 bg-gradient-to-r from-cyan-500 to-teal-500 text-white font-semibold py-4 rounded-xl transition-all duration-200 hover:from-cyan-600 hover:to-teal-600 hover:shadow-lg hover:shadow-cyan-500/20"
                >
                  <Lock className="w-5 h-5" />
                  Sign Up Free to Download
                </button>
                <p className="text-xs text-dark-400 text-center">
                  100% free — create an account to download your CV
                </p>
              </div>
            )}
          </div>
        )}
      </main>

      {/* ══════════════════════════════════════════════════
         AUTH MODAL (download gate)
         ══════════════════════════════════════════════════ */}
      {showAuthModal && !user && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-dark-900/60 backdrop-blur-sm" />

          {/* Modal */}
          <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl shadow-dark-900/20 overflow-hidden animate-fadeInUp">
            {/* Top gradient strip */}
            <div className="h-1 bg-gradient-to-r from-cyan-500 via-teal-400 to-cyan-500" />

            <div className="p-7 sm:p-8">
              {/* Header */}
              <div className="flex items-center gap-4 mb-5">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-cyan-500 to-teal-400 flex items-center justify-center shadow-lg shadow-cyan-500/20">
                  <Download className="w-7 h-7 text-white" />
                </div>
                <div>
                  <h3 className="text-lg font-extrabold text-dark-900">
                    Download Your CV
                  </h3>
                  <p className="text-sm text-dark-500 mt-0.5">
                    100% free &middot; takes 10 seconds
                  </p>
                </div>
              </div>

              {/* Benefits */}
              <div className="grid grid-cols-2 gap-2 mb-6">
                {[
                  "Download unlimited CVs",
                  "Save your profile",
                  "Get matched opportunities",
                  "Score your CV with AI",
                ].map((b) => (
                  <div key={b} className="flex items-center gap-1.5 text-xs text-dark-600">
                    <CheckCircle className="w-3.5 h-3.5 text-cyan-500 flex-shrink-0" />
                    {b}
                  </div>
                ))}
              </div>

              {/* Google sign-in */}
              <button
                onClick={() => {
                  try {
                    sessionStorage.setItem("devidends_builder_state", JSON.stringify({
                      docxResult,
                      cvData,
                    }));
                  } catch { /* ignore */ }
                  signInWithGoogle("/cv-builder");
                }}
                className="w-full flex items-center justify-center gap-3 px-6 py-3.5 rounded-xl bg-white border-2 border-dark-200 text-dark-700 font-bold text-sm hover:bg-dark-50 hover:border-dark-300 transition-all mb-4"
              >
                <svg viewBox="0 0 24 24" className="w-5 h-5">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                Continue with Google
              </button>

              {/* Divider */}
              <div className="flex items-center gap-3 mb-4">
                <div className="flex-1 h-px bg-dark-200" />
                <span className="text-xs text-dark-400 font-medium">or use email</span>
                <div className="flex-1 h-px bg-dark-200" />
              </div>

              {/* Email form */}
              <form onSubmit={handleBuilderAuth} className="space-y-3">
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
                      ? "Sign In & Download"
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
            </div>
          </div>
        </div>
      )}

      <SiteFooter />
    </div>
  );
}
