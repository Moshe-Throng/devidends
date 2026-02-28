"use client";

import { useState, useRef, useCallback } from "react";
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
  Target,
  Plus,
  Trash2,
  Loader2,
  ExternalLink,
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

/* ─── Constants ────────────────────────────────────────────── */

const PROFICIENCY_OPTIONS: ProficiencyLevel[] = [
  "Excellent",
  "Good",
  "Fair",
  "None",
];

const EXTRACT_MESSAGES = [
  "Parsing document\u2026",
  "Extracting personal information\u2026",
  "Identifying work history\u2026",
  "Mapping education\u2026",
  "Detecting languages & skills\u2026",
  "Finalizing structured data\u2026",
];

const SECTIONS = [
  { key: "personal", label: "Personal Information", icon: User, num: 1 },
  { key: "summary", label: "Professional Summary", icon: FileText, num: 2 },
  { key: "education", label: "Education", icon: GraduationCap, num: 3 },
  { key: "employment", label: "Employment Record", icon: Briefcase, num: 4 },
  { key: "languages", label: "Languages", icon: Languages, num: 5 },
  { key: "qualifications", label: "Key Qualifications", icon: Award, num: 6 },
  { key: "countries", label: "Countries of Experience", icon: Globe, num: 7 },
  {
    key: "optional",
    label: "Associations & Publications",
    icon: BookOpen,
    num: 8,
  },
];

/* ─── Helpers ──────────────────────────────────────────────── */

const INPUT =
  "w-full px-4 py-3 rounded-xl border border-dark-100 text-sm text-dark-900 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 placeholder:text-dark-300 transition-colors";
const TEXTAREA = `${INPUT} resize-none`;
const SELECT = `${INPUT} appearance-none bg-white`;

function isSectionFilled(data: StructuredCvData, key: string): boolean {
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
    case "countries":
      return data.countries_of_experience.length > 0;
    case "optional":
      return true; // always counts
    default:
      return false;
  }
}

function filledCount(data: StructuredCvData): number {
  return SECTIONS.filter((s) => isSectionFilled(data, s.key)).length;
}

/* ─── Main Page ────────────────────────────────────────────── */

