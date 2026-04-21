"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import {
  Trophy,
  Award,
  Users,
  TrendingUp,
  Sparkles,
  Calendar,
  CheckCircle2,
  ExternalLink,
  Loader2,
  Star,
} from "lucide-react";

const TIER_META: Record<string, { label: string; color: string; bg: string; tagline: string; nextThreshold?: number; nextLabel?: string }> = {
  architect: {
    label: "Architect",
    color: "#D4A853",
    bg: "rgba(212,168,83,0.10)",
    tagline: "Core builder. Shaping the network.",
  },
  catalyst: {
    label: "Catalyst",
    color: "#27ABD2",
    bg: "rgba(39,171,210,0.10)",
    tagline: "Active and trusted. Driving momentum.",
    nextThreshold: 15,
    nextLabel: "Architect",
  },
  contributor: {
    label: "Contributor",
    color: "#8B95A5",
    bg: "rgba(139,149,165,0.10)",
    tagline: "Getting started. Every referral counts.",
    nextThreshold: 5,
    nextLabel: "Catalyst",
  },
};

interface DashData {
  coCreator: { id: string; name: string; member_number: number; joined_at: string; role_title: string | null; preferred_sectors: string[] | null; preferred_channel: string | null; invite_token: string };
  profile: { id: string; name: string; cv_score: number | null };
  stats: {
    cvsSent: number;
    claimedCount: number;
    expertCount: number;
    placements: number;
    vouchesGiven: number;
    torsShared: number;
    avgCvScore: number | null;
    score: number;
    tier: string;
    networkSize: number;
  };
  recommended: { id: string; name: string; cv_score: number | null; claimed: boolean; sectors: string[]; profile_type: string | null; created_at: string }[];
  interactions: { interaction_type: string; direction: string; created_at: string; content: string | null }[];
}

