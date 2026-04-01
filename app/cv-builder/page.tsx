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
    "wb-standard" | "europass" | "au-standard" | "un-php" | "generic-professional" | "modern-executive"
  >("europass");
  const [docxResult, setDocxResult] = useState<{
    filename: string;
    docx_base64: string;
  } | null>(null);

  // AI Suggestions state
  const [suggestions, setSuggestions] = useState<
    { section: string; field?: string; text: string; suggestion: string; suggested_edit?: string; priority: "high" | "medium" | "low" }[]
  >([]);
  const [suggestionsNote, setSuggestionsNote] = useState("");
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [suggestionsRemaining, setSuggestionsRemaining] = useState<number | null>(null);
  const [dismissedSuggestions, setDismissedSuggestions] = useState<Set<number>>(new Set());

  const fileRef = useRef<HTMLInputElement>(null);

  /* ─── Auth state ─────────────────────────────────────────── */
  const { user, loading: authLoading, signInWithEmail } = useAuth();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signup");
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  /* ─── Telegram session (auto-login from mini-app) ────────── */
  const [tgSession, setTgSession] = useState<{ user: { first_name: string; id: number }; profile: Record<string, unknown>; initData: string } | null>(null);
  const [cvSaved, setCvSaved] = useState(false);

  /* ─── Explicit save with consent (web flow) ──────────────── */
  const [cvSavedToProfile, setCvSavedToProfile] = useState(false);
  const [isSavingToProfile, setIsSavingToProfile] = useState(false);

  // Auto-login from Telegram mini-app via ?tg_auth= URL param
  useEffect(() => {
    // Try URL param first (fresh handoff from TG app)
    const params = new URLSearchParams(window.location.search);
    const encoded = params.get("tg_auth");
    if (encoded) {
      try {
        const initData = decodeURIComponent(escape(atob(encoded)));
        fetch("/api/telegram/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ initData }),
        })
          .then((r) => r.json())
          .then((data) => {
            if (data.ok) {
              const session = { initData, user: data.user, profile: data.profile };
              sessionStorage.setItem("tg_web_session", JSON.stringify(session));
              setTgSession(session);
              // Pre-fill CV data from existing profile if available
              const existing = data.profile?.cv_structured_data;
              if (existing?.personal?.full_name) {
                setCvData(existing as StructuredCvData);
                setPhase("editing");
              }
            }
          })
          .catch(() => {});
        // Clean the token from the URL so it doesn't linger
        window.history.replaceState({}, "", window.location.pathname);
      } catch {}
      return;
    }
    // Restore TG session from sessionStorage (user refreshed the page)
    try {
      const stored = sessionStorage.getItem("tg_web_session");
      if (stored) {
        const session = JSON.parse(stored);
        if (session?.initData && session?.user) {
          setTgSession(session);
          const existing = session.profile?.cv_structured_data;
          if (existing?.personal?.full_name) {
            setCvData(existing as StructuredCvData);
            setPhase("editing");
          }
        }
      }
    } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // Auto-load saved CV data from Supabase on mount
  const [loadedFromDb, setLoadedFromDb] = useState(false);
  useEffect(() => {
    if (authLoading || loadedFromDb) return;
    if (!user) { setLoadedFromDb(true); return; }

    // Don't override if already past entry (e.g. OAuth restore set download phase)
    if (phase !== "entry") { setLoadedFromDb(true); return; }

    (async () => {
      try {
        const { createSupabaseBrowser } = await import("@/lib/supabase-browser");
        const { getCvStructuredData, getProfile } = await import("@/lib/profiles");
        const supabase = createSupabaseBrowser();

        // Try loading full structured CV data first
        const saved = await getCvStructuredData(supabase, user.id);
        if (saved && (saved as any)?.personal?.full_name) {
          setCvData(saved as unknown as StructuredCvData);
          setPhase("editing");
          setCvSavedToProfile(true); // User previously consented and saved
          setLoadedFromDb(true);
          return;
        }

        // No structured data — pre-fill from profile fields
        const profile = await getProfile(supabase, user.id);
        if (profile) {
          setCvData((prev) => ({
            ...prev,
            personal: {
              ...prev.personal,
              full_name: profile.name || prev.personal.full_name,
              email: profile.email || prev.personal.email,
              phone: profile.phone || prev.personal.phone,
            },
            countries_of_experience: profile.countries?.length ? profile.countries : prev.countries_of_experience,
            key_qualifications: profile.qualifications || prev.key_qualifications,
          }));
        }
      } catch {
        // DB fetch failed — continue with empty data
      }
      setLoadedFromDb(true);
    })();
  }, [user, authLoading, loadedFromDb, phase]);

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
    if (ext !== "pdf" && ext !== "docx" && ext !== "doc")
      return "Only PDF, DOCX, and DOC files accepted.";
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

      // Auto-save to Telegram profile if user came from the mini-app
      try {
        const storedSession = sessionStorage.getItem("tg_web_session");
        if (storedSession) {
          const session = JSON.parse(storedSession);
          if (session?.initData) {
            fetch("/api/telegram/verify", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                initData: session.initData,
                updateProfile: { cv_structured_data: json.data },
              }),
            })
              .then((r) => r.json())
              .then((res) => { if (res.ok) setCvSaved(true); })
              .catch(() => {});
          }
        }
      } catch {}
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

  const handleGetSuggestions = async () => {
    if (suggestionsLoading || !user) return;
    setSuggestionsLoading(true);
    setError(null);
    setDismissedSuggestions(new Set());

    try {
      const res = await fetch("/api/cv/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cv_data: cvData }),
      });
      const json = await res.json();

      if (!json.success) throw new Error(json.error || "Suggestion failed");

      setSuggestions(json.data.suggestions || []);
      setSuggestionsNote(json.data.overall_notes || "");
      if (json.remaining !== undefined) setSuggestionsRemaining(json.remaining);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not get suggestions.");
    } finally {
      setSuggestionsLoading(false);
    }
  };

  const handleAcceptSuggestion = (index: number) => {
    const s = suggestions[index];
    if (!s?.suggested_edit) return;

    // Apply the suggested edit to the CV data
    if (s.section === "summary" && s.suggested_edit) {
      setCvData((prev) => ({ ...prev, professional_summary: s.suggested_edit! }));
    } else if (s.section === "skills" && s.suggested_edit) {
      setCvData((prev) => ({ ...prev, key_qualifications: s.suggested_edit! }));
    } else if (s.section.startsWith("experience_")) {
      const idx = parseInt(s.section.split("_")[1], 10);
      if (!isNaN(idx) && s.suggested_edit) {
        setCvData((prev) => {
          const emp = [...prev.employment];
          if (emp[idx]) {
            emp[idx] = { ...emp[idx], description_of_duties: s.suggested_edit! };
          }
          return { ...prev, employment: emp };
        });
      }
    }

    setDismissedSuggestions((prev) => new Set(prev).add(index));
  };

  const handleDismissSuggestion = (index: number) => {
    setDismissedSuggestions((prev) => new Set(prev).add(index));
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

  const handleSaveToProfile = async () => {
    if (!user || !cvData.personal.full_name.trim() || isSavingToProfile) return;
    setIsSavingToProfile(true);
    try {
      const { createSupabaseBrowser } = await import("@/lib/supabase-browser");
      const { saveCvStructuredData } = await import("@/lib/profiles");
      const supabase = createSupabaseBrowser();
      await saveCvStructuredData(supabase, user.id, cvData as unknown as Record<string, unknown>);
      setCvSavedToProfile(true);
    } catch {
      // Save failed — surface nothing, user can retry
    } finally {
      setIsSavingToProfile(false);
    }
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

      {/* Telegram auto-login banner */}
      {tgSession && (
        <div className="bg-cyan-50 border-b border-cyan-200 px-5 sm:px-8 py-2.5 flex items-center gap-2 text-sm text-cyan-800">
          <svg className="w-4 h-4 shrink-0 text-cyan-600" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8l-1.7 8.01c-.12.59-.46.73-.94.45l-2.6-1.92-1.25 1.21c-.14.14-.26.26-.53.26l.19-2.66 4.83-4.37c.21-.19-.05-.29-.32-.1L7.9 15.17 5.34 14.4c-.56-.18-.57-.56.12-.83l8.96-3.45c.47-.18.88.11.72.83l-.5.85z"/>
          </svg>
          <span>
            Signed in via Telegram as <strong>{tgSession.user.first_name}</strong>
          </span>
          {cvSaved && (
            <span className="ml-auto flex items-center gap-1 text-green-700 font-medium">
              <Check className="w-3.5 h-3.5" />
              Saved to your profile
            </span>
          )}
        </div>
      )}

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
                className="group text-left p-5 sm:p-8 rounded-2xl border-2 border-dark-100 hover:border-cyan-400 hover:shadow-[0_12px_40px_-12px_rgba(39,171,210,0.18)] transition-all duration-500 hover:-translate-y-1 animate-slideInLeft"
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

              {!cvSavedToProfile && (
              <button
                onClick={async () => {
                  if (user) {
                    try {
                      const { createSupabaseBrowser } = await import("@/lib/supabase-browser");
                      const { saveCvStructuredData } = await import("@/lib/profiles");
                      await saveCvStructuredData(createSupabaseBrowser(), user.id, null as unknown as Record<string, unknown>);
                    } catch {}
                  }
                  setCvData(emptyCvData());
                  setPhase("editing");
                }}
                className="group text-left p-5 sm:p-8 rounded-2xl border-2 border-dark-100 hover:border-teal-400 hover:shadow-[0_12px_40px_-12px_rgba(36,207,214,0.18)] transition-all duration-500 hover:-translate-y-1 animate-slideInRight"
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
              )}
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
                accept=".pdf,.docx,.doc"
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
            {/* Loaded-from-DB notice */}
            {loadedFromDb && confidence === 0 && cvData.personal.full_name.trim() && (
              <div className="flex items-center justify-between gap-3 p-4 rounded-xl bg-dark-50/60 border border-dark-100">
                <p className="text-sm text-dark-600">
                  Continuing with your saved CV.
                </p>
                <button
                  onClick={async () => {
                    if (user) {
                      try {
                        const { createSupabaseBrowser } = await import("@/lib/supabase-browser");
                        const { saveCvStructuredData } = await import("@/lib/profiles");
                        await saveCvStructuredData(createSupabaseBrowser(), user.id, null as unknown as Record<string, unknown>);
                      } catch {}
                    }
                    setCvData(emptyCvData());
                    setConfidence(0);
                    setPhase("entry");
                  }}
                  className="text-xs font-semibold text-dark-400 hover:text-dark-700 underline underline-offset-2 whitespace-nowrap transition-colors"
                >
                  Start a new CV
                </button>
              </div>
            )}

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

            {/* AI Suggestions panel */}
            {user && (
              <div className="space-y-3">
                {suggestions.length === 0 && !suggestionsLoading && (
                  <button
                    onClick={handleGetSuggestions}
                    disabled={suggestionsLoading || !cvData.personal.full_name.trim()}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-amber-200 bg-amber-50/50 text-amber-700 text-sm font-semibold hover:bg-amber-100/60 transition-all disabled:opacity-40 disabled:pointer-events-none"
                  >
                    <Sparkles className="w-4 h-4" />
                    Get AI Suggestions
                    {suggestionsRemaining !== null && (
                      <span className="text-xs text-amber-500 font-normal ml-1">
                        ({suggestionsRemaining} remaining)
                      </span>
                    )}
                  </button>
                )}

                {suggestionsLoading && (
                  <div className="flex items-center gap-2 p-4 rounded-xl bg-amber-50/60 border border-amber-100">
                    <Loader2 className="w-4 h-4 text-amber-600 animate-spin" />
                    <p className="text-sm text-amber-700">Analyzing your CV for improvements...</p>
                  </div>
                )}

                {suggestions.length > 0 && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50/30 overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-amber-100">
                      <div className="flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-amber-600" />
                        <span className="text-sm font-bold text-amber-800">
                          AI Suggestions ({suggestions.filter((_, i) => !dismissedSuggestions.has(i)).length})
                        </span>
                      </div>
                      <button
                        onClick={() => { setSuggestions([]); setSuggestionsNote(""); setDismissedSuggestions(new Set()); }}
                        className="text-xs text-amber-500 hover:text-amber-700 font-medium"
                      >
                        Clear All
                      </button>
                    </div>

                    {suggestionsNote && (
                      <p className="px-4 py-2 text-xs text-amber-700 bg-amber-50/60 border-b border-amber-100">
                        {suggestionsNote}
                      </p>
                    )}

                    <div className="divide-y divide-amber-100">
                      {suggestions.map((s, i) => {
                        if (dismissedSuggestions.has(i)) return null;
                        const priorityColors = {
                          high: "bg-red-100 text-red-700",
                          medium: "bg-amber-100 text-amber-700",
                          low: "bg-dark-100 text-dark-500",
                        };
                        return (
                          <div key={i} className="px-4 py-3 space-y-1.5">
                            <div className="flex items-start gap-2">
                              <span className={`inline-flex px-1.5 py-0.5 text-[10px] font-bold rounded uppercase tracking-wider flex-shrink-0 mt-0.5 ${priorityColors[s.priority]}`}>
                                {s.priority}
                              </span>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-medium text-dark-500 mb-0.5">
                                  {s.section.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}
                                  {s.field && <span className="text-dark-300"> &middot; {s.field}</span>}
                                </p>
                                <p className="text-sm text-dark-700">{s.suggestion}</p>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 pl-10">
                              {s.suggested_edit && (
                                <button
                                  onClick={() => handleAcceptSuggestion(i)}
                                  className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg bg-emerald-100 text-emerald-700 hover:bg-emerald-200 transition-colors"
                                >
                                  <Check className="w-3 h-3" /> Apply
                                </button>
                              )}
                              <button
                                onClick={() => handleDismissSuggestion(i)}
                                className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg bg-dark-100 text-dark-400 hover:bg-dark-200 transition-colors"
                              >
                                <X className="w-3 h-3" /> Dismiss
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div className="px-4 py-2 border-t border-amber-100 bg-amber-50/40">
                      <button
                        onClick={handleGetSuggestions}
                        disabled={suggestionsLoading}
                        className="text-xs font-semibold text-amber-600 hover:text-amber-800 flex items-center gap-1"
                      >
                        <RefreshCw className="w-3 h-3" /> Refresh Suggestions
                        {suggestionsRemaining !== null && (
                          <span className="text-amber-400 font-normal ml-1">({suggestionsRemaining} left)</span>
                        )}
                      </button>
                    </div>
                  </div>
                )}
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
                                  className={`${INPUT} flex-1 min-w-0 sm:min-w-[140px]`}
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
          <div className="max-w-3xl mx-auto animate-fadeInUp space-y-6">
            <button
              onClick={() => setPhase("editing")}
              className="flex items-center gap-1.5 text-sm text-dark-400 hover:text-dark-700 font-medium transition-colors"
            >
              <ArrowLeft className="w-4 h-4" /> Back to Editor
            </button>

            <div>
              <h2 className="text-xl font-extrabold text-dark-900">
                Select Template
              </h2>
              <p className="text-sm text-dark-400 mt-1">
                Choose the format that best matches your target organization.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {([
                {
                  id: "europass" as const,
                  name: "Europass",
                  org: "EU / EuropeAid",
                  desc: "EU standard format with CEFR language grid and competence sections. Widely used for EU-funded projects.",
                  color: "blue",
                  badge: null,
                },
                {
                  id: "au-standard" as const,
                  name: "African Union",
                  org: "AU / AfDB / AUDA-NEPAD",
                  desc: "Official AU CV layout with numbered sections, green & gold branding, and declaration block. Required for AU vacancies.",
                  color: "green",
                  badge: "New",
                },
                {
                  id: "wb-standard" as const,
                  name: "World Bank",
                  org: "WB / IFC / MIGA",
                  desc: "Comprehensive multi-section format used for World Bank Group consulting assignments and staff positions.",
                  color: "cyan",
                  badge: null,
                },
                {
                  id: "un-php" as const,
                  name: "UN PHP",
                  org: "UN System / UNDP / UNICEF",
                  desc: "Personal History Profile format with formal numbered sections matching UN application requirements.",
                  color: "indigo",
                  badge: null,
                },
                {
                  id: "generic-professional" as const,
                  name: "Professional",
                  org: "General / Corporate",
                  desc: "Clean, modern format for private sector, NGOs, and general consulting applications.",
                  color: "slate",
                  badge: null,
                },
                {
                  id: "modern-executive" as const,
                  name: "Modern Executive ✦",
                  org: "Premium / Consulting",
                  desc: "Sleek two-column layout with dark sidebar, photo placeholder, gold accents. Requires profile photo.",
                  color: "slate",
                  badge: "New",
                },
              ]).map((tmpl) => {
                const isSelected = selectedTemplate === tmpl.id;
                const colorMap: Record<string, { border: string; bg: string; shadow: string; radio: string; badge: string }> = {
                  cyan: { border: "border-cyan-500", bg: "bg-cyan-50/30", shadow: "shadow-cyan-500/10", radio: "border-cyan-500", badge: "bg-cyan-100 text-cyan-700" },
                  blue: { border: "border-blue-500", bg: "bg-blue-50/30", shadow: "shadow-blue-500/10", radio: "border-blue-500", badge: "" },
                  green: { border: "border-emerald-500", bg: "bg-emerald-50/30", shadow: "shadow-emerald-500/10", radio: "border-emerald-500", badge: "" },
                  indigo: { border: "border-indigo-500", bg: "bg-indigo-50/30", shadow: "shadow-indigo-500/10", radio: "border-indigo-500", badge: "" },
                  slate: { border: "border-dark-400", bg: "bg-dark-50/30", shadow: "shadow-dark-400/10", radio: "border-dark-400", badge: "" },
                };
                const colors = colorMap[tmpl.color] || colorMap.cyan;

                return (
                  <button
                    key={tmpl.id}
                    onClick={() => setSelectedTemplate(tmpl.id)}
                    className={`relative w-full text-left p-4 rounded-xl border-2 transition-all duration-200 ${
                      isSelected
                        ? `${colors.border} ${colors.bg} shadow-md ${colors.shadow}`
                        : "border-dark-100 hover:border-dark-200"
                    }`}
                  >
                    {tmpl.badge && (
                      <span className={`absolute -top-2.5 right-3 inline-flex items-center px-2 py-0.5 text-[10px] font-bold rounded-full uppercase tracking-wider ${colors.badge}`}>
                        {tmpl.badge}
                      </span>
                    )}
                    <div className="flex items-start gap-3">
                      <div
                        className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-0.5 ${
                          isSelected ? colors.radio : "border-dark-200"
                        }`}
                      >
                        {isSelected && (
                          <div className={`w-2 h-2 rounded-full ${
                            tmpl.color === "cyan" ? "bg-cyan-500" :
                            tmpl.color === "blue" ? "bg-blue-500" :
                            tmpl.color === "green" ? "bg-emerald-500" :
                            tmpl.color === "indigo" ? "bg-indigo-500" :
                            "bg-dark-400"
                          }`} />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-dark-900 leading-tight">
                          {tmpl.name}
                        </p>
                        <p className="text-[11px] font-medium text-dark-400 mt-0.5">
                          {tmpl.org}
                        </p>
                        <p className="text-xs text-dark-400 mt-1.5 leading-relaxed">
                          {tmpl.desc}
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })}
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
              Generate CV — {selectedTemplate === "europass" ? "Europass" : selectedTemplate === "au-standard" ? "African Union" : selectedTemplate === "wb-standard" ? "World Bank" : selectedTemplate === "un-php" ? "UN PHP" : selectedTemplate === "modern-executive" ? "Executive" : "Professional"} Format
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

                {/* Explicit save with consent — unlocks Score CV */}
                {cvSavedToProfile ? (
                  <div className="flex flex-col items-center gap-3">
                    <div className="flex items-center gap-2 text-sm text-green-700 font-medium">
                      <CheckCircle className="w-4 h-4" />
                      CV saved to your profile
                    </div>
                    <Link
                      href="/score"
                      className="inline-flex items-center gap-2 text-sm font-semibold text-cyan-600 hover:text-cyan-700 transition-colors"
                    >
                      <BarChart3 className="w-4 h-4" />
                      Score This CV
                      <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <button
                      onClick={handleSaveToProfile}
                      disabled={isSavingToProfile}
                      className="inline-flex items-center gap-2 text-sm font-semibold text-dark-700 border-2 border-dark-100 px-5 py-2.5 rounded-xl hover:border-cyan-400 hover:text-cyan-700 transition-all duration-200 disabled:opacity-50"
                    >
                      {isSavingToProfile ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <ShieldCheck className="w-4 h-4" />
                      )}
                      Save CV to My Profile
                    </button>
                    <p className="text-xs text-dark-400">Save to unlock CV scoring & profile visibility</p>
                  </div>
                )}
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

              {/* Divider */}
              <div className="flex items-center gap-3 mb-4">
                <div className="flex-1 h-px bg-dark-200" />
                <span className="text-xs text-dark-400 font-medium">sign in with email</span>
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
