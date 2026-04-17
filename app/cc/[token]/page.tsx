"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter, useParams } from "next/navigation";

const SECTORS = [
  "Humanitarian Aid", "Global Health", "WASH", "Food Security",
  "Agriculture", "Education", "Climate & Environment",
  "Economic Development", "Gender & Inclusion", "M&E",
  "Research & Analytics", "Procurement & Grants", "Governance",
  "Private Sector", "ICT & Digital", "Finance",
];

const INTERESTS = [
  { id: "priority_alerts", label: "Early access to jobs & tenders (before public)" },
  { id: "tor_preview", label: "ToR pre-announcements" },
  { id: "shortlists", label: "Request candidates for bids I'm leading" },
  { id: "recommend", label: "Recommend consultants to the network" },
  { id: "gigs_inbound", label: "Get consulting gigs & short-term roles" },
  { id: "cv_tools", label: "Free CV scoring, editing & donor-ready templates" },
  { id: "network_access", label: "Connect with other Co-Creators in my sector" },
  { id: "share_tors", label: "Post ToRs & gigs for my own projects" },
];

export default function InvitePage() {
  const params = useParams();
  const router = useRouter();
  const token = params.token as string;

  const [loading, setLoading] = useState(true);
  const [invite, setInvite] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [step, setStep] = useState<"letter" | "details" | "interests" | "claim">("letter");
  const [showConfetti, setShowConfetti] = useState(false);
  const topRef = useRef<HTMLDivElement>(null);

  const [form, setForm] = useState({
    email: "",
    whatsapp_number: "",
    preferred_channel: "whatsapp" as string,
    ask_frequency: "weekly" as string,
    preferred_sectors: [] as string[],
    interests: [] as string[],
    subscribe_jobs: true,
    subscribe_news: true,
    cv_claim_requested: false,
    consent: false,
    notes: "",
    suggested_invites: "",
    recommended_experts: [] as { name: string; email: string; description: string }[],
  });

  useEffect(() => {
    fetch(`/api/co-creators/invite?token=${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) {
          setError(d.error);
        } else {
          setInvite(d.invite);
          setProfile(d.profile);
          // Prefill from invite + matched profile
          setForm((f) => ({
            ...f,
            email: d.invite.email || d.profile?.email || "",
            whatsapp_number: d.invite.whatsapp_number || d.profile?.phone || "",
            preferred_sectors: d.profile?.sectors || [],
          }));
        }
        setLoading(false);
      })
      .catch((e) => {
        setError(e.message);
        setLoading(false);
      });
  }, [token]);

  function toggle(field: "preferred_sectors" | "interests", value: string) {
    setForm((f) => {
      const arr = f[field];
      return { ...f, [field]: arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value] };
    });
  }

  function goStep(s: typeof step) {
    setStep(s);
    topRef.current?.scrollIntoView({ behavior: "smooth" });
  }

  async function handleSubmit() {
    setSubmitting(true);
    try {
      const res = await fetch("/api/co-creators/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, ...form, consent_privacy: true, consent_commitment: true }),
      });
      const d = await res.json();
      if (d.error) {
        alert(d.error);
        setSubmitting(false);
        return;
      }
      setShowConfetti(true);
      setTimeout(() => {
        const claimParam = d.cvClaimRequested && d.claimToken ? `&claim=${d.claimToken}` : "";
        router.push(`/cc/welcome?name=${encodeURIComponent(d.name)}${claimParam}`);
      }, 2000);
    } catch (err: any) {
      alert(err.message);
      setSubmitting(false);
    }
  }

  // ── Loading / Error / Already Joined ──────────────────────────────────────

  if (loading) {
    return (
      <Shell>
        <div className="text-[#888] text-sm text-center py-20">Loading your invitation...</div>
      </Shell>
    );
  }
  if (error || !invite) {
    return (
      <Shell>
        <div className="text-center py-20">
          <div className="text-[#212121] text-lg font-semibold mb-2">Invitation not found</div>
          <div className="text-[#888] text-sm">{error || "This link may have expired."}</div>
        </div>
      </Shell>
    );
  }
  if (invite.status === "joined") {
    return (
      <Shell>
        <div className="text-center py-20">
          <div className="text-4xl mb-3">&#x1F389;</div>
          <div className="text-[#27ABD2] text-lg font-bold mb-1">You&apos;re already in!</div>
          <div className="text-[#888] text-sm">Welcome back, {invite.name.split(" ")[0]}.</div>
        </div>
      </Shell>
    );
  }

  const firstName = invite.name.split(" ")[0];
  const isReferred = !!invite.invited_by && invite.invited_by !== "mussie";

  // ── Confetti overlay ──────────────────────────────────────────────────────

  if (showConfetti) {
    return (
      <Shell>
        <div className="text-center py-16 space-y-4">
          <div className="text-6xl animate-bounce">&#x1F389;</div>
          <div className="text-2xl font-bold text-[#212121]">Welcome aboard, {firstName}!</div>
          <div className="text-sm text-[#888]">Taking you to your Co-Creator home...</div>
          <div className="flex justify-center gap-1 mt-4">
            {[0, 1, 2].map((i) => (
              <div key={i} className="w-2 h-2 rounded-full bg-[#27ABD2] animate-pulse" style={{ animationDelay: `${i * 0.2}s` }} />
            ))}
          </div>
        </div>
      </Shell>
    );
  }

  // ── Main ──────────────────────────────────────────────────────────────────

  return (
    <Shell>
      <div ref={topRef} />

      {/* Progress dots */}
      <div className="flex justify-center gap-2 mb-6">
        {["letter", "details", "interests", ...(profile && !profile.claimed_at ? ["claim"] : [])].map((s, i) => (
          <div key={s} className={`h-1.5 rounded-full transition-all duration-300 ${step === s ? "w-8 bg-[#27ABD2]" : "w-1.5 bg-[#d5dade]"}`} />
        ))}
      </div>

      {/* ── STEP 1: LETTER ───────────────────────────────────────── */}
      {step === "letter" && (
        <div className="space-y-6 animate-in fade-in">
          {/* Celebratory banner */}
          <div className="bg-gradient-to-br from-[#27ABD2] to-[#24CFD6] rounded-2xl p-6 text-white text-center">
            <div className="text-3xl mb-2">&#x1F31F;</div>
            <h1 className="text-xl font-bold mb-1">{firstName}, you&apos;re invited</h1>
            <p className="text-sm text-white/80">Devidends Co-Creators</p>
          </div>

          {/* Letter */}
          <div className="bg-white rounded-xl border border-[#e5e9ed] p-6 text-[15px] text-[#333] leading-relaxed space-y-4">
            {isReferred ? (
              <>
                <p>
                  We&apos;re glad to have you here. <strong>{invite.invited_by}</strong> recommended you
                  to join our Co-Creators network — a trusted circle of development professionals
                  who shape how Devidends works.
                </p>
                <p>
                  Devidends connects 1,000+ consultants with 400+ live opportunities daily across
                  Ethiopia and East Africa. Co-Creators are the people behind the quality —
                  recommending strong candidates, sharing opportunities, and keeping the network sharp.
                </p>
              </>
            ) : (
              <>
                <p>
                  You already know what Devidends is about — you&apos;ve been part of it.
                  The recommendations you&apos;ve shared, the advice, the introductions over the
                  past year — that&apos;s what got us here.
                </p>
                <p>
                  1,000+ professionals in the database. 400+ opportunities surfaced daily.
                  A platform that actually works now. And your fingerprints are on it.
                </p>
                <p>
                  So this isn&apos;t a pitch. It&apos;s a <em>&quot;let&apos;s make this official.&quot;</em>
                </p>
              </>
            )}

            <p className="font-semibold text-[#27ABD2]">
              The Devidends Co-Creators — our trusted circle.
            </p>

            <div>
              <p className="font-semibold text-[#212121] mb-2">What stays the same:</p>
              <p>You keep doing what you do — recommend good people, share opportunities when you spot them, tell us when something&apos;s off. Your pace. No pressure.</p>
            </div>

            <div>
              <p className="font-semibold text-[#212121] mb-2">What you get now:</p>
              <ul className="space-y-2 text-sm">
                <li className="flex items-start gap-2">
                  <span className="text-[#27ABD2] mt-0.5 font-bold">+</span>
                  Early access to tenders and ToRs — before they go public
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-[#27ABD2] mt-0.5 font-bold">+</span>
                  Request candidates from the network when building a team
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-[#27ABD2] mt-0.5 font-bold">+</span>
                  Free access to all upcoming tools — automatic CV editing, upgrading, tailoring to specific roles, and more
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-[#27ABD2] mt-0.5 font-bold">+</span>
                  Your own verified profile with CV scoring and donor-ready templates
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-[#27ABD2] mt-0.5 font-bold">+</span>
                  Private Co-Creators group for market intel and sector updates
                </li>
              </ul>
            </div>

            <p className="text-[#888] italic text-sm">
              No obligation — you can step back anytime.
            </p>
            <p className="text-[#212121] font-medium">— The Devidends Team</p>
          </div>

          <button onClick={() => goStep("details")} className="w-full py-4 rounded-xl bg-gradient-to-r from-[#27ABD2] to-[#24CFD6] text-white font-bold text-base shadow-lg shadow-[#27ABD2]/20 active:scale-[0.98] transition-transform">
            Accept my place &#x2192;
          </button>
        </div>
      )}

      {/* ── STEP 2: QUICK DETAILS ────────────────────────────────── */}
      {step === "details" && (
        <div className="space-y-5 animate-in fade-in">
          <div>
            <h2 className="text-lg font-bold text-[#212121]">Quick details</h2>
            <p className="text-sm text-[#888] mt-0.5">Confirm your info — takes 30 seconds.</p>
          </div>

          <Field label="Email">
            <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={inp} placeholder="you@email.com" />
          </Field>

          <Field label="WhatsApp">
            <input type="tel" value={form.whatsapp_number} onChange={(e) => setForm({ ...form, whatsapp_number: e.target.value })} className={inp} placeholder="+251 ..." />
          </Field>

          <Field label="How should we reach you?">
            <div className="flex gap-2">
              {["whatsapp", "email", "telegram"].map((ch) => (
                <button key={ch} type="button" onClick={() => setForm({ ...form, preferred_channel: ch })} className={`flex-1 ${chip(form.preferred_channel === ch)}`}>
                  {ch === "whatsapp" ? "WhatsApp" : ch === "email" ? "Email" : "Telegram"}
                </button>
              ))}
            </div>
          </Field>

          <Field label="How often?">
            <select value={form.ask_frequency} onChange={(e) => setForm({ ...form, ask_frequency: e.target.value })} className={inp}>
              <option value="weekly">Weekly</option>
              <option value="biweekly">Every 2 weeks</option>
              <option value="monthly">Monthly</option>
              <option value="on_demand">Only for specific asks</option>
            </select>
          </Field>

          {/* Subscribe toggle */}
          <div className="bg-[#f7f9fb] rounded-xl p-4 space-y-3">
            <p className="text-sm font-semibold text-[#212121]">Subscribe to updates?</p>
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={form.subscribe_jobs} onChange={(e) => setForm({ ...form, subscribe_jobs: e.target.checked })} className="w-4 h-4 accent-[#27ABD2] rounded" />
              <span className="text-sm text-[#333]">Daily job & opportunity digest</span>
            </label>
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={form.subscribe_news} onChange={(e) => setForm({ ...form, subscribe_news: e.target.checked })} className="w-4 h-4 accent-[#27ABD2] rounded" />
              <span className="text-sm text-[#333]">Development sector news</span>
            </label>
          </div>

          <div className="flex gap-3">
            <button onClick={() => goStep("letter")} className="flex-1 py-3 rounded-xl border border-[#d5dade] text-[#666] font-medium text-sm">Back</button>
            <button onClick={() => goStep("interests")} className="flex-[2] py-3 rounded-xl bg-[#27ABD2] text-white font-bold text-sm active:scale-[0.98] transition-transform">
              Next &#x2192;
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 3: INTERESTS + SECTORS ──────────────────────────── */}
      {step === "interests" && (
        <div className="space-y-5 animate-in fade-in">
          <div>
            <h2 className="text-lg font-bold text-[#212121]">What&apos;s useful for you?</h2>
            <p className="text-sm text-[#888] mt-0.5">Shapes what we build first. Pick any.</p>
          </div>

          <div className="space-y-2">
            {INTERESTS.map((it) => (
              <label key={it.id} className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${form.interests.includes(it.id) ? "border-[#27ABD2] bg-[#27ABD2]/5" : "border-[#e5e9ed]"}`}>
                <input type="checkbox" checked={form.interests.includes(it.id)} onChange={() => toggle("interests", it.id)} className="w-4 h-4 accent-[#27ABD2] rounded" />
                <span className="text-sm text-[#333]">{it.label}</span>
              </label>
            ))}
          </div>

          <Field label="Your sectors" hint="Pick the ones you know best.">
            <div className="flex gap-2 flex-wrap">
              {SECTORS.map((s) => (
                <button key={s} type="button" onClick={() => toggle("preferred_sectors", s)} className={chip(form.preferred_sectors.includes(s))}>
                  {s}
                </button>
              ))}
            </div>
          </Field>

          <div>
            <label className="block text-sm font-semibold text-[#212121] mb-1.5">
              Recommend experts for the network (optional)
            </label>
            <div className="text-xs text-[#999] mb-3">
              Well-connected consultants and professionals who&apos;d strengthen the network. We&apos;ll reach out on your behalf.
            </div>
            <div className="space-y-3">
              {form.recommended_experts.map((r, i) => (
                <div key={i} className="bg-[#f7f9fb] rounded-xl p-3 border border-[#e5e9ed] space-y-2 relative">
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, recommended_experts: form.recommended_experts.filter((_, j) => j !== i) })}
                    className="absolute top-2 right-2 text-[#999] hover:text-red-500 text-xs"
                    aria-label="Remove"
                  >&#x2715;</button>
                  <input
                    type="text"
                    value={r.name}
                    onChange={(e) => {
                      const next = [...form.recommended_experts];
                      next[i] = { ...next[i], name: e.target.value };
                      setForm({ ...form, recommended_experts: next });
                    }}
                    className={inp}
                    placeholder="Full name"
                  />
                  <input
                    type="email"
                    value={r.email}
                    onChange={(e) => {
                      const next = [...form.recommended_experts];
                      next[i] = { ...next[i], email: e.target.value };
                      setForm({ ...form, recommended_experts: next });
                    }}
                    className={inp}
                    placeholder="Email or phone"
                  />
                  <textarea
                    value={r.description}
                    onChange={(e) => {
                      const next = [...form.recommended_experts];
                      next[i] = { ...next[i], description: e.target.value };
                      setForm({ ...form, recommended_experts: next });
                    }}
                    className={`${inp} min-h-[60px]`}
                    placeholder="Why they'd be great (optional) — sector, expertise, why you trust them"
                  />
                </div>
              ))}
              <button
                type="button"
                onClick={() => setForm({ ...form, recommended_experts: [...form.recommended_experts, { name: "", email: "", description: "" }] })}
                className="w-full py-2.5 rounded-xl border border-dashed border-[#27ABD2] text-[#27ABD2] text-sm font-medium hover:bg-[#27ABD2]/5 transition-colors"
              >
                + Add {form.recommended_experts.length > 0 ? "another" : "someone"}
              </button>
            </div>
          </div>

          <div className="flex gap-3">
            <button onClick={() => goStep("details")} className="flex-1 py-3 rounded-xl border border-[#d5dade] text-[#666] font-medium text-sm">Back</button>
            <button
              onClick={() => {
                if (profile && !profile.claimed_at) {
                  goStep("claim");
                } else {
                  handleSubmit();
                }
              }}
              disabled={submitting}
              className="flex-[2] py-3 rounded-xl bg-gradient-to-r from-[#27ABD2] to-[#24CFD6] text-white font-bold text-sm shadow-lg shadow-[#27ABD2]/20 active:scale-[0.98] transition-transform disabled:opacity-50"
            >
              {profile && !profile.claimed_at ? "Next \u2192" : submitting ? "Joining..." : "Join the Co-Creators \u2728"}
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 4: CLAIM (only if profile exists + unclaimed) ──── */}
      {step === "claim" && profile && (
        <div className="space-y-5 animate-in fade-in">
          <div>
            <h2 className="text-lg font-bold text-[#212121]">One more thing</h2>
            <p className="text-sm text-[#888] mt-0.5">We already have your profile in our database.</p>
          </div>

          <div className="bg-gradient-to-br from-[#f7f9fb] to-white rounded-xl border border-[#e5e9ed] p-5">
            <div className="text-base font-bold text-[#212121] mb-1">{profile.name}</div>
            {profile.headline && <div className="text-sm text-[#666] mb-2">{profile.headline}</div>}
            {profile.cv_score && (
              <div className="inline-flex items-center gap-1.5 bg-[#27ABD2]/10 text-[#27ABD2] text-xs font-bold px-2.5 py-1 rounded-full">
                CV Score: {profile.cv_score}/100
              </div>
            )}
          </div>

          <label className={`flex items-center gap-3 p-4 rounded-xl border cursor-pointer transition-colors ${form.cv_claim_requested ? "border-[#27ABD2] bg-[#27ABD2]/5" : "border-[#e5e9ed]"}`}>
            <input type="checkbox" checked={form.cv_claim_requested} onChange={(e) => setForm({ ...form, cv_claim_requested: e.target.checked })} className="w-5 h-5 accent-[#27ABD2] rounded" />
            <div>
              <div className="text-sm font-semibold text-[#212121]">Claim this profile</div>
              <div className="text-xs text-[#888]">Update it, score your CV, access all Co-Creator tools</div>
            </div>
          </label>

          {/* Privacy — minimal */}
          <p className="text-xs text-[#999] leading-relaxed">
            Your details stay between us. We don&apos;t share or publish them. Reply STOP anytime. <a className="text-[#27ABD2]" href="/privacy" target="_blank" rel="noreferrer">Privacy policy</a>
          </p>

          <div className="flex gap-3">
            <button onClick={() => goStep("interests")} className="flex-1 py-3 rounded-xl border border-[#d5dade] text-[#666] font-medium text-sm">Back</button>
            <button onClick={handleSubmit} disabled={submitting} className="flex-[2] py-3 rounded-xl bg-gradient-to-r from-[#27ABD2] to-[#24CFD6] text-white font-bold text-sm shadow-lg shadow-[#27ABD2]/20 active:scale-[0.98] transition-transform disabled:opacity-50">
              {submitting ? "Joining..." : "Join the Co-Creators \u2728"}
            </button>
          </div>
        </div>
      )}
    </Shell>
  );
}

// ── Shared components ─────────────────────────────────────────────────────────

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-[#f7f9fb] font-[Montserrat]">
      <div className="max-w-lg mx-auto px-5 py-8">
        <div className="mb-6 text-lg font-bold tracking-tight">
          <span className="text-[#27ABD2]">Dev</span>
          <span className="text-[#212121]">idends</span>
        </div>
        {children}
        <div className="text-center text-[10px] text-[#bbb] mt-8">Devidends · Ethiopia + Horn of Africa</div>
      </div>
    </main>
  );
}

const inp = "w-full border border-[#d5dade] rounded-xl px-4 py-3 text-sm text-[#212121] focus:outline-none focus:border-[#27ABD2] focus:ring-2 focus:ring-[#27ABD2]/20 transition-all bg-white";

function chip(active: boolean) {
  return `px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
    active ? "bg-[#27ABD2] border-[#27ABD2] text-white" : "bg-white border-[#d5dade] text-[#555] active:scale-95"
  }`;
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-semibold text-[#212121] mb-1.5">{label}</label>
      {hint && <div className="text-xs text-[#999] mb-2">{hint}</div>}
      {children}
    </div>
  );
}
