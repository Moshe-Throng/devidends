"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft, Bell, CheckCircle, Loader2, AlertCircle,
  Briefcase, Newspaper, ChevronDown, ChevronUp, Tag,
} from "lucide-react";
import { useTelegram } from "@/components/TelegramProvider";
import { SECTORS, NEWS_CATEGORIES } from "@/lib/constants";

const SECTOR_ICONS: Record<string, string> = {
  "Humanitarian Aid & Emergency": "🆘",
  "Global Health": "🏥",
  "Food Security & Nutrition": "🌾",
  "Agriculture & Rural Development": "🚜",
  "WASH (Water, Sanitation & Hygiene)": "💧",
  "Education & Training": "📚",
  "Environment & Climate Change": "🌍",
  "Energy & Infrastructure": "⚡",
  "Economic Development & Trade": "📈",
  "Governance & Rule of Law": "⚖️",
  "Gender & Social Inclusion": "♀️",
  "Peace & Security": "🕊️",
  "Migration & Displacement": "🚶",
  "Finance & Banking": "🏦",
  "Innovation & ICT": "💻",
  "Project Management & M&E": "📊",
  "Supply Chain & Logistics": "📦",
  "Human Resources & Admin": "👥",
  "Media & Communications": "📡",
  "Research & Data Analytics": "🔬",
  "Legal & Compliance": "📋",
  "Procurement & Grants": "📝",
  "Child Protection": "🛡️",
  "Youth & Livelihoods": "🌱",
  "Urban Development & Housing": "🏙️",
  "Transport": "🚌",
  "Mining & Extractives": "⛏️",
  "Private Sector Development": "🏢",
};

type SaveStatus = "idle" | "saving" | "saved" | "error";

