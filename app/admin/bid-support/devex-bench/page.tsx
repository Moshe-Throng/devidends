"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2, RefreshCw, AlertCircle, CheckCircle, Radar } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";

type CoverageRow = {
  batch_date: string;
  alert_type: string;
  total_entries: number;
  matched: number;
  coverage_pct: number;
  misses: number;
};

type MissDomain = {
  miss_domain: string;
  miss_count: number;
  first_seen: string;
  last_seen: string;
  alert_types: string[];
};

type UnmatchedEntry = {
  id: string;
  batch_date: string;
  alert_type: string;
  title: string;
  url: string;
  organization: string | null;
  country: string | null;
  miss_domain: string | null;
};

export default function DevexBenchPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [coverage, setCoverage] = useState<CoverageRow[]>([]);
  const [misses, setMisses] = useState<MissDomain[]>([]);
  const [unmatched, setUnmatched] = useState<UnmatchedEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) router.push("/login");
  }, [user, authLoading, router]);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/admin/devex-bench");
      const raw = await res.text();
      let d: any = null;
      try { d = JSON.parse(raw); } catch {}
      if (!res.ok) { setErr(d?.error || raw.slice(0, 300)); return; }
      setCoverage(d.coverage || []);
      setMisses(d.miss_domains || []);
      setUnmatched(d.unmatched || []);
    } catch (e: any) {
      setErr(e?.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  async function runMatcher() {
    setRunning(true);
    try {
      await fetch("/api/cron/devex-match");
      await load();
    } finally {
      setRunning(false);
    }
  }

  useEffect(() => {
    if (user) load();
  }, [user]);

  if (authLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-cyan-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-dark-50">
      <div className="bg-white border-b border-dark-100 px-6 py-4 sticky top-0 z-30">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/admin" className="text-dark-400 hover:text-dark-600">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <h1 className="text-lg font-extrabold text-dark-900 flex items-center gap-2">
                <Radar className="w-4 h-4 text-cyan-500" />
                Devex Benchmark
              </h1>
              <p className="text-xs text-dark-400">How well our crawlers cover what Devex sees.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={runMatcher}
              disabled={running}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 disabled:opacity-50"
            >
              {running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              Run matcher
            </button>
            <button
              onClick={load}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-dark-600 bg-white border border-dark-200 hover:bg-dark-50"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Refresh
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-6 space-y-6">
        {loading && <div className="text-xs text-dark-400">Loading...</div>}
        {err && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded px-3 py-2 flex items-center gap-2">
            <AlertCircle className="w-3.5 h-3.5" /> {err}
          </div>
        )}

        {/* Coverage table */}
        <section className="bg-white rounded-xl border border-dark-100">
          <div className="px-4 py-3 border-b border-dark-100 flex items-center justify-between">
            <h2 className="text-sm font-extrabold text-dark-900">Coverage (last 7 days)</h2>
            <span className="text-[10px] text-dark-400">matched / total opportunities</span>
          </div>
          <table className="w-full text-xs">
            <thead className="bg-dark-50/60 text-dark-500">
              <tr>
                <th className="text-left px-4 py-2 font-bold">Batch</th>
                <th className="text-left px-4 py-2 font-bold">Alert type</th>
                <th className="text-right px-4 py-2 font-bold">Matched</th>
                <th className="text-right px-4 py-2 font-bold">Total</th>
                <th className="text-right px-4 py-2 font-bold">Coverage</th>
                <th className="text-right px-4 py-2 font-bold">Misses</th>
              </tr>
            </thead>
            <tbody>
              {coverage.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center py-6 text-dark-400">
                    No emails received yet. Set up the inbound webhook + Gmail filter to start.
                  </td>
                </tr>
              )}
              {coverage.map((c) => {
                const pct = Math.round((c.coverage_pct || 0) * 100);
                const color = pct >= 80 ? "bg-emerald-500" : pct >= 50 ? "bg-amber-500" : "bg-red-500";
                return (
                  <tr key={`${c.batch_date}_${c.alert_type}`} className="border-t border-dark-100">
                    <td className="px-4 py-2 font-semibold">{c.batch_date}</td>
                    <td className="px-4 py-2 text-dark-600">{c.alert_type}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{c.matched}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{c.total_entries}</td>
                    <td className="px-4 py-2 text-right">
                      <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold text-white ${color}`}>
                        {pct}%
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-red-600">{c.misses}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>

        {/* Top miss domains */}
        <section className="bg-white rounded-xl border border-dark-100">
          <div className="px-4 py-3 border-b border-dark-100">
            <h2 className="text-sm font-extrabold text-dark-900">Top miss domains</h2>
            <p className="text-[10px] text-dark-400 mt-0.5">Domains that appear on Devex but we&apos;re not capturing. Crawler backlog.</p>
          </div>
          {misses.length === 0 ? (
            <div className="px-4 py-6 text-xs text-dark-400 text-center">No unmatched domains yet.</div>
          ) : (
            <ul>
              {misses.map((m) => (
                <li key={m.miss_domain} className="px-4 py-2 border-t border-dark-100 flex items-center justify-between text-xs">
                  <div>
                    <span className="font-bold text-dark-900">{m.miss_domain}</span>
                    <span className="text-dark-400 ml-2">({(m.alert_types || []).join(", ")})</span>
                  </div>
                  <span className="px-2 py-0.5 rounded bg-red-50 text-red-700 font-bold tabular-nums">{m.miss_count}×</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Most recent unmatched entries (sample) */}
        <section className="bg-white rounded-xl border border-dark-100">
          <div className="px-4 py-3 border-b border-dark-100">
            <h2 className="text-sm font-extrabold text-dark-900">Recent unmatched entries</h2>
            <p className="text-[10px] text-dark-400 mt-0.5">Sampled from the last 100 misses. Useful for spot-checking parser quality.</p>
          </div>
          {unmatched.length === 0 ? (
            <div className="px-4 py-6 text-xs text-dark-400 text-center">None.</div>
          ) : (
            <ul>
              {unmatched.map((u) => (
                <li key={u.id} className="px-4 py-2 border-t border-dark-100 text-xs">
                  <div className="font-semibold text-dark-900 truncate">{u.title}</div>
                  <div className="text-[11px] text-dark-500 truncate">
                    {u.organization || "?"} · {u.country || "?"} · <a className="text-cyan-600 underline" href={u.url} target="_blank" rel="noreferrer">{u.url}</a>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