export default function PocCvBuilderPage() {
  /* Phase */
  const [phase, setPhase] = useState<BuilderPhase>("entry");

  /* Data */
  const [cvData, setCvData] = useState<StructuredCvData>(emptyCvData());
  const [confidence, setConfidence] = useState(0);

  /* Upload */
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  /* Extract animation */
  const [extractStep, setExtractStep] = useState(0);

  /* Editor */
  const [openSections, setOpenSections] = useState<Set<string>>(
    new Set(["personal", "summary", "education", "employment"])
  );

  /* Country tag input */
  const [countryInput, setCountryInput] = useState("");

  /* Template */
  const [selectedTemplate, setSelectedTemplate] = useState<
    "wb-standard" | "custom"
  >("wb-standard");

  /* Download */
  const [docxResult, setDocxResult] = useState<{
    filename: string;
    docx_base64: string;
  } | null>(null);

  /* ─── Handlers ─────────────────────────────────────────── */

  const validateFile = useCallback((f: File): string | null => {
    const ext = f.name.split(".").pop()?.toLowerCase();
    if (ext !== "pdf" && ext !== "docx")
      return "Only PDF and DOCX files accepted.";
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

  const handleExtract = async () => {
    if (!file) return;
    setPhase("extracting");
    setExtractStep(0);
    setError(null);

    const iv = setInterval(
      () => setExtractStep((s) => (s + 1) % EXTRACT_MESSAGES.length),
      2000
    );

    try {
      const fd = new FormData();
      fd.append("file", file);

      const res = await fetch("/api/cv/extract", {
        method: "POST",
        body: fd,
      });
      const json = await res.json();

      clearInterval(iv);

      if (!json.success) throw new Error(json.error || "Extraction failed");

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
    }
  };

  const handleGenerate = async () => {
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

      setDocxResult({ filename: json.filename, docx_base64: json.docx_base64 });
      setPhase("download");
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Generation failed."
      );
      setPhase("template");
    }
  };

  const handleDownload = () => {
    if (!docxResult) return;
    const byteChars = atob(docxResult.docx_base64);
    const byteArray = new Uint8Array(byteChars.length);
    for (let i = 0; i < byteChars.length; i++) {
      byteArray[i] = byteChars.charCodeAt(i);
    }
    const blob = new Blob([byteArray], {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
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

  /* ─── Data updaters ────────────────────────────────────── */

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

  const addCountry = () => {
    const trimmed = countryInput.trim();
    if (!trimmed || cvData.countries_of_experience.includes(trimmed)) return;
    setCvData((d) => ({
      ...d,
      countries_of_experience: [...d.countries_of_experience, trimmed],
    }));
    setCountryInput("");
  };

  const removeCountry = (c: string) => {
    setCvData((d) => ({
      ...d,
      countries_of_experience: d.countries_of_experience.filter(
        (x) => x !== c
      ),
    }));
  };

  /* ─── Section render helpers ───────────────────────────── */

  const filled = filledCount(cvData);

  const renderSectionHeader = (
    sKey: string,
    sLabel: string,
    SIcon: typeof User,
    sNum: number
  ) => {
    const isOpen = openSections.has(sKey);
    const done = isSectionFilled(cvData, sKey);
    const isOptional = sKey === "optional";

    return (
      <button
        onClick={() => toggleSection(sKey)}
        className="w-full flex items-center gap-4 p-5 hover:bg-dark-50/30 transition-colors"
      >
        <div
          className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${
            done
              ? "bg-gradient-to-br from-cyan-500 to-teal-400 text-white shadow-md shadow-cyan-500/20"
              : "bg-dark-100 text-dark-500"
          }`}
        >
          {done ? <Check className="w-4 h-4" /> : sNum}
        </div>
        <SIcon className="w-5 h-5 text-dark-400 flex-shrink-0" />
        <div className="flex-1 text-left">
          <span className="text-sm font-bold text-dark-900">{sLabel}</span>
          {isOptional && (
            <span className="ml-2 text-[10px] font-bold text-dark-300 uppercase tracking-wider">
              Optional
            </span>
          )}
        </div>
        <ChevronDown
          className={`w-5 h-5 text-dark-300 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
        />
      </button>
    );
  };

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
              <FileCheck className="w-5 h-5 text-white" />
            </div>
            <span className="text-cyan-400 text-xs font-bold tracking-[0.2em] uppercase">
              PoC 3
            </span>
          </div>
          <h1 className="text-3xl lg:text-5xl font-extrabold text-white tracking-tight">
            CV Builder
          </h1>
          <p className="mt-3 text-dark-300 text-base lg:text-lg max-w-2xl leading-relaxed">
            {phase === "entry" &&
              "Build a donor-ready CV in World Bank / UN format. Upload an existing CV for AI extraction or start from scratch."}
            {(phase === "uploading" || phase === "extracting") &&
              "AI is analyzing your CV and extracting structured data\u2026"}
            {phase === "editing" &&
              "Review and refine your CV data. All sections are editable."}
            {phase === "template" && "Choose a template for your final CV."}
            {phase === "generating" && "Building your document\u2026"}
            {phase === "download" && "Your CV is ready to download."}
          </p>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-10 lg:py-14">
        {/* Error banner */}
        {error && (
          <div className="flex items-center gap-3 p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 mb-8">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <span className="text-sm font-medium">{error}</span>
            <button onClick={() => setError(null)} className="ml-auto">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* ── ENTRY ──────────────────────────────────────── */}
        {phase === "entry" && (
          <div className="animate-fadeInUp">
            <div className="grid md:grid-cols-2 gap-6 max-w-3xl mx-auto">
              {/* Upload existing */}
              <button
                onClick={() => setPhase("uploading")}
                className="group text-left p-8 rounded-2xl border-2 border-dark-100 hover:border-cyan-400 hover:shadow-lg hover:shadow-cyan-500/10 transition-all duration-200"
              >
                <div className="w-14 h-14 rounded-2xl bg-cyan-50 group-hover:bg-cyan-100 flex items-center justify-center mb-5 transition-colors">
                  <Upload className="w-7 h-7 text-cyan-500" />
                </div>
                <h3 className="text-lg font-extrabold text-dark-900 mb-2">
                  Upload Existing CV
                </h3>
                <p className="text-sm text-dark-400 leading-relaxed">
                  AI extracts your data into a structured format. Supports PDF
                  and DOCX files.
                </p>
              </button>

              {/* Start from scratch */}
              <button
                onClick={() => {
                  setCvData(emptyCvData());
                  setPhase("editing");
                }}
                className="group text-left p-8 rounded-2xl border-2 border-dark-100 hover:border-teal-400 hover:shadow-lg hover:shadow-teal-500/10 transition-all duration-200"
              >
                <div className="w-14 h-14 rounded-2xl bg-teal-50 group-hover:bg-teal-100 flex items-center justify-center mb-5 transition-colors">
                  <PenTool className="w-7 h-7 text-teal-500" />
                </div>
                <h3 className="text-lg font-extrabold text-dark-900 mb-2">
                  Start from Scratch
                </h3>
                <p className="text-sm text-dark-400 leading-relaxed">
                  Fill in your details manually using the guided form editor.
                </p>
              </button>
            </div>
          </div>
        )}

        {/* ── UPLOADING ──────────────────────────────────── */}
        {phase === "uploading" && (
          <div className="max-w-xl mx-auto animate-fadeInUp space-y-6">
            <div
              className={`relative rounded-2xl border-2 border-dashed p-12 text-center transition-all duration-200 cursor-pointer group ${
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
                    {(file.size / 1024).toFixed(0)} KB &middot; Click to change
                  </p>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setFile(null);
                      if (fileRef.current) fileRef.current.value = "";
                    }}
                    className="inline-flex items-center gap-1 text-xs text-dark-400 hover:text-red-500 transition-colors"
                  >
                    <X className="w-3 h-3" /> Remove
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="w-16 h-16 mx-auto rounded-2xl bg-dark-50 group-hover:bg-cyan-50 flex items-center justify-center transition-colors">
                    <Upload
                      className={`w-8 h-8 transition-colors ${isDragging ? "text-cyan-500" : "text-dark-300 group-hover:text-cyan-400"}`}
                    />
                  </div>
                  <p className="font-bold text-dark-700">Drop your CV here</p>
                  <p className="text-dark-400 text-sm">
                    PDF or DOCX &middot; up to 10 MB
                  </p>
                </div>
              )}
            </div>

            <div className="flex items-center gap-4">
              <button
                onClick={() => setPhase("entry")}
                className="inline-flex items-center gap-2 px-5 py-3 rounded-xl border border-dark-200 text-dark-600 font-semibold text-sm hover:bg-dark-50 transition-colors"
              >
                <ArrowLeft className="w-4 h-4" /> Back
              </button>
              <button
                onClick={handleExtract}
                disabled={!file}
                className={`flex-1 inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-bold text-sm transition-all ${
                  file
                    ? "bg-cyan-500 hover:bg-cyan-600 text-white shadow-lg shadow-cyan-500/25"
                    : "bg-dark-100 text-dark-400 cursor-not-allowed"
                }`}
              >
                <Target className="w-4 h-4" /> Extract CV Data
              </button>
            </div>
          </div>
        )}

        {/* ── EXTRACTING ─────────────────────────────────── */}
        {phase === "extracting" && (
          <div className="flex flex-col items-center justify-center py-24 animate-fadeInUp">
            <div className="relative mb-10">
              <div className="w-40 h-40 rounded-full border-4 border-dark-100" />
              <div
                className="absolute inset-0 w-40 h-40 rounded-full border-4 border-transparent border-t-cyan-500 border-r-cyan-300 animate-spin"
                style={{ animationDuration: "1.2s" }}
              />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-16 h-16 rounded-full bg-gradient-to-br from-cyan-500 to-teal-400 flex items-center justify-center shadow-xl shadow-cyan-500/30 animate-pulse">
                  <FileText className="w-8 h-8 text-white" />
                </div>
              </div>
            </div>

            <p className="text-xl font-bold text-dark-900 animate-fadeInUp" key={extractStep}>
              {EXTRACT_MESSAGES[extractStep]}
            </p>
            <p className="text-sm text-dark-400 mt-2">
              This usually takes 10&ndash;20 seconds
            </p>

            <div className="flex gap-2 mt-10">
              {EXTRACT_MESSAGES.map((_, i) => (
                <div
                  key={i}
                  className={`h-2 rounded-full transition-all duration-500 ${
                    i === extractStep
                      ? "bg-cyan-500 w-8"
                      : i < extractStep
                        ? "bg-cyan-300 w-2"
                        : "bg-dark-200 w-2"
                  }`}
                />
              ))}
            </div>
          </div>
        )}

        {/* ── EDITING ────────────────────────────────────── */}
        {phase === "editing" && (
          <div className="animate-fadeInUp space-y-6">
            {/* Confidence badge */}
            {confidence > 0 && (
              <div className="flex items-center gap-3 p-4 rounded-xl bg-cyan-50/60 border border-cyan-100">
                <Target className="w-5 h-5 text-cyan-500 flex-shrink-0" />
                <p className="text-sm text-dark-600">
                  AI extracted your data with{" "}
                  <span className="font-bold text-cyan-600">
                    {Math.round(confidence * 100)}% confidence
                  </span>
                  . Please review and adjust below.
                </p>
              </div>
            )}

            {/* Progress bar */}
            <div className="flex items-center gap-4">
              <div className="flex-1 h-2 bg-dark-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-cyan-500 to-teal-400 rounded-full transition-all duration-500"
                  style={{ width: `${(filled / 8) * 100}%` }}
                />
              </div>
              <span className="text-xs font-bold text-dark-500">
                {filled}/8 sections
              </span>
            </div>

            {/* Sections */}
            <div className="space-y-3">
              {SECTIONS.map((sec) => (
                <div
                  key={sec.key}
                  className="border border-dark-100 rounded-2xl overflow-hidden transition-shadow hover:shadow-sm"
                >
                  {renderSectionHeader(sec.key, sec.label, sec.icon, sec.num)}

                  {openSections.has(sec.key) && (
                    <div className="px-5 pb-6 border-t border-dark-50">
                      {/* ─ Personal ─ */}
                      {sec.key === "personal" && (
                        <div className="grid md:grid-cols-2 gap-4 mt-4">
                          <div className="md:col-span-2">
                            <label className="text-[10px] font-bold text-dark-500 uppercase tracking-wider mb-1.5 block">
                              Full Name *
                            </label>
                            <input
                              className={INPUT}
                              value={cvData.personal.full_name}
                              onChange={(e) =>
                                updatePersonal("full_name", e.target.value)
                              }
                              placeholder="John Doe"
                            />
                          </div>
                          {[
                            ["nationality", "Nationality", "Ethiopian"],
                            ["date_of_birth", "Date of Birth", "1985-03-15"],
                            ["email", "Email", "john@example.com"],
                            ["phone", "Phone", "+251 911 123456"],
                            ["address", "Address", "Addis Ababa, Ethiopia"],
                            [
                              "country_of_residence",
                              "Country of Residence",
                              "Ethiopia",
                            ],
                          ].map(([field, label, ph]) => (
                            <div key={field}>
                              <label className="text-[10px] font-bold text-dark-500 uppercase tracking-wider mb-1.5 block">
                                {label}
                              </label>
                              <input
                                className={INPUT}
                                value={
                                  (
                                    cvData.personal as unknown as Record<string, string>
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

                      {/* ─ Summary ─ */}
                      {sec.key === "summary" && (
                        <div className="mt-4">
                          <label className="text-[10px] font-bold text-dark-500 uppercase tracking-wider mb-1.5 block">
                            Professional Summary
                          </label>
                          <textarea
                            className={TEXTAREA}
                            rows={4}
                            value={cvData.professional_summary}
                            onChange={(e) =>
                              setCvData((d) => ({
                                ...d,
                                professional_summary: e.target.value,
                              }))
                            }
                            placeholder="2-3 sentences summarizing your sector expertise and years of experience..."
                          />
                          <p className="text-xs text-dark-300 mt-1 text-right">
                            {cvData.professional_summary.length} characters
                          </p>
                        </div>
                      )}

                      {/* ─ Education ─ */}
                      {sec.key === "education" && (
                        <div className="mt-4 space-y-4">
                          {cvData.education.map((edu) => (
                            <div
                              key={edu.id}
                              className="relative p-4 rounded-xl bg-dark-50/50 border border-dark-100 space-y-3"
                            >
                              <button
                                onClick={() =>
                                  setCvData((d) => ({
                                    ...d,
                                    education: d.education.filter(
                                      (e) => e.id !== edu.id
                                    ),
                                  }))
                                }
                                className="absolute top-3 right-3 p-1.5 rounded-lg hover:bg-red-50 text-dark-300 hover:text-red-500 transition-colors"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                              <div className="grid md:grid-cols-2 gap-3 pr-8">
                                <div>
                                  <label className="text-[10px] font-bold text-dark-500 uppercase tracking-wider mb-1 block">
                                    Degree
                                  </label>
                                  <input
                                    className={INPUT}
                                    value={edu.degree}
                                    onChange={(e) =>
                                      updateEducation(
                                        edu.id,
                                        "degree",
                                        e.target.value
                                      )
                                    }
                                    placeholder="Master of Public Health"
                                  />
                                </div>
                                <div>
                                  <label className="text-[10px] font-bold text-dark-500 uppercase tracking-wider mb-1 block">
                                    Field of Study
                                  </label>
                                  <input
                                    className={INPUT}
                                    value={edu.field_of_study}
                                    onChange={(e) =>
                                      updateEducation(
                                        edu.id,
                                        "field_of_study",
                                        e.target.value
                                      )
                                    }
                                    placeholder="Epidemiology"
                                  />
                                </div>
                                <div>
                                  <label className="text-[10px] font-bold text-dark-500 uppercase tracking-wider mb-1 block">
                                    Institution
                                  </label>
                                  <input
                                    className={INPUT}
                                    value={edu.institution}
                                    onChange={(e) =>
                                      updateEducation(
                                        edu.id,
                                        "institution",
                                        e.target.value
                                      )
                                    }
                                    placeholder="Addis Ababa University"
                                  />
                                </div>
                                <div className="flex gap-3">
                                  <div className="flex-1">
                                    <label className="text-[10px] font-bold text-dark-500 uppercase tracking-wider mb-1 block">
                                      Country
                                    </label>
                                    <input
                                      className={INPUT}
                                      value={edu.country}
                                      onChange={(e) =>
                                        updateEducation(
                                          edu.id,
                                          "country",
                                          e.target.value
                                        )
                                      }
                                      placeholder="Ethiopia"
                                    />
                                  </div>
                                  <div className="w-24">
                                    <label className="text-[10px] font-bold text-dark-500 uppercase tracking-wider mb-1 block">
                                      Year
                                    </label>
                                    <input
                                      type="number"
                                      className={INPUT}
                                      value={edu.year_graduated || ""}
                                      onChange={(e) =>
                                        updateEducation(
                                          edu.id,
                                          "year_graduated",
                                          parseInt(e.target.value) || 0
                                        )
                                      }
                                      placeholder="2015"
                                    />
                                  </div>
                                </div>
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
                            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-cyan-200 text-cyan-600 text-sm font-semibold hover:bg-cyan-50 transition-colors"
                          >
                            <Plus className="w-4 h-4" /> Add Education
                          </button>
                        </div>
                      )}

                      {/* ─ Employment ─ */}
                      {sec.key === "employment" && (
                        <div className="mt-4 space-y-4">
                          {cvData.employment.map((emp) => (
                            <div
                              key={emp.id}
                              className="relative p-4 rounded-xl bg-dark-50/50 border border-dark-100 space-y-3"
                            >
                              <button
                                onClick={() =>
                                  setCvData((d) => ({
                                    ...d,
                                    employment: d.employment.filter(
                                      (e) => e.id !== emp.id
                                    ),
                                  }))
                                }
                                className="absolute top-3 right-3 p-1.5 rounded-lg hover:bg-red-50 text-dark-300 hover:text-red-500 transition-colors"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                              <div className="grid md:grid-cols-2 gap-3 pr-8">
                                <div className="flex gap-3">
                                  <div className="flex-1">
                                    <label className="text-[10px] font-bold text-dark-500 uppercase tracking-wider mb-1 block">
                                      From
                                    </label>
                                    <input
                                      className={INPUT}
                                      value={emp.from_date}
                                      onChange={(e) =>
                                        updateEmployment(
                                          emp.id,
                                          "from_date",
                                          e.target.value
                                        )
                                      }
                                      placeholder="2018-01"
                                    />
                                  </div>
                                  <div className="flex-1">
                                    <label className="text-[10px] font-bold text-dark-500 uppercase tracking-wider mb-1 block">
                                      To
                                    </label>
                                    <div className="flex items-center gap-2">
                                      <input
                                        className={`${INPUT} ${emp.to_date === "Present" ? "opacity-50" : ""}`}
                                        value={
                                          emp.to_date === "Present"
                                            ? ""
                                            : emp.to_date
                                        }
                                        disabled={emp.to_date === "Present"}
                                        onChange={(e) =>
                                          updateEmployment(
                                            emp.id,
                                            "to_date",
                                            e.target.value
                                          )
                                        }
                                        placeholder="2021-06"
                                      />
                                    </div>
                                  </div>
                                </div>
                                <div className="flex items-end pb-1">
                                  <label className="inline-flex items-center gap-2 cursor-pointer">
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
                                      className="rounded border-dark-300 text-cyan-500 focus:ring-cyan-500"
                                    />
                                    <span className="text-sm text-dark-600">
                                      Present
                                    </span>
                                  </label>
                                </div>
                                <div>
                                  <label className="text-[10px] font-bold text-dark-500 uppercase tracking-wider mb-1 block">
                                    Employer
                                  </label>
                                  <input
                                    className={INPUT}
                                    value={emp.employer}
                                    onChange={(e) =>
                                      updateEmployment(
                                        emp.id,
                                        "employer",
                                        e.target.value
                                      )
                                    }
                                    placeholder="World Bank"
                                  />
                                </div>
                                <div>
                                  <label className="text-[10px] font-bold text-dark-500 uppercase tracking-wider mb-1 block">
                                    Position
                                  </label>
                                  <input
                                    className={INPUT}
                                    value={emp.position}
                                    onChange={(e) =>
                                      updateEmployment(
                                        emp.id,
                                        "position",
                                        e.target.value
                                      )
                                    }
                                    placeholder="Senior Consultant"
                                  />
                                </div>
                                <div className="md:col-span-2">
                                  <label className="text-[10px] font-bold text-dark-500 uppercase tracking-wider mb-1 block">
                                    Country
                                  </label>
                                  <input
                                    className={INPUT}
                                    value={emp.country}
                                    onChange={(e) =>
                                      updateEmployment(
                                        emp.id,
                                        "country",
                                        e.target.value
                                      )
                                    }
                                    placeholder="Ethiopia"
                                  />
                                </div>
                                <div className="md:col-span-2">
                                  <label className="text-[10px] font-bold text-dark-500 uppercase tracking-wider mb-1 block">
                                    Description of Duties
                                  </label>
                                  <textarea
                                    className={TEXTAREA}
                                    rows={3}
                                    value={emp.description_of_duties}
                                    onChange={(e) =>
                                      updateEmployment(
                                        emp.id,
                                        "description_of_duties",
                                        e.target.value
                                      )
                                    }
                                    placeholder="Key responsibilities and achievements..."
                                  />
                                </div>
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
                            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-cyan-200 text-cyan-600 text-sm font-semibold hover:bg-cyan-50 transition-colors"
                          >
                            <Plus className="w-4 h-4" /> Add Employment
                          </button>
                        </div>
                      )}

                      {/* ─ Languages ─ */}
                      {sec.key === "languages" && (
                        <div className="mt-4 space-y-3">
                          {cvData.languages.map((lang) => (
                            <div
                              key={lang.id}
                              className="flex items-center gap-3 p-3 rounded-xl bg-dark-50/50 border border-dark-100"
                            >
                              <input
                                className={`${INPUT} w-36`}
                                value={lang.language}
                                onChange={(e) =>
                                  updateLanguage(
                                    lang.id,
                                    "language",
                                    e.target.value
                                  )
                                }
                                placeholder="English"
                              />
                              {(
                                ["reading", "writing", "speaking"] as const
                              ).map((skill) => (
                                <div key={skill} className="flex-1 min-w-0">
                                  <label className="text-[9px] font-bold text-dark-400 uppercase tracking-wider mb-1 block text-center">
                                    {skill}
                                  </label>
                                  <select
                                    className={SELECT}
                                    value={lang[skill]}
                                    onChange={(e) =>
                                      updateLanguage(
                                        lang.id,
                                        skill,
                                        e.target.value
                                      )
                                    }
                                  >
                                    {PROFICIENCY_OPTIONS.map((o) => (
                                      <option key={o} value={o}>
                                        {o}
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
                                className="p-1.5 rounded-lg hover:bg-red-50 text-dark-300 hover:text-red-500 transition-colors flex-shrink-0"
                              >
                                <Trash2 className="w-4 h-4" />
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
                            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-cyan-200 text-cyan-600 text-sm font-semibold hover:bg-cyan-50 transition-colors"
                          >
                            <Plus className="w-4 h-4" /> Add Language
                          </button>
                        </div>
                      )}

                      {/* ─ Key Qualifications ─ */}
                      {sec.key === "qualifications" && (
                        <div className="mt-4">
                          <label className="text-[10px] font-bold text-dark-500 uppercase tracking-wider mb-1.5 block">
                            Key Qualifications
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
                            placeholder="Core competencies relevant to international development consulting..."
                          />
                        </div>
                      )}

                      {/* ─ Countries ─ */}
                      {sec.key === "countries" && (
                        <div className="mt-4">
                          <label className="text-[10px] font-bold text-dark-500 uppercase tracking-wider mb-1.5 block">
                            Countries of Work Experience
                          </label>
                          <div className="flex flex-wrap gap-2 mb-3">
                            {cvData.countries_of_experience.map((c) => (
                              <span
                                key={c}
                                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-cyan-50 text-cyan-700 text-xs font-semibold border border-cyan-200"
                              >
                                {c}
                                <button
                                  onClick={() => removeCountry(c)}
                                  className="hover:text-red-500 transition-colors"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </span>
                            ))}
                          </div>
                          <div className="flex gap-2">
                            <input
                              className={`${INPUT} flex-1`}
                              value={countryInput}
                              onChange={(e) => setCountryInput(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  addCountry();
                                }
                              }}
                              placeholder="Type country name and press Enter"
                            />
                            <button
                              onClick={addCountry}
                              className="px-4 py-3 rounded-xl bg-dark-50 text-dark-500 hover:bg-dark-100 transition-colors"
                            >
                              <Plus className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      )}

                      {/* ─ Associations & Publications ─ */}
                      {sec.key === "optional" && (
                        <div className="mt-4 space-y-4">
                          <div>
                            <label className="text-[10px] font-bold text-dark-500 uppercase tracking-wider mb-1.5 block">
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
                                    .filter((s) => s.trim()),
                                }))
                              }
                              placeholder="One per line..."
                            />
                          </div>
                          <div>
                            <label className="text-[10px] font-bold text-dark-500 uppercase tracking-wider mb-1.5 block">
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
                                    .filter((s) => s.trim()),
                                }))
                              }
                              placeholder="One per line..."
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* CTA */}
            <div className="flex justify-between items-center pt-4">
              <button
                onClick={() => setPhase("entry")}
                className="inline-flex items-center gap-2 px-5 py-3 rounded-xl border border-dark-200 text-dark-600 font-semibold text-sm hover:bg-dark-50 transition-colors"
              >
                <ArrowLeft className="w-4 h-4" /> Start Over
              </button>
              <button
                onClick={() => {
                  if (!cvData.personal.full_name.trim()) {
                    setError("Please enter at least your full name.");
                    return;
                  }
                  setPhase("template");
                }}
                className="inline-flex items-center gap-2 px-8 py-3.5 rounded-xl bg-cyan-500 hover:bg-cyan-600 text-white font-bold text-sm shadow-lg shadow-cyan-500/25 hover:shadow-xl hover:shadow-cyan-500/30 transition-all"
              >
                Continue to Template <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* ── TEMPLATE ───────────────────────────────────── */}
        {phase === "template" && (
          <div className="max-w-2xl mx-auto animate-fadeInUp space-y-6">
            <p className="text-xs font-bold text-dark-500 uppercase tracking-[0.15em] mb-4">
              Select Template
            </p>

            {/* WB Standard */}
            <button
              onClick={() => setSelectedTemplate("wb-standard")}
              className={`w-full text-left p-6 rounded-2xl border-2 transition-all ${
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
                      : "border-dark-300"
                  }`}
                >
                  {selectedTemplate === "wb-standard" && (
                    <div className="w-2.5 h-2.5 rounded-full bg-cyan-500" />
                  )}
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-dark-900">
                    World Bank / UN Standard
                  </h3>
                  <p className="text-sm text-dark-400 mt-1">
                    Standard consulting proposal CV format. Used by World Bank,
                    UNDP, GIZ, AfDB, and EU-funded projects.
                  </p>
                </div>
              </div>
            </button>

            {/* Custom template (coming soon) */}
            <div className="relative w-full text-left p-6 rounded-2xl border-2 border-dark-100 opacity-60">
              <div className="flex items-start gap-4">
                <div className="w-5 h-5 rounded-full border-2 border-dark-300 flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-base font-extrabold text-dark-900">
                    Upload Custom Template
                    <span className="ml-2 px-2 py-0.5 rounded-md bg-dark-100 text-dark-400 text-[10px] font-bold uppercase tracking-wider">
                      Coming Soon
                    </span>
                  </h3>
                  <p className="text-sm text-dark-400 mt-1">
                    Upload your own DOCX template with {"{{placeholder}}"} tags
                    for automatic field replacement.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-4 pt-4">
              <button
                onClick={() => setPhase("editing")}
                className="inline-flex items-center gap-2 px-5 py-3 rounded-xl border border-dark-200 text-dark-600 font-semibold text-sm hover:bg-dark-50 transition-colors"
              >
                <ArrowLeft className="w-4 h-4" /> Back to Editor
              </button>
              <button
                onClick={handleGenerate}
                className="flex-1 inline-flex items-center justify-center gap-2 px-8 py-3.5 rounded-xl bg-cyan-500 hover:bg-cyan-600 text-white font-bold text-sm shadow-lg shadow-cyan-500/25 hover:shadow-xl hover:shadow-cyan-500/30 transition-all"
              >
                <FileCheck className="w-4 h-4" /> Generate CV
              </button>
            </div>
          </div>
        )}

        {/* ── GENERATING ─────────────────────────────────── */}
        {phase === "generating" && (
          <div className="flex flex-col items-center justify-center py-24 animate-fadeInUp">
            <Loader2 className="w-16 h-16 text-cyan-500 animate-spin mb-6" />
            <p className="text-xl font-bold text-dark-900">
              Building your CV&hellip;
            </p>
            <p className="text-sm text-dark-400 mt-2">
              Formatting document in World Bank standard
            </p>
          </div>
        )}

        {/* ── DOWNLOAD ───────────────────────────────────── */}
        {phase === "download" && docxResult && (
          <div className="max-w-md mx-auto text-center animate-fadeInUp py-12">
            <div className="w-20 h-20 mx-auto rounded-full bg-green-50 flex items-center justify-center mb-6">
              <Check className="w-10 h-10 text-green-500" />
            </div>
            <h2 className="text-2xl font-extrabold text-dark-900 mb-2">
              Your CV is ready!
            </h2>
            <p className="text-sm text-dark-400 mb-2">
              {docxResult.filename}
            </p>
            <p className="text-xs text-dark-300 mb-8">
              World Bank / UN Standard Format &middot; DOCX
            </p>

            <button
              onClick={handleDownload}
              className="inline-flex items-center gap-3 px-10 py-4 rounded-xl bg-cyan-500 hover:bg-cyan-600 text-white font-bold text-lg shadow-lg shadow-cyan-500/25 hover:shadow-xl hover:shadow-cyan-500/30 hover:-translate-y-0.5 transition-all mb-6"
            >
              <Download className="w-5 h-5" />
              Download CV
            </button>

            <div className="flex flex-col items-center gap-3">
              <button
                onClick={() => setPhase("editing")}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl border border-dark-200 text-dark-600 font-semibold text-sm hover:bg-dark-50 transition-colors"
              >
                <ArrowLeft className="w-4 h-4" /> Edit & Regenerate
              </button>
              <a
                href="/poc/cv-scorer"
                className="inline-flex items-center gap-1 text-sm text-cyan-600 hover:text-cyan-700 font-semibold"
              >
                Score This CV <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
