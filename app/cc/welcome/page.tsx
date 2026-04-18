"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function WelcomeInner() {
  const sp = useSearchParams();
  const name = sp.get("name") || "friend";
  const claimId = sp.get("claim");
  const shareToken = sp.get("t");
  const firstName = name.split(" ")[0];

  const shareUrl = shareToken ? `https://devidends.net/c/${shareToken}` : null;
  const linkedInText = `I just joined the Devidends Co-Creators — a trusted circle of development professionals shaping how Ethiopian and Horn of Africa talent connects with the right opportunities.\n\nIf you're building bid teams or hunting consultancies in the region, it's worth a look.`;
  const linkedInShareUrl = shareUrl
    ? `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`
    : null;

  return (
    <main className="min-h-screen bg-[#f7f9fb] font-[Montserrat]">
      <div className="max-w-xl mx-auto px-5 py-12 md:py-20">
        <div className="mb-10 text-xl font-bold tracking-tight">
          <span className="text-[#27ABD2]">Dev</span>
          <span className="text-[#212121]">idends</span>
        </div>

        <div className="bg-white rounded-lg border border-[#e5e9ed] p-8 md:p-10">
          <div className="text-[#27ABD2] text-xs tracking-wider uppercase font-semibold mb-4">&#x2713; You&apos;re in</div>
          <h1 className="text-2xl md:text-3xl font-bold text-[#212121] mb-6">
            Welcome, {firstName}.
          </h1>

          <p className="text-[#444] text-base leading-relaxed mb-6">
            You&apos;re now a Devidends Co-Creator. A few things will happen in the next few days:
          </p>

          <ul className="space-y-4 mb-8">
            <Step n="1" title="Your first brief arrives within 48 hours">
              A short message on your preferred channel with the sectors we&apos;re actively sourcing for this week. Reply when someone comes to mind.
            </Step>
            <Step n="2" title="Your profile is being set up">
              We&apos;ll verify your Co-Creator record and add your sectors and regions. You can update any detail anytime — just reply to the first message.
            </Step>
            <Step n="3" title="You can forward CVs anytime">
              When someone asks you about a role, forward their CV to the Devidends line. We&apos;ll process, score, and tag them as recommended by you.
            </Step>
          </ul>

          {claimId && (
            <div className="bg-[#27ABD2]/5 border border-[#27ABD2]/30 rounded-md p-5 mb-6">
              <div className="text-[#212121] font-semibold text-sm mb-2">&#x2713; Profile claimed</div>
              <p className="text-sm text-[#555] mb-3">
                Your profile is now yours. Open it to see your CV score, download donor-ready templates, and track your recommendations.
              </p>
              <a href={`/claim?token=${claimId}`} className="inline-block bg-[#27ABD2] hover:bg-[#1e98bd] text-white text-sm font-semibold px-5 py-2 rounded-md transition-colors">
                Open my profile &#x2192;
              </a>
            </div>
          )}

          <div className="text-sm text-[#666] leading-relaxed">
            Questions? Just reply to the first message we send you. I read every response personally.
          </div>

          <div className="mt-6 text-sm text-[#212121] italic">— Mussie</div>
        </div>

        {/* ── Share card section ─────────────────────────────────── */}
        {shareUrl && (
          <div className="mt-8 bg-gradient-to-br from-white via-[#f7f9fb] to-[#eaf6fb] rounded-lg border border-[#e5e9ed] p-6 md:p-8">
            <div className="text-[#27ABD2] text-xs tracking-wider uppercase font-semibold mb-3">
              Share your Co-Creator card
            </div>
            <h2 className="text-lg font-bold text-[#212121] mb-2">
              Let your network know
            </h2>
            <p className="text-sm text-[#666] leading-relaxed mb-5">
              Share a beautifully designed card on LinkedIn. Auto-previews with your name, sectors, and the Devidends branding.
            </p>

            {/* Preview */}
            <div className="rounded-lg overflow-hidden border border-[#e5e9ed] mb-5 bg-white">
              <img
                src={`/api/og/co-creator/${shareToken}`}
                alt="Your Co-Creator card preview"
                className="w-full h-auto block"
              />
            </div>

            <div className="flex flex-col gap-2">
              {linkedInShareUrl && (
                <a
                  href={linkedInShareUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 bg-[#0077B5] hover:bg-[#006097] text-white font-semibold py-3 px-5 rounded-md transition-colors text-sm"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.063 2.063 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                  </svg>
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
              <a
                href={`/api/og/co-creator/${shareToken}`}
                download={`devidends-co-creator-${firstName.toLowerCase()}.png`}
                className="flex items-center justify-center gap-2 text-[#27ABD2] hover:underline font-medium py-2 text-xs"
              >
                Download card image
              </a>
            </div>
          </div>
        )}

        <div className="text-center text-xs text-[#999] mt-8">
          You can step back anytime. Reply STOP and we stop messaging you.
        </div>
      </div>
    </main>
  );
}

function Step({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-4">
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-[#27ABD2] text-white flex items-center justify-center text-sm font-bold">{n}</div>
      <div className="flex-1 pt-0.5">
        <div className="text-[#212121] font-semibold text-sm mb-1">{title}</div>
        <div className="text-[#666] text-sm leading-relaxed">{children}</div>
      </div>
    </li>
  );
}

export default function WelcomePage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-[#f7f9fb]" />}>
      <WelcomeInner />
    </Suspense>
  );
}
