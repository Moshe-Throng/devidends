"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import {
  Upload,
  FileText,
  Loader2,
  CheckCircle,
  AlertCircle,
  Copy,
  ExternalLink,
  Trash2,
  ArrowLeft,
} from "lucide-react";
import Link from "next/link";

interface IngestedProfile {
  id: string;
  name: string;
  headline: string | null;
  sectors: string[];
  donors: string[];
  countries: string[];
  skills: string[];
  qualifications: string | null;
  years_of_experience: number | null;
  cv_score: number | null;
  claim_token: string | null;
  claim_link_tg: string | null;
  claim_link_web: string | null;
  claimed_at: string | null;
  is_claimed: boolean;
  profile_type: string | null;
  created_at: string;
}

export default function AdminIngestPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [profiles, setProfiles] = useState<IngestedProfile[]>([]);
  const [loadingProfiles, setLoadingProfiles] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number; name: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Auth guard
  useEffect(() => {
    if (!authLoading && !user) router.push("/login");
  }, [user, authLoading, router]);

  // Load ingested profiles
  useEffect(() => {
    if (!user) return;
    fetchProfiles();
  }, [user]);

  async function fetchProfiles() {
    try {
      const res = await fetch("/api/admin/ingest");
      const data = await res.json();
      setProfiles(data.profiles || []);
    } catch {
      setError("Failed to load profiles");
    } finally {
      setLoadingProfiles(false);
    }
  }

  async function handleUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError(null);
    setUploading(true);

    const fileArray = Array.from(files);
    const results: IngestedProfile[] = [];

    for (let i = 0; i < fileArray.length; i++) {
      const file = fileArray[i];
      setBatchProgress({ current: i + 1, total: fileArray.length, name: file.name });

      try {
        const form = new FormData();
        form.append("cv", file);

        const res = await fetch("/api/admin/ingest", {
          method: "POST",
          body: form,
        });

        const data = await res.json();
        if (data.success && data.profile) {
          results.push({ ...data.profile, is_claimed: false });
        } else {
          console.error(`Failed to ingest ${file.name}:`, data.error);
        }
      } catch (err) {
        console.error(`Error ingesting ${file.name}:`, err);
      }
    }

    // Prepend new profiles to list
    setProfiles((prev) => [...results, ...prev]);
    setUploading(false);
    setBatchProgress(null);

    if (fileRef.current) fileRef.current.value = "";
  }

  const [expandedId, setExpandedId] = useState<string | null>(null);

  function copyText(text: string, id: string) {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  if (authLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-cyan-500" />
      </div>
    );
  }

  const claimed = profiles.filter((p) => p.is_claimed).length;
  const unclaimed = profiles.length - claimed;

  return (
    <div className="min-h-screen bg-dark-50">
      {/* Header */}
      <div className="bg-white border-b border-dark-100 px-6 py-4 sticky top-0 z-30">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/admin" className="text-dark-400 hover:text-dark-600">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <h1 className="text-lg font-extrabold text-dark-900">CV Ingest</h1>
              <p className="text-xs text-dark-400">Upload CVs and generate claim links for experts</p>
            </div>
          </div>
          <div className="flex items-center gap-4 text-xs">
            <span className="text-dark-400">{profiles.length} total</span>
            <span className="text-emerald-600 font-semibold">{claimed} claimed</span>
            <span className="text-amber-600 font-semibold">{unclaimed} pending</span>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-6 space-y-6">
        {/* Upload zone */}
        <div
          className={`border-2 border-dashed rounded-2xl p-8 text-center transition-colors ${
            uploading ? "border-cyan-300 bg-cyan-50/30" : "border-dark-200 bg-white hover:border-cyan-300"
          }`}
          onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add("border-cyan-400", "bg-cyan-50/50"); }}
          onDragLeave={(e) => { e.currentTarget.classList.remove("border-cyan-400", "bg-cyan-50/50"); }}
          onDrop={(e) => { e.preventDefault(); e.currentTarget.classList.remove("border-cyan-400", "bg-cyan-50/50"); handleUpload(e.dataTransfer.files); }}
        >
          {uploading && batchProgress ? (
            <div className="space-y-3">
              <Loader2 className="w-8 h-8 animate-spin text-cyan-500 mx-auto" />
              <p className="text-sm font-bold text-dark-700">
                Processing {batchProgress.current} of {batchProgress.total}
              </p>
              <p className="text-xs text-dark-400">{batchProgress.name}</p>
              <div className="w-48 h-1.5 bg-dark-100 rounded-full mx-auto overflow-hidden">
                <div
                  className="h-full bg-cyan-500 rounded-full transition-all"
                  style={{ width: `${(batchProgress.current / batchProgress.total) * 100}%` }}
                />
              </div>
            </div>
          ) : (
            <>
              <Upload className="w-10 h-10 text-dark-300 mx-auto mb-3" />
              <p className="text-sm font-bold text-dark-700">
                Drop CV files here or click to browse
              </p>
              <p className="text-xs text-dark-400 mt-1">
                PDF, DOCX, DOC — single or batch upload
              </p>
              <button
                onClick={() => fileRef.current?.click()}
                className="mt-4 px-5 py-2.5 rounded-xl bg-cyan-500 text-white font-bold text-sm hover:bg-cyan-600 transition-colors"
              >
                Select Files
              </button>
              <input
                ref={fileRef}
                type="file"
                accept=".pdf,.docx,.doc"
                multiple
                className="hidden"
                onChange={(e) => handleUpload(e.target.files)}
              />
            </>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-xs text-red-700 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        {/* Profiles list */}
        {loadingProfiles ? (
          <div className="text-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-dark-300 mx-auto" />
          </div>
        ) : profiles.length === 0 ? (
          <div className="text-center py-12 text-dark-400 text-sm">
            No CVs ingested yet. Upload some above.
          </div>
        ) : (
          <div className="space-y-2">
            {profiles.map((p) => {
              const isExpanded = expandedId === p.id;
              return (
                <div key={p.id} className="bg-white rounded-xl border border-dark-100 overflow-hidden">
                  {/* Summary row — click to expand */}
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : p.id)}
                    className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-dark-50/50 transition-colors"
                  >
                    {/* Score badge */}
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold text-sm shrink-0 ${
                      (p.cv_score ?? 0) >= 70 ? "bg-emerald-500" :
                      (p.cv_score ?? 0) >= 50 ? "bg-amber-500" : "bg-red-400"
                    }`}>
                      {p.cv_score ?? "—"}
                    </div>
                    {/* Name + headline */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-dark-900 truncate">{p.name}</p>
                      <p className="text-[11px] text-dark-400 truncate">
                        {p.headline || [p.profile_type, ...(p.sectors || []).slice(0, 2)].filter(Boolean).join(" · ") || "No data"}
                      </p>
                    </div>
                    {/* Status */}
                    {p.is_claimed ? (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0">
                        Claimed
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200 shrink-0">
                        Pending
                      </span>
                    )}
                    {/* Chevron */}
                    <svg className={`w-4 h-4 text-dark-300 transition-transform shrink-0 ${isExpanded ? "rotate-180" : ""}`} viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd"/>
                    </svg>
                  </button>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div className="border-t border-dark-100 px-4 py-4 space-y-3 bg-dark-50/30">
                      {/* Extracted fields grid */}
                      <div className="grid grid-cols-2 gap-3 text-xs">
                        <Field label="Profile Type" value={p.profile_type} />
                        <Field label="Years of Experience" value={p.years_of_experience != null ? String(p.years_of_experience) : null} />
                        <Field label="Qualifications" value={p.qualifications} span={2} />
                        <ChipField label="Sectors" items={p.sectors} color="cyan" />
                        <ChipField label="Donors" items={p.donors} color="teal" />
                        <ChipField label="Countries" items={p.countries} color="neutral" />
                        <ChipField label="Skills" items={p.skills} color="neutral" />
                      </div>

                      {/* Claim links */}
                      {!p.is_claimed && (
                        <div className="pt-2 border-t border-dark-100 space-y-2">
                          <p className="text-[10px] font-bold text-dark-400 uppercase tracking-wider">Claim Links</p>
                          <div className="flex flex-wrap gap-2">
                            {p.claim_link_tg && (
                              <button
                                onClick={(e) => { e.stopPropagation(); copyText(p.claim_link_tg!, `tg-${p.id}`); }}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#2AABEE]/10 text-[#2AABEE] text-xs font-semibold hover:bg-[#2AABEE]/20 transition-colors"
                              >
                                {copiedId === `tg-${p.id}` ? <CheckCircle className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                                {copiedId === `tg-${p.id}` ? "Copied!" : "Telegram Link"}
                              </button>
                            )}
                            {p.claim_link_web && (
                              <button
                                onClick={(e) => { e.stopPropagation(); copyText(p.claim_link_web!, `web-${p.id}`); }}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-50 text-cyan-700 text-xs font-semibold hover:bg-cyan-100 transition-colors"
                              >
                                {copiedId === `web-${p.id}` ? <CheckCircle className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                                {copiedId === `web-${p.id}` ? "Copied!" : "Email/Web Link"}
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Helper components ── */

function Field({ label, value, span }: { label: string; value: string | null | undefined; span?: number }) {
  return (
    <div className={span === 2 ? "col-span-2" : ""}>
      <p className="text-[10px] font-bold text-dark-400 uppercase tracking-wider mb-0.5">{label}</p>
      <p className="text-sm text-dark-700">{value || <span className="text-dark-300 italic">Not extracted</span>}</p>
    </div>
  );
}

function ChipField({ label, items, color }: { label: string; items: string[] | null; color: "cyan" | "teal" | "neutral" }) {
  const bg = color === "cyan" ? "bg-cyan-50 text-cyan-700 border-cyan-200" : color === "teal" ? "bg-teal-50 text-teal-700 border-teal-200" : "bg-dark-50 text-dark-600 border-dark-200";
  return (
    <div className="col-span-2">
      <p className="text-[10px] font-bold text-dark-400 uppercase tracking-wider mb-1">{label}</p>
      {items && items.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {items.map((s) => (
            <span key={s} className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${bg}`}>{s}</span>
          ))}
        </div>
      ) : (
        <p className="text-xs text-dark-300 italic">None extracted</p>
      )}
    </div>
  );
}
