"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Upload,
  PenTool,
  FileText,
  Loader2,
  AlertCircle,
  X,
  Plus,
  Trash2,
  User,
  Briefcase,
  GraduationCap,
  Languages,
  Globe,
  BookOpen,
  Award,
  ChevronDown,
  ChevronUp,
  Download,
  CheckCircle,
  RefreshCw,
  Sparkles,
  BarChart3,
  TrendingUp,
} from "lucide-react";
import { useTelegram } from "@/components/TelegramProvider";
import type {
  StructuredCvData,
  BuilderPhase,
  ProficiencyLevel,
  Education,
  Employment,
  Language,
  CvTemplate,
} from "@/lib/types/cv-data";
import {
  emptyCvData,
  newEducation,
  newEmployment,
  newLanguage,
} from "@/lib/types/cv-data";

/* ─── Helpers ──────────────────────────────────────────────── */

/** Simple hash of CV data to detect changes (for score caching) */
function cvDataHash(data: StructuredCvData): string {
  const key = [
    data.personal.full_name,
    data.professional_summary?.slice(0, 100),
    data.employment.length,
    data.education.length,
    data.employment[0]?.position,
    data.key_qualifications?.slice(0, 50),
  ].join("|");
  let h = 0;
  for (let i = 0; i < key.length; i++) {
    h = ((h << 5) - h + key.charCodeAt(i)) | 0;
  }
  return String(h);
}

/* ─── Constants ────────────────────────────────────────────── */

const PROFICIENCY: ProficiencyLevel[] = ["Excellent", "Good", "Fair", "None"];

const EXTRACT_STEPS = [
  "Parsing document...",
  "Extracting personal info...",
  "Identifying work history...",
  "Mapping education...",
  "Analyzing certifications...",
  "Finalizing...",
];

const TEMPLATES: { id: CvTemplate; label: string; desc: string }[] = [
  { id: "europass", label: "Europass", desc: "EU / EuropeAid standard" },
  { id: "au-standard", label: "African Union", desc: "AU / AfDB / AUDA-NEPAD" },
  { id: "wb-standard", label: "World Bank", desc: "WB / IFC consulting" },
  { id: "un-php", label: "UN PHP", desc: "UN Personal History Profile" },
  { id: "generic-professional", label: "Professional", desc: "General / Corporate" },
  { id: "modern-executive", label: "Modern Executive ✦", desc: "Premium two-column with photo" },
];

const SECTIONS = [
  { key: "personal", label: "Personal Info", icon: User },
  { key: "summary", label: "Summary", icon: FileText },
  { key: "education", label: "Education", icon: GraduationCap },
  { key: "employment", label: "Employment", icon: Briefcase },
  { key: "languages", label: "Languages", icon: Languages },
  { key: "qualifications", label: "Qualifications", icon: Award },
  { key: "certifications", label: "Certifications", icon: BookOpen },
  { key: "countries", label: "Countries", icon: Globe },
];

const PERSONAL_FIELDS = [
  { field: "full_name", label: "Full Name", ph: "e.g. Abebe Tadesse" },
  { field: "nationality", label: "Nationality", ph: "e.g. Ethiopian" },
  { field: "date_of_birth", label: "Date of Birth", ph: "YYYY-MM-DD", type: "date" },
  { field: "email", label: "Email", ph: "e.g. abebe@example.com", type: "email" },
  { field: "phone", label: "Phone", ph: "+251 911 123 456", type: "tel" },
  { field: "address", label: "Address", ph: "Bole Sub City, Addis Ababa" },
  { field: "country_of_residence", label: "Country of Residence", ph: "Ethiopia" },
];

const INPUT =
  "w-full px-3 py-2.5 rounded-lg border border-dark-200 bg-dark-50 text-sm text-dark-900 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500/30 placeholder:text-dark-300 transition-colors";
const TEXTAREA = `${INPUT} resize-none`;

/* ═══════════════════════════════════════════════════════════════
   COMPONENT
   ═══════════════════════════════════════════════════════════════ */

