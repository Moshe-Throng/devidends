"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";

const SECTORS = [
  "Humanitarian Aid & Emergency", "Global Health", "WASH", "Food Security & Nutrition",
  "Agriculture & Rural Development", "Education & Training", "Environment & Climate Change",
  "Economic Development & Trade", "Gender & Social Inclusion", "Project Management & M&E",
  "Research & Data Analytics", "Procurement & Grants", "Governance & Public Sector",
  "Private Sector Development", "ICT & Digital", "Finance & Banking",
];
const REGIONS = ["Ethiopia", "East Africa", "Horn of Africa", "Pan-African", "Global"];
const INTERESTS = [
  { id: "priority_alerts", label: "Priority alerts on jobs & tenders (24h early)" },
  { id: "tor_preview", label: "Pre-announcements of ToRs before they're public" },
  { id: "shortlists", label: "Request shortlists for bids I'm leading" },
  { id: "recommend", label: "Recommend consultants to the network" },
  { id: "gigs_inbound", label: "Get short-term gigs / consulting opportunities" },
  { id: "gigs_outbound", label: "Post my own consulting availability" },
  { id: "share_tors", label: "Share or announce ToRs I'm running" },
  { id: "cv_tools", label: "CV scoring + donor-ready templates" },
  { id: "network_access", label: "Connect with other Co-Creators in my sector" },
  { id: "leaderboard", label: "Be featured on the Co-Creators leaderboard" },
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

  const [form, setForm] = useState<any>({
    email: "",
    whatsapp_number: "",
    linkedin_url: "",
    role_title: "",
    years_in_sector: "",
    preferred_channel: "whatsapp",
    ask_frequency: "weekly",
    preferred_sectors: [] as string[],
    regions: [] as string[],
    interests: [] as string[],
    network_size: "",
    sharing_channels: [] as string[],
    suggested_invites: "",
    notes: "",
    cv_claim_requested: false,
    consent_privacy: false,
    consent_commitment: false,
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
          setForm((f: any) => ({
            ...f,
            email: d.invite.email || "",
            whatsapp_number: d.invite.whatsapp_number || "",
            role_title: d.invite.role_title || "",
          }));
        }
        setLoading(false);
      })
      .catch((e) => {
        setError(e.message);
        setLoading(false);
      });
  }, [token]);

  function toggle(field: string, value: string) {
    setForm((f: any) => {
      const arr = f[field] as string[];
      return {
        ...f,
        [field]: arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value],
      };
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.consent_privacy || !form.consent_commitment) {
      alert("Please confirm both check-ins at the bottom.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/co-creators/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, ...form }),
      });
      const d = await res.json();
      if (d.error) {
        alert(d.error);
        setSubmitting(false);
        return;
      }
      router.push(`/cc/welcome?name=${encodeURIComponent(d.name)}${d.cvClaimRequested && d.profileId ? `&claim=${d.profileId}` : ""}`);
    } catch (err: any) {
      alert(err.message);
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-[#f7f9fb] flex items-center justify-center p-6">
        <div className="text-[#666] font-[Montserrat] text-sm">Loading your invitation…</div>
      </main>
    );
  }

  if (error || !invite) {
    return (
      <main className="min-h-screen bg-[#f7f9fb] flex items-center justify-center p-6">
        <div className="max-w-md text-center">
          <div className="text-[#212121] font-[Montserrat] text-lg font-semibold mb-2">Invitation not found</div>
          <div className="text-[#666] text-sm">{error || "This link may have expired."}</div>
        </div>
      </main>
    );
  }

  if (invite.status === "joined") {
    return (
      <main className="min-h-screen bg-[#f7f9fb] flex items-center justify-center p-6">
        <div className="max-w-md text-center">
          <div className="text-[#27ABD2] font-[Montserrat] text-lg font-semibold mb-2">Already accepted ✓</div>
          <div className="text-[#666] text-sm">You've already joined the Co-Creators. Welcome back, {invite.name.split(" ")[0]}.</div>
        </div>
      </main>
    );
  }

  const firstName = invite.name.split(" ")[0];

  return (
    <main className="min-h-screen bg-[#f7f9fb] font-[Montserrat]">
      <div className="max-w-2xl mx-auto px-5 py-10 md:py-16">
        {/* Header logo */}
        <div className="mb-10 text-xl font-bold tracking-tight">
          <span className="text-[#27ABD2]">Dev</span>
          <span className="text-[#212121]">idends</span>
        </div>

        {/* Personal letter */}
        <div className="bg-white rounded-lg border border-[#e5e9ed] p-8 md:p-10 mb-8">
          <div className="text-[#666] text-xs tracking-wider uppercase mb-6">A personal note</div>
          <div className="text-[#212121] text-lg leading-relaxed space-y-4">
            <p><span className="font-semibold">{firstName},</span></p>
            <p>I wanted to write this to you personally.</p>
            <p>
              Over the past few months I've been building Devidends — a platform to help the
              development professionals we both know find the right opportunities and get the
              recognition they deserve. 113 profiles are in it already. It's growing, slowly
              and carefully.
            </p>
            <p className="text-[#27ABD2] font-semibold">I'd like you to help me shape what this becomes.</p>
            <p>
              I'm starting something called the <strong>Devidends Co-Creators</strong> — just seven
              of us to begin with. People whose judgment I trust, whose networks are deep, and whose
              fingerprints I want on the platform as it grows.
            </p>
            <p>
              <span className="font-semibold text-[#212121]">What I'm asking:</span> when you think of
              someone who'd be a good fit for a role, send their CV our way. Your pace. Your sectors.
              No quotas.
            </p>
            <p>
              <span className="font-semibold text-[#212121]">What I'm offering:</span> early access to
              every tender and ToR we surface — before anyone else. The ability to ask this network for
              recommendations when you need a team. Your own verified profile with CV scoring and
              donor-ready templates. A small private group where we share market intel and help each
              other. And when the platform earns — a cut of what comes from your referrals.
            </p>
            <p>
              This isn't a signup form. It's an invitation to be part of building something that
              could matter for our sector.
            </p>
            <p className="text-[#666] italic text-base">
              If it's not for you, just ignore this — no hard feelings.
            </p>
            <p className="text-[#212121]">— Mussie</p>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="bg-white rounded-lg border border-[#e5e9ed] p-8 md:p-10 space-y-8">
          <div>
            <h2 className="text-xl font-bold text-[#212121] mb-1">Accept my place as a Co-Creator</h2>
            <p className="text-sm text-[#666]">Takes about four minutes.</p>
          </div>

          {/* IDENTITY */}
          <section className="space-y-4">
            <div className="text-[#27ABD2] text-xs tracking-wider uppercase font-semibold">A few details</div>

            <Field label="Email" required>
              <input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={inp} placeholder="you@email.com" />
            </Field>

            <Field label="WhatsApp number" hint="How most of us actually talk. We'll never cold-message, only reply to you.">
              <input type="tel" value={form.whatsapp_number} onChange={(e) => setForm({ ...form, whatsapp_number: e.target.value })} className={inp} placeholder="+251 ..." />
            </Field>

            <Field label="LinkedIn (optional)">
              <input type="url" value={form.linkedin_url} onChange={(e) => setForm({ ...form, linkedin_url: e.target.value })} className={inp} placeholder="linkedin.com/in/..." />
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Current role / title">
                <input type="text" value={form.role_title} onChange={(e) => setForm({ ...form, role_title: e.target.value })} className={inp} placeholder="Senior M&E Advisor" />
              </Field>
              <Field label="Years in the sector">
                <input type="number" min="0" max="60" value={form.years_in_sector} onChange={(e) => setForm({ ...form, years_in_sector: e.target.value })} className={inp} placeholder="15" />
              </Field>
            </div>
          </section>

          {/* HOW TO REACH */}
          <section className="space-y-4">
            <div className="text-[#27ABD2] text-xs tracking-wider uppercase font-semibold">How to reach you</div>

            <Field label="Preferred channel">
              <div className="flex gap-2 flex-wrap">
                {["whatsapp", "email", "telegram"].map((ch) => (
                  <button key={ch} type="button" onClick={() => setForm({ ...form, preferred_channel: ch })} className={chipBtn(form.preferred_channel === ch)}>
                    {ch === "whatsapp" ? "WhatsApp" : ch === "email" ? "Email" : "Telegram"}
                  </button>
                ))}
              </div>
            </Field>

            <Field label="How often should we message?">
              <div className="flex gap-2 flex-wrap">
                {[
                  { v: "weekly", l: "Weekly" },
                  { v: "biweekly", l: "Every 2 weeks" },
                  { v: "monthly", l: "Monthly" },
                  { v: "on_demand", l: "Only for specific sectors" },
                ].map((o) => (
                  <button key={o.v} type="button" onClick={() => setForm({ ...form, ask_frequency: o.v })} className={chipBtn(form.ask_frequency === o.v)}>
                    {o.l}
                  </button>
                ))}
              </div>
            </Field>
          </section>

          {/* SECTORS */}
          <section className="space-y-4">
            <div className="text-[#27ABD2] text-xs tracking-wider uppercase font-semibold">Your domain</div>

            <Field label="Sectors you're closest to" hint="Pick any number.">
              <div className="flex gap-2 flex-wrap">
                {SECTORS.map((s) => (
                  <button key={s} type="button" onClick={() => toggle("preferred_sectors", s)} className={chipBtn(form.preferred_sectors.includes(s))}>
                    {s}
                  </button>
                ))}
              </div>
            </Field>

            <Field label="Regions you cover">
              <div className="flex gap-2 flex-wrap">
                {REGIONS.map((r) => (
                  <button key={r} type="button" onClick={() => toggle("regions", r)} className={chipBtn(form.regions.includes(r))}>
                    {r}
                  </button>
                ))}
              </div>
            </Field>
          </section>

          {/* INTERESTS (bidirectional) */}
          <section className="space-y-4">
            <div className="text-[#27ABD2] text-xs tracking-wider uppercase font-semibold">What you'd like to use the Co-Creators for</div>
            <p className="text-sm text-[#666] -mt-2">Pick any that apply. This shapes what we build for you first.</p>

            <div className="space-y-2">
              {INTERESTS.map((it) => (
                <label key={it.id} className={checkRow(form.interests.includes(it.id))}>
                  <input type="checkbox" checked={form.interests.includes(it.id)} onChange={() => toggle("interests", it.id)} className="mt-1 accent-[#27ABD2]" />
                  <span className="text-sm text-[#212121]">{it.label}</span>
                </label>
              ))}
            </div>
          </section>

          {/* NETWORK CONTEXT */}
          <section className="space-y-4">
            <div className="text-[#27ABD2] text-xs tracking-wider uppercase font-semibold">Your network</div>

            <Field label="About how many dev professionals are in your close network?">
              <div className="flex gap-2 flex-wrap">
                {["<50", "50–200", "200–500", "500+"].map((n) => (
                  <button key={n} type="button" onClick={() => setForm({ ...form, network_size: n })} className={chipBtn(form.network_size === n)}>
                    {n}
                  </button>
                ))}
              </div>
            </Field>

            <Field label="How do you share opportunities today?">
              <div className="flex gap-2 flex-wrap">
                {["WhatsApp groups", "Direct DMs", "Email", "LinkedIn", "In-person", "Telegram"].map((c) => (
                  <button key={c} type="button" onClick={() => toggle("sharing_channels", c)} className={chipBtn(form.sharing_channels.includes(c))}>
                    {c}
                  </button>
                ))}
              </div>
            </Field>

            <Field label="Anyone you'd like us to invite next? (optional)">
              <textarea value={form.suggested_invites} onChange={(e) => setForm({ ...form, suggested_invites: e.target.value })} className={`${inp} min-h-[80px]`} placeholder="Names, emails, or WhatsApp numbers — whatever's easiest" />
            </Field>
          </section>

          {/* CLAIM CV */}
          {profile && !profile.claimed_at && (
            <section className="bg-[#f7f9fb] rounded-lg p-5 border border-[#e5e9ed]">
              <div className="text-[#212121] font-semibold text-sm mb-2">Claim your profile</div>
              <p className="text-sm text-[#666] mb-3">
                We already have you in our consultant database as <span className="text-[#212121] font-medium">{profile.name}{profile.headline ? `, ${profile.headline}` : ""}</span>.
                Claim it to update, see your CV score, and access Co-Creator tools.
              </p>
              <label className={checkRow(form.cv_claim_requested)}>
                <input type="checkbox" checked={form.cv_claim_requested} onChange={(e) => setForm({ ...form, cv_claim_requested: e.target.checked })} className="mt-1 accent-[#27ABD2]" />
                <span className="text-sm text-[#212121]">Yes, I'd like to claim my profile</span>
              </label>
            </section>
          )}

          {/* Notes */}
          <Field label="Anything we should know? (optional)">
            <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className={`${inp} min-h-[80px]`} />
          </Field>

          {/* Privacy */}
          <div className="bg-[#f7f9fb] rounded-lg p-5 border border-[#e5e9ed] text-sm text-[#666] leading-relaxed">
            <div className="text-[#212121] font-semibold mb-2">On privacy</div>
            Your contact details stay between us. We don't share, sell, or publish them. CVs you send are added only with the person's consent.
            Reply STOP anytime — everything pauses. Full details at <a className="text-[#27ABD2] underline" href="/privacy" target="_blank" rel="noreferrer">devidends.net/privacy</a>.
          </div>

          {/* Consent */}
          <div className="space-y-3">
            <label className={checkRow(form.consent_privacy)}>
              <input type="checkbox" checked={form.consent_privacy} onChange={(e) => setForm({ ...form, consent_privacy: e.target.checked })} className="mt-1 accent-[#27ABD2]" />
              <span className="text-sm text-[#212121]">I've read the privacy note and I'm okay with it.</span>
            </label>
            <label className={checkRow(form.consent_commitment)}>
              <input type="checkbox" checked={form.consent_commitment} onChange={(e) => setForm({ ...form, consent_commitment: e.target.checked })} className="mt-1 accent-[#27ABD2]" />
              <span className="text-sm text-[#212121]">I understand the Co-Creators is mutual — I'll recommend when I can, and I'll use the tools and network the way they're intended. I can step back anytime.</span>
            </label>
          </div>

          <div className="pt-2">
            <button type="submit" disabled={submitting} className="w-full bg-[#27ABD2] hover:bg-[#1e98bd] disabled:opacity-50 text-white font-semibold py-3 px-6 rounded-md transition-colors">
              {submitting ? "Saving…" : "Accept my place as a Co-Creator →"}
            </button>
          </div>
        </form>

        <div className="text-center text-xs text-[#999] mt-8">Devidends · Ethiopia + Horn of Africa</div>
      </div>
    </main>
  );
}

const inp = "w-full border border-[#d5dade] rounded-md px-3 py-2 text-sm text-[#212121] focus:outline-none focus:border-[#27ABD2] focus:ring-1 focus:ring-[#27ABD2]/30 transition-colors";

function chipBtn(active: boolean) {
  return `px-3 py-1.5 rounded-full text-sm border transition-colors ${
    active
      ? "bg-[#27ABD2] border-[#27ABD2] text-white"
      : "bg-white border-[#d5dade] text-[#212121] hover:border-[#27ABD2]"
  }`;
}

function checkRow(active: boolean) {
  return `flex items-start gap-3 p-3 rounded-md border transition-colors cursor-pointer ${
    active ? "border-[#27ABD2] bg-[#27ABD2]/5" : "border-[#e5e9ed] hover:border-[#27ABD2]/50"
  }`;
}

function Field({ label, hint, required, children }: { label: string; hint?: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-[#212121] mb-1.5">
        {label}{required && <span className="text-[#27ABD2]"> *</span>}
      </label>
      {hint && <div className="text-xs text-[#888] mb-2">{hint}</div>}
      {children}
    </div>
  );
}
