"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Save,
  Upload,
  X,
  Plus,
  Check,
  Loader2,
  Eye,
  EyeOff,
  Edit3,
  AlertCircle,
  FileText,
} from "lucide-react";

import { useAuth } from "@/components/AuthProvider";
import { createSupabaseBrowser } from "@/lib/supabase-browser";
import {
  getProfile,
  updateProfile,
  createProfile,
  calculateProfileScore,
} from "@/lib/profiles";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { ScoreRing } from "@/components/ScoreRing";
import type { Profile } from "@/lib/database.types";

/* ─── Constants ───────────────────────────────────────────── */

import { SECTORS, DONORS } from "@/lib/constants";

const PROFILE_TYPES = [
  "Expert",
  "Senior",
  "Mid-level",
  "Junior",
  "Entry",
] as const;

/* ─── Tag Input Component ─────────────────────────────────── */

function TagInput({
  label,
  tags,
  onAdd,
  onRemove,
  placeholder,
}: {
  label: string;
  tags: string[];
  onAdd: (tag: string) => void;
  onRemove: (tag: string) => void;
  placeholder?: string;
}) {
  const [input, setInput] = useState("");

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      const val = input.trim();
      if (val && !tags.includes(val)) {
        onAdd(val);
      }
      setInput("");
    }
  }

  return (
    <div>
      <label className="block text-sm font-bold text-dark-700 mb-2">
        {label}
      </label>

      {/* Tag chips */}
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3">
          {tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-dark-50 text-dark-700 text-xs font-semibold border border-dark-100 group"
            >
              {tag}
              <button
                type="button"
                onClick={() => onRemove(tag)}
                className="text-dark-400 hover:text-red-500 transition-colors"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="relative">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder || "Type and press Enter to add"}
          className="w-full px-4 py-3 rounded-xl border border-dark-200 bg-white text-sm text-dark-900 placeholder:text-dark-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-400 transition-all"
        />
        <Plus className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-300" />
      </div>
    </div>
  );
}

/* ─── Multi-Select Chip Group ─────────────────────────────── */

