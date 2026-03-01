"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  User,
  MapPin,
  Briefcase,
  GraduationCap,
  Target,
  Linkedin,
  Mail,
  ChevronRight,
  AlertCircle,
  Loader2,
  CheckCircle,
  Edit3,
  Save,
  X,
  Link2,
} from "lucide-react";
import { useTelegram } from "@/components/TelegramProvider";
import { SECTORS, DONORS, COUNTRIES } from "@/lib/constants";

export default function TgAppProfile() {
  const { tgUser, profile, loading, refreshProfile } = useTelegram();

  /* ─── Edit state ──────────────────────────────── */
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");

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
    }
  }, [profile]);

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
      setEditing(false);
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
              <p className="text-sm font-semibold text-dark-700">No profile yet</p>
              <p className="text-xs text-dark-400">
                Close and reopen the app to create your profile automatically
              </p>
            </div>
            <Link
              href="/tg-app"
              className="inline-block px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-teal-500 text-white font-bold text-sm"
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
          {!editing ? (
            <button
              onClick={() => setEditing(true)}
              className="flex items-center gap-1.5 text-xs font-bold text-cyan-600 px-3 py-1.5 rounded-lg bg-cyan-50 border border-cyan-200"
            >
              <Edit3 className="w-3.5 h-3.5" />
              Edit
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setEditing(false)}
                className="text-xs font-semibold text-dark-400 px-2 py-1.5"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-1.5 text-xs font-bold text-white px-3 py-1.5 rounded-lg bg-cyan-500 disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                Save
              </button>
            </div>
          )}
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
              {tgUser?.photo_url ? (
                <img
                  src={tgUser.photo_url}
                  alt=""
                  className="w-14 h-14 rounded-full border-2 border-white/20"
                />
              ) : (
                <div className="w-14 h-14 rounded-full bg-white/10 flex items-center justify-center">
                  <User className="w-7 h-7 text-white/60" />
                </div>
              )}
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

        {/* Donors */}
        <ChipSection
          icon={Briefcase}
          title="Donor Experience"
          color="teal"
          editing={editing}
          options={[...DONORS]}
          selected={selectedDonors}
          onToggle={(s) => {
            setSelectedDonors((prev) => {
              const next = new Set(prev);
              next.has(s) ? next.delete(s) : next.add(s);
              return next;
            });
          }}
          display={profile.donors}
        />

        {/* Countries */}
        <ChipSection
          icon={MapPin}
          title="Countries"
          color="neutral"
          editing={editing}
          options={[...COUNTRIES]}
          selected={selectedCountries}
          onToggle={(s) => {
            setSelectedCountries((prev) => {
              const next = new Set(prev);
              next.has(s) ? next.delete(s) : next.add(s);
              return next;
            });
          }}
          display={profile.countries}
        />

        {/* Qualifications */}
        <div className="bg-white border border-dark-100 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2.5">
            <div className="w-6 h-6 rounded-md bg-dark-50 flex items-center justify-center">
              <GraduationCap className="w-3.5 h-3.5 text-dark-500" />
            </div>
            <h3 className="text-xs font-bold text-dark-600 uppercase tracking-wider">Qualifications</h3>
          </div>
          {editing ? (
            <textarea
              value={qualifications}
              onChange={(e) => setQualifications(e.target.value)}
              placeholder="e.g. MSc Development Studies, PMP certified"
              rows={2}
              className="w-full bg-dark-50 border border-dark-200 rounded-lg px-3 py-2 text-sm text-dark-800 placeholder-dark-400 focus:outline-none focus:border-cyan-400 resize-none"
            />
          ) : profile.qualifications ? (
            <p className="text-sm text-dark-700">{profile.qualifications}</p>
          ) : (
            <p className="text-xs text-dark-400 italic">Add your qualifications</p>
          )}
        </div>

        {/* Experience + LinkedIn row */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white border border-dark-100 rounded-xl px-4 py-3">
            <p className="text-xs text-dark-400 font-medium mb-1">Years of experience</p>
            {editing ? (
              <input
                type="number"
                value={yearsExp}
                onChange={(e) => setYearsExp(e.target.value)}
                placeholder="0"
                className="w-full bg-dark-50 border border-dark-200 rounded-lg px-2 py-1.5 text-sm font-bold text-dark-900 focus:outline-none focus:border-cyan-400"
              />
            ) : (
              <p className="text-lg font-bold text-dark-900">
                {profile.years_of_experience ?? "—"}
              </p>
            )}
          </div>
          <div className="bg-white border border-dark-100 rounded-xl px-4 py-3">
            <p className="text-xs text-dark-400 font-medium mb-1">CV Score</p>
            <p className="text-lg font-bold text-dark-900">
              {profile.cv_score != null ? `${profile.cv_score}/100` : "—"}
            </p>
          </div>
        </div>

        {/* LinkedIn */}
        <div className="bg-white border border-dark-100 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2.5">
            <Linkedin className="w-4 h-4 text-[#0A66C2]" />
            <h3 className="text-xs font-bold text-dark-600 uppercase tracking-wider">LinkedIn</h3>
          </div>
          {editing ? (
            <input
              value={linkedinUrl}
              onChange={(e) => setLinkedinUrl(e.target.value)}
              placeholder="https://linkedin.com/in/yourname"
              className="w-full bg-dark-50 border border-dark-200 rounded-lg px-3 py-2 text-sm text-dark-800 placeholder-dark-400 focus:outline-none focus:border-cyan-400"
            />
          ) : profile.linkedin_url ? (
            <a
              href={profile.linkedin_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-sm text-cyan-600"
            >
              View Profile <ChevronRight className="w-4 h-4" />
            </a>
          ) : (
            <p className="text-xs text-dark-400 italic">Add your LinkedIn URL</p>
          )}
        </div>
      </div>

      {/* ── Bottom Edit CTA (if not already editing) ── */}
      {!editing && profilePct < 60 && (
        <div className="px-4 mt-5">
          <button
            onClick={() => setEditing(true)}
            className="block w-full text-center py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-teal-500 text-white font-bold text-sm"
          >
            Complete Your Profile
          </button>
        </div>
      )}
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
        <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto">
          {options.map((opt) => {
            const isActive = selected.has(opt);
            return (
              <button
                key={opt}
                onClick={() => onToggle(opt)}
                className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-colors ${
                  isActive ? activeBg : "bg-white text-dark-500 border-dark-100 hover:border-dark-200"
                }`}
              >
                {opt}
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
        <p className="text-xs text-dark-400 italic">Not set yet — tap Edit to add</p>
      )}
    </div>
  );
}