export default function TgAppAlerts() {
  const { tgUser, profile, loading } = useTelegram();

  const [sectors, setSectors] = useState<Set<string>>(new Set());
  const [newsCategories, setNewsCategories] = useState<Set<string>>(new Set());
  const [newsSectors, setNewsSectors] = useState<Set<string>>(new Set());
  const [sectorsOpen, setSectorsOpen] = useState(true);
  const [newsOpen, setNewsOpen] = useState(true);
  const [newsSectorsOpen, setNewsSectorsOpen] = useState(false);
  const [loadingPrefs, setLoadingPrefs] = useState(true);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [error, setError] = useState("");

  // Load existing preferences from Supabase
  useEffect(() => {
    if (!tgUser) return;
    (async () => {
      try {
        const res = await fetch(`/api/subscribe?telegram_id=${tgUser.id}`);
        const { subscription } = await res.json();
        if (subscription) {
          if (subscription.sectors_filter?.length) {
            setSectors(new Set(subscription.sectors_filter));
          } else if (profile?.sectors?.length) {
            setSectors(new Set(profile.sectors));
          }
          if (subscription.news_categories_filter?.length) {
            setNewsCategories(new Set(subscription.news_categories_filter));
          }
          if (subscription.news_sectors_filter?.length) {
            setNewsSectors(new Set(subscription.news_sectors_filter));
          }
        } else if (profile?.sectors?.length) {
          setSectors(new Set(profile.sectors));
        }
      } catch {
        if (profile?.sectors?.length) setSectors(new Set(profile.sectors));
      } finally {
        setLoadingPrefs(false);
      }
    })();
  }, [tgUser, profile]);

  function toggleSector(s: string) {
    setSectors((prev) => { const n = new Set(prev); n.has(s) ? n.delete(s) : n.add(s); return n; });
    setSaveStatus("idle");
  }
  function toggleNews(c: string) {
    setNewsCategories((prev) => { const n = new Set(prev); n.has(c) ? n.delete(c) : n.add(c); return n; });
    setSaveStatus("idle");
  }
  function toggleNewsSector(s: string) {
    setNewsSectors((prev) => { const n = new Set(prev); n.has(s) ? n.delete(s) : n.add(s); return n; });
    setSaveStatus("idle");
  }

  async function handleSave() {
    if (!tgUser) return;
    if (sectors.size === 0 && newsCategories.size === 0 && newsSectors.size === 0) {
      setError("Select at least one sector or news category");
      return;
    }
    setSaveStatus("saving");
    setError("");
    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          telegram_id: String(tgUser.id),
          channel: "telegram",
          sectors_filter: Array.from(sectors),
          news_categories_filter: Array.from(newsCategories),
          news_sectors_filter: Array.from(newsSectors),
          country_filter: ["Ethiopia"],
          frequency: "daily",
        }),
      });
      if (!res.ok) throw new Error("Failed to save");
      setSaveStatus("saved");
    } catch {
      setSaveStatus("error");
      setError("Couldn't save preferences. Try again.");
    }
  }

  if (loading || loadingPrefs) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-cyan-400 to-teal-500 flex items-center justify-center shadow-lg">
            <Bell className="w-6 h-6 text-white" />
          </div>
          <Loader2 className="w-5 h-5 animate-spin text-cyan-500" />
          <p className="text-xs text-slate-400 font-medium">Loading your preferences…</p>
        </div>
      </div>
    );
  }

  const hasChanges = sectors.size > 0 || newsCategories.size > 0 || newsSectors.size > 0;
  const newsFilterCount = newsCategories.size + newsSectors.size;

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      {/* Sticky Header */}
      <div className="sticky top-0 z-30 bg-white/95 backdrop-blur-sm border-b border-slate-100">
        <div className="flex items-center gap-3 px-4 h-14">
          <Link href="/tg-app" className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-slate-100 transition-colors">
            <ArrowLeft className="w-4 h-4 text-slate-500" />
          </Link>
          <div className="flex-1">
            <h1 className="text-[15px] font-extrabold text-slate-900 tracking-tight">Alert Preferences</h1>
            <p className="text-[10px] text-slate-400 font-medium">Daily at 8:00 AM EAT</p>
          </div>
          <div className="flex items-center gap-1.5">
            {sectors.size > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-cyan-100 text-cyan-700 text-[10px] font-bold">
                {sectors.size} jobs
              </span>
            )}
            {newsFilterCount > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-teal-100 text-teal-700 text-[10px] font-bold">
                {newsFilterCount} news
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Hero strip */}
      <div className="bg-gradient-to-r from-cyan-500 to-teal-500 px-4 py-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
            <Bell className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="text-sm font-bold text-white">Personalised Daily Alerts</p>
            <p className="text-[11px] text-cyan-100 mt-0.5">
              Matching jobs &amp; news sent to your Telegram every morning
            </p>
          </div>
        </div>
      </div>

      <div className="px-4 mt-4 space-y-3">

        {/* Job Alerts Section */}
        <div className="bg-white rounded-2xl overflow-hidden shadow-sm border border-slate-100">
          <button
            onClick={() => setSectorsOpen((v) => !v)}
            className="w-full flex items-center gap-3 px-4 py-3.5"
          >
            <div className="w-8 h-8 rounded-lg bg-cyan-50 flex items-center justify-center shrink-0">
              <Briefcase className="w-4 h-4 text-cyan-600" />
            </div>
            <div className="flex-1 text-left">
              <p className="text-sm font-bold text-slate-900">Job Alerts</p>
              <p className="text-[11px] text-slate-400">
                {sectors.size === 0 ? "No sectors selected" : `${sectors.size} sector${sectors.size !== 1 ? "s" : ""} selected`}
              </p>
            </div>
            {sectorsOpen ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
          </button>

          {sectorsOpen && (
            <div className="px-4 pb-4 border-t border-slate-50">
              <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider mt-3 mb-2.5">
                Tap sectors to receive matching opportunities
              </p>
              <div className="flex flex-wrap gap-2">
                {SECTORS.map((sector) => {
                  const active = sectors.has(sector);
                  return (
                    <button
                      key={sector}
                      onClick={() => toggleSector(sector)}
                      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[11px] font-semibold border transition-all active:scale-95 ${
                        active
                          ? "bg-cyan-500 border-cyan-500 text-white shadow-sm"
                          : "bg-slate-50 border-slate-200 text-slate-600 hover:border-cyan-300"
                      }`}
                    >
                      <span>{SECTOR_ICONS[sector] || "🔹"}</span>
                      <span>{sector.split("(")[0].trim()}</span>
                      {active && <CheckCircle className="w-3 h-3 opacity-80" />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Dev News Section */}
        <div className="bg-white rounded-2xl overflow-hidden shadow-sm border border-slate-100">
          <button
            onClick={() => setNewsOpen((v) => !v)}
            className="w-full flex items-center gap-3 px-4 py-3.5"
          >
            <div className="w-8 h-8 rounded-lg bg-teal-50 flex items-center justify-center shrink-0">
              <Newspaper className="w-4 h-4 text-teal-600" />
            </div>
            <div className="flex-1 text-left">
              <p className="text-sm font-bold text-slate-900">Dev News</p>
              <p className="text-[11px] text-slate-400">
                {newsFilterCount === 0
                  ? "All categories (no filter)"
                  : `${newsFilterCount} filter${newsFilterCount !== 1 ? "s" : ""} active`}
              </p>
            </div>
            {newsOpen ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
          </button>

          {newsOpen && (
            <div className="px-4 pb-4 border-t border-slate-50 space-y-4">

              {/* By Category */}
              <div>
                <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider mt-3 mb-2.5">
                  By topic — leave all off for everything
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {NEWS_CATEGORIES.map((cat) => {
                    const active = newsCategories.has(cat.id);
                    return (
                      <button
                        key={cat.id}
                        onClick={() => toggleNews(cat.id)}
                        className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-left transition-all active:scale-95 ${
                          active
                            ? "bg-teal-500 border-teal-500 text-white shadow-sm"
                            : "bg-slate-50 border-slate-200 text-slate-600 hover:border-teal-300"
                        }`}
                      >
                        <span className="text-base leading-none">{cat.emoji}</span>
                        <span className="text-[11px] font-semibold leading-tight">{cat.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* By Sector — collapsible sub-section */}
              <div className="border-t border-slate-100 pt-3">
                <button
                  onClick={() => setNewsSectorsOpen((v) => !v)}
                  className="w-full flex items-center gap-2 mb-2"
                >
                  <Tag className="w-3.5 h-3.5 text-teal-500 shrink-0" />
                  <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider flex-1 text-left">
                    Also filter by sector
                    {newsSectors.size > 0 && (
                      <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-teal-100 text-teal-700 normal-case tracking-normal font-bold">
                        {newsSectors.size}
                      </span>
                    )}
                  </p>
                  {newsSectorsOpen
                    ? <ChevronUp className="w-3 h-3 text-slate-400" />
                    : <ChevronDown className="w-3 h-3 text-slate-400" />}
                </button>
                {!newsSectorsOpen && (
                  <p className="text-[10px] text-slate-400 leading-relaxed">
                    Receive news relevant to your professional sectors
                  </p>
                )}
                {newsSectorsOpen && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {SECTORS.map((sector) => {
                      const active = newsSectors.has(sector);
                      return (
                        <button
                          key={sector}
                          onClick={() => toggleNewsSector(sector)}
                          className={`flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-semibold border transition-all active:scale-95 ${
                            active
                              ? "bg-teal-500 border-teal-500 text-white shadow-sm"
                              : "bg-slate-50 border-slate-200 text-slate-500 hover:border-teal-300"
                          }`}
                        >
                          <span>{SECTOR_ICONS[sector] || "🔹"}</span>
                          <span>{sector.split("(")[0].trim()}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {error && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5">
            <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
            <p className="text-xs text-red-700">{error}</p>
          </div>
        )}

        {saveStatus === "saved" && (
          <div className="flex items-start gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-3">
            <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-bold text-emerald-800">Preferences saved!</p>
              <p className="text-[10px] text-emerald-600 mt-0.5">
                You&apos;ll receive daily alerts at 8:00 AM EAT.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Floating Save Button */}
      <div className="fixed bottom-0 left-0 right-0 px-4 pb-6 pt-3 bg-gradient-to-t from-slate-50 via-slate-50/95 to-transparent pointer-events-none">
        <button
          onClick={handleSave}
          disabled={saveStatus === "saving" || !hasChanges}
          className={`pointer-events-auto w-full py-4 rounded-2xl font-extrabold text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.98] ${
            saveStatus === "saved"
              ? "bg-emerald-500 text-white shadow-lg shadow-emerald-200"
              : "bg-gradient-to-r from-cyan-500 to-teal-500 text-white shadow-lg shadow-cyan-200 disabled:opacity-40 disabled:shadow-none"
          }`}
        >
          {saveStatus === "saving" ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</>
          ) : saveStatus === "saved" ? (
            <><CheckCircle className="w-4 h-4" /> Saved!</>
          ) : (
            <><Bell className="w-4 h-4" /> Save Alert Preferences</>
          )}
        </button>
      </div>
    </div>
  );
}
