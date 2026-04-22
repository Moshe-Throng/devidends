"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Loader2,
  ArrowLeft,
  Copy,
  CheckCircle,
  Sparkles,
  FileText,
  Search,
} from "lucide-react";
import { useAuth } from "@/components/AuthProvider";

type SlimProfile = {
  id: string;
  name: string;
  headline: string | null;
  cv_score: number | null;
  profile_type: string | null;
  sectors: string[] | null;
  years_of_experience: number | null;
  has_cv: boolean;
};

type TailorResult = {
  profile_name: string;
  key_qualifications: string[];
  narrative_hook: string;
  top_experiences_to_highlight: { employer: string; position: string; reason: string }[];
  voice_notes: string;
};

export default function CvTailorPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [profiles, setProfiles] = useState<SlimProfile[]>([]);
  const [profileSearch, setProfileSearch] = useState("");
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [torText, setTorText] = useState("");
  const [targetRole, setTargetRole] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TailorResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) router.push("/login");
  }, [user, authLoading, router]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const res = await fetch("/api/admin/ingest?all=true");
      const data = await res.json();
      const list: SlimProfile[] = (data.profiles || [])
        .filter((p: any) => p.cv_text || p.cv_structured_data)
        .map((p: any) => ({
          id: p.id,
          name: p.name,
          headline: p.headline,
          cv_score: p.cv_score,
          profile_type: p.profile_type,
          sectors: p.sectors,
          years_of_experience: p.years_of_experience,
          has_cv: !!(p.cv_text || p.cv_structured_data),
        }));
      setProfiles(list);
    })();
  }, [user]);

  const filteredProfiles = useMemo(() => {
    const q = profileSearch.toLowerCase().trim();
    if (!q) return profiles.slice(0, 40);
    return profiles
      .filter((p) => {
        const blob = [p.name, p.headline, (p.sectors || []).join(" ")]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return q.split(/\s+/).every((t) => blob.includes(t));
      })
      .slice(0, 40);
  }, [profiles, profileSearch]);

  const selected = profiles.find((p) => p.id === selectedProfileId) || null;

  async function handleGenerate() {
    if (!selectedProfileId || torText.trim().length < 100) {
      setError("Pick a profile and paste a ToR (at least 100 characters)");
      return;
    }
    setError(null);
    setResult(null);
    setLoading(true);
    try {
      const res = await fetch("/api/admin/cv-tailor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profile_id: selectedProfileId,
          tor_text: torText,
          target_role: targetRole || null,
        }),
      });
      const d = await res.json();
      if (!res.ok) {
        setError(d.error || "Generation failed");
      } else {
        setResult(d);
      }
    } catch (e: any) {
      setError(e.message || "Generation failed");
    } finally {
      setLoading(false);
    }
  }

  function copy(text: string, key: string) {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  }

  if (authLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-cyan-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-dark-50">
      {/* Header */}
      <div className="bg-white border-b border-dark-100 px-6 py-4 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/admin" className="text-dark-400 hover:text-dark-600">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <h1 className="text-lg font-extrabold text-dark-900 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-500" />
                CV Tailor (prototype)
              </h1>
              <p className="text-xs text-dark-400">
                Admin only. Tailor an ingested profile against a ToR. Output preserves candidate voice.
              </p>
            </div>
          </div>
          <span className="text-xs text-dark-400">{profiles.length} tailorable profiles</span>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6 grid grid-cols-12 gap-6">
        {/* LEFT: inputs */}
        <div className="col-span-12 md:col-span-5 space-y-4">
          <div className="bg-white rounded-xl border border-dark-100 p-4">
            <p className="text-xs font-bold text-dark-500 uppercase tracking-wider mb-2">
              1. Pick a profile
            </p>
            <div className="relative mb-2">
              <Search className="w-4 h-4 text-dark-300 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                value={profileSearch}
                onChange={(e) => setProfileSearch(e.target.value)}
                placeholder="Search by name, sector, headline..."
                className="w-full pl-9 pr-3 py-2 rounded-lg border border-dark-200 text-sm focus:border-cyan-400 focus:outline-none"
              />
            </div>
            <div className="max-h-[280px] overflow-y-auto border border-dark-100 rounded-lg">
              {filteredProfiles.map((p) => {
                const active = p.id === selectedProfileId;
                return (
                  <button
                    key={p.id}
                    onClick={() => setSelectedProfileId(p.id)}
                    className={`w-full text-left px-3 py-2 text-xs border-b border-dark-100 last:border-b-0 transition-colors ${
                      active ? "bg-cyan-50 text-cyan-900" : "bg-white hover:bg-dark-50 text-dark-700"
                    }`}
                  >
                    <div className="font-bold">{p.name}</div>
                    <div className="text-[11px] text-dark-400 truncate">
                      {p.profile_type || "-"} · {p.years_of_experience ? `${p.years_of_experience}y` : "?y"} · cv={p.cv_score ?? "-"} · {p.headline || "(no headline)"}
                    </div>
                  </button>
                );
              })}
              {filteredProfiles.length === 0 && (
                <div className="px-3 py-4 text-xs text-dark-400">No matches.</div>
              )}
            </div>
            {selected && (
              <div className="mt-2 px-3 py-2 bg-cyan-50 rounded-lg text-xs text-cyan-900">
                Selected: <b>{selected.name}</b>
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl border border-dark-100 p-4">
            <p className="text-xs font-bold text-dark-500 uppercase tracking-wider mb-2">
              2. Target role (optional)
            </p>
            <input
              value={targetRole}
              onChange={(e) => setTargetRole(e.target.value)}
              placeholder="e.g. Private Sector Development Expert"
              className="w-full px-3 py-2 rounded-lg border border-dark-200 text-sm focus:border-cyan-400 focus:outline-none"
            />
          </div>

          <div className="bg-white rounded-xl border border-dark-100 p-4">
            <p className="text-xs font-bold text-dark-500 uppercase tracking-wider mb-2">
              3. Paste Terms of Reference
            </p>
            <textarea
              value={torText}
              onChange={(e) => setTorText(e.target.value)}
              placeholder="Paste the full ToR text here. Role requirements, scope, deliverables, qualifications..."
              className="w-full px-3 py-2 rounded-lg border border-dark-200 text-xs font-mono h-64 focus:border-cyan-400 focus:outline-none"
            />
            <p className="text-[10px] text-dark-400 mt-1">{torText.length} chars</p>
          </div>

          <button
            onClick={handleGenerate}
            disabled={loading || !selectedProfileId || torText.trim().length < 100}
            className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-teal-500 text-white font-bold text-sm transition hover:from-cyan-600 hover:to-teal-600 disabled:opacity-50"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Tailoring... (20-40s)
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                Generate tailored output
              </>
            )}
          </button>

          {error && (
            <div className="px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
              {error}
            </div>
          )}
        </div>

        {/* RIGHT: output */}
        <div className="col-span-12 md:col-span-7 space-y-4">
          {!result && !loading && (
            <div className="bg-white rounded-xl border border-dark-100 p-8 text-center">
              <FileText className="w-10 h-10 text-dark-200 mx-auto mb-3" />
              <p className="text-sm text-dark-500">
                Output will appear here. Pick a profile, paste a ToR, generate.
              </p>
              <p className="text-xs text-dark-400 mt-2">
                Humanizer is baked in: no em-dashes, no "serves as", voice matched to the candidate's own CV.
              </p>
            </div>
          )}

          {result && (
            <>
              {/* Narrative hook */}
              <div className="bg-white rounded-xl border border-dark-100 p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-bold text-dark-500 uppercase tracking-wider">
                    Narrative hook (cover-letter opener)
                  </p>
                  <button
                    onClick={() => copy(result.narrative_hook, "hook")}
                    className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-semibold text-cyan-600 hover:bg-cyan-50"
                  >
                    {copiedKey === "hook" ? <CheckCircle className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    {copiedKey === "hook" ? "Copied" : "Copy"}
                  </button>
                </div>
                <p className="text-sm text-dark-800 italic">&ldquo;{result.narrative_hook}&rdquo;</p>
              </div>

              {/* Key Qualifications */}
              <div className="bg-white rounded-xl border border-dark-100 p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-bold text-dark-500 uppercase tracking-wider">
                    Key Qualifications (paste into CV)
                  </p>
                  <button
                    onClick={() => copy(result.key_qualifications.map((b) => (b.startsWith("-") ? b : "- " + b)).join("\n"), "quals")}
                    className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-semibold text-cyan-600 hover:bg-cyan-50"
                  >
                    {copiedKey === "quals" ? <CheckCircle className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    {copiedKey === "quals" ? "Copied" : "Copy all"}
                  </button>
                </div>
                <ul className="space-y-2 text-sm text-dark-800">
                  {result.key_qualifications.map((b, i) => (
                    <li key={i} className="pl-4 relative before:content-['-'] before:absolute before:left-0 before:text-dark-400">
                      {b.replace(/^[-•]\s*/, "")}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Top experiences */}
              <div className="bg-white rounded-xl border border-dark-100 p-4">
                <p className="text-xs font-bold text-dark-500 uppercase tracking-wider mb-2">
                  Top experiences to highlight (reorder or lead with these in assignment table)
                </p>
                <div className="space-y-2">
                  {result.top_experiences_to_highlight.map((e, i) => (
                    <div key={i} className="px-3 py-2 rounded-lg bg-dark-50">
                      <div className="text-sm font-bold text-dark-900">
                        {e.position}
                      </div>
                      <div className="text-xs text-dark-500">{e.employer}</div>
                      <div className="text-xs text-dark-700 mt-1 italic">{e.reason}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Voice notes */}
              <div className="bg-amber-50 rounded-xl border border-amber-200 p-4">
                <p className="text-xs font-bold text-amber-700 uppercase tracking-wider mb-1">
                  Voice notes (admin sanity check)
                </p>
                <p className="text-sm text-amber-900">{result.voice_notes}</p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
