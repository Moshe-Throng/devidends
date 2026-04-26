import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import ClaimEmailForm from "./ClaimEmailForm";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ token: string }>;
}

interface Profile {
  id: string;
  name: string;
  headline: string | null;
  sectors: string[] | null;
  cv_score: number | null;
  is_recommender: boolean | null;
  email: string | null;
  claimed_at: string | null;
  telegram_id: string | null;
  recommended_count?: number;
}

async function loadProfile(token: string): Promise<Profile | null> {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  const { data } = await sb
    .from("profiles")
    .select("id, name, headline, sectors, cv_score, is_recommender, email, claimed_at, telegram_id")
    .eq("claim_token", token)
    .maybeSingle();
  if (!data) return null;

  let recommended_count = 0;
  if (data.is_recommender) {
    const parts = (data.name || "").toLowerCase().split(/\s+/).filter(Boolean);
    if (parts[0]) {
      const { data: recs } = await sb
        .from("profiles")
        .select("recommended_by")
        .ilike("recommended_by", `%${parts[0]}%`);
      recommended_count = (recs || []).filter((p: { recommended_by: string | null }) => {
        const rb = (p.recommended_by || "").toLowerCase();
        const matchesFirst = rb.includes(parts[0]);
        if (parts.length === 1) return matchesFirst;
        return matchesFirst && parts.slice(1).some((q: string) => q.length >= 3 && rb.includes(q));
      }).length;
    }
  }

  return { ...(data as Profile), recommended_count };
}

