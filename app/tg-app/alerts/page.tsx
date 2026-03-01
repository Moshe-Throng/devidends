"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Bell,
  CheckCircle,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { useTelegram } from "@/components/TelegramProvider";
import { SECTORS } from "@/lib/constants";

export default function TgAppAlerts() {
  const { tgUser, profile, loading } = useTelegram();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  // Pre-fill from profile sectors
  useEffect(() => {
    if (profile?.sectors && profile.sectors.length > 0) {
      setSelected(new Set(profile.sectors));
    }
  }, [profile]);

  function toggleSector(sector: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(sector)) {
        next.delete(sector);
      } else {
        next.add(sector);
      }
      return next;
    });
    setSaved(false);
  }

  async function handleSave() {
    if (!tgUser) return;
    if (selected.size === 0) {
      setError("Select at least one sector");
      return;
    }

    setSaving(true);
    setError("");

    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          telegram_id: String(tgUser.id),
          channel: "telegram",
          sectors_filter: Array.from(selected),
          country_filter: ["Ethiopia"],
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to save preferences");
      }

      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
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

  return (
    <div className="pb-6">
      {/* ── Header ── */}
      <div className="bg-white border-b border-dark-100 px-4 pt-3 pb-3 sticky top-0 z-30">
        <div className="flex items-center gap-3">
          <Link href="/tg-app" className="text-dark-400 hover:text-dark-600">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-lg font-extrabold text-dark-900 tracking-tight">
            Alert Preferences
          </h1>
        </div>
      </div>

      <div className="px-4 mt-5">
        <div className="text-center mb-5">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-cyan-500 to-teal-500 flex items-center justify-center mx-auto mb-3">
            <Bell className="w-7 h-7 text-white" />
          </div>
          <h2 className="text-lg font-bold text-dark-900">
            Select Your Sectors
          </h2>
          <p className="text-sm text-dark-400 mt-1">
            Get notified when new opportunities match your interests
          </p>
        </div>

        {/* Sector grid */}
        <div className="grid grid-cols-2 gap-2">
          {SECTORS.map((sector) => {
            const isSelected = selected.has(sector);
            return (
              <button
                key={sector}
                onClick={() => toggleSector(sector)}
                className={`px-3 py-3 rounded-xl text-sm font-semibold text-left transition-all border ${
                  isSelected
                    ? "bg-cyan-50 border-cyan-300 text-cyan-800"
                    : "bg-white border-dark-100 text-dark-600 hover:border-dark-200"
                }`}
              >
                <div className="flex items-center gap-2">
                  <div
                    className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 ${
                      isSelected
                        ? "bg-cyan-500"
                        : "border border-dark-200"
                    }`}
                  >
                    {isSelected && (
                      <CheckCircle className="w-3.5 h-3.5 text-white" />
                    )}
                  </div>
                  <span className="text-xs leading-tight">{sector}</span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Count */}
        <p className="text-center text-xs text-dark-400 mt-3">
          {selected.size} sector{selected.size !== 1 ? "s" : ""} selected
        </p>

        {error && (
          <div className="mt-3 bg-red-50 border border-red-200 rounded-lg px-3 py-2 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
            <p className="text-xs text-red-700">{error}</p>
          </div>
        )}

        {saved && (
          <div className="mt-3 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
            <p className="text-xs text-emerald-700">
              Preferences saved! You&apos;ll receive alerts via Telegram.
            </p>
          </div>
        )}

        <button
          onClick={handleSave}
          disabled={saving || selected.size === 0}
          className="w-full mt-4 py-3.5 rounded-xl bg-gradient-to-r from-cyan-500 to-teal-500 text-white font-bold text-sm disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {saving ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            "Save Preferences"
          )}
        </button>
      </div>
    </div>
  );
}
