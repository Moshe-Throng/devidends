"use client";

import { useEffect, useState } from "react";

// ── Tier config ─────────────────────────────────────────────────────────────

const TIERS = {
  architect: {
    label: "Architect",
    tagline: "Core builder. Shaping the network.",
    color: "#D4A853",
    bg: "rgba(212,168,83,0.08)",
    border: "rgba(212,168,83,0.25)",
    threshold: "15+ CVs or 3+ placements",
    perks: ["Revenue share on referral placements", "Quarterly strategy briefing with founders", "Co-branded profile badge (when public)", "Priority shortlist access"],
  },
  catalyst: {
    label: "Catalyst",
    tagline: "Active and trusted. Driving momentum.",
    color: "#27ABD2",
    bg: "rgba(39,171,210,0.08)",
    border: "rgba(39,171,210,0.25)",
    threshold: "5-14 CVs or 1+ placement",
    perks: ["Early access to ToRs (24h)", "Request candidates from the network", "Full CV scoring + all templates", "Co-Creators private group access"],
  },
  contributor: {
    label: "Contributor",
    tagline: "Getting started. Every referral counts.",
    color: "#8B95A5",
    bg: "rgba(139,149,165,0.08)",
    border: "rgba(139,149,165,0.25)",
    threshold: "0-4 CVs",
    perks: ["Daily opportunity digest", "CV scoring for own profile", "Attribution on referred profiles"],
  },
};

type TierKey = keyof typeof TIERS;

type MemberData = {
  id: string;
  name: string;
  email: string | null;
  whatsapp_number: string | null;
  invite_token: string;
  member_number: number | null;
  status: string;
  preferred_channel: string | null;
  ask_frequency: string | null;
  preferred_sectors: string[] | null;
  interests: string[] | null;
  joined_at: string | null;
  invited_at: string;
  profile_id: string | null;
  tier: TierKey;
  score: number;
  stats: {
    cvsSent: number;
    placements: number;
    vouchesGiven: number;
    torsShared: number;
    avgCvScore: number | null;
    lastActive: string | null;
  };
  recentInteractions: { interaction_type: string; direction: string; created_at: string }[];
};

type GlobalStats = {
  total: number;
  joined: number;
  invited: number;
  activeThisMonth: number;
  totalCvs: number;
  totalPlacements: number;
  tierCounts: Record<TierKey, number>;
};

