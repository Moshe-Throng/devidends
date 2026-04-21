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
  CheckCircle2,
  Loader2,
  Star,
  Lock,
  Send,
  Copy,
  Check,
} from "lucide-react";

const TIER_META: Record<string, { label: string; color: string; bg: string; tagline: string; nextThreshold?: number; nextLabel?: string; level: number }> = {
  architect: { label: "Architect", color: "#D4A853", bg: "rgba(212,168,83,0.10)", tagline: "Core builder. Shaping the network.", level: 3 },
  catalyst: { label: "Catalyst", color: "#27ABD2", bg: "rgba(39,171,210,0.10)", tagline: "Active and trusted. Driving momentum.", nextThreshold: 15, nextLabel: "Architect", level: 2 },
  contributor: { label: "Contributor", color: "#8B95A5", bg: "rgba(139,149,165,0.10)", tagline: "Getting started. Every referral counts.", nextThreshold: 5, nextLabel: "Catalyst", level: 1 },
};

interface Service {
  id: string;
  label: string;
  description: string;
  minLevel: number; // 1=Contributor, 2=Catalyst, 3=Architect
}

const SERVICES: Service[] = [
  { id: "daily_digest", label: "Daily opportunity digest", description: "Personalized briefs on your channel.", minLevel: 1 },
  { id: "cv_score", label: "CV scoring (your own)", description: "Score your CV against donor standards.", minLevel: 1 },
  { id: "attribution", label: "Attribution on your referrals", description: "You're credited every time someone you brought lands a role.", minLevel: 1 },
  { id: "early_tor", label: "Early access to ToRs (24h)", description: "See new tenders 24 hours before they go public.", minLevel: 2 },
  { id: "request_candidates", label: "Request candidates from the network", description: "Need an expert for a bid? We'll surface a shortlist for you.", minLevel: 2 },
  { id: "all_templates", label: "All 6 donor-ready CV templates", description: "GIZ, World Bank, EU, AfDB, USAID, and a generic format.", minLevel: 2 },
  { id: "private_group", label: "Co-Creators private group", description: "Closed Telegram group with the inner circle.", minLevel: 2 },
  { id: "rev_share", label: "Revenue share on placements", description: "Quarterly payout when your referrals get placed.", minLevel: 3 },
  { id: "founder_brief", label: "Quarterly founder briefing", description: "1:1 strategy call with the team.", minLevel: 3 },
  { id: "co_branded_badge", label: "Co-branded profile badge", description: "Public-facing badge — when public profiles ship.", minLevel: 3 },
  { id: "priority_shortlist", label: "Priority on every shortlist", description: "Your candidates get top placement in matched searches.", minLevel: 3 },
];

interface DashData {
  coCreator: { id: string; name: string; member_number: number; joined_at: string; role_title: string | null; preferred_sectors: string[] | null; preferred_channel: string | null; invite_token: string };
  profile: { id: string; name: string; cv_score: number | null };
  stats: {
    cvsSent: number; claimedCount: number; expertCount: number;
    placements: number; vouchesGiven: number; torsShared: number;
    avgCvScore: number | null; score: number; tier: string; networkSize: number;
    maleCount: number; femaleCount: number; newThisMonth: number;
    topSectors: { sector: string; count: number }[]; rank: number | null;
  };
  recommended: { id: string; name: string; cv_score: number | null; claimed: boolean; sectors: string[]; profile_type: string | null; created_at: string }[];
  interactions: { interaction_type: string; direction: string; created_at: string; content: string | null }[];
}