export default function TgCvBuilder() {
  const { profile, refreshProfile, loading: tgLoading, tgUser, isTelegram } = useTelegram();

  /* ─── State ─────────────────────────────────────── */
  const [phase, setPhase] = useState<BuilderPhase>("entry");
  const [cvData, setCvData] = useState<StructuredCvData>(emptyCvData());
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [extractStep, setExtractStep] = useState(0);
  const [openSections, setOpenSections] = useState<Set<string>>(
    new Set(["personal", "summary"])
  );
  const [selectedTemplate, setSelectedTemplate] = useState<CvTemplate>("wb-standard");
  // mode="telegram" → sent to user's Telegram chat (most reliable)
  // mode="url"      → signed URL from Supabase Storage (fallback)
  // mode="base64"   → browser blob download (web fallback)
  const [docxResult, setDocxResult] = useState<{
    filename: string;
    mode: "telegram" | "url" | "base64";
    url?: string;
    base64?: string;
  } | null>(null);
  const [countryInput, setCountryInput] = useState("");
  const [certInput, setCertInput] = useState("");
  const [loadedFromProfile, setLoadedFromProfile] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");

  // Inline scoring state — loaded from profile if available
  const [scoreResult, setScoreResult] = useState<{
    overall_score: number;
    dimensions?: { name: string; score: number }[];
    top_3_improvements?: string[];
  } | null>(null);
  const [scoring, setScoring] = useState(false);
  const [showScore, setShowScore] = useState(false);
  const [scoredCvHash, setScoredCvHash] = useState<string>("");  // hash of CV when last scored

  const fileRef = useRef<HTMLInputElement>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ─── Auto-load from profile on mount ──────────── */
  useEffect(() => {
    if (tgLoading || loadedFromProfile) return;
    if (!profile) {
      setLoadedFromProfile(true);
      return;
    }

    let saved: StructuredCvData | null = null;
    try {
      const raw = profile.cv_structured_data;
      // If it's a string (corrupted JSONB), try parsing it
      if (typeof raw === "string") {
        saved = JSON.parse(raw) as StructuredCvData;
      } else if (raw && typeof raw === "object") {
        saved = raw as unknown as StructuredCvData;
      }
    } catch (e) {
      console.warn("[cv-builder] Corrupted CV data in profile, clearing it");
      saved = null;
      // Auto-clear the corrupted data from Supabase
      const initData = sessionStorage.getItem("tg_init_data");
      if (initData) {
        fetch("/api/telegram/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ initData, updateProfile: { cv_structured_data: null } }),
        }).catch(() => {});
      }
    }

    if (saved && saved?.personal?.full_name) {
      setCvData(saved);
      setOpenSections(new Set()); // All sections collapsed by default
      // Load cached score if available
      const cachedScore = (profile as any).cv_score_data;
      const cachedHash = (profile as any).cv_score_hash;
      if (cachedScore && cachedHash === cvDataHash(saved)) {
        setScoreResult(cachedScore);
        setScoredCvHash(cachedHash);
        setShowScore(true);
      }
      // User already has a CV — go straight to template selection
      setPhase("template");
    } else {
      // Pre-fill from profile basics
      setCvData((prev) => ({
        ...prev,
        personal: {
          ...prev.personal,
          full_name: profile.name || "",
          email: profile.email || "",
          phone: profile.phone || "",
        },
        countries_of_experience: profile.countries?.length ? profile.countries : [],
        key_qualifications: profile.qualifications || "",
      }));
    }
    setLoadedFromProfile(true);
  }, [tgLoading, profile, loadedFromProfile]);

  /* ─── Save to profile (on phase transition, not auto-debounce) ── */
  const saveCvToProfile = useCallback(async (data: StructuredCvData) => {
    const initData = sessionStorage.getItem("tg_init_data");
    if (!initData) return;
    if (!data.personal.full_name.trim()) return;

    // Validate JSON roundtrip — prevent saving corrupted data
    try {
      const serialized = JSON.stringify(data);
      JSON.parse(serialized); // roundtrip test
      if (serialized.length > 500000) {
        console.warn("[cv-builder] CV data too large, skipping save");
        return;
      }
    } catch {
      console.error("[cv-builder] CV data failed JSON roundtrip, not saving");
      return;
    }

    setSaveStatus("saving");
    try {
      const res = await fetch("/api/telegram/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          initData,
          updateProfile: { cv_structured_data: data },
        }),
      });
      if (res.ok) {
        setSaveStatus("saved");
        setTimeout(() => setSaveStatus("idle"), 2000);
      }
    } catch {
      setSaveStatus("idle");
    }
  }, []);

  // Save when leaving editing phase (not on every keystroke)
  const lastSavedPhaseRef = useRef<string>("");
  useEffect(() => {
    if (!cvData.personal.full_name.trim()) return;
    // Save when transitioning OUT of editing, or entering template/download
    if ((phase === "template" || phase === "download") && lastSavedPhaseRef.current !== phase) {
      lastSavedPhaseRef.current = phase;
      saveCvToProfile(cvData);
    }
  }, [phase, cvData, saveCvToProfile]);

  /* ─── Extracting step animation ─────────────────── */
  useEffect(() => {
    if (phase !== "extracting") return;
    const iv = setInterval(() => {
      setExtractStep((s) => (s + 1) % EXTRACT_STEPS.length);
    }, 2500);
    return () => clearInterval(iv);
  }, [phase]);

  /* ─── Handlers ──────────────────────────────────── */

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const ext = f.name.toLowerCase().split(".").pop();
    if (!["pdf", "docx", "doc"].includes(ext || "")) {
      setError("Only PDF, DOCX, and DOC files accepted");
      return;
    }
    if (f.size > 15 * 1024 * 1024) {
      setError("File must be under 15MB");
      return;
    }
    setFile(f);
    setError(null);
  }

  async function handleExtract() {
    if (!file || isProcessing) return;
    setIsProcessing(true);
    setPhase("extracting");
    setExtractStep(0);
    setError(null);

    try {
      // Check file size before uploading
      if (file.size > 10 * 1024 * 1024) {
        throw new Error("File must be under 10MB");
      }

      // Use FormData instead of base64 JSON — more reliable in Telegram WebView
      // Base64 inflates size by ~33% and can exceed webview fetch limits
      const formData = new FormData();
      formData.append("file", file);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 90000);

      const res = await fetch("/api/cv/extract", {
        method: "POST",
        body: formData,
        signal: controller.signal,
      });
      clearTimeout(timeout);

      const json = await res.json().catch(() => ({ success: false, error: `Server error (${res.status})` }));
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Extraction failed");
      }

      setCvData(json.data);
      setOpenSections(new Set(["personal", "summary", "education", "employment"]));
      setPhase("editing");
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setError("Extraction timed out. Try a smaller file or convert to PDF.");
      } else {
        setError(err instanceof Error ? err.message : "Extraction failed — try again");
      }
      setPhase("uploading");
    } finally {
      setIsProcessing(false);
    }
  }

  async function handleGenerate() {
    if (isProcessing) return;

    // Modern Executive requires a photo — redirect to profile if missing
    if (selectedTemplate === "modern-executive" && !(profile as any)?.photo_file_id) {
      setError("The Modern Executive template requires a profile photo. Please upload one in your Profile first.");
      return;
    }

    setIsProcessing(true);
    setPhase("generating");
    setError(null);

    try {
      // Use tgUser from TelegramProvider (uses @telegram-apps/sdk, not legacy WebApp)
      const tgUserId = isTelegram ? tgUser?.id : undefined;

      if (tgUserId) {
        // Inside Telegram: send the DOCX directly to the user's chat via Bot API.
        // This is the most reliable delivery method — no Supabase, no signed URLs.
        const res = await fetch("/api/cv/send-to-telegram", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            cv_data: cvData,
            template: selectedTemplate,
            telegram_user_id: tgUserId,
            photo_file_id: (profile as any)?.photo_file_id || undefined,
          }),
        });
        const json = await res.json();
        if (json.error) throw new Error(json.error);
        setDocxResult({ filename: json.filename, mode: "telegram" });
      } else {
        // Web browser (outside Telegram): use base64 + blob download
        const res = await fetch("/api/cv/generate-docx", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cv_data: cvData, template: selectedTemplate, photo_file_id: (profile as any)?.photo_file_id || undefined }),
        });
        const json = await res.json();
        if (json.error || !json.success) throw new Error(json.error || "Generation failed");
        setDocxResult({ filename: json.filename, mode: "base64", base64: json.docx_base64 });
      }

      setPhase("download");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Generation failed");
      setPhase("template");
    } finally {
      setIsProcessing(false);
    }
  }

  async function handleDownload() {
    if (!docxResult) return;

    if (docxResult.mode === "telegram") {
      // Already delivered to chat — close the mini app so user can see it
      try {
        const sdk = await import("@telegram-apps/sdk");
        if (sdk.miniApp.close.isAvailable()) sdk.miniApp.close();
        else (window as any).Telegram?.WebApp?.close?.();
      } catch {
        (window as any).Telegram?.WebApp?.close?.();
      }
      return;
    }

    if (docxResult.mode === "base64" && docxResult.base64) {
      // Browser blob download
      const bytes = Uint8Array.from(atob(docxResult.base64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = docxResult.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      return;
    }

    if (docxResult.mode === "url" && docxResult.url) {
      const twa = (window as any).Telegram?.WebApp;
      if (typeof twa?.downloadFile === "function") {
        twa.downloadFile({ url: docxResult.url, file_name: docxResult.filename });
        return;
      }
      if (typeof twa?.openLink === "function") {
        twa.openLink(docxResult.url, { try_instant_view: false });
        return;
      }
      const a = document.createElement("a");
      a.href = docxResult.url;
      a.download = docxResult.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  }

  function handleStartFresh() {
    setCvData(emptyCvData());
    setPhase("entry");
    setFile(null);
    setDocxResult(null);
    setError(null);
    // Clear from profile
    const initData = sessionStorage.getItem("tg_init_data");
    if (initData) {
      fetch("/api/telegram/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initData, updateProfile: { cv_structured_data: null } }),
      }).catch(() => {});
    }
  }

  /* ─── Build CV plain text for scoring ──────────── */
  function buildCvText(): string {
    const p = cvData.personal;
    return [
      p.full_name,
      p.nationality && `Nationality: ${p.nationality}`,
      p.email && `Email: ${p.email}`,
      p.phone && `Phone: ${p.phone}`,
      p.address,
      p.country_of_residence && `Country: ${p.country_of_residence}`,
      "",
      "PROFESSIONAL SUMMARY",
      cvData.professional_summary,
      "",
      "KEY QUALIFICATIONS",
      cvData.key_qualifications,
      "",
      "EDUCATION",
      ...cvData.education.map(
        (e) => `${e.degree} in ${e.field_of_study}, ${e.institution} (${e.country}, ${e.year_graduated})`
      ),
      "",
      "EMPLOYMENT",
      ...cvData.employment.map(
        (e) =>
          `${e.position} at ${e.employer} (${e.from_date} - ${e.to_date}, ${e.country})\n${e.description_of_duties}`
      ),
      "",
      "LANGUAGES",
      ...cvData.languages.map(
        (l) => `${l.language}: Reading ${l.reading}, Writing ${l.writing}, Speaking ${l.speaking}`
      ),
      "",
      "CERTIFICATIONS",
      ...cvData.certifications,
      "",
      "COUNTRIES OF EXPERIENCE",
      ...cvData.countries_of_experience,
    ].filter(Boolean).join("\n");
  }

  /* ─── Score CV (simple fetch, fast prompt) ──────── */

  async function handleScoreCv() {
    if (scoring) return;

    const currentHash = cvDataHash(cvData);
    if (scoreResult && scoredCvHash === currentHash) {
      setShowScore(true);
      return;
    }

    setScoring(true);
    setError(null);

    try {
      const cvText = buildCvText();

      const res = await fetch("/api/cv/score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cv_text: cvText }),
      });

      if (!res.ok) {
        const ct = res.headers.get("content-type") || "";
        if (ct.includes("application/json")) {
          const err = await res.json();
          throw new Error(err.error || "Scoring failed");
        }
        throw new Error(`Server error (${res.status})`);
      }

      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Scoring failed");

      const scoreData = json.data;
      const hash = cvDataHash(cvData);
      setScoreResult(scoreData);
      setScoredCvHash(hash);
      setShowScore(true);

      // Cache to profile
      const initData = sessionStorage.getItem("tg_init_data");
      if (initData) {
        fetch("/api/telegram/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            initData,
            updateProfile: {
              cv_score: scoreData.overall_score,
              cv_score_data: scoreData,
              cv_score_hash: hash,
            },
          }),
        }).catch(() => {});
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Scoring failed — try again");
    } finally {
      setScoring(false);
    }
  }

  // No auto-score — user presses "Score" manually

  const toggleSection = (key: string) => {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  /* ─── Data updaters ─────────────────────────────── */

  const updatePersonal = (field: string, value: string) => {
    setCvData((d) => ({ ...d, personal: { ...d.personal, [field]: value } }));
  };

  const updateEducation = (id: string, field: keyof Education, value: string | number) => {
    setCvData((d) => ({
      ...d,
      education: d.education.map((e) => (e.id === id ? { ...e, [field]: value } : e)),
    }));
  };

  const updateEmployment = (id: string, field: keyof Employment, value: string) => {
    setCvData((d) => ({
      ...d,
      employment: d.employment.map((e) => (e.id === id ? { ...e, [field]: value } : e)),
    }));
  };

  const updateLanguage = (id: string, field: keyof Language, value: string) => {
    setCvData((d) => ({
      ...d,
      languages: d.languages.map((l) => (l.id === id ? { ...l, [field]: value } : l)),
    }));
  };

  const addTag = (field: "countries_of_experience" | "certifications", value: string, setter: (v: string) => void) => {
    const trimmed = value.trim();
    if (!trimmed || cvData[field].includes(trimmed)) return;
    setCvData((d) => ({ ...d, [field]: [...d[field], trimmed] }));
    setter("");
  };

  const removeTag = (field: "countries_of_experience" | "certifications", val: string) => {
    setCvData((d) => ({ ...d, [field]: d[field].filter((x: string) => x !== val) }));
  };

  /* ─── Section filled check ──────────────────────── */

  function isFilled(key: string): boolean {
    switch (key) {
      case "personal": return !!cvData.personal.full_name.trim();
      case "summary": return !!cvData.professional_summary.trim();
      case "education": return cvData.education.some((e) => !!e.degree.trim());
      case "employment": return cvData.employment.some((e) => !!e.employer.trim());
      case "languages": return cvData.languages.some((l) => !!l.language.trim());
      case "qualifications": return !!cvData.key_qualifications.trim();
      case "certifications": return cvData.certifications.length > 0;
      case "countries": return cvData.countries_of_experience.length > 0;
      default: return false;
    }
  }

  const filledCount = SECTIONS.filter((s) => isFilled(s.key)).length;

  /* ─── Loading ───────────────────────────────────── */

  if (tgLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-cyan-500" />
      </div>
    );
  }

  /* ═══════════════════════════════════════════════════
     RENDER
     ═══════════════════════════════════════════════════ */

  return (
    <div className="pb-8">
      {/* ── Sticky Header ── */}
      <div className="bg-white border-b border-dark-100 px-4 pt-3 pb-3 sticky top-0 z-30">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {phase === "editing" || phase === "template" || phase === "download" ? (
              <button
                onClick={() => {
                  if (phase === "template") setPhase("editing");
                  else if (phase === "download") setPhase("template");
                  else setPhase("entry");
                }}
                className="text-dark-400 hover:text-dark-600"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
            ) : (
              <Link href="/tg-app" className="text-dark-400 hover:text-dark-600">
                <ArrowLeft className="w-5 h-5" />
              </Link>
            )}
            <h1 className="text-lg font-extrabold text-dark-900 tracking-tight">
              CV Builder
            </h1>
          </div>
          {/* Save indicator */}
          {phase === "editing" && (
            <div className="flex items-center gap-1.5">
              {saveStatus === "saving" && (
                <>
                  <Loader2 className="w-3 h-3 animate-spin text-dark-300" />
                  <span className="text-[10px] text-dark-400">Saving</span>
                </>
              )}
              {saveStatus === "saved" && (
                <>
                  <CheckCircle className="w-3 h-3 text-emerald-500" />
                  <span className="text-[10px] text-emerald-600">Saved</span>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Error Banner ── */}
      {error && (
        <div className="mx-4 mt-3 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
            <p className="text-xs text-red-700 flex-1">{error}</p>
            <button onClick={() => setError(null)} className="text-red-400">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          {error.includes("profile photo") && (
            <Link href="/tg-app/profile" className="mt-2 block text-center text-xs font-bold text-cyan-600 bg-cyan-50 rounded-lg py-2">
              Go to Profile to Upload Photo
            </Link>
          )}
        </div>
      )}

      {/* ══════════════ ENTRY PHASE ══════════════ */}
      {phase === "entry" && (
        <div className="px-4 mt-6">
          <div className="text-center mb-8">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-cyan-500 to-teal-500 flex items-center justify-center mx-auto mb-3 shadow-lg shadow-cyan-500/20">
              <Sparkles className="w-8 h-8 text-white" />
            </div>
            <h2 className="text-xl font-extrabold text-dark-900">
              Build a Donor-Ready CV
            </h2>
            <p className="text-sm text-dark-400 mt-1.5 max-w-xs mx-auto leading-relaxed">
              Transform your CV into World Bank, UN, or EU standard format
            </p>
          </div>

          <div className="space-y-3">
            <button
              onClick={() => {
                const initData = sessionStorage.getItem("tg_init_data");
                const base = `${window.location.origin}/cv-builder`;
                if (initData) {
                  try {
                    const encoded = btoa(unescape(encodeURIComponent(initData)));
                    window.open(`${base}?tg_auth=${encoded}`, "_blank");
                  } catch {
                    window.open(base, "_blank");
                  }
                } else {
                  window.open(base, "_blank");
                }
              }}
              className="w-full text-left p-4 rounded-xl border-2 border-dark-100 hover:border-cyan-400 transition-colors block"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-cyan-50 flex items-center justify-center shrink-0">
                  <Upload className="w-6 h-6 text-cyan-600" />
                </div>
                <div>
                  <p className="text-sm font-bold text-dark-900">Upload Existing CV</p>
                  <p className="text-xs text-dark-400 mt-0.5">
                    Opens in browser for AI extraction
                  </p>
                </div>
              </div>
            </button>

            {!(loadedFromProfile && profile?.cv_structured_data) && (
            <button
              onClick={() => {
                setCvData(emptyCvData());
                setOpenSections(new Set(["personal", "summary"]));
                setPhase("editing");
              }}
              className="w-full text-left p-4 rounded-xl border-2 border-dark-100 hover:border-teal-400 transition-colors"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-teal-50 flex items-center justify-center shrink-0">
                  <PenTool className="w-6 h-6 text-teal-600" />
                </div>
                <div>
                  <p className="text-sm font-bold text-dark-900">Start from Scratch</p>
                  <p className="text-xs text-dark-400 mt-0.5">
                    Fill in each section manually
                  </p>
                </div>
              </div>
            </button>
            )}
          </div>
        </div>
      )}

      {/* ══════════════ UPLOADING PHASE ══════════════ */}
      {phase === "uploading" && (
        <div className="px-4 mt-6">
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.docx,.doc"
            onChange={handleFileSelect}
            className="hidden"
          />

          {!file ? (
            <button
              onClick={() => fileRef.current?.click()}
              className="w-full border-2 border-dashed border-dark-200 rounded-xl py-10 flex flex-col items-center gap-2 hover:border-cyan-400 hover:bg-cyan-50/30 transition-colors active:scale-[0.98]"
            >
              <Upload className="w-8 h-8 text-dark-300" />
              <p className="text-sm font-semibold text-dark-600">
                Tap to upload your CV
              </p>
              <p className="text-xs text-dark-400">PDF or DOCX - up to 15MB</p>
            </button>
          ) : (
            <div className="bg-cyan-50 border border-cyan-200 rounded-xl px-4 py-3 flex items-center gap-3">
              <FileText className="w-5 h-5 text-cyan-600 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-dark-900 truncate">{file.name}</p>
                <p className="text-xs text-dark-400">{(file.size / 1024).toFixed(0)} KB</p>
              </div>
              <button
                onClick={() => {
                  setFile(null);
                  if (fileRef.current) fileRef.current.value = "";
                }}
                className="text-dark-400"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {file && (
            <button
              onClick={handleExtract}
              disabled={isProcessing}
              className="w-full mt-4 py-3.5 rounded-xl bg-gradient-to-r from-cyan-500 to-teal-500 text-white font-bold text-sm disabled:opacity-50 active:scale-[0.98] transition-transform"
            >
              Extract CV Data
            </button>
          )}

          <button
            onClick={() => {
              setPhase("entry");
              setFile(null);
            }}
            className="w-full mt-3 py-2.5 text-sm font-medium text-dark-400"
          >
            Back
          </button>
        </div>
      )}

      {/* ══════════════ EXTRACTING PHASE ══════════════ */}
      {phase === "extracting" && (
        <div className="px-4 mt-16 text-center">
          <Loader2 className="w-10 h-10 animate-spin text-cyan-500 mx-auto" />
          <h2 className="text-lg font-bold text-dark-900 mt-4">
            Analyzing your CV...
          </h2>
          <p className="text-sm text-dark-400 mt-1">This takes 15-30 seconds</p>
          <div className="mt-6 space-y-2 max-w-xs mx-auto text-left">
            {EXTRACT_STEPS.map((step, i) => (
              <div
                key={i}
                className={`flex items-center gap-2 text-xs transition-opacity duration-300 ${
                  i <= extractStep ? "text-dark-600 opacity-100" : "text-dark-300 opacity-40"
                }`}
              >
                {i < extractStep ? (
                  <CheckCircle className="w-3 h-3 text-emerald-500" />
                ) : i === extractStep ? (
                  <Loader2 className="w-3 h-3 animate-spin text-cyan-500" />
                ) : (
                  <div className="w-3 h-3 rounded-full border border-dark-200" />
                )}
                <span>{step}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ══════════════ EDITING PHASE ══════════════ */}
      {phase === "editing" && (
        <div className="px-4 mt-4">
          {/* Returning user banner */}
          {loadedFromProfile && profile?.cv_structured_data && (
            <div className="bg-cyan-50 border border-cyan-200 rounded-xl px-3 py-2.5 mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-cyan-600 shrink-0" />
                <span className="text-xs font-medium text-cyan-800">
                  Continuing with your saved CV
                </span>
              </div>
              <button
                onClick={handleStartFresh}
                className="text-[11px] font-bold text-cyan-600 underline"
              >
                Start new
              </button>
            </div>
          )}

          {/* Save prompt for newly extracted CVs */}
          {cvData.personal.full_name && saveStatus !== "saved" && !profile?.cv_structured_data && (
            <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-xl px-4 py-3 mb-4">
              <div className="flex items-start gap-2.5">
                <Sparkles className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-xs font-bold text-amber-800">
                    CV extracted! Review &amp; save to unlock scoring and templates.
                  </p>
                  <p className="text-[10px] text-amber-600 mt-0.5">
                    Check the sections below, then tap &quot;Save &amp; Continue&quot; at the bottom.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Progress bar */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] text-dark-400 font-medium uppercase tracking-wider">
                Sections filled
              </span>
              <span className="text-xs font-bold text-dark-700">
                {filledCount}/{SECTIONS.length}
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-dark-100">
              <div
                className="h-1.5 rounded-full bg-gradient-to-r from-cyan-500 to-teal-500 transition-all duration-500"
                style={{ width: `${(filledCount / SECTIONS.length) * 100}%` }}
              />
            </div>
          </div>

          {/* Accordion Sections */}
          <div className="space-y-2">
            {SECTIONS.map(({ key, label, icon: Icon }) => {
              const open = openSections.has(key);
              const filled = isFilled(key);
              return (
                <div key={key} className="border border-dark-100 rounded-xl overflow-hidden">
                  <button
                    onClick={() => toggleSection(key)}
                    className="w-full flex items-center gap-3 px-4 py-3 bg-white"
                  >
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${
                      filled ? "bg-cyan-50" : "bg-dark-50"
                    }`}>
                      <Icon className={`w-3.5 h-3.5 ${filled ? "text-cyan-600" : "text-dark-400"}`} />
                    </div>
                    <span className={`flex-1 text-left text-sm font-bold ${
                      filled ? "text-dark-900" : "text-dark-500"
                    }`}>
                      {label}
                    </span>
                    {filled && <CheckCircle className="w-4 h-4 text-emerald-500 mr-1" />}
                    {open ? (
                      <ChevronUp className="w-4 h-4 text-dark-300" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-dark-300" />
                    )}
                  </button>

                  {open && (
                    <div className="px-4 pb-4 pt-1 bg-white border-t border-dark-50">
                      {/* Personal Info */}
                      {key === "personal" && (
                        <div className="space-y-3">
                          {PERSONAL_FIELDS.map((f) => (
                            <div key={f.field}>
                              <label className="text-[11px] font-semibold text-dark-500 uppercase tracking-wider mb-1 block">
                                {f.label}
                              </label>
                              <input
                                type={f.type || "text"}
                                value={(cvData.personal as any)[f.field] || ""}
                                onChange={(e) => updatePersonal(f.field, e.target.value)}
                                placeholder={f.ph}
                                className={INPUT}
                              />
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Summary */}
                      {key === "summary" && (
                        <textarea
                          value={cvData.professional_summary}
                          onChange={(e) =>
                            setCvData((d) => ({ ...d, professional_summary: e.target.value }))
                          }
                          placeholder="Brief professional summary highlighting your development sector expertise..."
                          rows={4}
                          className={TEXTAREA}
                        />
                      )}

                      {/* Education */}
                      {key === "education" && (
                        <div className="space-y-4">
                          {cvData.education.map((edu, i) => (
                            <div key={edu.id} className="relative bg-dark-50/50 rounded-lg p-3 space-y-2.5">
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] font-bold text-dark-400 uppercase tracking-wider">
                                  Entry {i + 1}
                                </span>
                                <button
                                  onClick={() =>
                                    setCvData((d) => ({
                                      ...d,
                                      education: d.education.filter((e) => e.id !== edu.id),
                                    }))
                                  }
                                  className="p-1 text-red-400 hover:text-red-600"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                              <input
                                value={edu.degree}
                                onChange={(e) => updateEducation(edu.id, "degree", e.target.value)}
                                placeholder="Degree (e.g. MSc)"
                                className={INPUT}
                              />
                              <input
                                value={edu.field_of_study}
                                onChange={(e) => updateEducation(edu.id, "field_of_study", e.target.value)}
                                placeholder="Field of study"
                                className={INPUT}
                              />
                              <input
                                value={edu.institution}
                                onChange={(e) => updateEducation(edu.id, "institution", e.target.value)}
                                placeholder="Institution"
                                className={INPUT}
                              />
                              <div className="grid grid-cols-2 gap-2">
                                <input
                                  value={edu.country}
                                  onChange={(e) => updateEducation(edu.id, "country", e.target.value)}
                                  placeholder="Country"
                                  className={INPUT}
                                />
                                <input
                                  type="number"
                                  value={edu.year_graduated || ""}
                                  onChange={(e) =>
                                    updateEducation(edu.id, "year_graduated", parseInt(e.target.value) || 0)
                                  }
                                  placeholder="Year"
                                  className={INPUT}
                                />
                              </div>
                            </div>
                          ))}
                          <button
                            onClick={() =>
                              setCvData((d) => ({ ...d, education: [...d.education, newEducation()] }))
                            }
                            className="flex items-center gap-2 w-full py-2.5 justify-center text-xs font-bold text-cyan-600 border border-dashed border-cyan-300 rounded-lg hover:bg-cyan-50 transition-colors"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            Add Education
                          </button>
                        </div>
                      )}

                      {/* Employment */}
                      {key === "employment" && (
                        <div className="space-y-4">
                          {cvData.employment.map((emp, i) => (
                            <div key={emp.id} className="relative bg-dark-50/50 rounded-lg p-3 space-y-2.5">
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] font-bold text-dark-400 uppercase tracking-wider">
                                  Position {i + 1}
                                </span>
                                <button
                                  onClick={() =>
                                    setCvData((d) => ({
                                      ...d,
                                      employment: d.employment.filter((e) => e.id !== emp.id),
                                    }))
                                  }
                                  className="p-1 text-red-400 hover:text-red-600"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                              <input
                                value={emp.position}
                                onChange={(e) => updateEmployment(emp.id, "position", e.target.value)}
                                placeholder="Position / Title"
                                className={INPUT}
                              />
                              <input
                                value={emp.employer}
                                onChange={(e) => updateEmployment(emp.id, "employer", e.target.value)}
                                placeholder="Employer / Organization"
                                className={INPUT}
                              />
                              <div className="grid grid-cols-3 gap-2">
                                <input
                                  value={emp.from_date}
                                  onChange={(e) => updateEmployment(emp.id, "from_date", e.target.value)}
                                  placeholder="From (YYYY-MM)"
                                  className={INPUT}
                                />
                                <input
                                  value={emp.to_date}
                                  onChange={(e) => updateEmployment(emp.id, "to_date", e.target.value)}
                                  placeholder="To / Present"
                                  className={INPUT}
                                />
                                <input
                                  value={emp.country}
                                  onChange={(e) => updateEmployment(emp.id, "country", e.target.value)}
                                  placeholder="Country"
                                  className={INPUT}
                                />
                              </div>
                              <textarea
                                value={emp.description_of_duties}
                                onChange={(e) =>
                                  updateEmployment(emp.id, "description_of_duties", e.target.value)
                                }
                                placeholder="Description of duties and achievements..."
                                rows={3}
                                className={TEXTAREA}
                              />
                            </div>
                          ))}
                          <button
                            onClick={() =>
                              setCvData((d) => ({
                                ...d,
                                employment: [...d.employment, newEmployment()],
                              }))
                            }
                            className="flex items-center gap-2 w-full py-2.5 justify-center text-xs font-bold text-cyan-600 border border-dashed border-cyan-300 rounded-lg hover:bg-cyan-50 transition-colors"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            Add Employment
                          </button>
                        </div>
                      )}

                      {/* Languages */}
                      {key === "languages" && (
                        <div className="space-y-4">
                          {cvData.languages.map((lang, i) => (
                            <div key={lang.id} className="relative bg-dark-50/50 rounded-lg p-3 space-y-2.5">
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] font-bold text-dark-400 uppercase tracking-wider">
                                  Language {i + 1}
                                </span>
                                <button
                                  onClick={() =>
                                    setCvData((d) => ({
                                      ...d,
                                      languages: d.languages.filter((l) => l.id !== lang.id),
                                    }))
                                  }
                                  className="p-1 text-red-400 hover:text-red-600"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                              <input
                                value={lang.language}
                                onChange={(e) => updateLanguage(lang.id, "language", e.target.value)}
                                placeholder="Language name"
                                className={INPUT}
                              />
                              <div className="grid grid-cols-3 gap-2">
                                {(["reading", "writing", "speaking"] as const).map((skill) => (
                                  <div key={skill}>
                                    <label className="text-[10px] text-dark-400 font-medium capitalize mb-0.5 block">
                                      {skill}
                                    </label>
                                    <select
                                      value={lang[skill]}
                                      onChange={(e) => updateLanguage(lang.id, skill, e.target.value)}
                                      className={`${INPUT} appearance-none`}
                                    >
                                      {PROFICIENCY.map((p) => (
                                        <option key={p} value={p}>{p}</option>
                                      ))}
                                    </select>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                          <button
                            onClick={() =>
                              setCvData((d) => ({
                                ...d,
                                languages: [...d.languages, newLanguage()],
                              }))
                            }
                            className="flex items-center gap-2 w-full py-2.5 justify-center text-xs font-bold text-cyan-600 border border-dashed border-cyan-300 rounded-lg hover:bg-cyan-50 transition-colors"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            Add Language
                          </button>
                        </div>
                      )}

                      {/* Qualifications */}
                      {key === "qualifications" && (
                        <textarea
                          value={cvData.key_qualifications}
                          onChange={(e) =>
                            setCvData((d) => ({ ...d, key_qualifications: e.target.value }))
                          }
                          placeholder="Key qualifications, skills, and competencies..."
                          rows={4}
                          className={TEXTAREA}
                        />
                      )}

                      {/* Certifications (tag input) */}
                      {key === "certifications" && (
                        <div>
                          <div className="flex flex-wrap gap-1.5 mb-2">
                            {cvData.certifications.map((c) => (
                              <span
                                key={c}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-teal-50 text-teal-700 border border-teal-200"
                              >
                                {c}
                                <button onClick={() => removeTag("certifications", c)}>
                                  <X className="w-3 h-3" />
                                </button>
                              </span>
                            ))}
                          </div>
                          <div className="flex gap-2">
                            <input
                              value={certInput}
                              onChange={(e) => setCertInput(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  addTag("certifications", certInput, setCertInput);
                                }
                              }}
                              placeholder="Add certification..."
                              className={`${INPUT} flex-1`}
                            />
                            <button
                              onClick={() => addTag("certifications", certInput, setCertInput)}
                              className="px-3 py-2 rounded-lg bg-teal-500 text-white text-xs font-bold shrink-0"
                            >
                              Add
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Countries (tag input) */}
                      {key === "countries" && (
                        <div>
                          <div className="flex flex-wrap gap-1.5 mb-2">
                            {cvData.countries_of_experience.map((c) => (
                              <span
                                key={c}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-cyan-50 text-cyan-700 border border-cyan-200"
                              >
                                {c}
                                <button onClick={() => removeTag("countries_of_experience", c)}>
                                  <X className="w-3 h-3" />
                                </button>
                              </span>
                            ))}
                          </div>
                          <div className="flex gap-2">
                            <input
                              value={countryInput}
                              onChange={(e) => setCountryInput(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  addTag("countries_of_experience", countryInput, setCountryInput);
                                }
                              }}
                              placeholder="Add country..."
                              className={`${INPUT} flex-1`}
                            />
                            <button
                              onClick={() =>
                                addTag("countries_of_experience", countryInput, setCountryInput)
                              }
                              className="px-3 py-2 rounded-lg bg-cyan-500 text-white text-xs font-bold shrink-0"
                            >
                              Add
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Action buttons */}
          <div className="mt-5 space-y-2.5">
            <button
              onClick={() => setPhase("template")}
              disabled={filledCount < 2}
              className="w-full py-3.5 rounded-xl bg-gradient-to-r from-cyan-500 to-teal-500 text-white font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-40 active:scale-[0.98] transition-transform"
            >
              {!profile?.cv_structured_data ? (
                <>
                  <CheckCircle className="w-4 h-4" />
                  Save &amp; Continue
                </>
              ) : (
                <>
                  Choose Template
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>

          </div>

        </div>
      )}

      {/* ══════════════ TEMPLATE PHASE (with CV summary) ══════════════ */}
      {phase === "template" && (
        <div className="px-4 mt-4 space-y-4">
          {/* ── Compact CV Summary ── */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-base font-extrabold text-dark-900">My CV</h2>
              <button
                onClick={() => setPhase("editing")}
                className="text-xs text-cyan-600 font-semibold"
              >
                Edit CV
              </button>
            </div>

            {/* Name card */}
            <div className="bg-gradient-to-r from-cyan-500 to-teal-500 rounded-xl p-4 mb-3">
              <p className="text-white font-bold text-lg">{cvData.personal.full_name || "—"}</p>
              <p className="text-white/70 text-xs mt-0.5">
                {[cvData.personal.email, cvData.personal.phone].filter(Boolean).join(" · ") || "No contact info"}
              </p>
            </div>

            {/* Collapsible sections */}
            <div className="space-y-1.5">
              {[
                { key: "summary", label: "Professional Summary", icon: FileText, content: cvData.professional_summary ? <p className="text-xs text-dark-500 leading-relaxed line-clamp-3">{cvData.professional_summary}</p> : null },
                { key: "education", label: `Education (${cvData.education.filter(e => e.degree).length})`, icon: GraduationCap, content: cvData.education.filter(e => e.degree).length > 0 ? <div className="space-y-1">{cvData.education.filter(e => e.degree).map((e, i) => <p key={i} className="text-xs text-dark-500"><span className="font-semibold text-dark-700">{e.degree}</span> — {e.institution} ({e.year_graduated})</p>)}</div> : null },
                { key: "employment", label: `Experience (${cvData.employment.filter(e => e.employer).length})`, icon: Briefcase, content: cvData.employment.filter(e => e.employer).length > 0 ? <div className="space-y-1">{cvData.employment.filter(e => e.employer).map((e, i) => <p key={i} className="text-xs text-dark-500"><span className="font-semibold text-dark-700">{e.position}</span> — {e.employer} ({e.from_date}–{e.to_date})</p>)}</div> : null },
                { key: "languages", label: `Languages (${cvData.languages.filter(l => l.language).length})`, icon: Languages, content: cvData.languages.filter(l => l.language).length > 0 ? <p className="text-xs text-dark-500">{cvData.languages.filter(l => l.language).map(l => l.language).join(", ")}</p> : null },
                { key: "qualifications", label: "Key Qualifications", icon: Award, content: cvData.key_qualifications ? <p className="text-xs text-dark-500 leading-relaxed line-clamp-2">{cvData.key_qualifications}</p> : null },
                { key: "certifications", label: `Certifications (${cvData.certifications.filter(Boolean).length})`, icon: BookOpen, content: cvData.certifications.filter(Boolean).length > 0 ? <p className="text-xs text-dark-500">{cvData.certifications.filter(Boolean).join(", ")}</p> : null },
              ].filter(s => s.content).map((section) => {
                const Icon = section.icon;
                const isOpen = openSections.has(section.key);
                return (
                  <button
                    key={section.key}
                    onClick={() => setOpenSections(prev => {
                      const next = new Set(prev);
                      if (next.has(section.key)) next.delete(section.key);
                      else next.add(section.key);
                      return next;
                    })}
                    className="w-full text-left rounded-lg border border-dark-100 bg-white overflow-hidden"
                  >
                    <div className="flex items-center gap-2.5 px-3 py-2.5">
                      <Icon className="w-3.5 h-3.5 text-cyan-500 flex-shrink-0" />
                      <span className="text-xs font-semibold text-dark-700 flex-1">{section.label}</span>
                      {isOpen ? <ChevronUp className="w-3.5 h-3.5 text-dark-300" /> : <ChevronDown className="w-3.5 h-3.5 text-dark-300" />}
                    </div>
                    {isOpen && (
                      <div className="px-3 pb-2.5 pt-0 border-t border-dark-50">
                        {section.content}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── CV Score (permanent, auto-scored) ── */}
          <div className="rounded-xl border border-dark-100 bg-white overflow-hidden">
            {scoreResult ? (
              /* ── Standing score — always visible ── */
              <div className="p-4">
                <h3 className="text-[10px] font-bold text-dark-400 uppercase tracking-wider mb-3">Your CV Score</h3>
                <div className="flex items-center gap-4 mb-3">
                  <div className={`w-16 h-16 rounded-full flex items-center justify-center text-white font-extrabold text-xl ${
                    scoreResult.overall_score >= 70 ? "bg-emerald-500" :
                    scoreResult.overall_score >= 50 ? "bg-amber-500" : "bg-red-500"
                  }`}>
                    {scoreResult.overall_score}
                  </div>
                  <div className="flex-1">
                    <p className="text-xs font-semibold text-dark-700">
                      {scoreResult.overall_score >= 70 ? "Strong CV" :
                       scoreResult.overall_score >= 50 ? "Decent — room to improve" : "Needs work"}
                    </p>
                    <p className="text-[10px] text-dark-400 mt-0.5">
                      GIZ · World Bank · EU · UN standards
                    </p>
                  </div>
                </div>
                {scoreResult.dimensions && (
                  <div className="space-y-1.5">
                    {scoreResult.dimensions.map((d, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <span className="text-[10px] text-dark-500 w-24 truncate">{d.name}</span>
                        <div className="flex-1 h-1.5 bg-dark-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-700 ${
                              d.score >= 70 ? "bg-emerald-500" :
                              d.score >= 50 ? "bg-amber-500" : "bg-red-400"
                            }`}
                            style={{ width: `${d.score}%` }}
                          />
                        </div>
                        <span className="text-[10px] font-bold text-dark-600 w-6 text-right">{d.score}</span>
                      </div>
                    ))}
                  </div>
                )}
                {scoreResult.top_3_improvements && scoreResult.top_3_improvements.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-dark-50">
                    <p className="text-[10px] font-bold text-dark-500 uppercase tracking-wider mb-1.5">How to improve</p>
                    <ul className="space-y-1">
                      {scoreResult.top_3_improvements.map((tip, i) => (
                        <li key={i} className="text-[11px] text-dark-600 flex gap-1.5">
                          <TrendingUp className="w-3 h-3 text-amber-500 shrink-0 mt-0.5" />
                          <span>{tip}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ) : scoring ? (
              /* ── Scoring in progress (auto-triggered or manual) ── */
              <div className="p-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-indigo-50 flex items-center justify-center shrink-0">
                    <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-bold text-dark-900">
                      Scoring your CV...
                    </p>
                    <p className="text-[10px] text-dark-400 mt-0.5">
                      Takes about 30 seconds
                    </p>
                    {/* Animated progress bar */}
                    <div className="mt-2 h-1 bg-dark-100 rounded-full overflow-hidden">
                      <div className="h-full bg-indigo-400 rounded-full animate-pulse" style={{ width: "60%", animationDuration: "1.5s" }} />
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              /* ── Not yet scored — will auto-trigger, but show manual button too ── */
              <button
                onClick={handleScoreCv}
                className="w-full p-4 flex items-center gap-3 hover:bg-dark-50 transition-colors"
              >
                <div className="w-10 h-10 rounded-lg bg-indigo-50 flex items-center justify-center shrink-0">
                  <BarChart3 className="w-5 h-5 text-indigo-500" />
                </div>
                <div className="text-left flex-1">
                  <p className="text-sm font-bold text-dark-900">Score My CV</p>
                  <p className="text-[11px] text-dark-400">See how you rank against donor standards</p>
                </div>
                <Sparkles className="w-4 h-4 text-indigo-400" />
              </button>
            )}
          </div>

          {/* ── Template Picker ── */}
          <div>
            <h3 className="text-sm font-bold text-dark-900 mb-2">Export as</h3>
            <div className="space-y-2">
              {TEMPLATES.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setSelectedTemplate(t.id)}
                  className={`w-full text-left p-3.5 rounded-xl border-2 transition-colors ${
                    selectedTemplate === t.id
                      ? "border-cyan-500 bg-cyan-50/50"
                      : "border-dark-100 bg-white"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                      selectedTemplate === t.id
                        ? "border-cyan-500 bg-cyan-500"
                        : "border-dark-200"
                    }`}>
                      {selectedTemplate === t.id && (
                        <div className="w-1.5 h-1.5 rounded-full bg-white" />
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-dark-900">{t.label}</p>
                      <p className="text-[11px] text-dark-400">{t.desc}</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={handleGenerate}
            disabled={isProcessing}
            className="w-full py-3.5 rounded-xl bg-gradient-to-r from-cyan-500 to-teal-500 text-white font-bold text-sm disabled:opacity-50 flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
          >
            <Download className="w-4 h-4" />
            Generate &amp; Download
          </button>
        </div>
      )}

      {/* ══════════════ GENERATING PHASE ══════════════ */}
      {phase === "generating" && (
        <div className="px-4 mt-16 text-center">
          <Loader2 className="w-10 h-10 animate-spin text-cyan-500 mx-auto" />
          <h2 className="text-lg font-bold text-dark-900 mt-4">
            Building your CV...
          </h2>
          <p className="text-sm text-dark-400 mt-1">
            Generating {TEMPLATES.find((t) => t.id === selectedTemplate)?.label} format and sending to your chat
          </p>
        </div>
      )}

      {/* ══════════════ DOWNLOAD PHASE ══════════════ */}
      {phase === "download" && docxResult && (
        <div className="px-4 mt-6">
          <div className="bg-gradient-to-br from-dark-900 to-dark-800 rounded-2xl p-6 text-center relative overflow-hidden">
            <div
              className="absolute inset-0 opacity-5"
              style={{
                backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.5) 1px, transparent 1px)",
                backgroundSize: "14px 14px",
              }}
            />
            <div className="relative z-10">
              <CheckCircle className="w-12 h-12 text-emerald-400 mx-auto mb-3" />
              {docxResult.mode === "telegram" ? (
                <>
                  <h2 className="text-xl font-extrabold text-white">CV Sent!</h2>
                  <p className="text-sm text-white/70 mt-1">
                    Check your Telegram chat — the file was sent by the bot.
                  </p>
                </>
              ) : (
                <>
                  <h2 className="text-xl font-extrabold text-white">CV Ready!</h2>
                  <p className="text-sm text-white/60 mt-1">{docxResult.filename}</p>
                </>
              )}
            </div>
          </div>

          <button
            onClick={handleDownload}
            className="w-full mt-4 py-3.5 rounded-xl bg-gradient-to-r from-cyan-500 to-teal-500 text-white font-bold text-sm flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
          >
            <Download className="w-4 h-4" />
            {docxResult.mode === "telegram" ? "Open Chat" : "Download DOCX"}
          </button>

          <div className="flex gap-3 mt-3">
            <button
              onClick={() => setPhase("editing")}
              className="flex-1 py-3 rounded-xl border-2 border-dark-200 text-dark-600 font-bold text-xs flex items-center justify-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Edit & Regenerate
            </button>
            <button
              onClick={() => setPhase("template")}
              className="flex-1 py-3 rounded-xl border-2 border-dark-200 text-dark-600 font-bold text-xs flex items-center justify-center gap-1.5"
            >
              <FileText className="w-3.5 h-3.5" />
              Change Template
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
