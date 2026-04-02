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
  cv_score: number | null;
  claim_token: string | null;
  claim_link: string | null;
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

  function copyLink(link: string, id: string) {
    navigator.clipboard.writeText(link);
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

        {/* Profiles table */}
        {loadingProfiles ? (
          <div className="text-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-dark-300 mx-auto" />
          </div>
        ) : profiles.length === 0 ? (
          <div className="text-center py-12 text-dark-400 text-sm">
            No CVs ingested yet. Upload some above.
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-dark-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-dark-50 text-left text-xs text-dark-400 font-bold uppercase tracking-wider">
                    <th className="px-4 py-3">Name</th>
                    <th className="px-4 py-3">Score</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Sectors</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Claim Link</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-dark-50">
                  {profiles.map((p) => (
                    <tr key={p.id} className="hover:bg-dark-50/50">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-dark-900">{p.name}</p>
                        {p.headline && <p className="text-[11px] text-dark-400 mt-0.5 line-clamp-1">{p.headline}</p>}
                      </td>
                      <td className="px-4 py-3">
                        {p.cv_score != null ? (
                          <span className={`font-bold ${
                            p.cv_score >= 70 ? "text-emerald-600" :
                            p.cv_score >= 50 ? "text-amber-600" : "text-red-500"
                          }`}>
                            {p.cv_score}
                          </span>
                        ) : (
                          <span className="text-dark-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {p.profile_type ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-50 text-cyan-700 border border-cyan-200">
                            {p.profile_type}
                          </span>
                        ) : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1 max-w-[200px]">
                          {(p.sectors || []).slice(0, 2).map((s) => (
                            <span key={s} className="px-1.5 py-0.5 rounded text-[10px] bg-dark-50 text-dark-500">
                              {s}
                            </span>
                          ))}
                          {(p.sectors || []).length > 2 && (
                            <span className="text-[10px] text-dark-300">+{p.sectors.length - 2}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {p.is_claimed ? (
                          <span className="flex items-center gap-1 text-emerald-600 text-xs font-semibold">
                            <CheckCircle className="w-3.5 h-3.5" />
                            Claimed
                          </span>
                        ) : (
                          <span className="text-amber-600 text-xs font-semibold">Pending</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {p.claim_link && !p.is_claimed ? (
                          <button
                            onClick={() => copyLink(p.claim_link!, p.id)}
                            className="flex items-center gap-1.5 text-xs font-semibold text-cyan-600 hover:text-cyan-700 transition-colors"
                          >
                            {copiedId === p.id ? (
                              <>
                                <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
                                Copied!
                              </>
                            ) : (
                              <>
                                <Copy className="w-3.5 h-3.5" />
                                Copy Link
                              </>
                            )}
                          </button>
                        ) : p.is_claimed ? (
                          <span className="text-xs text-dark-300">—</span>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
