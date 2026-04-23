import type { Metadata } from "next";
import Link from "next/link";
import { Instrument_Serif, Montserrat } from "next/font/google";
import { ShortlistRequestForm } from "./ShortlistRequestForm";

const serif = Instrument_Serif({
  subsets: ["latin"],
  weight: ["400"],
  style: ["normal", "italic"],
  variable: "--font-serif",
  display: "swap",
});

const sans = Montserrat({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Devidends For Firms — Ethiopia Consultant Shortlists in 24 Hours",
  description:
    "Curated, vetted Ethiopian development consultants for international firms bidding on EU, USAID, World Bank, GIZ, and AFD-funded work in Ethiopia and the Horn of Africa. Request a shortlist and receive ranked candidates within 24 hours.",
};

/**
 * /for-firms — B2B landing page for bid managers at international consulting
 * firms (AESA, Landell Mills, Chemonics, DAI, Ecorys, etc.) who source
 * Ethiopian experts for donor-funded bids. Separate from the expert-facing
 * homepage at /. Editorial aesthetic, data-first, conversion-oriented.
 */

const SECTOR_COVERAGE: { name: string; count: number }[] = [
  { name: "Project Management", count: 99 },
  { name: "Economic Development", count: 71 },
  { name: "Governance", count: 60 },
  { name: "Finance & Banking", count: 48 },
  { name: "Innovation & ICT", count: 47 },
  { name: "Gender & Social Inclusion", count: 43 },
  { name: "Agriculture", count: 35 },
  { name: "Research & Evaluation", count: 31 },
  { name: "Global Health", count: 27 },
  { name: "Education & TVET", count: 26 },
  { name: "Environment & Climate", count: 17 },
  { name: "Legal & Regulatory", count: 16 },
  { name: "Energy", count: 11 },
  { name: "Humanitarian Aid", count: 11 },
];

const DONORS = [
  "USAID",
  "World Bank",
  "GIZ",
  "European Union",
  "UNDP",
  "ILO",
  "Gates Foundation",
  "FCDO",
  "Mastercard Foundation",
  "AfDB",
  "SIDA",
  "UNICEF",
  "UN Women",
  "WFP",
  "JICA",
  "FAO",
  "AFD",
  "UNHCR",
  "WHO",
];

export default function ForFirmsPage() {
  return (
    <div className={`${serif.variable} ${sans.variable} min-h-screen bg-[#F9F6F0] text-[#111111]`}>
      {/* Top bar — minimal, editorial */}
      <header className="border-b border-[#111111]/10">
        <div className="max-w-6xl mx-auto px-6 md:px-10 py-5 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 text-sm font-[var(--font-sans)]">
            <span className="font-extrabold tracking-tight text-lg">
              <span style={{ color: "#27ABD2" }}>Dev</span>
              <span className="text-[#111111]">idends</span>
            </span>
            <span className="hidden md:inline text-[#111111]/40 font-medium uppercase tracking-[0.18em] text-[10px]">
              For Firms
            </span>
          </Link>
          <nav className="flex items-center gap-5 text-xs md:text-sm font-[var(--font-sans)] font-semibold">
            <a href="#process" className="hidden md:inline text-[#111111]/70 hover:text-[#111111] transition">
              How it works
            </a>
            <a href="#coverage" className="hidden md:inline text-[#111111]/70 hover:text-[#111111] transition">
              Coverage
            </a>
            <a
              href="#request"
              className="px-4 py-2 rounded-full bg-[#111111] text-[#F9F6F0] hover:bg-[#27ABD2] transition font-bold"
            >
              Request a shortlist
            </a>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="px-6 md:px-10 pt-16 md:pt-24 pb-16 md:pb-24">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center gap-3 mb-8 md:mb-10 font-[var(--font-sans)]">
            <span className="inline-flex items-center gap-2 text-[10px] md:text-[11px] font-bold tracking-[0.22em] uppercase text-[#111111]/60">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#27ABD2] opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-[#27ABD2]" />
              </span>
              For firms bidding on Ethiopia / Horn of Africa work
            </span>
          </div>

          <h1
            className="font-[var(--font-serif)] text-[48px] leading-[1.02] md:text-[96px] md:leading-[0.98] tracking-[-0.02em] text-[#111111]"
            style={{ fontFeatureSettings: '"liga","dlig"' }}
          >
            Your Ethiopia consultant bench,
            <br />
            <span className="italic text-[#27ABD2]">in twenty-four hours.</span>
          </h1>

          <p className="mt-8 md:mt-10 max-w-2xl font-[var(--font-sans)] text-[17px] md:text-[19px] leading-[1.55] text-[#111111]/75">
            Devidends curates vetted Ethiopian development consultants for bid managers who
            don&apos;t have time to chase CVs across WhatsApp groups. Send us a ToR, receive a
            ranked shortlist the next day, contact candidates directly.
          </p>

          <div className="mt-10 md:mt-12 flex items-center gap-6 md:gap-8">
            <a
              href="#request"
              className="group inline-flex items-center gap-2 font-[var(--font-sans)] text-sm md:text-[15px] font-bold tracking-tight px-6 md:px-7 py-3.5 md:py-4 rounded-full bg-[#111111] text-[#F9F6F0] hover:bg-[#27ABD2] transition-colors"
            >
              Request a shortlist
              <span className="inline-block transition-transform group-hover:translate-x-1">→</span>
            </a>
            <a
              href="#process"
              className="font-[var(--font-sans)] text-sm md:text-[15px] font-semibold text-[#111111]/70 hover:text-[#111111] transition underline decoration-[#27ABD2] decoration-2 underline-offset-[6px]"
            >
              See how it works
            </a>
          </div>
        </div>
      </section>

      {/* Ticker of donors */}
      <section className="border-y border-[#111111]/10 bg-[#111111] text-[#F9F6F0] overflow-hidden">
        <div className="max-w-6xl mx-auto px-6 md:px-10 py-4 md:py-5">
          <div className="flex items-center gap-2 md:gap-3 font-[var(--font-sans)] text-[10px] md:text-[11px] uppercase tracking-[0.18em] overflow-hidden">
            <span className="opacity-60 whitespace-nowrap font-bold">
              Network members have worked for
            </span>
            <span className="opacity-30">/</span>
            <div className="flex items-center gap-4 md:gap-6 whitespace-nowrap overflow-x-auto no-scrollbar">
              {DONORS.map((d) => (
                <span key={d} className="font-semibold opacity-80">
                  {d}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Problem — editorial spread */}
      <section className="px-6 md:px-10 py-20 md:py-28 border-b border-[#111111]/10">
        <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-12 gap-8 md:gap-12">
          <div className="md:col-span-4 md:pt-2">
            <p className="font-[var(--font-sans)] text-[10px] md:text-[11px] font-bold tracking-[0.22em] uppercase text-[#111111]/50">
              I. The problem
            </p>
            <p className="mt-3 font-[var(--font-serif)] text-3xl md:text-[40px] leading-[1.05] italic text-[#27ABD2]">
              &ldquo;We&apos;ve already mapped the network. You pay the cost of not being
              inside it.&rdquo;
            </p>
          </div>
          <div className="md:col-span-8 font-[var(--font-sans)] text-[16px] md:text-[17px] leading-[1.7] text-[#111111]/80 space-y-5">
            <p>
              <span
                className="float-left mr-3 mt-1 font-[var(--font-serif)] text-[74px] leading-[0.8] text-[#27ABD2]"
                style={{ shapeOutside: "circle()" }}
              >
                M
              </span>
              ost firms sourcing for Ethiopia still rely on ad-hoc networks, stale CVs on
              LinkedIn, and guesswork. A bid deadline is 72 hours away, the PSD expert went
              quiet two weeks ago, and your backup isn&apos;t returning emails.
            </p>
            <p>
              Meanwhile the Ethiopian experts donors actually recognise — the ones with GIZ,
              World Bank, EU, and AFD track records — are spread across private networks
              you&apos;re not inside. Private WhatsApp groups. Airtable rosters from 2021.
              A spreadsheet your Addis partner hasn&apos;t updated since the last bid.
            </p>
            <p className="text-[#111111]/95 font-medium">
              Devidends is the network. Curated by Ethiopian consultants, scored against
              donor standards, available on demand.
            </p>
          </div>
        </div>
      </section>

      {/* Process — numbered three-step */}
      <section id="process" className="px-6 md:px-10 py-20 md:py-28 border-b border-[#111111]/10">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-baseline justify-between mb-12 md:mb-16">
            <p className="font-[var(--font-sans)] text-[10px] md:text-[11px] font-bold tracking-[0.22em] uppercase text-[#111111]/50">
              II. How it works
            </p>
            <p className="font-[var(--font-sans)] text-[10px] md:text-[11px] font-bold tracking-[0.22em] uppercase text-[#111111]/40">
              24 hours, start to shortlist
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-10">
            {[
              {
                num: "I",
                title: "Send us the ToR",
                body: "Attach the document, paste the scope, or just describe the role in a paragraph. English or French. Any donor format. A single role or a full team.",
              },
              {
                num: "II",
                title: "Receive a ranked shortlist",
                body: "Within 24 hours: top five to ten candidates with scored CVs, role signals (lead vs support, never inflated), availability confirmed, daily rate expectations.",
              },
              {
                num: "III",
                title: "Contact directly",
                body: "No middleman on the conversation. Introduce yourself, interview, negotiate. We stay out of the way. You close at your pace.",
              },
            ].map((step, i) => (
              <div
                key={i}
                className="relative border-t border-[#111111] pt-6 md:pt-8"
              >
                <span className="font-[var(--font-serif)] text-[72px] md:text-[92px] leading-[0.85] text-[#27ABD2] block mb-5 md:mb-6">
                  {step.num}
                </span>
                <h3 className="font-[var(--font-sans)] font-extrabold text-[22px] md:text-[24px] tracking-tight text-[#111111] mb-3">
                  {step.title}
                </h3>
                <p className="font-[var(--font-sans)] text-[15px] md:text-[16px] leading-[1.65] text-[#111111]/70">
                  {step.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Data — the numbers */}
      <section className="px-6 md:px-10 py-20 md:py-28 bg-[#111111] text-[#F9F6F0]">
        <div className="max-w-6xl mx-auto">
          <p className="font-[var(--font-sans)] text-[10px] md:text-[11px] font-bold tracking-[0.22em] uppercase text-[#F9F6F0]/50 mb-10 md:mb-12">
            III. The bench
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-10">
            {[
              { n: "282", label: "Curated consultants" },
              { n: "175", label: "Actively available experts" },
              { n: "75", label: "Senior recommenders vouching" },
              { n: "40+", label: "Donor sources monitored daily" },
            ].map((m, i) => (
              <div key={i} className="border-t border-[#F9F6F0]/20 pt-5 md:pt-6">
                <p className="font-[var(--font-serif)] text-[56px] md:text-[88px] leading-none text-[#27ABD2] tabular-nums">
                  {m.n}
                </p>
                <p className="mt-3 md:mt-4 font-[var(--font-sans)] text-[13px] md:text-[14px] tracking-tight text-[#F9F6F0]/70 leading-snug">
                  {m.label}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Sector coverage — a compliance matrix */}
      <section id="coverage" className="px-6 md:px-10 py-20 md:py-28 border-b border-[#111111]/10">
        <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-12 gap-8 md:gap-12">
          <div className="md:col-span-4">
            <p className="font-[var(--font-sans)] text-[10px] md:text-[11px] font-bold tracking-[0.22em] uppercase text-[#111111]/50">
              IV. Coverage
            </p>
            <h2 className="mt-3 font-[var(--font-serif)] text-[40px] md:text-[56px] leading-[1.02] tracking-[-0.02em]">
              Where our <span className="italic text-[#27ABD2]">network</span> is deep.
            </h2>
            <p className="mt-6 font-[var(--font-sans)] text-[15px] md:text-[16px] leading-[1.65] text-[#111111]/70">
              Live counts across primary sectors. For rarer combinations (e.g. WASH × rural
              finance × women traders), ask. Depth almost always exists; the question is how
              to surface the right fit.
            </p>
          </div>
          <div className="md:col-span-8">
            <div className="border-t-2 border-[#111111]">
              {SECTOR_COVERAGE.map((s, i) => (
                <div
                  key={s.name}
                  className="flex items-baseline justify-between border-b border-[#111111]/10 py-3 md:py-4 hover:bg-[#27ABD2]/5 transition"
                >
                  <div className="flex items-baseline gap-4 md:gap-6">
                    <span className="font-[var(--font-sans)] text-[10px] md:text-[11px] font-bold tracking-widest text-[#111111]/35 tabular-nums w-6">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="font-[var(--font-sans)] text-[15px] md:text-[16px] font-semibold text-[#111111]">
                      {s.name}
                    </span>
                  </div>
                  <span className="font-[var(--font-serif)] text-[26px] md:text-[30px] leading-none text-[#27ABD2] tabular-nums">
                    {s.count}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Differentiators — editorial feature comparison */}
      <section className="px-6 md:px-10 py-20 md:py-28 border-b border-[#111111]/10">
        <div className="max-w-6xl mx-auto">
          <p className="font-[var(--font-sans)] text-[10px] md:text-[11px] font-bold tracking-[0.22em] uppercase text-[#111111]/50 mb-10 md:mb-12">
            V. What makes this different
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-0 md:gap-10 border-t border-[#111111]/10">
            {[
              {
                label: "Not LinkedIn",
                body: "LinkedIn is a database of everyone. We&apos;re a network of people who&apos;ve been vouched for by senior Ethiopian consultants. The signal is stronger because the source is accountable.",
              },
              {
                label: "Not your spreadsheet",
                body: "We maintain freshness. CVs get re-scored on donor standards, availability is pinged, stale entries get flagged. You don&apos;t inherit a 2021 roster of people who&apos;ve since left the country.",
              },
              {
                label: "Not a headhunter",
                body: "No retainers, no exclusivity clauses, no middleman on the call. First shortlist is free. After that, structure the economics around what works for your bid-to-placement ratio.",
              },
            ].map((d, i) => (
              <div
                key={i}
                className={`pt-6 md:pt-10 pb-6 md:pb-0 md:pl-6 md:pr-2 ${
                  i > 0 ? "border-t md:border-t-0 md:border-l border-[#111111]/10" : ""
                }`}
              >
                <p className="font-[var(--font-sans)] text-[11px] md:text-[12px] font-bold tracking-[0.18em] uppercase text-[#27ABD2] mb-4">
                  {d.label}
                </p>
                <p
                  className="font-[var(--font-sans)] text-[15px] md:text-[16px] leading-[1.65] text-[#111111]/80"
                  dangerouslySetInnerHTML={{ __html: d.body }}
                />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Reference — IRMAW case */}
      <section className="px-6 md:px-10 py-20 md:py-28 border-b border-[#111111]/10">
        <div className="max-w-6xl mx-auto">
          <p className="font-[var(--font-sans)] text-[10px] md:text-[11px] font-bold tracking-[0.22em] uppercase text-[#111111]/50 mb-10 md:mb-12">
            VI. Reference
          </p>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-8 md:gap-12 items-start">
            <div className="md:col-span-5">
              <p className="font-[var(--font-sans)] text-[10px] md:text-[11px] font-bold tracking-[0.22em] uppercase text-[#111111]/50 mb-4">
                April 2026
              </p>
              <h3 className="font-[var(--font-serif)] text-[36px] md:text-[48px] leading-[1.05] tracking-[-0.01em] text-[#111111]">
                IRMAW,{" "}
                <span className="italic text-[#27ABD2]">
                  TradeMark&nbsp;Africa&nbsp;/&nbsp;AFD
                </span>
              </h3>
              <p className="mt-4 font-[var(--font-sans)] text-[14px] md:text-[15px] uppercase tracking-[0.12em] font-semibold text-[#111111]/60">
                Women in Trade · Ethiopia-Djibouti Corridor
              </p>
            </div>
            <div className="md:col-span-7 font-[var(--font-sans)] text-[16px] leading-[1.7] text-[#111111]/80 space-y-4">
              <p>
                Two European firms competing for the same restricted TradeMark Africa tender
                needed Ethiopian Private Sector Development, Monitoring &amp; Evaluation, and
                Gender specialists inside 48 hours.
              </p>
              <p>
                Devidends surfaced ranked candidates from the network for both bids,
                including an unlisted Private Sector Development expert currently running the
                Research &amp; Project Management department at the Addis Ababa Chamber of
                Commerce — a profile neither firm had access to through their standing
                rosters.
              </p>
              <p className="text-[#111111] font-medium">
                Sourcing time reduced from days of outreach to a single turnaround.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing — honest */}
      <section className="px-6 md:px-10 py-20 md:py-28 border-b border-[#111111]/10">
        <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-12 gap-8 md:gap-12">
          <div className="md:col-span-5">
            <p className="font-[var(--font-sans)] text-[10px] md:text-[11px] font-bold tracking-[0.22em] uppercase text-[#111111]/50">
              VII. Pricing
            </p>
            <h2 className="mt-3 font-[var(--font-serif)] text-[40px] md:text-[56px] leading-[1.02] tracking-[-0.02em]">
              <span className="italic">First shortlist</span> is free.
            </h2>
          </div>
          <div className="md:col-span-7 font-[var(--font-sans)] text-[16px] md:text-[17px] leading-[1.7] text-[#111111]/80 space-y-5">
            <p>
              Testing fit is on us. You pay nothing for the first shortlist we deliver.
            </p>
            <p>
              For ongoing work we structure economics around what fits your model: a flat fee
              per shortlist, a success fee on placement, or a modest monthly retainer for
              firms running continuous Ethiopia pipelines. We&apos;ll propose options when
              you&apos;re ready to commit.
            </p>
            <p className="text-[#111111] font-medium">
              No retainers to try us. No exclusivity. No standing invoice.
            </p>
          </div>
        </div>
      </section>

      {/* Request a shortlist — the form */}
      <section id="request" className="px-6 md:px-10 py-20 md:py-28 bg-[#111111] text-[#F9F6F0]">
        <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-12 gap-8 md:gap-14 items-start">
          <div className="md:col-span-5">
            <p className="font-[var(--font-sans)] text-[10px] md:text-[11px] font-bold tracking-[0.22em] uppercase text-[#F9F6F0]/50">
              VIII. Request
            </p>
            <h2 className="mt-3 font-[var(--font-serif)] text-[44px] md:text-[68px] leading-[0.98] tracking-[-0.02em]">
              Send us <span className="italic text-[#27ABD2]">one ToR.</span>
              <br />
              We&apos;ll return ranked candidates
              <br />
              tomorrow.
            </h2>
            <p className="mt-6 font-[var(--font-sans)] text-[15px] md:text-[16px] leading-[1.65] text-[#F9F6F0]/70 max-w-md">
              First shortlist is free. If you&apos;d rather email us directly,{" "}
              <a
                href="mailto:hello@devidends.net?subject=Shortlist%20request"
                className="underline decoration-[#27ABD2] decoration-2 underline-offset-[5px] hover:text-[#F9F6F0] transition"
              >
                hello@devidends.net
              </a>
              .
            </p>
          </div>
          <div className="md:col-span-7">
            <ShortlistRequestForm />
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="px-6 md:px-10 py-12 md:py-14 text-[#111111]/70 bg-[#F9F6F0]">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row md:items-end md:justify-between gap-6">
          <div className="font-[var(--font-sans)] text-[13px] leading-[1.7]">
            <p className="font-extrabold text-[#111111] text-[16px] mb-1">
              <span style={{ color: "#27ABD2" }}>Dev</span>
              <span>idends</span>
            </p>
            <p>Envest Technologies PLC — Addis Ababa, Ethiopia</p>
            <p className="mt-2 text-[#111111]/50">
              A curated Ethiopian development consulting network.
            </p>
          </div>
          <div className="font-[var(--font-sans)] text-[13px] flex items-center gap-5">
            <Link href="/" className="hover:text-[#111111] transition">
              Homepage
            </Link>
            <a
              href="mailto:hello@devidends.net"
              className="hover:text-[#111111] transition"
            >
              Contact
            </a>
            <a
              href="#request"
              className="hover:text-[#111111] transition underline decoration-[#27ABD2] decoration-2 underline-offset-[4px]"
            >
              Request a shortlist
            </a>
          </div>
        </div>
      </footer>

      <style>{`
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { scrollbar-width: none; }
      `}</style>
    </div>
  );
}