export default function CoCreatorDashboard() {
  const { user, loading: authLoading } = useAuth();
  const [data, setData] = useState<DashData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { setError("Sign in to see your Co-Creator dashboard."); setLoading(false); return; }
    fetch("/api/co-creators/me")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error);
        else setData(d);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [user, authLoading]);

  if (loading || authLoading) {
    return (
      <main className="min-h-screen bg-[#0f1117] flex items-center justify-center text-[#8b95a5]">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading your dashboard…
      </main>
    );
  }

  if (error) {
    return (
      <main className="min-h-screen bg-[#0f1117] flex items-center justify-center px-6">
        <div className="max-w-md text-center">
          <p className="text-[#c8ccd4] mb-4">{error}</p>
          <Link href="/login" className="inline-block bg-[#27ABD2] hover:bg-[#1e98bd] text-white text-sm font-bold px-4 py-2 rounded-lg">Sign in</Link>
        </div>
      </main>
    );
  }

  if (!data) return null;

  const tier = TIER_META[data.stats.tier] || TIER_META.contributor;
  const next = tier.nextThreshold ? Math.min(100, Math.round((data.stats.cvsSent / tier.nextThreshold) * 100)) : 100;
  const firstName = data.coCreator.name.split(" ")[0];
  const joinedYear = new Date(data.coCreator.joined_at).getFullYear();

  return (
    <main className="min-h-screen bg-[#0f1117] font-[Montserrat] text-[#c8ccd4]">
      {/* Hero */}
      <div className="border-b border-[#1e2130]">
        <div className="max-w-5xl mx-auto px-6 py-10">
          <div className="flex items-start justify-between gap-6 flex-wrap">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="w-4 h-4" style={{ color: tier.color }} />
                <span className="text-xs tracking-widest uppercase font-bold" style={{ color: tier.color }}>{tier.label}</span>
                <span className="text-xs text-[#3a3f50]">·</span>
                <span className="text-xs text-[#555]">Member #{data.coCreator.member_number} · since {joinedYear}</span>
              </div>
              <h1 className="text-3xl md:text-4xl font-bold text-[#e0e2e7] mb-1">
                Welcome back, {firstName}.
              </h1>
              <p className="text-[#8b95a5] text-sm max-w-xl">{tier.tagline}</p>
            </div>
            <div className="text-right">
              <div className="text-xs text-[#555] mb-1">Contribution score</div>
              <div className="text-4xl font-bold" style={{ color: tier.color }}>{data.stats.score}</div>
              <div className="text-xs text-[#3a3f50]">pts</div>
            </div>
          </div>

          {/* Tier progress */}
          {tier.nextThreshold && (
            <div className="mt-6">
              <div className="flex items-center justify-between text-xs text-[#555] mb-1.5">
                <span>Progress to <span style={{ color: tier.color }}>{tier.nextLabel}</span></span>
                <span>{data.stats.cvsSent} / {tier.nextThreshold} CVs</span>
              </div>
              <div className="h-2 bg-[#1e2130] rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all duration-700" style={{ width: `${next}%`, background: tier.color }} />
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-8 space-y-8">
        {/* Headline stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Stat icon={Users} label="People you brought" value={data.stats.cvsSent} sub={`${data.stats.claimedCount} claimed their profile`} accent />
          <Stat icon={Trophy} label="Experts in your network" value={data.stats.expertCount} sub="(E)-tier consultants" />
          <Stat icon={TrendingUp} label="Avg CV score you bring in" value={data.stats.avgCvScore ?? "—"} sub="Out of 100" />
          <Stat icon={Award} label="Network size" value={data.stats.networkSize} sub="Co-Creators total" />
        </div>

        {/* Recommended people */}
        <section>
          <div className="flex items-baseline justify-between mb-4">
            <h2 className="text-lg font-bold text-[#e0e2e7]">People you've recommended</h2>
            <span className="text-xs text-[#555]">{data.recommended.length} total</span>
          </div>
          {data.recommended.length === 0 ? (
            <div className="bg-[#161923] border border-[#1e2130] rounded-lg p-8 text-center">
              <p className="text-sm text-[#8b95a5] mb-2">No recommendations yet.</p>
              <p className="text-xs text-[#555] max-w-md mx-auto">Forward a CV to <span className="text-[#27ABD2]">@Devidends_Bot</span> with the caption <code className="bg-[#1e2130] px-1.5 py-0.5 rounded">Recommended by {data.coCreator.name.split(" ")[0]}</code> and they'll show up here.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {data.recommended.slice(0, 20).map((p) => (
                <div key={p.id} className="bg-[#161923] border border-[#1e2130] rounded-lg px-4 py-3 flex items-center gap-4 hover:border-[#2a2f42] transition-colors">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-[#e0e2e7] truncate">{p.name}</span>
                      {p.profile_type === "Expert" && (
                        <span className="text-[10px] font-bold tracking-wider uppercase px-1.5 py-0.5 rounded text-[#D4A853] bg-[rgba(212,168,83,0.10)] border border-[rgba(212,168,83,0.25)]">Expert</span>
                      )}
                      {p.claimed && (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" aria-label="Claimed profile" />
                      )}
                    </div>
                    <div className="text-xs text-[#555] mt-0.5">{p.sectors.join(" · ") || "—"}</div>
                  </div>
                  {p.cv_score !== null && (
                    <div className="text-right">
                      <div className="text-sm font-bold text-[#27ABD2]">{p.cv_score}</div>
                      <div className="text-[10px] text-[#3a3f50]">CV score</div>
                    </div>
                  )}
                  <div className="text-xs text-[#3a3f50] w-20 text-right">{relTime(p.created_at)}</div>
                </div>
              ))}
              {data.recommended.length > 20 && (
                <div className="text-center text-xs text-[#555] pt-2">… and {data.recommended.length - 20} more</div>
              )}
            </div>
          )}
        </section>

        {/* Activity */}
        {data.interactions.length > 0 && (
          <section>
            <h2 className="text-lg font-bold text-[#e0e2e7] mb-4">Recent activity</h2>
            <div className="space-y-2">
              {data.interactions.map((i, idx) => (
                <div key={idx} className="bg-[#161923] border border-[#1e2130] rounded-lg px-4 py-3 flex items-center gap-3 text-sm">
                  <span className={`w-2 h-2 rounded-full ${i.direction === "inbound" ? "bg-[#27ABD2]" : "bg-[#555]"}`} />
                  <span className="text-[#c8ccd4] flex-1 capitalize">{i.interaction_type.replace(/_/g, " ")}</span>
                  <span className="text-xs text-[#555]">{relTime(i.created_at)}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Invite link */}
        <section className="bg-[#161923] border border-[#1e2130] rounded-lg p-6">
          <div className="flex items-start gap-3 mb-3">
            <Star className="w-5 h-5 text-[#27ABD2] mt-0.5" />
            <div>
              <h3 className="text-sm font-bold text-[#e0e2e7] mb-1">Bring someone you trust</h3>
              <p className="text-xs text-[#8b95a5] leading-relaxed">Forward a CV to <span className="text-[#c8ccd4]">@Devidends_Bot</span> with caption <code className="bg-[#0f1117] border border-[#1e2130] px-1.5 py-0.5 rounded text-[#27ABD2]">Recommended by {data.coCreator.name.split(" ")[0]}</code> — they'll be added and tagged to you automatically.</p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function Stat({ icon: Icon, label, value, sub, accent }: { icon: any; label: string; value: number | string; sub: string; accent?: boolean }) {
  return (
    <div className="bg-[#161923] border border-[#1e2130] rounded-lg p-4">
      <div className="flex items-center gap-2 mb-2">
        <Icon className={`w-4 h-4 ${accent ? "text-[#27ABD2]" : "text-[#555]"}`} />
        <span className="text-xs text-[#555] tracking-wide">{label}</span>
      </div>
      <div className={`text-2xl font-bold ${accent ? "text-[#27ABD2]" : "text-[#e0e2e7]"}`}>{value}</div>
      <div className="text-xs text-[#3a3f50] mt-1">{sub}</div>
    </div>
  );
}

function relTime(s: string): string {
  const d = new Date(s);
  const diff = Date.now() - d.getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}