export default function CoCreatorsDashboard() {
  const [members, setMembers] = useState<MemberData[]>([]);
  const [stats, setStats] = useState<GlobalStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [view, setView] = useState<"leaderboard" | "tiers" | "all">("leaderboard");

  async function load() {
    const r = await fetch("/api/co-creators/admin");
    const d = await r.json();
    setMembers(d.members || []);
    setStats(d.stats || null);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function createInvite() {
    if (!newName.trim()) return;
    setCreating(true);
    const r = await fetch("/api/co-creators/admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName.trim() }),
    });
    const d = await r.json();
    setCreating(false);
    if (d.error) { alert(d.error); return; }
    setNewName("");
    load();
  }

  const origin = typeof window !== "undefined" ? window.location.origin : "https://devidends.net";
  const sorted = [...members].sort((a, b) => b.score - a.score);
  const joined = members.filter(m => m.status === "joined");
  const pending = members.filter(m => m.status === "invited");

  function relativeTime(dateStr: string | null) {
    if (!dateStr) return "—";
    const d = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const days = Math.floor(diff / 86400000);
    if (days === 0) return "Today";
    if (days === 1) return "Yesterday";
    if (days < 7) return `${days}d ago`;
    if (days < 30) return `${Math.floor(days / 7)}w ago`;
    return `${Math.floor(days / 30)}mo ago`;
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-[#0f1117] flex items-center justify-center">
        <div className="text-[#555] font-[Montserrat] text-sm tracking-wide">Loading dashboard...</div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#0f1117] font-[Montserrat] text-[#c8ccd4]">
      {/* Top bar */}
      <div className="border-b border-[#1e2130] px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-lg font-bold tracking-tight">
            <span className="text-[#27ABD2]">Dev</span><span className="text-[#e0e2e7]">idends</span>
          </span>
          <span className="text-[#3a3f50] text-lg font-light">/</span>
          <span className="text-sm text-[#8b95a5] tracking-wide">Co-Creators</span>
        </div>
        <div className="text-xs text-[#555]">{members.length} members</div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-8 space-y-8">
        {/* ── Overview stats ─────────────────────────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <StatCard label="Co-Creators" value={stats?.total || 0} sub={`${stats?.joined || 0} joined`} />
          <StatCard label="CVs Recommended" value={stats?.totalCvs || 0} accent />
          <StatCard label="Placements" value={stats?.totalPlacements || 0} />
          <StatCard label="Active this month" value={stats?.activeThisMonth || 0} />
          <StatCard label="Pending invites" value={stats?.invited || 0} />
        </div>

        {/* ── Tier overview ──────────────────────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {(["architect", "catalyst", "contributor"] as TierKey[]).map((key) => {
            const t = TIERS[key];
            const count = stats?.tierCounts?.[key] || 0;
            return (
              <div key={key} className="rounded-lg p-5" style={{ background: t.bg, border: `1px solid ${t.border}` }}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ background: t.color }} />
                    <span className="text-sm font-bold" style={{ color: t.color }}>{t.label}</span>
                  </div>
                  <span className="text-2xl font-bold" style={{ color: t.color }}>{count}</span>
                </div>
                <div className="text-xs text-[#8b95a5] mb-3">{t.tagline}</div>
                <div className="text-xs text-[#555] mb-2">{t.threshold}</div>
                <div className="space-y-1">
                  {t.perks.map((p, i) => (
                    <div key={i} className="text-xs text-[#6b7280] flex items-start gap-1.5">
                      <span style={{ color: t.color }} className="mt-0.5 text-[10px]">+</span>
                      {p}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* ── View toggle + invite bar ───────────────────────────────── */}
        <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
          <div className="flex gap-1 bg-[#161923] rounded-lg p-1">
            {(["leaderboard", "tiers", "all"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-4 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  view === v ? "bg-[#1e2130] text-[#e0e2e7]" : "text-[#555] hover:text-[#8b95a5]"
                }`}
              >
                {v === "leaderboard" ? "Leaderboard" : v === "tiers" ? "By Tier" : "All Members"}
              </button>
            ))}
          </div>

          <div className="flex gap-2 w-full md:w-auto">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && createInvite()}
              placeholder="Invite new Co-Creator..."
              className="flex-1 md:w-64 bg-[#161923] border border-[#1e2130] rounded-lg px-3 py-2 text-sm text-[#e0e2e7] placeholder-[#3a3f50] focus:outline-none focus:border-[#27ABD2]/50"
            />
            <button
              onClick={createInvite}
              disabled={creating}
              className="bg-[#27ABD2] hover:bg-[#1e98bd] disabled:opacity-50 text-white font-semibold px-4 py-2 rounded-lg text-sm transition-colors whitespace-nowrap"
            >
              {creating ? "..." : "Invite"}
            </button>
          </div>
        </div>

        {/* ── Member list ────────────────────────────────────────────── */}
        {view === "leaderboard" && (
          <div className="space-y-2">
            {sorted.map((m, i) => (
              <MemberRow key={m.id} m={m} rank={i + 1} origin={origin} expanded={expandedId === m.id} onToggle={() => setExpandedId(expandedId === m.id ? null : m.id)} relativeTime={relativeTime} />
            ))}
          </div>
        )}

        {view === "tiers" && (
          <div className="space-y-6">
            {(["architect", "catalyst", "contributor"] as TierKey[]).map((tier) => {
              const tierMembers = sorted.filter(m => m.tier === tier);
              if (tierMembers.length === 0) return null;
              const t = TIERS[tier];
              return (
                <div key={tier}>
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-2 h-2 rounded-full" style={{ background: t.color }} />
                    <span className="text-sm font-bold" style={{ color: t.color }}>{t.label}s</span>
                    <span className="text-xs text-[#555]">({tierMembers.length})</span>
                  </div>
                  <div className="space-y-2">
                    {tierMembers.map((m) => (
                      <MemberRow key={m.id} m={m} rank={sorted.indexOf(m) + 1} origin={origin} expanded={expandedId === m.id} onToggle={() => setExpandedId(expandedId === m.id ? null : m.id)} relativeTime={relativeTime} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {view === "all" && (
          <div className="space-y-6">
            {joined.length > 0 && (
              <div>
                <div className="text-xs text-[#555] tracking-wider uppercase mb-3">Joined ({joined.length})</div>
                <div className="space-y-2">
                  {joined.map((m) => (
                    <MemberRow key={m.id} m={m} rank={sorted.indexOf(m) + 1} origin={origin} expanded={expandedId === m.id} onToggle={() => setExpandedId(expandedId === m.id ? null : m.id)} relativeTime={relativeTime} />
                  ))}
                </div>
              </div>
            )}
            {pending.length > 0 && (
              <div>
                <div className="text-xs text-[#555] tracking-wider uppercase mb-3">Pending invites ({pending.length})</div>
                <div className="space-y-2">
                  {pending.map((m) => (
                    <PendingRow key={m.id} m={m} origin={origin} relativeTime={relativeTime} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}

// ── Components ────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, accent }: { label: string; value: number; sub?: string; accent?: boolean }) {
  return (
    <div className="bg-[#161923] border border-[#1e2130] rounded-lg p-4">
      <div className="text-xs text-[#555] tracking-wide mb-1">{label}</div>
      <div className={`text-2xl font-bold ${accent ? "text-[#27ABD2]" : "text-[#e0e2e7]"}`}>{value}</div>
      {sub && <div className="text-xs text-[#3a3f50] mt-1">{sub}</div>}
    </div>
  );
}

function MemberRow({ m, rank, origin, expanded, onToggle, relativeTime }: {
  m: MemberData; rank: number; origin: string; expanded: boolean;
  onToggle: () => void; relativeTime: (s: string | null) => string;
}) {
  const t = TIERS[m.tier];

  return (
    <div className="bg-[#161923] border border-[#1e2130] rounded-lg overflow-hidden transition-colors hover:border-[#2a2f42]">
      <button onClick={onToggle} className="w-full px-5 py-4 flex items-center gap-4 text-left">
        {/* Rank */}
        <div className="w-8 text-center">
          {rank <= 3 ? (
            <span className={`text-lg font-bold ${rank === 1 ? "text-[#D4A853]" : rank === 2 ? "text-[#8B95A5]" : "text-[#9a6b3e]"}`}>
              {rank}
            </span>
          ) : (
            <span className="text-sm text-[#3a3f50]">{rank}</span>
          )}
        </div>

        {/* Tier dot */}
        <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: t.color }} title={t.label} />

        {/* Name + meta */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-[#e0e2e7] truncate">{m.name}</span>
            <span className="text-[10px] font-bold tracking-wider uppercase px-1.5 py-0.5 rounded" style={{ color: t.color, background: t.bg, border: `1px solid ${t.border}` }}>
              {t.label}
            </span>
            {m.status === "invited" && (
              <span className="text-[10px] text-[#555] bg-[#1e2130] px-1.5 py-0.5 rounded">pending</span>
            )}
          </div>
          <div className="text-xs text-[#555] mt-0.5">
            {m.preferred_channel || "—"} · {m.ask_frequency || "—"}
            {m.preferred_sectors?.length ? ` · ${m.preferred_sectors.slice(0, 2).join(", ")}` : ""}
          </div>
        </div>

        {/* Stats */}
        <div className="hidden md:flex items-center gap-6 text-xs">
          <Metric label="CVs" value={m.stats.cvsSent} accent={m.stats.cvsSent >= 5} />
          <Metric label="Vouches" value={m.stats.vouchesGiven} />
          <Metric label="ToRs" value={m.stats.torsShared} />
          <Metric label="Avg score" value={m.stats.avgCvScore !== null ? `${m.stats.avgCvScore}` : "—"} />
          <div className="text-[#555] w-16 text-right">{relativeTime(m.stats.lastActive)}</div>
        </div>

        {/* Score */}
        <div className="text-right w-12">
          <div className="text-sm font-bold" style={{ color: t.color }}>{m.score}</div>
          <div className="text-[10px] text-[#3a3f50]">pts</div>
        </div>

        {/* Expand chevron */}
        <svg className={`w-4 h-4 text-[#3a3f50] transition-transform ${expanded ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {expanded && (
        <div className="px-5 pb-5 border-t border-[#1e2130] pt-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <Detail label="Email" value={m.email} />
            <Detail label="WhatsApp" value={m.whatsapp_number} />
            <Detail label="Joined" value={m.joined_at ? new Date(m.joined_at).toLocaleDateString("en-GB") : "Not yet"} />
            <Detail label="Member #" value={m.member_number ? `#${m.member_number}` : "—"} />
          </div>

          {/* Interests */}
          {m.interests && m.interests.length > 0 && (
            <div className="mb-4">
              <div className="text-[10px] text-[#555] tracking-wider uppercase mb-2">Interests</div>
              <div className="flex flex-wrap gap-1.5">
                {m.interests.map((int) => (
                  <span key={int} className="text-xs px-2 py-0.5 rounded bg-[#1e2130] text-[#8b95a5]">{int.replace(/_/g, " ")}</span>
                ))}
              </div>
            </div>
          )}

          {/* Progress to next tier */}
          {m.tier !== "architect" && (
            <div className="mb-4">
              <div className="text-[10px] text-[#555] tracking-wider uppercase mb-2">Progress to {m.tier === "contributor" ? "Catalyst" : "Architect"}</div>
              <TierProgress current={m.stats.cvsSent} target={m.tier === "contributor" ? 5 : 15} color={m.tier === "contributor" ? TIERS.catalyst.color : TIERS.architect.color} />
            </div>
          )}

          {/* Recent interactions */}
          {m.recentInteractions.length > 0 && (
            <div className="mb-4">
              <div className="text-[10px] text-[#555] tracking-wider uppercase mb-2">Recent activity</div>
              <div className="space-y-1">
                {m.recentInteractions.map((i, idx) => (
                  <div key={idx} className="text-xs flex items-center gap-2 text-[#6b7280]">
                    <span className={`w-1.5 h-1.5 rounded-full ${i.direction === "inbound" ? "bg-[#27ABD2]" : "bg-[#555]"}`} />
                    <span>{i.interaction_type.replace(/_/g, " ")}</span>
                    <span className="text-[#3a3f50] ml-auto">{relativeTime(i.created_at)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Invite link */}
          <div className="flex items-center gap-2 mt-3">
            <code className="text-xs bg-[#0f1117] border border-[#1e2130] px-3 py-1.5 rounded text-[#555] flex-1 truncate">
              {origin}/cc/{m.invite_token}
            </code>
            <button
              onClick={() => { navigator.clipboard.writeText(`${origin}/cc/${m.invite_token}`); }}
              className="text-xs text-[#27ABD2] hover:text-[#1e98bd] px-3 py-1.5 border border-[#1e2130] rounded hover:border-[#27ABD2]/30 transition-colors"
            >
              Copy link
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function PendingRow({ m, origin, relativeTime }: { m: MemberData; origin: string; relativeTime: (s: string | null) => string }) {
  return (
    <div className="bg-[#161923] border border-[#1e2130] rounded-lg px-5 py-4 flex items-center gap-4">
      <div className="w-2.5 h-2.5 rounded-full bg-[#3a3f50]" />
      <div className="flex-1 min-w-0">
        <span className="text-sm text-[#8b95a5]">{m.name}</span>
        <div className="text-xs text-[#3a3f50] mt-0.5">Invited {relativeTime(m.invited_at)}</div>
      </div>
      <div className="flex items-center gap-2">
        <code className="text-xs text-[#3a3f50]">{m.invite_token}</code>
        <button
          onClick={() => navigator.clipboard.writeText(`${origin}/cc/${m.invite_token}`)}
          className="text-xs text-[#555] hover:text-[#27ABD2] transition-colors"
        >
          Copy
        </button>
      </div>
    </div>
  );
}

function Metric({ label, value, accent }: { label: string; value: string | number; accent?: boolean }) {
  return (
    <div className="text-center w-14">
      <div className={`text-sm font-semibold ${accent ? "text-[#27ABD2]" : "text-[#e0e2e7]"}`}>{value}</div>
      <div className="text-[10px] text-[#3a3f50]">{label}</div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <div className="text-[10px] text-[#3a3f50] tracking-wider uppercase">{label}</div>
      <div className="text-xs text-[#8b95a5] mt-0.5">{value || "—"}</div>
    </div>
  );
}

function TierProgress({ current, target, color }: { current: number; target: number; color: string }) {
  const pct = Math.min(100, Math.round((current / target) * 100));
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-1.5 bg-[#1e2130] rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="text-xs text-[#555] w-20 text-right">{current}/{target} CVs</span>
    </div>
  );
}
