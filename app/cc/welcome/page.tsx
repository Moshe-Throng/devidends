"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { useAuth } from "@/components/AuthProvider";

function WelcomeInner() {
  const sp = useSearchParams();
  const fullName = sp.get("name") || "friend";
  const claimId = sp.get("claim");
  const shareToken = sp.get("t");
  const tgDeep = sp.get("tg");
  const channel = sp.get("channel") || "";
  const signInUrl = sp.get("signin");
  const { user, loading: authLoading } = useAuth();
  const [signInAttempted, setSignInAttempted] = useState(false);

  // If a signInUrl was provided AND user isn't logged in yet, fire an
  // invisible iframe to let Supabase set the session cookies in the
  // background. When that succeeds, the AuthProvider picks up the user.
  // If the iframe approach fails, the visible "Open profile" button still
  // works via direct navigation to the magic link.
  useEffect(() => {
    if (authLoading) return;
    if (user) return; // already signed in
    if (!signInUrl) return;
    if (signInAttempted) return;
    setSignInAttempted(true);
    // Use fetch no-cors to ping the verify endpoint, but cookies won't cross
    // origin to Supabase. Safer: just direct-navigate the first time.
    // Give the user 1.2s to read the page, then bounce through the magic link.
    const t = setTimeout(() => {
      window.location.href = signInUrl;
    }, 1200);
    return () => clearTimeout(t);
  }, [authLoading, user, signInUrl, signInAttempted]);

  const nameParts = fullName.trim().split(/\s+/).filter(Boolean);
  const firstName = nameParts[0] || "friend";

  const shareUrl = shareToken ? `https://devidends.net/c/${shareToken}` : null;
  const linkedInText = `I just joined the Devidends Co-Creators — a trusted circle of development professionals shaping how Ethiopian and Horn of Africa talent connects with the right opportunities.\n\nIf you're building bid teams or hunting consultancies in the region, it's worth a look.`;
  const linkedInShareUrl = shareUrl
    ? `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`
    : null;

  const prefersTelegram = channel === "telegram";
  const signedIn = !authLoading && !!user;

  return (
    <main className="min-h-screen bg-[#f7f9fb] font-[Montserrat]">
      <div className="max-w-xl mx-auto px-5 py-10 md:py-16">
        <div className="mb-8 text-xl font-bold tracking-tight">
          <span className="text-[#27ABD2]">Dev</span>
          <span className="text-[#212121]">idends</span>
        </div>

        <div className="bg-white rounded-lg border border-[#e5e9ed] p-7 md:p-9 mb-6">
          <div className="text-[#27ABD2] text-xs tracking-wider uppercase font-semibold mb-3">✓ You&apos;re in</div>
          <h1 className="text-2xl md:text-3xl font-bold text-[#212121] mb-3">
            Welcome, {firstName}.
          </h1>
          <p className="text-[#444] text-base leading-relaxed mb-0">
            You&apos;re now a Devidends Co-Creator. Here&apos;s what&apos;s ready for you right now:
          </p>
        </div>

        {/* Immediate actions — what the user can do NOW */}
        <div className="space-y-3 mb-8">
          {/* Profile — primary action */}
          <ActionCard
            emoji="👤"
            title={signedIn ? "Open your profile" : "Sign in to your profile"}
            description={
              signedIn
                ? "See your CV score, download donor-ready templates, and track your recommendations."
                : "Your profile is ready. Sign in to see your CV, score, and templates."
            }
            href={signedIn ? "/profile" : "/login"}
            primary
            label={signedIn ? "Open profile →" : "Sign in →"}
          />

          {/* Telegram — if preferred or as bonus */}
          {tgDeep && (
            <ActionCard
              emoji="📱"
              title={prefersTelegram ? "Open the Devidends bot" : "Also on Telegram"}
              description={
                prefersTelegram
                  ? "You picked Telegram as your preferred channel. Tap below to open the bot — briefs arrive directly there."
                  : "Prefer Telegram? Tap below to open the bot and pair your account."
              }
              href={tgDeep}
              label="Open @Devidends_Bot →"
              external
            />
          )}

          {/* Subscription confirmation */}
          <div className="bg-white rounded-lg border border-[#e5e9ed] p-5">
            <div className="flex items-start gap-3">
              <span className="text-xl">✉️</span>
              <div className="flex-1">
                <div className="text-[#212121] font-semibold text-sm mb-1">Subscribed to daily briefs</div>
                <p className="text-[#666] text-sm leading-relaxed">
                  You&apos;ll start receiving personalized opportunity alerts on your{" "}
                  <span className="font-medium text-[#212121]">
                    {prefersTelegram ? "Telegram" : "email"}
                  </span>{" "}
                  within 24 hours. Reply STOP anytime to pause.
                </p>
              </div>
            </div>
          </div>

          {/* Legacy claim path fallback */}
          {claimId && !signedIn && (
            <ActionCard
              emoji="🔑"
              title="Trouble signing in?"
              description="Use this one-time link to claim your profile manually."
              href={`/claim?token=${claimId}`}
              label="Claim profile →"
            />
          )}
        </div>

        {/* Share card */}
        {shareUrl && (
          <div className="bg-gradient-to-br from-white via-[#f7f9fb] to-[#eaf6fb] rounded-lg border border-[#e5e9ed] p-6 md:p-7 mb-6">
            <div className="text-[#27ABD2] text-xs tracking-wider uppercase font-semibold mb-3">
              Share your Co-Creator card
            </div>
            <h2 className="text-lg font-bold text-[#212121] mb-2">Let your network know</h2>
            <p className="text-sm text-[#666] leading-relaxed mb-4">
              Share a beautifully designed card on LinkedIn. Auto-previews with your name, sectors, and Devidends branding.
            </p>

            <div className="rounded-lg overflow-hidden border border-[#e5e9ed] mb-4 bg-white">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/og/co-creator/${shareToken}`} alt="Your Co-Creator card" className="w-full h-auto block" />
            </div>

            <div className="flex flex-col gap-2">
              {linkedInShareUrl && (
                <a
                  href={linkedInShareUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 bg-[#0077B5] hover:bg-[#006097] text-white font-semibold py-3 px-5 rounded-md transition-colors text-sm"
                >
                  Share on LinkedIn
                </a>
              )}
              <button
                onClick={() => {
                  navigator.clipboard.writeText(`${linkedInText}\n\n${shareUrl}`);
                  alert("Post text + link copied. Paste it on LinkedIn.");
                }}
                className="flex items-center justify-center gap-2 bg-white hover:border-[#27ABD2] border border-[#d5dade] text-[#212121] font-semibold py-3 px-5 rounded-md transition-colors text-sm"
              >
                Copy post + link
              </button>
            </div>
          </div>
        )}

        <div className="text-center text-xs text-[#999]">
          Questions? Reply to the first brief we send. — Mussie
        </div>
      </div>
    </main>
  );
}

function ActionCard({
  emoji,
  title,
  description,
  href,
  label,
  primary,
  external,
}: {
  emoji: string;
  title: string;
  description: string;
  href: string;
  label: string;
  primary?: boolean;
  external?: boolean;
}) {
  const ringClass = primary
    ? "bg-white border-2 border-[#27ABD2] shadow-sm"
    : "bg-white border border-[#e5e9ed]";
  const buttonClass = primary
    ? "bg-[#27ABD2] hover:bg-[#1e98bd] text-white"
    : "bg-[#212121] hover:bg-[#333] text-white";
  return (
    <div className={`rounded-lg p-5 ${ringClass}`}>
      <div className="flex items-start gap-3 mb-3">
        <span className="text-xl">{emoji}</span>
        <div className="flex-1">
          <div className="text-[#212121] font-semibold text-sm mb-1">{title}</div>
          <p className="text-[#666] text-sm leading-relaxed">{description}</p>
        </div>
      </div>
      <a
        href={href}
        target={external ? "_blank" : undefined}
        rel={external ? "noopener noreferrer" : undefined}
        className={`inline-block ${buttonClass} font-semibold py-2 px-4 rounded-md text-sm transition-colors`}
      >
        {label}
      </a>
    </div>
  );
}

export default function WelcomePage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-[#f7f9fb]" />}>
      <WelcomeInner />
    </Suspense>
  );
}
