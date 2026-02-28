"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  User,
  MapPin,
  Briefcase,
  GraduationCap,
  Target,
  Globe,
  Linkedin,
  Mail,
  ChevronRight,
  AlertCircle,
  Loader2,
  CheckCircle,
} from "lucide-react";
import { useTelegram } from "@/components/TelegramProvider";

export default function TgAppProfile() {
  const { tgUser, profile, loading } = useTelegram();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-cyan-500" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6">
        <div className="text-center space-y-3">
          <AlertCircle className="w-8 h-8 text-dark-300 mx-auto" />
          <p className="text-sm text-dark-500">Profile not found</p>
        </div>
      </div>
    );
  }

  const profilePct = profile.profile_score_pct ?? 0;

  // Calculate missing fields for nudges
  const missingFields: { label: string; value: string }[] = [];
  if (!profile.sectors || profile.sectors.length === 0)
    missingFields.push({ label: "sectors", value: "Add your sector expertise" });
  if (!profile.donors || profile.donors.length === 0)
    missingFields.push({ label: "donors", value: "Add donor experience" });
  if (!profile.countries || profile.countries.length === 0)
    missingFields.push({ label: "countries", value: "Add target countries" });
  if (!profile.skills || profile.skills.length < 3)
    missingFields.push({ label: "skills", value: "Add at least 3 skills" });
  if (!profile.qualifications)
    missingFields.push({ label: "qualifications", value: "Add your qualifications" });
  if (!profile.headline)
    missingFields.push({ label: "headline", value: "Add a professional headline" });
  if (!profile.linkedin_url)
    missingFields.push({ label: "linkedin", value: "Add your LinkedIn URL" });

  return (
    <div className="pb-6">
      {/* ── Header ── */}
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

      {/* ── Profile Card ── */}
      <div className="px-4 mt-4">
        <div className="bg-gradient-to-br from-dark-900 to-dark-800 rounded-2xl p-5 relative overflow-hidden">
          <div
            className="absolute inset-0 opacity-5"
            style={{
              backgroundImage:
                "radial-gradient(circle, rgba(255,255,255,0.5) 1px, transparent 1px)",
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
                {profile.headline && (
                  <p className="text-sm text-cyan-300 mt-0.5 line-clamp-2">
                    {profile.headline}
                  </p>
                )}
                {profile.profile_type && (
                  <span className="inline-block mt-2 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                    {profile.profile_type}
                  </span>
                )}
              </div>
            </div>

            {/* Score bar */}
            <div className="mt-4">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-medium text-white/60 uppercase tracking-wider">
                  Profile completeness
                </span>
                <span className="text-xs font-bold text-white">
                  {profilePct}%
                </span>
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
        {/* Sectors */}
        <ProfileSection icon={Target} title="Sectors" color="cyan">
          {profile.sectors && profile.sectors.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {profile.sectors.map((s) => (
                <span
                  key={s}
                  className="px-2.5 py-1 rounded-full text-xs font-semibold bg-cyan-50 text-cyan-700 border border-cyan-100"
                >
                  {s}
                </span>
              ))}
            </div>
          ) : (
            <EmptyHint>Add sectors to get matched opportunities</EmptyHint>
          )}
        </ProfileSection>

        {/* Countries */}
        <ProfileSection icon={MapPin} title="Countries" color="neutral">
          {profile.countries && profile.countries.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {profile.countries.map((c) => (
                <span
                  key={c}
                  className="px-2.5 py-1 rounded-full text-xs font-medium bg-dark-50 text-dark-600"
                >
                  {c}
                </span>
              ))}
            </div>
          ) : (
            <EmptyHint>Add target countries</EmptyHint>
          )}
        </ProfileSection>

        {/* Skills */}
        <ProfileSection icon={Briefcase} title="Skills" color="teal">
          {profile.skills && profile.skills.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {profile.skills.map((s) => (
                <span
                  key={s}
                  className="px-2 py-0.5 rounded text-[11px] font-medium bg-teal-50 text-teal-700"
                >
                  {s}
                </span>
              ))}
            </div>
          ) : (
            <EmptyHint>Add at least 3 skills</EmptyHint>
          )}
        </ProfileSection>

        {/* Qualifications */}
        <ProfileSection
          icon={GraduationCap}
          title="Qualifications"
          color="neutral"
        >
          {profile.qualifications ? (
            <p className="text-sm text-dark-700">{profile.qualifications}</p>
          ) : (
            <EmptyHint>Add your qualifications</EmptyHint>
          )}
        </ProfileSection>

        {/* Experience */}
        {profile.years_of_experience != null && (
          <div className="bg-white border border-dark-100 rounded-xl px-4 py-3 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-dark-50 flex items-center justify-center">
              <Briefcase className="w-4 h-4 text-dark-500" />
            </div>
            <div>
              <p className="text-xs text-dark-400 font-medium">Experience</p>
              <p className="text-sm font-bold text-dark-900">
                {profile.years_of_experience} years
              </p>
            </div>
          </div>
        )}

        {/* CV Score */}
        {profile.cv_score != null && (
          <div className="bg-white border border-dark-100 rounded-xl px-4 py-3 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-cyan-50 flex items-center justify-center">
              <Target className="w-4 h-4 text-cyan-600" />
            </div>
            <div>
              <p className="text-xs text-dark-400 font-medium">CV Score</p>
              <p className="text-sm font-bold text-dark-900">
                {profile.cv_score}/100
              </p>
            </div>
          </div>
        )}

        {/* Links */}
        {(profile.linkedin_url || profile.email) && (
          <div className="space-y-2">
            {profile.linkedin_url && (
              <a
                href={profile.linkedin_url}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-white border border-dark-100 rounded-xl px-4 py-3 flex items-center gap-3"
              >
                <Linkedin className="w-4 h-4 text-[#0A66C2]" />
                <span className="text-sm text-dark-700 truncate flex-1">
                  LinkedIn Profile
                </span>
                <ChevronRight className="w-4 h-4 text-dark-300" />
              </a>
            )}
            {profile.email && (
              <div className="bg-white border border-dark-100 rounded-xl px-4 py-3 flex items-center gap-3">
                <Mail className="w-4 h-4 text-dark-400" />
                <span className="text-sm text-dark-700 truncate">
                  {profile.email}
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Completeness Nudges ── */}
      {missingFields.length > 0 && profilePct < 80 && (
        <div className="px-4 mt-5">
          <h3 className="text-xs font-bold text-dark-400 uppercase tracking-wider mb-2">
            Strengthen your profile
          </h3>
          <div className="space-y-1.5">
            {missingFields.slice(0, 4).map((field) => (
              <div
                key={field.label}
                className="bg-amber-50 border border-amber-100 rounded-lg px-3 py-2.5 flex items-center gap-2"
              >
                <AlertCircle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                <span className="text-xs text-amber-800 flex-1">
                  {field.value}
                </span>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-dark-400 mt-2 text-center">
            Edit your profile on the{" "}
            <a
              href="https://app.devidends.org/profile/edit"
              target="_blank"
              rel="noopener noreferrer"
              className="text-cyan-600 font-semibold"
            >
              web app
            </a>
          </p>
        </div>
      )}

      {/* ── Edit CTA ── */}
      <div className="px-4 mt-5">
        <a
          href="https://app.devidends.org/profile/edit"
          target="_blank"
          rel="noopener noreferrer"
          className="block w-full text-center py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-teal-500 text-white font-bold text-sm"
        >
          Edit Profile on Web
        </a>
      </div>
    </div>
  );
}

// ── Sub-components ──

function ProfileSection({
  icon: Icon,
  title,
  color,
  children,
}: {
  icon: React.ElementType;
  title: string;
  color: "cyan" | "teal" | "neutral";
  children: React.ReactNode;
}) {
  const iconBg =
    color === "cyan"
      ? "bg-cyan-50"
      : color === "teal"
      ? "bg-teal-50"
      : "bg-dark-50";
  const iconColor =
    color === "cyan"
      ? "text-cyan-600"
      : color === "teal"
      ? "text-teal-600"
      : "text-dark-500";

  return (
    <div className="bg-white border border-dark-100 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-2.5">
        <div
          className={`w-6 h-6 rounded-md ${iconBg} flex items-center justify-center`}
        >
          <Icon className={`w-3.5 h-3.5 ${iconColor}`} />
        </div>
        <h3 className="text-xs font-bold text-dark-600 uppercase tracking-wider">
          {title}
        </h3>
      </div>
      {children}
    </div>
  );
}

function EmptyHint({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs text-dark-400 italic">{children}</p>
  );
}
