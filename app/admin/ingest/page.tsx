"use client";

import { useState, useEffect, useRef, useMemo } from "react";
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
  cv_structured_data: any | null;
  gender: string | null;
  nationality: string | null;
  languages: string[] | null;
  education_level: string | null;
  recommended_by: string | null;
  is_recommender: boolean;
  tags: string[];
  admin_notes: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  availability: string | null;
  daily_rate_usd: number | null;
  certifications: string[] | null;
  claim_token: string | null;
  claim_link_tg: string | null;
  claim_link_web: string | null;
  claimed_at: string | null;
  is_claimed: boolean;
  profile_type: string | null;
  source: string | null;
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
      const res = await fetch("/api/admin/ingest?all=true");
      const data = await res.json();
      setProfiles(data.profiles || []);
    } catch {
      setError("Failed to load profiles");
    } finally {
      setLoadingProfiles(false);
    }
  }

  // Derived: active recommenders (for dropdowns)
  const recommenderNames = useMemo(
    () =>
      Array.from(
        new Set(
          (profiles || [])
            .filter((p) => p.is_recommender && p.name)
            .map((p) => p.name)
        )
      ).sort((a, b) => a.localeCompare(b)),
    [profiles]
  );

  // Metadata fields for batch ingestion
  const [metaRecommendedBy, setMetaRecommendedBy] = useState("");
  const [metaGender, setMetaGender] = useState("");
  const [metaIsRecommender, setMetaIsRecommender] = useState(false);
  const [metaTags, setMetaTags] = useState("");
  const [metaNotes, setMetaNotes] = useState("");

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
        if (metaRecommendedBy) form.append("recommended_by", metaRecommendedBy);
        if (metaGender) form.append("gender", metaGender);
        if (metaIsRecommender) form.append("is_recommender", "true");
        if (metaTags) form.append("tags", metaTags);
        if (metaNotes) form.append("admin_notes", metaNotes);

        const res = await fetch("/api/admin/ingest", {
          method: "POST",
          body: form,
        });

        const data = await res.json();
        if (data.success && data.profile) {
          results.push(data.profile);
          if (data.dup_warning) {
            setWarnings((prev) => ({ ...prev, [data.profile.id]: data.dup_warning }));
          }
        } else {
          setError(`${file.name}: ${data.error || "Failed"}`);
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
  const [warnings, setWarnings] = useState<Record<string, string>>({});

  function copyText(text: string, id: string) {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
    try {
      const res = await fetch("/api/admin/ingest", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      if (data.success) {
        setProfiles((prev) => prev.filter((p) => p.id !== id));
      } else {
        setError(`Delete failed: ${data.error || "Unknown"}`);
      }
    } catch (err: any) { setError(`Delete failed: ${err.message}`); }
  }

  // Search + filter
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | "claimed" | "pending">("all");
  const [filterSource, setFilterSource] = useState<"all" | "admin_ingest" | "telegram" | "web">("all");

  const filtered = profiles.filter(p => {
    if (filterStatus === "claimed" && !p.is_claimed) return false;
    if (filterStatus === "pending" && p.is_claimed) return false;
    if (filterSource !== "all" && (p as any).source !== filterSource) return false;
    if (search) {
      const q = search.toLowerCase();
      return (p.name || "").toLowerCase().includes(q) ||
        (p.headline || "").toLowerCase().includes(q) ||
        (p.sectors || []).some(s => s.toLowerCase().includes(q)) ||
        (p.recommended_by || "").toLowerCase().includes(q) ||
        (p.tags || []).some(t => t.toLowerCase().includes(q)) ||
        (p.nationality || "").toLowerCase().includes(q);
    }
    return true;
  });

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
        {/* AI Expert Matching */}
        <ExpertMatcher />

        {/* Search + filters */}
        <div className="flex items-center gap-3">
          <div className="flex-1 relative">
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by name, sector, nationality, tag..."
              className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-dark-200 text-sm focus:border-cyan-400 focus:outline-none bg-white"
            />
            <svg className="w-4 h-4 text-dark-300 absolute left-3 top-1/2 -translate-y-1/2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          </div>
          <div className="flex rounded-lg border border-dark-200 overflow-hidden text-xs">
            {(["all", "pending", "claimed"] as const).map(s => (
              <button key={s} onClick={() => setFilterStatus(s)} className={`px-3 py-2 font-semibold capitalize transition-colors ${filterStatus === s ? "bg-cyan-500 text-white" : "bg-white text-dark-500 hover:bg-dark-50"}`}>
                {s}
              </button>
            ))}
          </div>
          <div className="flex rounded-lg border border-dark-200 overflow-hidden text-xs">
            {(["all", "admin_ingest", "telegram", "web"] as const).map(s => (
              <button key={s} onClick={() => setFilterSource(s)} className={`px-3 py-2 font-semibold transition-colors ${filterSource === s ? "bg-teal-500 text-white" : "bg-white text-dark-500 hover:bg-dark-50"}`}>
                {s === "all" ? "All Sources" : s === "admin_ingest" ? "Ingested" : s === "telegram" ? "Telegram" : "Web"}
              </button>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-dark-100 p-4">
          <p className="text-[10px] font-bold text-dark-400 uppercase tracking-wider mb-3">Batch metadata (applied to all uploads)</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="text-[10px] font-semibold text-dark-500 mb-1 block">Recommended By</label>
              <select
                value={metaRecommendedBy}
                onChange={e => setMetaRecommendedBy(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-dark-200 text-xs focus:border-cyan-400 focus:outline-none bg-white"
              >
                <option value="">— Select recommender —</option>
                {recommenderNames.map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-semibold text-dark-500 mb-1 block">Gender</label>
              <select value={metaGender} onChange={e => setMetaGender(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-dark-200 text-xs focus:border-cyan-400 focus:outline-none bg-white">
                <option value="">Auto-detect</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] font-semibold text-dark-500 mb-1 block">Tags</label>
              <input value={metaTags} onChange={e => setMetaTags(e.target.value)} placeholder="priority, verified" className="w-full px-3 py-2 rounded-lg border border-dark-200 text-xs focus:border-cyan-400 focus:outline-none" />
            </div>
            <div className="flex items-end gap-2">
              <label className="flex items-center gap-2 text-xs text-dark-600 cursor-pointer">
                <input type="checkbox" checked={metaIsRecommender} onChange={e => setMetaIsRecommender(e.target.checked)} className="rounded border-dark-300" />
                Is Recommender
              </label>
            </div>
          </div>
          <div className="mt-3">
            <label className="text-[10px] font-semibold text-dark-500 mb-1 block">Admin Notes</label>
            <input value={metaNotes} onChange={e => setMetaNotes(e.target.value)} placeholder="Optional notes about this batch" className="w-full px-3 py-2 rounded-lg border border-dark-200 text-xs focus:border-cyan-400 focus:outline-none" />
          </div>
        </div>

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
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-dark-400 text-sm">
            No CVs ingested yet. Upload some above.
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((p) => {
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

                      {/* Full structured CV data — collapsible sections */}
                      {p.cv_structured_data && (
                        <CvDataView profileId={p.id} cv={p.cv_structured_data} onUpdate={(newCv) => setProfiles(prev => prev.map(x => x.id === p.id ? { ...x, cv_structured_data: newCv } : x))} />
                      )}

                      {/* Editable admin fields */}
                      <AdminFields profile={p} recommenderNames={recommenderNames} onSave={(updated) => setProfiles(prev => prev.map(x => x.id === p.id ? { ...x, ...updated } : x))} />

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

                      {/* Dup warning */}
                      {warnings[p.id] && (
                        <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-700 flex items-center gap-2">
                          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                          {warnings[p.id]}
                        </div>
                      )}

                      {/* Update CV + Delete */}
                      <div className="pt-2 border-t border-dark-100 flex items-center justify-between">
                        <label className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-cyan-600 hover:bg-cyan-50 transition-colors cursor-pointer">
                          <Upload className="w-3 h-3" />
                          Re-upload CV
                          <input type="file" accept=".pdf,.docx,.doc" className="hidden" onChange={async (ev) => {
                            ev.stopPropagation();
                            const file = ev.target.files?.[0];
                            if (!file) return;
                            const form = new FormData();
                            form.append("cv", file);
                            // Add metadata from current profile
                            if (p.recommended_by) form.append("recommended_by", p.recommended_by);
                            if (p.gender) form.append("gender", p.gender);
                            try {
                              const res = await fetch("/api/admin/ingest", { method: "POST", body: form });
                              const data = await res.json();
                              if (data.success) {
                                await fetch("/api/admin/ingest", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: p.id }) });
                                setProfiles(prev => [data.profile, ...prev.filter(x => x.id !== p.id)]);
                              } else {
                                setError(`Re-upload failed: ${data.error || "Unknown error"}`);
                              }
                            } catch (err: any) { setError(`Re-upload failed: ${err.message}`); }
                            ev.target.value = "";
                          }} />
                        </label>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDelete(p.id, p.name); }}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-red-500 hover:bg-red-50 transition-colors"
                        >
                          <Trash2 className="w-3 h-3" />
                          Delete
                        </button>
                      </div>
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

/* ── Editable admin fields ── */

function AdminFields({ profile: p, onSave, recommenderNames }: { profile: IngestedProfile; onSave: (updated: Partial<IngestedProfile>) => void; recommenderNames: string[] }) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [gender, setGender] = useState(p.gender || "");
  const [nationality, setNationality] = useState(p.nationality || "");
  const [email, setEmail] = useState(p.email || "");
  const [phone, setPhone] = useState(p.phone || "");
  const [city, setCity] = useState(p.city || "");
  const [recommendedBy, setRecommendedBy] = useState(p.recommended_by || "");
  const [isRecommender, setIsRecommender] = useState(p.is_recommender || false);
  const [profileType, setProfileType] = useState(p.profile_type || "");
  const [educationLevel, setEducationLevel] = useState(p.education_level || "");
  const [availability, setAvailability] = useState(p.availability || "");
  const [dailyRate, setDailyRate] = useState(p.daily_rate_usd != null ? String(p.daily_rate_usd) : "");
  const [tags, setTags] = useState((p.tags || []).join(", "));
  const [adminNotes, setAdminNotes] = useState(p.admin_notes || "");

  async function handleSave() {
    setSaving(true);
    try {
      const update: any = {
        id: p.id,
        gender: gender || null,
        nationality: nationality || null,
        email: email || null,
        phone: phone || null,
        city: city || null,
        recommended_by: recommendedBy || null,
        is_recommender: isRecommender,
        profile_type: profileType || null,
        education_level: educationLevel || null,
        availability: availability || null,
        daily_rate_usd: dailyRate ? parseInt(dailyRate) : null,
        tags: tags ? tags.split(",").map((t: string) => t.trim()).filter(Boolean) : [],
        admin_notes: adminNotes || null,
      };
      const res = await fetch("/api/admin/ingest", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(update) });
      const data = await res.json();
      if (data.success) {
        onSave(update);
        setSaved(true);
        setTimeout(() => { setSaved(false); setEditing(false); }, 1500);
      } else {
        alert("Update failed: " + (data.error || "Unknown error"));
      }
    } catch (err: any) { alert("Update failed: " + err.message); } finally { setSaving(false); }
  }

  const INPUT = "w-full px-2.5 py-1.5 rounded-lg border border-dark-200 text-xs focus:border-cyan-400 focus:outline-none";

  if (!editing) {
    return (
      <div className="pt-2 border-t border-dark-100">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[10px] font-bold text-dark-400 uppercase tracking-wider">Admin Fields</p>
          <button onClick={(e) => { e.stopPropagation(); setEditing(true); }} className="text-[10px] font-bold text-cyan-600 hover:text-cyan-700">Edit</button>
        </div>
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div><span className="text-dark-400">Gender:</span> <span className="text-dark-700 font-medium">{p.gender || "—"}</span></div>
          <div><span className="text-dark-400">Nationality:</span> <span className="text-dark-700 font-medium">{p.nationality || "—"}</span></div>
          <div><span className="text-dark-400">City:</span> <span className="text-dark-700 font-medium">{p.city || "—"}</span></div>
          <div><span className="text-dark-400">Type:</span> <span className="text-dark-700 font-medium">{p.profile_type || "—"}</span></div>
          <div><span className="text-dark-400">Education:</span> <span className="text-dark-700 font-medium">{p.education_level || "—"}</span></div>
          <div><span className="text-dark-400">Rate:</span> <span className="text-dark-700 font-medium">{p.daily_rate_usd ? `$${p.daily_rate_usd}/day` : "—"}</span></div>
          <div><span className="text-dark-400">Recommended by:</span> <span className="text-dark-700 font-medium">{p.recommended_by || "—"}</span></div>
          <div><span className="text-dark-400">Recommender:</span> <span className="text-dark-700 font-medium">{p.is_recommender ? "Yes" : "No"}</span></div>
          <div><span className="text-dark-400">Availability:</span> <span className="text-dark-700 font-medium">{p.availability || "—"}</span></div>
          {p.tags?.length > 0 && <div className="col-span-3"><span className="text-dark-400">Tags:</span> {p.tags.map((t: string) => <span key={t} className="ml-1 px-1.5 py-0.5 rounded text-[10px] bg-dark-100 text-dark-600">{t}</span>)}</div>}
          {p.admin_notes && <div className="col-span-3"><span className="text-dark-400">Notes:</span> <span className="text-dark-600">{p.admin_notes}</span></div>}
        </div>
      </div>
    );
  }

  return (
    <div className="pt-2 border-t border-dark-100" onClick={e => e.stopPropagation()}>
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] font-bold text-dark-400 uppercase tracking-wider">Edit Admin Fields</p>
        <div className="flex gap-2">
          <button onClick={() => setEditing(false)} className="text-[10px] font-semibold text-dark-400">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="text-[10px] font-bold text-white bg-cyan-500 px-2.5 py-1 rounded-lg disabled:opacity-50">
            {saved ? "Saved!" : saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
        <div>
          <label className="text-[10px] text-dark-400 block mb-0.5">Gender</label>
          <select value={gender} onChange={e => setGender(e.target.value)} className={INPUT + " bg-white"}>
            <option value="">—</option><option value="male">Male</option><option value="female">Female</option>
          </select>
        </div>
        <div>
          <label className="text-[10px] text-dark-400 block mb-0.5">Nationality</label>
          <input value={nationality} onChange={e => setNationality(e.target.value)} className={INPUT} placeholder="Ethiopian" />
        </div>
        <div>
          <label className="text-[10px] text-dark-400 block mb-0.5">City</label>
          <input value={city} onChange={e => setCity(e.target.value)} className={INPUT} placeholder="Addis Ababa" />
        </div>
        <div>
          <label className="text-[10px] text-dark-400 block mb-0.5">Email</label>
          <input value={email} onChange={e => setEmail(e.target.value)} className={INPUT} placeholder="email@example.com" />
        </div>
        <div>
          <label className="text-[10px] text-dark-400 block mb-0.5">Phone</label>
          <input value={phone} onChange={e => setPhone(e.target.value)} className={INPUT} placeholder="+251..." />
        </div>
        <div>
          <label className="text-[10px] text-dark-400 block mb-0.5">Profile Type</label>
          <select value={profileType} onChange={e => setProfileType(e.target.value)} className={INPUT + " bg-white"}>
            <option value="">—</option><option value="Expert">Expert (15+yr)</option><option value="Senior">Senior (10-14)</option><option value="Mid-level">Mid-level (5-9)</option><option value="Junior">Junior (2-4)</option><option value="Entry">Entry (0-1)</option>
          </select>
        </div>
        <div>
          <label className="text-[10px] text-dark-400 block mb-0.5">Education Level</label>
          <select value={educationLevel} onChange={e => setEducationLevel(e.target.value)} className={INPUT + " bg-white"}>
            <option value="">—</option><option value="PhD">PhD</option><option value="Masters">Masters</option><option value="Bachelors">Bachelors</option><option value="Diploma">Diploma</option>
          </select>
        </div>
        <div>
          <label className="text-[10px] text-dark-400 block mb-0.5">Daily Rate (USD)</label>
          <input type="number" value={dailyRate} onChange={e => setDailyRate(e.target.value)} className={INPUT} placeholder="500" />
        </div>
        <div>
          <label className="text-[10px] text-dark-400 block mb-0.5">Availability</label>
          <select value={availability} onChange={e => setAvailability(e.target.value)} className={INPUT + " bg-white"}>
            <option value="">—</option><option value="immediate">Immediate</option><option value="1_month">1 month</option><option value="3_months">3 months</option><option value="unavailable">Unavailable</option>
          </select>
        </div>
        <div>
          <label className="text-[10px] text-dark-400 block mb-0.5">Recommended By</label>
          <select value={recommendedBy} onChange={e => setRecommendedBy(e.target.value)} className={`${INPUT} bg-white`}>
            <option value="">— Select —</option>
            {recommendedBy && !recommenderNames.includes(recommendedBy) && (
              <option value={recommendedBy}>{recommendedBy} (legacy)</option>
            )}
            {recommenderNames.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </div>
        <div className="flex items-end pb-1">
          <label className="flex items-center gap-2 text-xs text-dark-600 cursor-pointer">
            <input type="checkbox" checked={isRecommender} onChange={e => setIsRecommender(e.target.checked)} className="rounded" />
            Is Recommender
          </label>
        </div>
        <div>
          <label className="text-[10px] text-dark-400 block mb-0.5">Tags (comma-separated)</label>
          <input value={tags} onChange={e => setTags(e.target.value)} className={INPUT} placeholder="priority, verified" />
        </div>
        <div className="col-span-2 md:col-span-3">
          <label className="text-[10px] text-dark-400 block mb-0.5">Admin Notes</label>
          <input value={adminNotes} onChange={e => setAdminNotes(e.target.value)} className={INPUT} placeholder="Internal notes about this expert" />
        </div>
      </div>
    </div>
  );
}

/* ── Collapsible, editable CV data viewer ── */

/* ── AI Expert Matcher ── */

function ExpertMatcher() {
  const [torText, setTorText] = useState("");
  const [matching, setMatching] = useState(false);
  const [results, setResults] = useState<any[] | null>(null);
  const [reqs, setReqs] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(true);

  async function handleMatch() {
    if (matching || torText.length < 50) return;
    setMatching(true);
    setError(null);
    setResults(null);

    try {
      const res = await fetch("/api/admin/match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tor_text: torText, max_results: 15 }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Matching failed");
      setReqs(data.requirements);
      setResults(data.results);
    } catch (err: any) {
      setError(err.message || "Matching failed");
    } finally {
      setMatching(false);
    }
  }

  return (
    <div className="bg-white rounded-xl border border-dark-100 overflow-hidden">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center justify-between px-5 py-3 hover:bg-dark-50/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center">
            <svg className="w-4 h-4 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
          </div>
          <div className="text-left">
            <p className="text-sm font-bold text-dark-900">AI Expert Matching</p>
            <p className="text-[10px] text-dark-400">Paste a ToR or job description to find matching experts</p>
          </div>
        </div>
        <svg className={`w-4 h-4 text-dark-300 transition-transform ${collapsed ? "" : "rotate-180"}`} viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd"/></svg>
      </button>

      {!collapsed && (
        <div className="border-t border-dark-100 px-5 py-4 space-y-4">
          <textarea
            value={torText}
            onChange={e => setTorText(e.target.value)}
            placeholder="Paste Terms of Reference, Job Description, or key requirements here...&#10;&#10;Example: Looking for a Senior WASH Specialist with 10+ years of GIZ/World Bank experience in Ethiopia, Masters in Public Health, fluent in English and Amharic..."
            className="w-full h-32 px-3 py-2.5 rounded-xl border border-dark-200 text-sm focus:border-indigo-400 focus:outline-none resize-y placeholder:text-dark-300"
          />
          <div className="flex items-center gap-3">
            <button
              onClick={handleMatch}
              disabled={matching || torText.length < 50}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-500 text-white font-bold text-sm hover:bg-indigo-600 disabled:opacity-40 transition-colors"
            >
              {matching ? <Loader2 className="w-4 h-4 animate-spin" /> : <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>}
              {matching ? "Matching..." : "Find Experts"}
            </button>
            {torText.length > 0 && torText.length < 50 && (
              <span className="text-xs text-dark-400">Need at least 50 characters</span>
            )}
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700 flex items-center gap-2">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              {error}
            </div>
          )}

          {/* Extracted requirements */}
          {reqs && (
            <div className="bg-indigo-50/50 rounded-xl px-4 py-3 space-y-1.5">
              <p className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider">Extracted Requirements</p>
              <div className="flex flex-wrap gap-2 text-xs">
                {reqs.title && <span className="px-2 py-0.5 rounded bg-indigo-100 text-indigo-700 font-semibold">{reqs.title}</span>}
                {reqs.donor && <span className="px-2 py-0.5 rounded bg-teal-100 text-teal-700 font-semibold">{reqs.donor}</span>}
                {reqs.required_experience_years && <span className="px-2 py-0.5 rounded bg-dark-100 text-dark-600">{reqs.required_experience_years}+ years</span>}
                {reqs.required_education && <span className="px-2 py-0.5 rounded bg-dark-100 text-dark-600">{reqs.required_education}</span>}
                {(reqs.sectors || []).map((s: string) => <span key={s} className="px-2 py-0.5 rounded bg-cyan-100 text-cyan-700">{s}</span>)}
                {(reqs.required_languages || []).map((l: string) => <span key={l} className="px-2 py-0.5 rounded bg-amber-100 text-amber-700">{l}</span>)}
                {(reqs.required_countries || []).map((c: string) => <span key={c} className="px-2 py-0.5 rounded bg-dark-100 text-dark-600">{c}</span>)}
              </div>
            </div>
          )}

          {/* Results */}
          {results && (
            <div className="space-y-2">
              <p className="text-[10px] font-bold text-dark-400 uppercase tracking-wider">{results.length} matches found</p>
              {results.map((r, i) => (
                <div key={r.id} className="bg-dark-50/30 rounded-xl p-3 flex items-start gap-3">
                  {/* Rank + score */}
                  <div className="text-center shrink-0 w-12">
                    <p className="text-lg font-extrabold text-dark-300">#{i + 1}</p>
                    <div className={`mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold text-white ${
                      (r.ai_fit_score || r.match_score) >= 70 ? "bg-emerald-500" :
                      (r.ai_fit_score || r.match_score) >= 50 ? "bg-amber-500" : "bg-red-400"
                    }`}>
                      {r.ai_fit_score || r.match_score}%
                    </div>
                  </div>

                  {/* Details */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-dark-900">{r.name}</p>
                    <p className="text-[11px] text-dark-500">{r.headline || [r.profile_type, ...(r.sectors || []).slice(0, 2)].filter(Boolean).join(" · ")}</p>

                    {/* AI reason */}
                    {r.ai_reason && (
                      <p className="text-[11px] text-indigo-600 mt-1 italic">{r.ai_reason}</p>
                    )}

                    {/* Quick stats */}
                    <div className="flex flex-wrap gap-2 mt-1.5 text-[10px]">
                      {r.years_of_experience && <span className="text-dark-400">{r.years_of_experience}yr exp</span>}
                      {r.education_level && <span className="text-dark-400">{r.education_level}</span>}
                      {r.nationality && <span className="text-dark-400">{r.nationality}</span>}
                      {r.cv_score && <span className="text-dark-400">CV: {r.cv_score}/100</span>}
                    </div>

                    {/* Recent roles */}
                    {r.recent_roles?.length > 0 && (
                      <div className="mt-1.5 space-y-0.5">
                        {r.recent_roles.map((role: any, j: number) => (
                          <p key={j} className="text-[10px] text-dark-400">
                            {role.position} at {role.employer} ({role.from_date}–{role.to_date})
                          </p>
                        ))}
                      </div>
                    )}

                    {/* Contact */}
                    <div className="flex gap-3 mt-1.5 text-[10px]">
                      {r.email && <span className="text-cyan-600">{r.email}</span>}
                      {r.phone && <span className="text-dark-400">{r.phone}</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CvDataView({ profileId, cv, onUpdate }: { profileId: string; cv: any; onUpdate: (cv: any) => void }) {
  const [openSection, setOpenSection] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [editCv, setEditCv] = useState<any>(null);

  function startEdit() { setEditCv(JSON.parse(JSON.stringify(cv))); }

  async function saveEdit() {
    if (!editCv) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/ingest", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: profileId, cv_structured_data: editCv }),
      });
      const data = await res.json();
      if (data.success) { onUpdate(editCv); setEditCv(null); }
      else alert("Update failed: " + (data.error || "Unknown"));
    } catch (err: any) { alert("Update failed: " + err.message); } finally { setSaving(false); }
  }

  const data = editCv || cv;
  const isEditing = !!editCv;
  const INP = "w-full px-2 py-1 rounded border border-dark-200 text-xs focus:border-cyan-400 focus:outline-none";
  const toggle = (key: string) => setOpenSection(openSection === key ? null : key);

  const sections = [
    { key: "summary", label: "Professional Summary", count: data.professional_summary ? 1 : 0 },
    { key: "employment", label: "Employment", count: (data.employment || []).length },
    { key: "education", label: "Education", count: (data.education || []).length },
    { key: "languages", label: "Languages", count: (data.languages || []).length },
    { key: "certifications", label: "Certifications", count: (data.certifications || []).filter(Boolean).length },
    { key: "qualifications", label: "Key Qualifications", count: data.key_qualifications ? 1 : 0 },
  ].filter(s => s.count > 0);

  return (
    <div className="pt-2 border-t border-dark-100 space-y-1" onClick={e => e.stopPropagation()}>
      <div className="flex items-center justify-between mb-1">
        <p className="text-[10px] font-bold text-dark-400 uppercase tracking-wider">CV Data</p>
        {!isEditing ? (
          <button onClick={startEdit} className="text-[10px] font-bold text-cyan-600">Edit CV Data</button>
        ) : (
          <div className="flex gap-2">
            <button onClick={() => setEditCv(null)} className="text-[10px] text-dark-400">Cancel</button>
            <button onClick={saveEdit} disabled={saving} className="text-[10px] font-bold text-white bg-cyan-500 px-2.5 py-1 rounded-lg disabled:opacity-50">
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        )}
      </div>
      {sections.map(s => (
        <div key={s.key} className="rounded-lg border border-dark-100 overflow-hidden">
          <button onClick={() => toggle(s.key)} className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold text-dark-700 hover:bg-dark-50">
            <span>{s.label} ({s.count})</span>
            <svg className={`w-3.5 h-3.5 text-dark-300 transition-transform ${openSection === s.key ? "rotate-180" : ""}`} viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd"/></svg>
          </button>
          {openSection === s.key && (
            <div className="border-t border-dark-100 px-3 py-2 bg-white space-y-2">
              {s.key === "summary" && (isEditing
                ? <textarea value={data.professional_summary || ""} onChange={e => setEditCv({...editCv, professional_summary: e.target.value})} className={INP + " h-24 resize-none"} />
                : <p className="text-xs text-dark-600 whitespace-pre-line">{data.professional_summary}</p>
              )}
              {s.key === "qualifications" && (isEditing
                ? <textarea value={data.key_qualifications || ""} onChange={e => setEditCv({...editCv, key_qualifications: e.target.value})} className={INP + " h-20 resize-none"} />
                : <p className="text-xs text-dark-600 whitespace-pre-line">{data.key_qualifications}</p>
              )}
              {s.key === "employment" && (data.employment || []).map((emp: any, i: number) => (
                <div key={i} className="bg-dark-50/50 rounded-lg p-2.5 space-y-1.5">
                  {isEditing ? (<>
                    <div className="grid grid-cols-2 gap-1.5">
                      <input value={emp.position||""} onChange={e => {const a=[...editCv.employment]; a[i]={...a[i],position:e.target.value}; setEditCv({...editCv,employment:a});}} className={INP} placeholder="Position" />
                      <input value={emp.employer||""} onChange={e => {const a=[...editCv.employment]; a[i]={...a[i],employer:e.target.value}; setEditCv({...editCv,employment:a});}} className={INP} placeholder="Employer" />
                      <input value={emp.from_date||""} onChange={e => {const a=[...editCv.employment]; a[i]={...a[i],from_date:e.target.value}; setEditCv({...editCv,employment:a});}} className={INP} placeholder="From (YYYY-MM)" />
                      <input value={emp.to_date||""} onChange={e => {const a=[...editCv.employment]; a[i]={...a[i],to_date:e.target.value}; setEditCv({...editCv,employment:a});}} className={INP} placeholder="To" />
                      <input value={emp.country||""} onChange={e => {const a=[...editCv.employment]; a[i]={...a[i],country:e.target.value}; setEditCv({...editCv,employment:a});}} className={INP} placeholder="Country" />
                    </div>
                    <textarea value={emp.description_of_duties||""} onChange={e => {const a=[...editCv.employment]; a[i]={...a[i],description_of_duties:e.target.value}; setEditCv({...editCv,employment:a});}} className={INP + " h-20 resize-y"} placeholder="Description of duties" />
                  </>) : (<>
                    <p className="text-xs text-dark-800 font-semibold">{emp.position}</p>
                    <p className="text-[11px] text-dark-500">{emp.employer}{emp.country&&` · ${emp.country}`}{(emp.from_date||emp.to_date)&&` · ${[emp.from_date,emp.to_date].filter(Boolean).join(" – ")}`}</p>
                    {emp.description_of_duties && <p className="text-[11px] text-dark-500 whitespace-pre-line mt-1">{emp.description_of_duties}</p>}
                  </>)}
                </div>
              ))}
              {s.key === "education" && (data.education || []).map((edu: any, i: number) => (
                <div key={i} className="bg-dark-50/50 rounded-lg p-2.5">
                  {isEditing ? (
                    <div className="grid grid-cols-2 gap-1.5">
                      <input value={edu.degree||""} onChange={e => {const a=[...editCv.education]; a[i]={...a[i],degree:e.target.value}; setEditCv({...editCv,education:a});}} className={INP} placeholder="Degree" />
                      <input value={edu.field_of_study||""} onChange={e => {const a=[...editCv.education]; a[i]={...a[i],field_of_study:e.target.value}; setEditCv({...editCv,education:a});}} className={INP} placeholder="Field" />
                      <input value={edu.institution||""} onChange={e => {const a=[...editCv.education]; a[i]={...a[i],institution:e.target.value}; setEditCv({...editCv,education:a});}} className={INP} placeholder="Institution" />
                      <input value={edu.year_graduated||""} onChange={e => {const a=[...editCv.education]; a[i]={...a[i],year_graduated:e.target.value}; setEditCv({...editCv,education:a});}} className={INP} placeholder="Year" />
                      <input value={edu.country||""} onChange={e => {const a=[...editCv.education]; a[i]={...a[i],country:e.target.value}; setEditCv({...editCv,education:a});}} className={INP} placeholder="Country" />
                    </div>
                  ) : (<>
                    <p className="text-xs text-dark-800 font-semibold">{edu.degree}{edu.field_of_study&&` in ${edu.field_of_study}`}</p>
                    <p className="text-[11px] text-dark-500">{edu.institution}{edu.country&&` · ${edu.country}`}{edu.year_graduated&&` · ${edu.year_graduated}`}</p>
                  </>)}
                </div>
              ))}
              {s.key === "languages" && (data.languages || []).map((lang: any, i: number) => (
                <div key={i} className="text-xs">
                  {isEditing ? (
                    <div className="grid grid-cols-4 gap-1.5">
                      <input value={lang.language||""} onChange={e => {const a=[...editCv.languages]; a[i]={...a[i],language:e.target.value}; setEditCv({...editCv,languages:a});}} className={INP} placeholder="Language" />
                      <select value={lang.speaking||""} onChange={e => {const a=[...editCv.languages]; a[i]={...a[i],speaking:e.target.value}; setEditCv({...editCv,languages:a});}} className={INP+" bg-white"}><option value="">Speaking</option><option>Excellent</option><option>Good</option><option>Fair</option></select>
                      <select value={lang.reading||""} onChange={e => {const a=[...editCv.languages]; a[i]={...a[i],reading:e.target.value}; setEditCv({...editCv,languages:a});}} className={INP+" bg-white"}><option value="">Reading</option><option>Excellent</option><option>Good</option><option>Fair</option></select>
                      <select value={lang.writing||""} onChange={e => {const a=[...editCv.languages]; a[i]={...a[i],writing:e.target.value}; setEditCv({...editCv,languages:a});}} className={INP+" bg-white"}><option value="">Writing</option><option>Excellent</option><option>Good</option><option>Fair</option></select>
                    </div>
                  ) : (
                    <span className="text-dark-600">{lang.language}: {[lang.speaking&&`Speaking ${lang.speaking}`,lang.reading&&`Reading ${lang.reading}`,lang.writing&&`Writing ${lang.writing}`].filter(Boolean).join(", ")}</span>
                  )}
                </div>
              ))}
              {s.key === "certifications" && (isEditing
                ? <textarea value={(data.certifications||[]).join("\n")} onChange={e => setEditCv({...editCv, certifications: e.target.value.split("\n").filter(Boolean)})} className={INP + " h-16 resize-none"} placeholder="One per line" />
                : <div className="flex flex-wrap gap-1">{(data.certifications||[]).filter(Boolean).map((c:string,i:number) => <span key={i} className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">{c}</span>)}</div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