function ChipSelect({
  label,
  options,
  selected,
  onToggle,
  colorClass,
}: {
  label: string;
  options: readonly string[];
  selected: string[];
  onToggle: (option: string) => void;
  colorClass: {
    active: string;
    inactive: string;
  };
}) {
  return (
    <div>
      <label className="block text-sm font-bold text-dark-700 mb-3">
        {label}
      </label>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const isSelected = selected.includes(option);
          return (
            <button
              key={option}
              type="button"
              onClick={() => onToggle(option)}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border transition-all duration-200 ${
                isSelected ? colorClass.active : colorClass.inactive
              }`}
            >
              {isSelected && <Check className="w-3 h-3" />}
              {option}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════════ */

export default function ProfileEditPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  /* ─── Loading & state ────────────────────────────────────── */
  const [pageLoading, setPageLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [existingProfile, setExistingProfile] = useState<Profile | null>(null);

  /* ─── CV re-upload state ─────────────────────────────────── */
  const [showCvUpload, setShowCvUpload] = useState(false);
  const [cvUploading, setCvUploading] = useState(false);
  const [cvFile, setCvFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /* ─── Form fields ────────────────────────────────────────── */
  const [name, setName] = useState("");
  const [headline, setHeadline] = useState("");
  const [profileType, setProfileType] = useState<string>("");
  const [yearsOfExperience, setYearsOfExperience] = useState<string>("");
  const [sectors, setSectors] = useState<string[]>([]);
  const [donors, setDonors] = useState<string[]>([]);
  const [countries, setCountries] = useState<string[]>([]);
  const [skills, setSkills] = useState<string[]>([]);
  const [qualifications, setQualifications] = useState("");
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [telegramUsername, setTelegramUsername] = useState("");
  const [phone, setPhone] = useState("");
  const [isPublic, setIsPublic] = useState(false);

  /* ─── Populate form from profile ─────────────────────────── */
  const populateForm = useCallback((p: Profile) => {
    setName(p.name || "");
    setHeadline(p.headline || "");
    setProfileType(p.profile_type || "");
    setYearsOfExperience(
      p.years_of_experience != null ? String(p.years_of_experience) : ""
    );
    setSectors(p.sectors || []);
    setDonors(p.donors || []);
    setCountries(p.countries || []);
    setSkills(p.skills || []);
    setQualifications(p.qualifications || "");
    setLinkedinUrl(p.linkedin_url || "");
    setTelegramUsername(p.telegram_username || "");
    setPhone(p.phone || "");
    setIsPublic(p.is_public ?? false);
  }, []);

  /* ─── Auth guard + fetch profile ─────────────────────────── */
  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push("/login");
      return;
    }

    const supabase = createSupabaseBrowser();
    getProfile(supabase, user.id)
      .then((p) => {
        if (p) {
          setExistingProfile(p);
          populateForm(p);
        }
      })
      .finally(() => setPageLoading(false));
  }, [user, authLoading, router, populateForm]);

  /* ─── Live profile score preview ─────────────────────────── */
  const liveScore = useMemo(() => {
    const draft: Partial<Profile> = {
      name,
      headline: headline || null,
      cv_url: existingProfile?.cv_url || null,
      cv_text: existingProfile?.cv_text || null,
      cv_score: existingProfile?.cv_score ?? null,
      sectors,
      donors,
      countries,
      skills,
      qualifications: qualifications || null,
      years_of_experience:
        yearsOfExperience !== "" ? Number(yearsOfExperience) : null,
      linkedin_url: linkedinUrl || null,
      phone: phone || null,
      telegram_username: telegramUsername || null,
    };
    return calculateProfileScore(draft);
  }, [
    name,
    headline,
    sectors,
    donors,
    countries,
    skills,
    qualifications,
    yearsOfExperience,
    linkedinUrl,
    phone,
    telegramUsername,
    existingProfile,
  ]);

  /* ─── CV re-upload handler ───────────────────────────────── */
  async function handleCvUpload() {
    if (!cvFile) return;

    setCvUploading(true);
    try {
      // Read file as text (for PDF/DOCX we send to API for extraction)
      const formData = new FormData();
      formData.append("file", cvFile);

      // First extract text from the file via the existing CV parse endpoint
      const reader = new FileReader();
      const arrayBuffer = await new Promise<ArrayBuffer>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as ArrayBuffer);
        reader.onerror = reject;
        reader.readAsArrayBuffer(cvFile);
      });

      // Use the file parser to extract text client-side first, then send to extract API
      const textDecoder = new TextDecoder("utf-8");
      const rawText = textDecoder.decode(arrayBuffer);

      // For PDF/DOCX, we rely on the server-side extraction
      // Send to /api/profile/extract
      const res = await fetch("/api/profile/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cv_text: rawText.length > 100 ? rawText : "Unable to parse client-side. File: " + cvFile.name }),
      });

      if (!res.ok) {
        throw new Error("Failed to extract profile from CV");
      }

      const json = await res.json();
      if (json.success && json.data) {
        const d = json.data;
        // Only fill fields that the extraction returned — don't overwrite with empty
        if (d.name) setName(d.name);
        if (d.headline) setHeadline(d.headline);
        if (d.profile_type) setProfileType(d.profile_type);
        if (d.years_of_experience != null)
          setYearsOfExperience(String(d.years_of_experience));
        if (d.sectors?.length) setSectors(d.sectors);
        if (d.donors?.length) setDonors(d.donors);
        if (d.countries?.length) setCountries(d.countries);
        if (d.skills?.length) setSkills(d.skills);
        if (d.qualifications) setQualifications(d.qualifications);
        if (d.linkedin_url) setLinkedinUrl(d.linkedin_url);
      }

      setShowCvUpload(false);
      setCvFile(null);
    } catch (err) {
      console.error("CV upload error:", err);
      setSaveError(
        err instanceof Error ? err.message : "Failed to process CV"
      );
    } finally {
      setCvUploading(false);
    }
  }

  /* ─── Save handler ───────────────────────────────────────── */
  async function handleSave() {
    if (!user) return;
    if (!name.trim()) {
      setSaveError("Name is required");
      return;
    }

    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);

    const profileData: Partial<Profile> = {
      name: name.trim(),
      headline: headline.trim() || null,
      profile_type:
        (profileType as Profile["profile_type"]) || null,
      years_of_experience:
        yearsOfExperience !== "" ? Number(yearsOfExperience) : null,
      sectors,
      donors,
      countries,
      skills,
      qualifications: qualifications.trim() || null,
      linkedin_url: linkedinUrl.trim() || null,
      telegram_username: telegramUsername.trim() || null,
      phone: phone.trim() || null,
      is_public: isPublic,
      email: user.email || null,
    };

    try {
      const supabase = createSupabaseBrowser();

      if (existingProfile) {
        await updateProfile(supabase, user.id, profileData);
      } else {
        await createProfile(supabase, user.id, profileData);
      }

      setSaveSuccess(true);
      setTimeout(() => {
        router.push("/profile");
      }, 800);
    } catch (err) {
      console.error("Save error:", err);
      setSaveError(
        err instanceof Error ? err.message : "Failed to save profile"
      );
    } finally {
      setSaving(false);
    }
  }

  /* ─── Toggle helpers ─────────────────────────────────────── */
  function toggleSector(sector: string) {
    setSectors((prev) =>
      prev.includes(sector)
        ? prev.filter((s) => s !== sector)
        : [...prev, sector]
    );
  }

  function toggleDonor(donor: string) {
    setDonors((prev) =>
      prev.includes(donor)
        ? prev.filter((d) => d !== donor)
        : [...prev, donor]
    );
  }

  /* ─── Loading state ──────────────────────────────────────── */
  if (authLoading || pageLoading) {
    return (
      <div className="min-h-screen bg-white flex flex-col">
        <SiteHeader activeHref="/profile" />
        <div className="h-1 bg-gradient-to-r from-cyan-500 via-teal-400 to-cyan-500" />
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="w-8 h-8 text-cyan-500 animate-spin" />
            <p className="text-sm text-dark-400 font-medium">
              Loading profile editor...
            </p>
          </div>
        </div>
        <SiteFooter />
      </div>
    );
  }

  /* ─── Render ─────────────────────────────────────────────── */
  return (
    <div className="min-h-screen bg-white flex flex-col">
      <SiteHeader activeHref="/profile" />

      {/* Gradient accent strip */}
      <div className="h-1 bg-gradient-to-r from-cyan-500 via-teal-400 to-cyan-500" />

      {/* ══ HERO (compact) ═══════════════════════════════════════ */}
      <section className="relative bg-dark-900 overflow-hidden">
        {/* Dot grid */}
        <div
          className="absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage:
              "radial-gradient(circle, #27ABD2 1px, transparent 1px)",
            backgroundSize: "24px 24px",
          }}
        />
        {/* Glow accents */}
        <div className="absolute -top-40 -right-40 w-[500px] h-[500px] rounded-full bg-cyan-500/10 blur-3xl animate-blobMove" />
        <div
          className="absolute -bottom-32 -left-32 w-[400px] h-[400px] rounded-full bg-teal-500/[0.08] blur-3xl animate-blobMove"
          style={{ animationDelay: "-4s" }}
        />

        {/* Floating accents */}
        <div className="hidden lg:block absolute top-8 right-[12%] w-12 h-12 border-2 border-cyan-400/20 rounded-xl rotate-12 animate-float" />
        <div
          className="hidden lg:block absolute top-16 right-[20%] w-6 h-6 rounded-full bg-teal-400/15 animate-float"
          style={{ animationDelay: "-2s" }}
        />

        <div className="relative max-w-3xl mx-auto px-6 py-10 lg:py-12">
          {/* Back link */}
          <Link
            href="/profile"
            className="inline-flex items-center gap-2 text-sm text-dark-400 hover:text-cyan-400 transition-colors mb-5 animate-staggerFadeUp"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Profile
          </Link>

          <div className="flex items-center justify-between animate-staggerFadeUp" style={{ animationDelay: "0.1s" }}>
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-500 to-teal-400 flex items-center justify-center shadow-lg shadow-cyan-500/25">
                <Edit3 className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl lg:text-3xl font-extrabold text-white tracking-tight">
                  Edit Profile
                </h1>
                <p className="text-dark-400 text-sm mt-0.5">
                  {existingProfile
                    ? "Update your professional profile"
                    : "Create your professional profile"}
                </p>
              </div>
            </div>

            {/* Live score ring */}
            <div
              className="hidden sm:block animate-staggerFadeUp"
              style={{ animationDelay: "0.2s" }}
            >
              <div className="text-center">
                <ScoreRing
                  score={liveScore}
                  size={80}
                  stroke={6}
                  label="complete"
                />
                <p className="text-[10px] text-dark-400 mt-1 font-medium uppercase tracking-wider">
                  Preview
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ══ FORM ═════════════════════════════════════════════════ */}
      <main className="flex-1 max-w-3xl mx-auto w-full px-6 py-10 lg:py-14">
        {/* Mobile score preview */}
        <div className="sm:hidden flex justify-center mb-8 animate-fadeInUp">
          <div className="text-center">
            <ScoreRing
              score={liveScore}
              size={80}
              stroke={6}
              label="complete"
            />
            <p className="text-[10px] text-dark-400 mt-1 font-medium uppercase tracking-wider">
              Profile Score Preview
            </p>
          </div>
        </div>

        {/* ── CV Re-upload ──────────────────────────────────── */}
        <div
          className="border border-dark-100 rounded-2xl p-6 mb-8 animate-fadeInUp"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-cyan-50 flex items-center justify-center">
                <FileText className="w-5 h-5 text-cyan-500" />
              </div>
              <div>
                <p className="text-sm font-bold text-dark-900">
                  Auto-fill from CV
                </p>
                <p className="text-xs text-dark-400 mt-0.5">
                  Upload your CV to pre-fill fields with AI extraction
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowCvUpload(!showCvUpload)}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-teal-500 text-white text-sm font-bold hover:from-cyan-600 hover:to-teal-600 transition-all shadow-sm hover:shadow-md hover:shadow-cyan-500/20"
            >
              <Upload className="w-4 h-4" />
              Re-upload CV
            </button>
          </div>

          {showCvUpload && (
            <div className="mt-5 pt-5 border-t border-dark-100 animate-fadeInUp">
              <div className="flex items-center gap-3">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.docx,.doc"
                  onChange={(e) => setCvFile(e.target.files?.[0] || null)}
                  className="flex-1 text-sm text-dark-500 file:mr-3 file:py-2.5 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-bold file:bg-dark-50 file:text-dark-700 hover:file:bg-dark-100 file:transition-colors file:cursor-pointer"
                />
                <button
                  type="button"
                  onClick={handleCvUpload}
                  disabled={!cvFile || cvUploading}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-dark-900 text-white text-sm font-bold disabled:opacity-50 disabled:cursor-not-allowed hover:bg-dark-800 transition-all"
                >
                  {cvUploading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Extracting...
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4" />
                      Extract
                    </>
                  )}
                </button>
              </div>
              {cvFile && (
                <p className="text-xs text-dark-400 mt-2">
                  Selected: {cvFile.name} ({(cvFile.size / 1024).toFixed(1)} KB)
                </p>
              )}
            </div>
          )}
        </div>

        {/* ── Error / Success messages ──────────────────────── */}
        {saveError && (
          <div className="flex items-center gap-3 p-4 mb-6 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700 animate-fadeInUp">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            {saveError}
          </div>
        )}

        {saveSuccess && (
          <div className="flex items-center gap-3 p-4 mb-6 rounded-xl bg-emerald-50 border border-emerald-200 text-sm text-emerald-700 animate-fadeInUp">
            <Check className="w-5 h-5 flex-shrink-0" />
            Profile saved successfully! Redirecting...
          </div>
        )}

        {/* ── Form cards ────────────────────────────────────── */}
        <div className="space-y-8">
          {/* Card 1: Basic Info */}
          <div
            className="border border-dark-100 rounded-2xl p-6 animate-staggerFadeUp"
            style={{ animationDelay: "0.1s" }}
          >
            <h2 className="text-xs font-bold text-dark-500 uppercase tracking-[0.15em] mb-6">
              Basic Information
            </h2>

            <div className="grid sm:grid-cols-2 gap-5">
              {/* Name */}
              <div className="sm:col-span-2">
                <label className="block text-sm font-bold text-dark-700 mb-2">
                  Full Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your full name"
                  className="w-full px-4 py-3 rounded-xl border border-dark-200 bg-white text-sm text-dark-900 placeholder:text-dark-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-400 transition-all"
                  required
                />
              </div>

              {/* Headline */}
              <div className="sm:col-span-2">
                <label className="block text-sm font-bold text-dark-700 mb-2">
                  Professional Headline
                </label>
                <input
                  type="text"
                  value={headline}
                  onChange={(e) => setHeadline(e.target.value)}
                  placeholder="e.g., Senior M&E Specialist | 12 years with GIZ & World Bank"
                  className="w-full px-4 py-3 rounded-xl border border-dark-200 bg-white text-sm text-dark-900 placeholder:text-dark-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-400 transition-all"
                />
              </div>

              {/* Profile Type */}
              <div>
                <label className="block text-sm font-bold text-dark-700 mb-2">
                  Profile Level
                </label>
                <select
                  value={profileType}
                  onChange={(e) => setProfileType(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-dark-200 bg-white text-sm text-dark-900 focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-400 transition-all appearance-none"
                >
                  <option value="">Select level</option>
                  {PROFILE_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </div>

              {/* Years of Experience */}
              <div>
                <label className="block text-sm font-bold text-dark-700 mb-2">
                  Years of Experience
                </label>
                <input
                  type="number"
                  min={0}
                  max={50}
                  value={yearsOfExperience}
                  onChange={(e) => setYearsOfExperience(e.target.value)}
                  placeholder="e.g., 8"
                  className="w-full px-4 py-3 rounded-xl border border-dark-200 bg-white text-sm text-dark-900 placeholder:text-dark-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-400 transition-all"
                />
              </div>
            </div>
          </div>

          {/* Card 2: Sectors */}
          <div
            className="border border-dark-100 rounded-2xl p-6 animate-staggerFadeUp"
            style={{ animationDelay: "0.15s" }}
          >
            <ChipSelect
              label="Sectors of Expertise"
              options={SECTORS}
              selected={sectors}
              onToggle={toggleSector}
              colorClass={{
                active:
                  "bg-cyan-50 text-cyan-700 border-cyan-200 shadow-sm shadow-cyan-500/10",
                inactive:
                  "bg-white text-dark-500 border-dark-200 hover:border-cyan-300 hover:bg-cyan-50/50",
              }}
            />
          </div>

          {/* Card 3: Donors */}
          <div
            className="border border-dark-100 rounded-2xl p-6 animate-staggerFadeUp"
            style={{ animationDelay: "0.2s" }}
          >
            <ChipSelect
              label="Donor Experience"
              options={DONORS}
              selected={donors}
              onToggle={toggleDonor}
              colorClass={{
                active:
                  "bg-teal-50 text-teal-700 border-teal-200 shadow-sm shadow-teal-500/10",
                inactive:
                  "bg-white text-dark-500 border-dark-200 hover:border-teal-300 hover:bg-teal-50/50",
              }}
            />
          </div>

          {/* Card 4: Countries & Skills */}
          <div
            className="border border-dark-100 rounded-2xl p-6 space-y-6 animate-staggerFadeUp"
            style={{ animationDelay: "0.25s" }}
          >
            <TagInput
              label="Countries of Work"
              tags={countries}
              onAdd={(tag) =>
                setCountries((prev) =>
                  prev.includes(tag) ? prev : [...prev, tag]
                )
              }
              onRemove={(tag) =>
                setCountries((prev) => prev.filter((c) => c !== tag))
              }
              placeholder="e.g., Ethiopia — press Enter to add"
            />

            <div className="border-t border-dark-50" />

            <TagInput
              label="Skills"
              tags={skills}
              onAdd={(tag) =>
                setSkills((prev) =>
                  prev.includes(tag) ? prev : [...prev, tag]
                )
              }
              onRemove={(tag) =>
                setSkills((prev) => prev.filter((s) => s !== tag))
              }
              placeholder="e.g., Monitoring & Evaluation — press Enter to add"
            />
          </div>

          {/* Card 5: Qualifications */}
          <div
            className="border border-dark-100 rounded-2xl p-6 animate-staggerFadeUp"
            style={{ animationDelay: "0.3s" }}
          >
            <label className="block text-sm font-bold text-dark-700 mb-2">
              Qualifications & Education
            </label>
            <textarea
              value={qualifications}
              onChange={(e) => setQualifications(e.target.value)}
              placeholder="e.g., MSc Development Economics, University of Sussex (2015). PMP certified. Fluent in English, Amharic, French."
              rows={4}
              className="w-full px-4 py-3 rounded-xl border border-dark-200 bg-white text-sm text-dark-900 placeholder:text-dark-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-400 transition-all resize-y"
            />
          </div>

          {/* Card 6: Contact & Visibility */}
          <div
            className="border border-dark-100 rounded-2xl p-6 animate-staggerFadeUp"
            style={{ animationDelay: "0.35s" }}
          >
            <h2 className="text-xs font-bold text-dark-500 uppercase tracking-[0.15em] mb-6">
              Contact & Visibility
            </h2>

            <div className="grid sm:grid-cols-2 gap-5">
              {/* LinkedIn */}
              <div>
                <label className="block text-sm font-bold text-dark-700 mb-2">
                  LinkedIn URL
                </label>
                <input
                  type="url"
                  value={linkedinUrl}
                  onChange={(e) => setLinkedinUrl(e.target.value)}
                  placeholder="https://linkedin.com/in/yourname"
                  className="w-full px-4 py-3 rounded-xl border border-dark-200 bg-white text-sm text-dark-900 placeholder:text-dark-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-400 transition-all"
                />
              </div>

              {/* Telegram */}
              <div>
                <label className="block text-sm font-bold text-dark-700 mb-2">
                  Telegram Username
                </label>
                <input
                  type="text"
                  value={telegramUsername}
                  onChange={(e) => setTelegramUsername(e.target.value)}
                  placeholder="@yourusername"
                  className="w-full px-4 py-3 rounded-xl border border-dark-200 bg-white text-sm text-dark-900 placeholder:text-dark-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-400 transition-all"
                />
              </div>

              {/* Phone */}
              <div>
                <label className="block text-sm font-bold text-dark-700 mb-2">
                  Phone Number
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+251 9XX XXX XXXX"
                  className="w-full px-4 py-3 rounded-xl border border-dark-200 bg-white text-sm text-dark-900 placeholder:text-dark-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-400 transition-all"
                />
              </div>

              {/* Public toggle */}
              <div className="flex items-center gap-4 sm:items-end sm:pb-1">
                <div className="flex-1">
                  <label className="block text-sm font-bold text-dark-700 mb-2">
                    Profile Visibility
                  </label>
                  <p className="text-xs text-dark-400">
                    {isPublic
                      ? "Your profile is visible to others"
                      : "Your profile is private"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsPublic(!isPublic)}
                  className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/30 ${
                    isPublic ? "bg-cyan-500" : "bg-dark-200"
                  }`}
                >
                  <span
                    className={`inline-flex items-center justify-center h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform duration-200 ${
                      isPublic ? "translate-x-6" : "translate-x-1"
                    }`}
                  >
                    {isPublic ? (
                      <Eye className="w-3 h-3 text-cyan-500" />
                    ) : (
                      <EyeOff className="w-3 h-3 text-dark-400" />
                    )}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ── Action buttons ────────────────────────────────── */}
        <div className="sticky bottom-0 bg-white/95 backdrop-blur-sm border-t border-dark-100 -mx-6 px-6 py-4 mt-10 flex items-center justify-between gap-3 z-10">
          <Link
            href="/profile"
            className="inline-flex items-center gap-2 px-5 py-3 rounded-xl border-2 border-dark-200 text-dark-600 text-sm font-bold hover:bg-dark-50 hover:border-dark-300 transition-all"
          >
            <X className="w-4 h-4" />
            Cancel
          </Link>

          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !name.trim()}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-teal-500 text-white text-sm font-bold hover:from-cyan-600 hover:to-teal-600 transition-all shadow-lg shadow-cyan-500/20 hover:shadow-xl hover:shadow-cyan-500/30 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-lg"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Saving...
              </>
            ) : saveSuccess ? (
              <>
                <Check className="w-4 h-4" />
                Saved!
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                {existingProfile ? "Save Changes" : "Create Profile"}
              </>
            )}
          </button>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