export default function CoCreatorDashboard() {
  const { user, loading: authLoading } = useAuth();
  const [data, setData] = useState<DashData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState<string | null>(null);
  const [requesting, setRequesting] = useState<string | null>(null);
  const [requested, setRequested] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (authLoading) return;
    if (!user) { setError("Sign in to see your Co-Creator dashboard."); setLoading(false); return; }
    fetch("/api/co-creators/me")
      .then((r) => r.json())
      .then((d) => { if (d.error) setError(d.error); else setData(d); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [user, authLoading]);

  function copy(text: string, key: string) {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 1800);
  }

  async function requestService(serviceId: string, label: string) {
    setRequesting(serviceId);
    try {
      const res = await fetch("/api/co-creators/me/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ service: label }),
      });
      const d = await res.json();
      if (!d.error) setRequested((s) => new Set([...s, serviceId]));
    } finally {
      setRequesting(null);
    }
  }

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

  if (!data || !data.coCreator || !data.stats) {
    return <main className="min-h-screen bg-[#0f1117] flex items-center justify-center text-[#8b95a5]"><div className="text-sm">Dashboard data unavailable.</div></main>;
  }

  const tier = TIER_META[data.stats.tier] || TIER_META.contributor;
  const safeCvsSent = data.stats.cvsSent || 0;
  const next = tier.nextThreshold ? Math.min(100, Math.round((safeCvsSent / tier.nextThreshold) * 100)) : 100;
  const ccName = data.coCreator.name || "Friend";
  const firstName = ccName.split(" ")[0];
  const joinedYear = data.coCreator.joined_at ? new Date(data.coCreator.joined_at).getFullYear() : "—";
  const tgCaption = `Recommended by ${firstName}`;
  const tgInvite = `https://t.me/Devidends_Bot?start=ref_${data.coCreator.invite_token}`;
  const webInvite = `https://devidends.net/cc/${data.coCreator.invite_token}`;

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
                {data.stats.rank && (
                  <>
                    <span className="text-xs text-[#3a3f50]">·</span>
                    <span className="text-xs text-[#555]">Rank #{data.stats.rank} of {data.stats.networkSize}</span>
                  </>
                )}
              </div>
              <h1 className="text-3xl md:text-4xl font-bold text-[#e0e2e7] mb-1">Welcome back, {firstName}.</h1>
              <p className="text-[#8b95a5] text-sm max-w-xl">{tier.tagline}</p>
            </div>
            <div className="text-right">
              <div className="text-xs text-[#555] mb-1">Contribution score</div>
              <div className="text-4xl font-bold" style={{ color: tier.color }}>{data.stats.score}</div>
              <div className="text-xs text-[#3a3f50]">pts</div>
            </div>
          </div>

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

      <div className="max-w-5xl mx-auto px-6 py-8 space-y-10">
        {/* Headline metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Stat icon={Users} label="People you brought" value={data.stats.cvsSent} sub={`${data.stats.claimedCount} claimed · +${data.stats.newThisMonth} this month`} accent />
          <Stat icon={Trophy} label="Experts in your network" value={data.stats.expertCount} sub="(E)-tier consultants" />
          <Stat icon={TrendingUp} label="Avg CV score" value={data.stats.avgCvScore ?? "—"} sub={data.stats.maleCount + data.stats.femaleCount > 0 ? `${data.stats.maleCount}M · ${data.stats.femaleCount}F` : "—"} />
          <Stat icon={Award} label="Network size" value={data.stats.networkSize} sub="Co-Creators total" />
        </div>

        {/* Top sectors */}
        {data.stats.topSectors.length > 0 && (
          <section>
            <h2 className="text-sm font-bold text-[#e0e2e7] mb-3 uppercase tracking-wider">Sectors you bring expertise in</h2>
            <div className="flex flex-wrap gap-2">
              {data.stats.topSectors.map((s) => (
                <span key={s.sector} className="text-xs font-medium px-3 py-1.5 rounded-full bg-[#161923] border border-[#1e2130] text-[#c8ccd4]">
                  {s.sector} <span className="text-[#555] ml-1">({s.count})</span>
                </span>
              ))}
            </div>
          </section>
        )}

        {/* Invite kit */}
        <section>
          <div className="flex items-baseline gap-2 mb-4">
            <h2 className="text-lg font-bold text-[#e0e2e7]">Your invite kit</h2>
            <span className="text-xs text-[#555]">— grow your network</span>
          </div>
          <div className="space-y-3">
            <InviteRow
              label="Telegram invite link (one-tap)"
              hint={`Anyone you share this with lands on @Devidends_Bot, pre-tagged as recommended by ${firstName}.`}
              value={tgInvite}
              keyId="tg-invite"
              copied={copied}
              onCopy={() => copy(tgInvite, "tg-invite")}
            />
            <InviteRow
              label="Web invite link"
              hint="Share with collaborators who prefer the website."
              value={webInvite}
              keyId="web-invite"
              copied={copied}
              onCopy={() => copy(webInvite, "web-invite")}
            />
            <InviteRow
              label="Caption template (for forwarding CVs to the bot)"
              hint="Drop this caption when you forward a CV to @Devidends_Bot — they'll be tagged to you automatically."
              value={tgCaption}
              keyId="caption"
              copied={copied}
              onCopy={() => copy(tgCaption, "caption")}
            />
          </div>
        </section>

        {/* Services */}
        <section>
          <div className="flex items-baseline gap-2 mb-4">
            <h2 className="text-lg font-bold text-[#e0e2e7]">Services available to you</h2>
            <span className="text-xs text-[#555]">— request anytime</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {SERVICES.map((s) => {
              const locked = s.minLevel > tier.level;
              const reqd = requested.has(s.id);
              const isRequesting = requesting === s.id;
              const lockedTier = s.minLevel === 2 ? "Catalyst" : "Architect";
              const lockedThresh = s.minLevel === 2 ? 5 : 15;
              return (
                <div key={s.id} className={`bg-[#161923] border rounded-lg p-4 ${locked ? "border-[#1e2130] opacity-60" : "border-[#1e2130] hover:border-[#2a2f42]"} transition-colors`}>
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="text-sm font-semibold text-[#e0e2e7] leading-snug">{s.label}</div>
                    {locked ? <Lock className="w-3.5 h-3.5 text-[#555] mt-0.5 shrink-0" /> : <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 mt-0.5 shrink-0" />}
                  </div>
                  <p className="text-xs text-[#8b95a5] leading-relaxed mb-3">{s.description}</p>
                  {locked ? (
                    <div className="text-[11px] text-[#555]">Unlocks at <span className="text-[#c8ccd4] font-medium">{lockedTier}</span> ({lockedThresh}+ CVs)</div>
                  ) : reqd ? (
                    <div className="flex items-center gap-1.5 text-[11px] text-emerald-400 font-medium">
                      <Check className="w-3 h-3" /> Requested · we&apos;ll be in touch
                    </div>
                  ) : (
                    <button
                      onClick={() => requestService(s.id, s.label)}
                      disabled={isRequesting}
                      className="text-[11px] font-bold text-[#27ABD2] hover:text-[#1e98bd] disabled:opacity-50 inline-flex items-center gap-1"
                    >
                      <Send className="w-3 h-3" /> {isRequesting ? "Requesting…" : "Request"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* People you've brought */}
        <section>
          <div className="flex items-baseline justify-between mb-4">
            <h2 className="text-lg font-bold text-[#e0e2e7]">People you&apos;ve recommended</h2>
            <span className="text-xs text-[#555]">{data.recommended.length} total</span>
          </div>
          {data.recommended.length === 0 ? (
            <div className="bg-[#161923] border border-[#1e2130] rounded-lg p-8 text-center">
              <p className="text-sm text-[#8b95a5] mb-2">No recommendations yet.</p>
              <p className="text-xs text-[#555] max-w-md mx-auto">Forward a CV to <span className="text-[#27ABD2]">@Devidends_Bot</span> with the caption <code className="bg-[#1e2130] px-1.5 py-0.5 rounded">{tgCaption}</code> and they&apos;ll show up here.</p>
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
                      {p.claimed && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
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
              {data.recommended.length > 20 && <div className="text-center text-xs text-[#555] pt-2">… and {data.recommended.length - 20} more</div>}
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
                  <span className="text-[#c8ccd4] flex-1 capitalize">{(i.interaction_type || "").replace(/_/g, " ")}</span>
                  <span className="text-xs text-[#555]">{relTime(i.created_at)}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        <div className="text-center text-xs text-[#555] pt-4 pb-8 flex items-center justify-center gap-1">
          <Star className="w-3 h-3 text-[#27ABD2]" />
          You&apos;re part of the inner circle. Reply to any brief to talk.
        </div>
      </div>
    </main>
  );
}

function InviteRow({ label, hint, value, keyId, copied, onCopy }: { label: string; hint: string; value: string; keyId: string; copied: string | null; onCopy: () => void }) {
  return (
    <div className="bg-[#161923] border border-[#1e2130] rounded-lg p-4">
      <div className="flex items-center justify-between gap-3 mb-1">
        <div className="text-sm font-semibold text-[#e0e2e7]">{label}</div>
        <button onClick={onCopy} className="text-xs text-[#27ABD2] hover:text-[#1e98bd] inline-flex items-center gap-1 font-medium">
          {copied === keyId ? <><Check className="w-3 h-3" /> Copied</> : <><Copy className="w-3 h-3" /> Copy</>}
        </button>
      </div>
      <p className="text-xs text-[#555] leading-relaxed mb-2">{hint}</p>
      <code className="block text-xs text-[#8b95a5] bg-[#0f1117] border border-[#1e2130] rounded px-2.5 py-1.5 break-all">{value}</code>
    </div>
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
