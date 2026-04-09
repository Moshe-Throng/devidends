"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  User,
  MapPin,
  Target,
  Linkedin,
  ChevronRight,
  AlertCircle,
  Loader2,
  CheckCircle,
  Save,
  Link2,
  Camera,
  Mail,
} from "lucide-react";
import { useTelegram } from "@/components/TelegramProvider";
import { SECTORS, COUNTRIES } from "@/lib/constants";

export default function TgAppProfile() {
  const { tgUser, profile, loading, refreshProfile } = useTelegram();

  /* ─── Always-editable state ────────────────────── */
  const editing = true; // always editable, no toggle
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");

  // Photo upload
  const [photoFileId, setPhotoFileId] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  // Editable fields
  const [headline, setHeadline] = useState("");
  const [selectedSectors, setSelectedSectors] = useState<Set<string>>(new Set());
  const [selectedDonors, setSelectedDonors] = useState<Set<string>>(new Set());
  const [selectedCountries, setSelectedCountries] = useState<Set<string>>(new Set());
  const [qualifications, setQualifications] = useState("");
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [email, setEmail] = useState("");
  const [yearsExp, setYearsExp] = useState("");

  // Populate from profile
  useEffect(() => {
    if (profile) {
      setHeadline(profile.headline || "");
      setSelectedSectors(new Set(profile.sectors || []));
      setSelectedDonors(new Set(profile.donors || []));
      setSelectedCountries(new Set(profile.countries || []));
      setQualifications(profile.qualifications || "");
      setLinkedinUrl(profile.linkedin_url || "");
      setEmail(profile.email || "");
      setYearsExp(profile.years_of_experience != null ? String(profile.years_of_experience) : "");
      setPhotoFileId((profile as any).photo_file_id || null);
    }
  }, [profile]);

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { setSaveMsg("Photo must be under 5MB"); return; }
    setUploadingPhoto(true);
    try {
      const buffer = await file.arrayBuffer();
      const base64 = btoa(new Uint8Array(buffer).reduce((s, b) => s + String.fromCharCode(b), ""));
      const initData = sessionStorage.getItem("tg_init_data");
      if (!initData) throw new Error("Not authenticated");
      const res = await fetch("/api/telegram/upload-photo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initData, imageBase64: base64 }),
      });
      const data = await res.json();
      if (data.success) {
        setPhotoFileId(data.photo_file_id);
        setSaveMsg("Photo updated!");
        refreshProfile();
      } else {
        throw new Error(data.error);
      }
    } catch (err) {
      setSaveMsg(err instanceof Error ? err.message : "Photo upload failed");
    } finally {
      setUploadingPhoto(false);
    }
  }

  async function handleSave() {
    if (!tgUser) return;
    setSaving(true);
    setSaveMsg("");

    try {
      const res = await fetch("/api/telegram/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          initData: sessionStorage.getItem("tg_init_data"),
          updateProfile: {
            headline,
            sectors: Array.from(selectedSectors),
            donors: Array.from(selectedDonors),
            countries: Array.from(selectedCountries),
            qualifications,
            linkedin_url: linkedinUrl,
            email,
            years_of_experience: yearsExp ? parseInt(yearsExp) : null,
          },
        }),
      });

      if (!res.ok) throw new Error("Save failed");

      setSaveMsg("Profile updated!");
      refreshProfile();
    } catch {
      setSaveMsg("Failed to save — try again");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-cyan-500" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen flex flex-col">
        {/* Header with back button */}
        <div className="bg-white border-b border-dark-100 px-4 pt-3 pb-3 sticky top-0 z-30">
          <div className="flex items-center gap-3">
            <Link href="/tg-app" className="text-dark-400 hover:text-dark-600">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <h1 className="text-lg font-extrabold text-dark-900 tracking-tight">
              My Profile
            </h1>
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center px-6">
          <div className="text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-dark-50 flex items-center justify-center mx-auto">
              <User className="w-8 h-8 text-dark-300" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-semibold text-dark-700">
                {tgUser ? `Hi ${tgUser.first_name}!` : "No profile yet"}
              </p>
              <p className="text-xs text-dark-400">
                {tgUser
                  ? "Setting up your profile — tap retry if it doesn't load"
                  : "Open this app from Telegram to create your profile"}
              </p>
            </div>
            <button
              onClick={() => refreshProfile()}
              className="inline-block px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-teal-500 text-white font-bold text-sm"
            >
              Retry
            </button>
            <Link
              href="/tg-app"
              className="block text-xs text-dark-400 font-medium hover:text-dark-600"
            >
              Back to Home
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const profilePct = profile.profile_score_pct ?? 0;

  return (
    <div className="pb-6">
      {/* ── Header ── */}
      <div className="bg-white border-b border-dark-100 px-4 pt-3 pb-3 sticky top-0 z-30">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/tg-app" className="text-dark-400 hover:text-dark-600">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <h1 className="text-lg font-extrabold text-dark-900 tracking-tight">
              My Profile
            </h1>
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 text-xs font-bold text-white px-3 py-1.5 rounded-lg bg-cyan-500 disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            Save
          </button>
        </div>
      </div>

      {/* Save feedback */}
      {saveMsg && (
        <div className={`mx-4 mt-2 px-3 py-2 rounded-lg text-xs font-medium flex items-center gap-2 ${
          saveMsg.includes("updated") ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
        }`}>
          {saveMsg.includes("updated") ? <CheckCircle className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
          {saveMsg}
        </div>
      )}

      {/* ── Profile Card ── */}
      <div className="px-4 mt-4">
        <div className="bg-gradient-to-br from-dark-900 to-dark-800 rounded-2xl p-5 relative overflow-hidden">
          <div
            className="absolute inset-0 opacity-5"
            style={{
              backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.5) 1px, transparent 1px)",
              backgroundSize: "14px 14px",
            }}
          />
          <div className="relative z-10">
            <div className="flex items-start gap-4">
              <div className="relative flex-shrink-0">
                {photoFileId ? (
                  <img
                    src={`/api/img/${photoFileId}`}
                    alt=""
                    className="w-14 h-14 rounded-full border-2 border-white/20 object-cover"
                  />
                ) : (
                  <div className="w-14 h-14 rounded-full bg-white/10 flex items-center justify-center">
                    <User className="w-7 h-7 text-white/60" />
                  </div>
                )}
                <label className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-cyan-500 flex items-center justify-center cursor-pointer shadow-lg">
                  {uploadingPhoto ? (
                    <Loader2 className="w-3 h-3 text-white animate-spin" />
                  ) : (
                    <Camera className="w-3 h-3 text-white" />
                  )}
                  <input type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} disabled={uploadingPhoto} />
                </label>
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-lg font-bold text-white truncate">
                  {profile.name}
                </h2>
                {editing ? (
                  <input
                    value={headline}
                    onChange={(e) => setHeadline(e.target.value)}
                    placeholder="Professional headline"
                    className="w-full mt-1 bg-white/10 border border-white/20 rounded-lg px-3 py-1.5 text-sm text-white placeholder-white/40 focus:outline-none focus:border-cyan-400"
                  />
                ) : profile.headline ? (
                  <p className="text-sm text-cyan-300 mt-0.5 line-clamp-2">{profile.headline}</p>
                ) : null}
              </div>
            </div>

            {/* Score bar */}
            <div className="mt-4">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-medium text-white/60 uppercase tracking-wider">Profile completeness</span>
                <span className="text-xs font-bold text-white">{profilePct}%</span>
              </div>
              <div className="h-2 rounded-full bg-white/10">
                <div
                  className="h-2 rounded-full bg-gradient-to-r from-cyan-400 to-teal-400 transition-all duration-700"
                  style={{ width: `${profilePct}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Details Sections ── */}
      <div className="px-4 mt-5 space-y-4">
        {/* Email link */}
        <div className="bg-white border border-dark-100 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2.5">
            <div className="w-6 h-6 rounded-md bg-cyan-50 flex items-center justify-center">
              <Mail className="w-3.5 h-3.5 text-cyan-600" />
            </div>
            <h3 className="text-xs font-bold text-dark-600 uppercase tracking-wider">Email</h3>
          </div>
          {editing ? (
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com — link your account"
              className="w-full bg-dark-50 border border-dark-200 rounded-lg px-3 py-2 text-sm text-dark-800 placeholder-dark-400 focus:outline-none focus:border-cyan-400"
            />
          ) : profile.email ? (
            <div className="flex items-center gap-2">
              <Link2 className="w-3.5 h-3.5 text-emerald-500" />
              <span className="text-sm text-dark-700">{profile.email}</span>
            </div>
          ) : (
            <p className="text-xs text-dark-400 italic">
              Add email to link with your web account
            </p>
          )}
        </div>

        {/* Sectors */}
        <ChipSection
          icon={Target}
          title="Sectors"
          color="cyan"
          editing={editing}
          options={[...SECTORS]}
          selected={selectedSectors}
          onToggle={(s) => {
            setSelectedSectors((prev) => {
              const next = new Set(prev);
              next.has(s) ? next.delete(s) : next.add(s);
              return next;
            });
          }}
          display={profile.sectors}
        />

        {/* Countries — read-only from CV, not editable here */}
        {profile.countries && profile.countries.length > 0 && (
          <div className="bg-white border border-dark-100 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2.5">
              <div className="w-6 h-6 rounded-md bg-dark-50 flex items-center justify-center">
                <MapPin className="w-3.5 h-3.5 text-dark-500" />
              </div>
              <h3 className="text-xs font-bold text-dark-600 uppercase tracking-wider">Countries</h3>
              <span className="text-[10px] text-dark-300 ml-auto">from CV</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {profile.countries.map((c: string) => (
                <span key={c} className="px-2.5 py-1 rounded-full text-xs font-semibold bg-dark-50 text-dark-700 border border-dark-200">
                  {c}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Years of experience */}
        <div className="bg-white border border-dark-100 rounded-xl px-4 py-3">
          <p className="text-xs text-dark-400 font-medium mb-1">Years of experience</p>
          <input
            type="number"
            value={yearsExp}
            onChange={(e) => setYearsExp(e.target.value)}
            placeholder="0"
            className="w-full bg-dark-50 border border-dark-200 rounded-lg px-3 py-2 text-sm font-bold text-dark-900 focus:outline-none focus:border-cyan-400"
          />
        </div>

      </div>

      {/* Spacer */}
      <div className="h-16" />

      {/* Delete — intentionally subtle */}
      <div className="px-4 pb-8">
        <button
          onClick={async () => {
            if (!confirm("This will permanently delete your profile, CV data, and all associated information. This cannot be undone.")) return;
            if (!confirm("Are you absolutely sure?")) return;
            try {
              const initData = sessionStorage.getItem("tg_init_data");
              await fetch("/api/profile/delete", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ initData }),
              });
              window.location.href = "/tg-app";
            } catch {}
          }}
          className="text-[10px] text-dark-200 hover:text-red-400 transition-colors"
        >
          Delete my data
        </button>
      </div>

    </div>
  );
}

/* ── Chip multi-select section ── */

function ChipSection({
  icon: Icon,
  title,
  color,
  editing,
  options,
  selected,
  onToggle,
  display,
}: {
  icon: React.ElementType;
  title: string;
  color: "cyan" | "teal" | "neutral";
  editing: boolean;
  options: string[];
  selected: Set<string>;
  onToggle: (val: string) => void;
  display?: string[] | null;
}) {
  const iconBg = color === "cyan" ? "bg-cyan-50" : color === "teal" ? "bg-teal-50" : "bg-dark-50";
  const iconColor = color === "cyan" ? "text-cyan-600" : color === "teal" ? "text-teal-600" : "text-dark-500";
  const activeBg = color === "cyan" ? "bg-cyan-50 text-cyan-700 border-cyan-200" : color === "teal" ? "bg-teal-50 text-teal-700 border-teal-200" : "bg-dark-50 text-dark-700 border-dark-200";

  return (
    <div className="bg-white border border-dark-100 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-2.5">
        <div className={`w-6 h-6 rounded-md ${iconBg} flex items-center justify-center`}>
          <Icon className={`w-3.5 h-3.5 ${iconColor}`} />
        </div>
        <h3 className="text-xs font-bold text-dark-600 uppercase tracking-wider">{title}</h3>
        {editing && <span className="text-[10px] text-dark-400 ml-auto">{selected.size} selected</span>}
      </div>
      {editing ? (
        <div className="flex flex-wrap gap-1.5">
          {options.map((opt) => {
            const isActive = selected.has(opt);
            return (
              <button
                key={opt}
                onClick={() => onToggle(opt)}
                className={`px-2.5 py-1.5 rounded-full text-[11px] font-semibold border transition-all ${
                  isActive ? `${activeBg} ring-1 ring-offset-1 ${color === "cyan" ? "ring-cyan-400" : color === "teal" ? "ring-teal-400" : "ring-dark-300"}` : "bg-white text-dark-500 border-dark-100 hover:border-dark-200"
                }`}
              >
                {isActive && "✓ "}{opt}
              </button>
            );
          })}
        </div>
      ) : display && display.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {display.map((s) => (
            <span key={s} className={`px-2.5 py-1 rounded-full text-xs font-semibold ${activeBg} border`}>
              {s}
            </span>
          ))}
        </div>
      ) : (
        <p className="text-xs text-dark-400 italic">Tap to select</p>
      )}
    </div>
  );
}
