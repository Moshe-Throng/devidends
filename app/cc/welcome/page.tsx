"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function WelcomeInner() {
  const sp = useSearchParams();
  const name = sp.get("name") || "friend";
  const claimId = sp.get("claim");
  const firstName = name.split(" ")[0];

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
              <div className="text-[#212121] font-semibold text-sm mb-2">One more thing — claim your profile</div>
              <p className="text-sm text-[#555] mb-3">
                We have a profile for you already. Claim it to see your CV score, get donor-ready templates, and track who you recommend.
              </p>
              <a href={`/claim?profile=${claimId}`} className="inline-block bg-[#27ABD2] hover:bg-[#1e98bd] text-white text-sm font-semibold px-5 py-2 rounded-md transition-colors">
                Claim my profile →
              </a>
            </div>
          )}

          <div className="text-sm text-[#666] leading-relaxed">
            Questions? Just reply to the first message we send you. I read every response personally.
          </div>

          <div className="mt-6 text-sm text-[#212121] italic">— Mussie</div>
        </div>

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