export default async function ClaimByTokenPage({ params }: PageProps) {
  const { token } = await params;
  const profile = await loadProfile(token);

  if (!profile) {
    return (
      <main className="min-h-screen bg-gradient-to-b from-dark-50 to-white flex items-center justify-center px-6 py-20">
        <div className="max-w-md w-full text-center bg-white rounded-2xl border border-dark-100 p-10">
          <h1 className="text-xl font-bold text-dark-900 mb-3">Link not valid</h1>
          <p className="text-dark-600 mb-6">
            This claim link couldn&apos;t be matched to a profile. Ask whoever shared it
            to resend the latest one.
          </p>
          <Link
            href="https://devidends.net"
            className="inline-block px-6 py-3 bg-cyan-500 text-white font-bold rounded-xl"
          >
            Go to Devidends
          </Link>
        </div>
      </main>
    );
  }

  const isRecommender = !!profile.is_recommender;
  const sectors = (profile.sectors || []).slice(0, 4);
  const tgDeepLink = `https://t.me/Devidends_Bot?start=claim_${token}`;

  return (
    <main className="min-h-screen bg-gradient-to-b from-dark-50 to-white px-4 py-12 md:py-16">
      <div className="max-w-xl mx-auto">
        {/* Brand bar */}
        <div className="mb-8 flex items-center justify-center gap-1.5 text-2xl md:text-3xl font-extrabold tracking-tight">
          <span style={{ color: "#27ABD2" }}>Dev</span>
          <span className="text-dark-900">idends</span>
        </div>

        <div className="bg-white rounded-2xl border border-dark-100 shadow-sm overflow-hidden">
          {/* Header — branded by audience */}
          <div
            className="px-7 py-6 text-white"
            style={{
              background: isRecommender
                ? "linear-gradient(135deg, #1F3A5F 0%, #27ABD2 100%)"
                : "linear-gradient(135deg, #27ABD2 0%, #24CFD6 100%)",
            }}
          >
            <p className="text-xs font-bold uppercase tracking-[0.18em] opacity-80">
              {isRecommender ? "Co-Creator invitation" : "Your Devidends profile"}
            </p>
            <h1 className="text-2xl md:text-3xl font-extrabold mt-1.5 leading-tight">
              Welcome, {profile.name?.split(/\s+/)[0] || "there"}.
            </h1>
            {profile.headline && (
              <p className="text-sm md:text-base opacity-90 mt-1 line-clamp-2">
                {profile.headline}
              </p>
            )}
          </div>

          {/* Body — branched copy */}
          <div className="px-7 py-6">
            {isRecommender ? (
              <>
                <p className="text-dark-700 leading-relaxed mb-5">
                  You&apos;re in the Devidends <b>Co-Creator circle</b> — the senior Ethiopian
                  consultants the network is built around. You vouch for people, and Devidends
                  tracks every introduction back to you.
                </p>

                <div className="grid grid-cols-2 gap-3 mb-6">
                  {(profile.recommended_count ?? 0) > 0 && (
                    <Stat label="Already brought in" value={String(profile.recommended_count)} />
                  )}
                  {sectors.length > 0 && (
                    <Stat label="Sectors" value={sectors.join(" · ")} mono />
                  )}
                </div>

                <h2 className="text-sm font-bold text-dark-900 uppercase tracking-[0.12em] mb-3">
                  What&apos;s inside the Hub
                </h2>
                <ul className="space-y-2 text-dark-700 mb-6">
                  <li>📊 Your referrals + intros + the network you&apos;ve built</li>
                  <li>🤝 Drop any CV in the bot — I&apos;ll ingest under your name</li>
                  <li>🎯 Live opportunities matched to your profile</li>
                  <li>🏆 Attribution credit on every assignment that lands</li>
                </ul>
              </>
            ) : (
              <>
                <p className="text-dark-700 leading-relaxed mb-5">
                  Your professional profile is on Devidends — the AI intel platform for the
                  development consulting market in Ethiopia and the Horn. Claim it to start
                  receiving matched briefs and to score / tailor your CV.
                </p>

                <div className="grid grid-cols-2 gap-3 mb-6">
                  {profile.cv_score !== null && (
                    <Stat label="CV score" value={`${profile.cv_score}/100`} />
                  )}
                  {sectors.length > 0 && (
                    <Stat label="Sectors" value={sectors.join(" · ")} mono />
                  )}
                </div>

                <h2 className="text-sm font-bold text-dark-900 uppercase tracking-[0.12em] mb-3">
                  What&apos;s inside the Hub
                </h2>
                <ul className="space-y-2 text-dark-700 mb-6">
                  <li>📊 Daily intel — jobs, consultancies, tenders matched to your profile</li>
                  <li>🎯 Live CV scoring against GIZ, FCDO, World Bank and EU standards</li>
                  <li>✍️ CV tailoring + donor-format templates</li>
                  <li>🤝 Be recommended into live opportunities by the network</li>
                </ul>
              </>
            )}

            {/* Telegram option */}
            <a
              href={tgDeepLink}
              className="block w-full text-center px-6 py-4 rounded-xl font-bold text-white shadow-sm transition-transform hover:translate-y-[-1px]"
              style={{
                background: "linear-gradient(135deg, #229ED9 0%, #34A0DC 100%)",
              }}
            >
              🚀 Open in Telegram
            </a>
            <p className="text-xs text-dark-400 mt-2 text-center">
              Recommended — instant claim, drop-CV ingest, daily briefs
            </p>

            {/* Divider */}
            <div className="flex items-center gap-3 my-6">
              <div className="flex-1 h-px bg-dark-100" />
              <span className="text-xs text-dark-400 font-semibold tracking-wider">
                OR
              </span>
              <div className="flex-1 h-px bg-dark-100" />
            </div>

            {/* Email option */}
            <ClaimEmailForm
              token={token}
              prefilledEmail={profile.email || ""}
              isRecommender={isRecommender}
            />

            <p className="text-xs text-dark-400 mt-4 text-center leading-relaxed">
              Don&apos;t have Telegram? We&apos;ll send a one-click magic link to your email.
              The Hub works on the web too — you just won&apos;t get bot DMs.
            </p>
          </div>

          {/* Footer */}
          <div className="px-7 py-4 border-t border-dark-100 bg-dark-50/30">
            <p className="text-xs text-dark-500 text-center">
              <b className="text-dark-700">Devidends</b> · the development consulting network for the Horn of Africa
            </p>
          </div>
        </div>

        <p className="text-center text-xs text-dark-400 mt-6">
          Issue with this link? Reply to whoever sent it, or write to <b>contact@devidends.net</b>
        </p>
      </div>
    </main>
  );
}

function Stat({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="bg-dark-50 rounded-xl px-4 py-3">
      <p className="text-[10px] font-bold text-dark-500 uppercase tracking-[0.15em] mb-1">
        {label}
      </p>
      <p className={`text-sm font-bold text-dark-900 ${mono ? "font-mono" : ""}`}>{value}</p>
    </div>
  );
}
