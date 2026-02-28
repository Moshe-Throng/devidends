"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import {
  Mail,
  Send,
  ArrowRight,
  Check,
  Globe,
  Target,
  Bell,
  Shield,
  Zap,
  ChevronDown,
  Loader2,
  Sparkles,
  Clock,
  Filter,
} from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";

/* ─── Scroll reveal hook ──────────────────────────────────── */

function useReveal(threshold = 0.15) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.unobserve(el);
        }
      },
      { threshold }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [threshold]);

  return { ref, visible };
}

/* ─── FAQ Accordion Item ──────────────────────────────────── */

function FaqItem({
  question,
  answer,
  delay,
  visible,
}: {
  question: string;
  answer: string;
  delay: number;
  visible: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div
      className={`border-b border-dark-100 transition-all duration-600 ${
        visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
      }`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between py-5 text-left group"
      >
        <span className="text-[15px] font-semibold text-dark-800 group-hover:text-cyan-600 transition-colors pr-4">
          {question}
        </span>
        <ChevronDown
          className={`w-5 h-5 text-dark-300 flex-shrink-0 transition-transform duration-300 ${
            open ? "rotate-180 text-cyan-500" : ""
          }`}
        />
      </button>
      <div
        className={`overflow-hidden transition-all duration-400 ${
          open ? "max-h-40 pb-5" : "max-h-0"
        }`}
      >
        <p className="text-sm text-dark-400 leading-relaxed">{answer}</p>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   SUBSCRIBE PAGE
   ═══════════════════════════════════════════════════════════════ */

export default function SubscribePage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<
    "idle" | "loading" | "success" | "error" | "already"
  >("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const cardsReveal = useReveal(0.1);
  const featuresReveal = useReveal(0.15);
  const sourcesReveal = useReveal(0.1);
  const faqReveal = useReveal(0.15);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;

    // Client-side validation
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setStatus("error");
      setErrorMsg("Please enter a valid email address");
      return;
    }

    setStatus("loading");
    setErrorMsg("");

    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          channel: "email",
          country_filter: ["Ethiopia"],
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setStatus("error");
        setErrorMsg(data.error || "Something went wrong");
        return;
      }

      if (data.alreadySubscribed) {
        setStatus("already");
      } else {
        setStatus("success");
      }
    } catch {
      setStatus("error");
      setErrorMsg("Network error. Please try again.");
    }
  }

  return (
    <div className="min-h-screen bg-white">
      <SiteHeader activeHref="/subscribe" />

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          HERO — Dark authority section
          ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <section className="relative overflow-hidden bg-dark-900">
        {/* Dot grid */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage:
              "radial-gradient(circle, #27ABD2 1px, transparent 1px)",
            backgroundSize: "28px 28px",
          }}
        />

        {/* Gradient blobs */}
        <div className="absolute top-0 right-[10%] w-[500px] h-[500px] rounded-full bg-gradient-to-br from-cyan-500/10 to-teal-400/5 blur-3xl animate-blobMove" />
        <div
          className="absolute bottom-0 left-[5%] w-[350px] h-[350px] rounded-full bg-gradient-to-tr from-teal-500/8 to-cyan-400/3 blur-3xl animate-blobMove"
          style={{ animationDelay: "-4s" }}
        />

        {/* Oversized background numeral */}
        <div className="absolute top-1/2 right-[8%] -translate-y-1/2 select-none pointer-events-none hidden lg:block">
          <span
            className="text-[18rem] font-black leading-none tracking-tighter bg-gradient-to-b from-dark-800/40 to-transparent bg-clip-text text-transparent"
            aria-hidden="true"
          >
            845
          </span>
        </div>

        {/* Geometric accents */}
        <div className="hidden lg:block absolute top-16 right-[30%] w-20 h-20 border border-cyan-500/10 rounded-2xl rotate-12 animate-float" />
        <div
          className="hidden lg:block absolute bottom-20 right-[20%] w-10 h-10 rounded-full bg-teal-400/8 animate-float"
          style={{ animationDelay: "-2s" }}
        />

        <div className="relative max-w-4xl mx-auto px-5 sm:px-8 pt-16 pb-20 md:pt-24 md:pb-28 text-center">
          {/* Eyebrow */}
          <div className="animate-staggerFadeUp inline-flex items-center gap-2.5 px-4 py-2 rounded-full border border-dark-700 bg-dark-800/60 backdrop-blur-sm mb-8">
            <Bell className="w-3.5 h-3.5 text-cyan-400" />
            <span className="text-[11px] font-bold text-dark-300 tracking-[0.18em] uppercase">
              Never Miss an Opportunity
            </span>
          </div>

          {/* Headline */}
          <h1
            className="animate-staggerFadeUp text-4xl sm:text-5xl md:text-[3.5rem] font-extrabold text-white leading-[1.1] tracking-tight"
            style={{ animationDelay: "0.1s" }}
          >
            Stay Ahead in{" "}
            <span
              className="bg-gradient-to-r from-cyan-400 via-teal-400 to-cyan-400 bg-clip-text text-transparent animate-gradientShift"
              style={{ backgroundSize: "200% 200%" }}
            >
              International
              <br className="hidden sm:block" />
              Development
            </span>
          </h1>

          {/* Subtext */}
          <p
            className="animate-staggerFadeUp mt-6 text-lg text-dark-400 leading-relaxed max-w-xl mx-auto"
            style={{ animationDelay: "0.2s" }}
          >
            Get curated jobs, tenders, and grants delivered to you weekly.
            Filtered, verified, and ready for your next move.
          </p>

          {/* Stats ribbon */}
          <div
            className="animate-staggerFadeUp mt-10 inline-flex flex-wrap items-center justify-center gap-x-6 gap-y-2 px-6 py-3 rounded-2xl border border-dark-700/60 bg-dark-800/40 backdrop-blur-sm"
            style={{ animationDelay: "0.3s" }}
          >
            {[
              { num: "845+", label: "Opportunities" },
              { num: "84", label: "Sources" },
              { num: "Weekly", label: "Digest" },
            ].map((s, i) => (
              <div key={s.label} className="flex items-center gap-x-6">
                <div className="flex items-center gap-2">
                  <span className="text-base font-extrabold bg-gradient-to-r from-cyan-400 to-teal-400 bg-clip-text text-transparent">
                    {s.num}
                  </span>
                  <span className="text-xs text-dark-400 font-medium uppercase tracking-wider">
                    {s.label}
                  </span>
                </div>
                {i < 2 && (
                  <div className="w-px h-4 bg-dark-700 hidden sm:block" />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Bottom curve */}
        <div className="absolute bottom-0 left-0 right-0">
          <svg
            viewBox="0 0 1440 48"
            className="w-full h-8 md:h-12 text-white"
            preserveAspectRatio="none"
          >
            <path
              d="M0,48 L0,24 Q360,0 720,24 Q1080,48 1440,24 L1440,48 Z"
              fill="currentColor"
            />
          </svg>
        </div>
      </section>

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          TWO SUBSCRIPTION CARDS
          ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <section className="py-16 md:py-20 -mt-4" ref={cardsReveal.ref}>
        <div className="max-w-5xl mx-auto px-5 sm:px-8">
          {/* Section intro */}
          <div
            className={`text-center mb-12 transition-all duration-700 ${
              cardsReveal.visible
                ? "opacity-100 translate-y-0"
                : "opacity-0 translate-y-8"
            }`}
          >
            <p className="text-[11px] font-bold text-dark-300 tracking-[0.25em] uppercase mb-3">
              Choose Your Channel
            </p>
            <h2 className="text-2xl md:text-3xl font-extrabold text-dark-900 tracking-tight">
              Two Ways to{" "}
              <span className="bg-gradient-to-r from-cyan-500 to-teal-400 bg-clip-text text-transparent">
                Stay Informed
              </span>
            </h2>
          </div>

          <div className="grid md:grid-cols-2 gap-6 lg:gap-8">
            {/* ── EMAIL CARD (Cyan) ───────────────────────── */}
            <div
              className={`group relative transition-all duration-700 ${
                cardsReveal.visible
                  ? "opacity-100 translate-x-0"
                  : "opacity-0 -translate-x-10"
              }`}
              style={{ transitionDelay: "200ms" }}
            >
              {/* Glow border on hover */}
              <div className="absolute -inset-[1px] rounded-3xl bg-gradient-to-br from-cyan-400 via-cyan-500/40 to-cyan-300/20 opacity-0 group-hover:opacity-100 transition-opacity duration-500 blur-[0.5px]" />

              <div className="relative bg-white border border-dark-100 group-hover:border-transparent rounded-3xl p-8 lg:p-10 transition-all duration-500 group-hover:shadow-2xl group-hover:shadow-cyan-500/8 overflow-hidden">
                {/* Background glow */}
                <div className="absolute top-0 right-0 w-56 h-56 rounded-full bg-gradient-to-bl from-cyan-50 to-transparent -translate-y-1/3 translate-x-1/4" />

                <div className="relative">
                  {/* Icon */}
                  <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-cyan-500 to-cyan-600 flex items-center justify-center mb-6 shadow-lg shadow-cyan-500/20">
                    <Mail className="w-7 h-7 text-white" />
                  </div>

                  <h3 className="text-xl font-extrabold text-dark-900 mb-2">
                    Email Alerts
                  </h3>
                  <p className="text-sm text-dark-400 leading-relaxed mb-6">
                    A curated digest of the best opportunities, delivered
                    straight to your inbox every Monday.
                  </p>

                  {/* Form or success state */}
                  {status === "success" ? (
                    <div className="animate-scaleReveal flex flex-col items-center py-6 px-4 rounded-2xl bg-emerald-50 border border-emerald-100">
                      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-500 flex items-center justify-center mb-3 shadow-md shadow-emerald-500/20">
                        <Check className="w-6 h-6 text-white" />
                      </div>
                      <p className="text-base font-bold text-emerald-800">
                        You&apos;re subscribed!
                      </p>
                      <p className="text-xs text-emerald-600 mt-1">
                        Check your inbox on Monday
                      </p>
                    </div>
                  ) : status === "already" ? (
                    <div className="animate-scaleReveal flex flex-col items-center py-6 px-4 rounded-2xl bg-cyan-50 border border-cyan-100">
                      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-cyan-400 to-cyan-500 flex items-center justify-center mb-3">
                        <Check className="w-6 h-6 text-white" />
                      </div>
                      <p className="text-base font-bold text-cyan-800">
                        Already subscribed!
                      </p>
                      <p className="text-xs text-cyan-600 mt-1">
                        You&apos;re all set — no action needed
                      </p>
                    </div>
                  ) : (
                    <form onSubmit={handleSubmit} className="space-y-3">
                      <div className="relative">
                        <input
                          type="email"
                          value={email}
                          onChange={(e) => {
                            setEmail(e.target.value);
                            if (status === "error") setStatus("idle");
                          }}
                          placeholder="your@email.com"
                          className={`w-full px-4 py-3.5 rounded-xl border-2 text-sm font-medium text-dark-900 placeholder:text-dark-300 outline-none transition-all duration-300 ${
                            status === "error"
                              ? "border-red-300 bg-red-50/50 focus:border-red-400 focus:shadow-md focus:shadow-red-500/5"
                              : "border-dark-100 bg-dark-50/50 focus:border-cyan-400 focus:bg-white focus:shadow-md focus:shadow-cyan-500/5"
                          }`}
                          disabled={status === "loading"}
                        />
                        {status === "error" && errorMsg && (
                          <p className="mt-1.5 text-xs text-red-500 font-medium">
                            {errorMsg}
                          </p>
                        )}
                      </div>
                      <button
                        type="submit"
                        disabled={status === "loading" || !email.trim()}
                        className="w-full flex items-center justify-center gap-2.5 px-6 py-3.5 rounded-xl bg-gradient-to-r from-cyan-500 to-cyan-600 text-white font-bold text-sm transition-all duration-300 hover:from-cyan-600 hover:to-cyan-700 hover:shadow-lg hover:shadow-cyan-500/25 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-none"
                      >
                        {status === "loading" ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Subscribing...
                          </>
                        ) : (
                          <>
                            Subscribe
                            <ArrowRight className="w-4 h-4" />
                          </>
                        )}
                      </button>
                    </form>
                  )}

                  {/* Benefits */}
                  <div className="mt-6 pt-6 border-t border-dark-50 space-y-2.5">
                    {[
                      { icon: Clock, text: "Weekly digest every Monday" },
                      { icon: Filter, text: "Sector & donor filtering" },
                      { icon: Mail, text: "Direct to your inbox" },
                    ].map((b) => (
                      <div
                        key={b.text}
                        className="flex items-center gap-2.5 text-xs text-dark-400"
                      >
                        <b.icon className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0" />
                        <span>{b.text}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* ── TELEGRAM CARD (Teal) ────────────────────── */}
            <div
              className={`group relative transition-all duration-700 ${
                cardsReveal.visible
                  ? "opacity-100 translate-x-0"
                  : "opacity-0 translate-x-10"
              }`}
              style={{ transitionDelay: "400ms" }}
            >
              {/* Glow border on hover */}
              <div className="absolute -inset-[1px] rounded-3xl bg-gradient-to-br from-teal-400 via-teal-500/40 to-teal-300/20 opacity-0 group-hover:opacity-100 transition-opacity duration-500 blur-[0.5px]" />

              <div className="relative bg-white border border-dark-100 group-hover:border-transparent rounded-3xl p-8 lg:p-10 transition-all duration-500 group-hover:shadow-2xl group-hover:shadow-teal-500/8 overflow-hidden">
                {/* Background glow */}
                <div className="absolute top-0 right-0 w-56 h-56 rounded-full bg-gradient-to-bl from-teal-50 to-transparent -translate-y-1/3 translate-x-1/4" />

                <div className="relative">
                  {/* Icon */}
                  <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-teal-500 to-teal-600 flex items-center justify-center mb-6 shadow-lg shadow-teal-500/20">
                    <Send className="w-7 h-7 text-white" />
                  </div>

                  <h3 className="text-xl font-extrabold text-dark-900 mb-2">
                    Telegram Bot
                  </h3>
                  <p className="text-sm text-dark-400 leading-relaxed mb-6">
                    Chat with our bot for personalized alerts, opportunity search,
                    and AI-powered CV scoring — right from Telegram.
                  </p>

                  {/* Telegram Bot CTA */}
                  <a
                    href="https://t.me/Devidends_Bot"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full flex items-center justify-center gap-2.5 px-6 py-3.5 rounded-xl bg-gradient-to-r from-teal-500 to-teal-600 text-white font-bold text-sm transition-all duration-300 hover:from-teal-600 hover:to-teal-700 hover:shadow-lg hover:shadow-teal-500/25 hover:-translate-y-0.5"
                  >
                    <Send className="w-4 h-4" />
                    Start Bot
                    <ArrowRight className="w-4 h-4" />
                  </a>

                  {/* Channel secondary link */}
                  <a
                    href="https://t.me/devidends"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-teal-200 text-teal-600 font-semibold text-xs transition-all duration-300 hover:bg-teal-50 hover:border-teal-300"
                  >
                    Or join our channel for daily updates
                  </a>

                  {/* Telegram preview */}
                  <div className="mt-5 rounded-xl bg-teal-50/60 border border-teal-100/60 p-4">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-teal-500 to-teal-600 flex items-center justify-center flex-shrink-0">
                        <Send className="w-4 h-4 text-white" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-dark-800">
                          Devidends Bot
                        </p>
                        <p className="text-[10px] text-dark-400">
                          @Devidends_Bot
                        </p>
                      </div>
                    </div>
                    <div className="space-y-1.5 pl-12">
                      <div className="h-2 w-3/4 rounded-full bg-teal-200/60" />
                      <div className="h-2 w-1/2 rounded-full bg-teal-200/40" />
                      <div className="h-2 w-2/3 rounded-full bg-teal-200/30" />
                    </div>
                  </div>

                  {/* Benefits */}
                  <div className="mt-6 pt-6 border-t border-dark-50 space-y-2.5">
                    {[
                      { icon: Zap, text: "Search opportunities instantly" },
                      { icon: Sparkles, text: "AI-powered CV scoring" },
                      { icon: Shield, text: "Personalized sector alerts" },
                    ].map((b) => (
                      <div
                        key={b.text}
                        className="flex items-center gap-2.5 text-xs text-dark-400"
                      >
                        <b.icon className="w-3.5 h-3.5 text-teal-400 flex-shrink-0" />
                        <span>{b.text}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          WHAT YOU'LL GET
          ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <section
        className="py-16 md:py-20 bg-dark-50/40"
        ref={featuresReveal.ref}
      >
        <div className="max-w-5xl mx-auto px-5 sm:px-8">
          <div
            className={`text-center mb-12 transition-all duration-700 ${
              featuresReveal.visible
                ? "opacity-100 translate-y-0"
                : "opacity-0 translate-y-8"
            }`}
          >
            <p className="text-[11px] font-bold text-dark-300 tracking-[0.25em] uppercase mb-3">
              What You&apos;ll Receive
            </p>
            <h2 className="text-2xl md:text-3xl font-extrabold text-dark-900 tracking-tight">
              Intelligence, Not Just Listings
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                icon: Target,
                title: "Curated Opportunities",
                desc: "Hand-picked from 84+ development sources. Quality-scored and deduplicated so you only see what matters.",
                color: "cyan" as const,
                delay: 100,
              },
              {
                icon: Filter,
                title: "Smart Filtering",
                desc: "Matched to your sector, donor preference, and location. No noise — only opportunities relevant to you.",
                color: "teal" as const,
                delay: 250,
              },
              {
                icon: Zap,
                title: "Early Access",
                desc: "Be among the first to know about new positions, tenders, and grants. Apply before the crowd.",
                color: "cyan" as const,
                delay: 400,
              },
            ].map((f) => (
              <div
                key={f.title}
                className={`group p-7 rounded-2xl bg-white border border-dark-100 transition-all duration-600 hover:shadow-xl hover:shadow-${f.color}-500/5 hover:-translate-y-1 hover:border-${f.color}-200 ${
                  featuresReveal.visible
                    ? "opacity-100 translate-y-0"
                    : "opacity-0 translate-y-8"
                }`}
                style={{ transitionDelay: `${f.delay}ms` }}
              >
                <div
                  className={`w-12 h-12 rounded-xl bg-gradient-to-br ${
                    f.color === "cyan"
                      ? "from-cyan-500 to-cyan-600 shadow-cyan-500/20"
                      : "from-teal-500 to-teal-600 shadow-teal-500/20"
                  } flex items-center justify-center mb-5 shadow-lg transition-transform duration-300 group-hover:scale-110`}
                >
                  <f.icon className="w-6 h-6 text-white" />
                </div>
                <h3 className="text-base font-extrabold text-dark-900 mb-2">
                  {f.title}
                </h3>
                <p className="text-sm text-dark-400 leading-relaxed">
                  {f.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          TRUSTED SOURCES
          ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <section className="py-14 md:py-16" ref={sourcesReveal.ref}>
        <div className="max-w-5xl mx-auto px-5 sm:px-8">
          <p
            className={`text-center text-[11px] font-bold text-dark-300 tracking-[0.25em] uppercase mb-8 transition-all duration-500 ${
              sourcesReveal.visible
                ? "opacity-100 translate-y-0"
                : "opacity-0 translate-y-4"
            }`}
          >
            Aggregating from trusted sources
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            {[
              "World Bank",
              "GIZ",
              "United Nations",
              "European Union",
              "AfDB",
              "UNDP",
              "USAID",
              "DRC",
              "African Union",
              "UNICEF",
            ].map((name, i) => (
              <div
                key={name}
                className={`flex items-center gap-2 px-4 py-2 bg-white border border-dark-100 rounded-full text-dark-500 text-xs font-medium transition-all duration-500 hover:border-cyan-300 hover:text-cyan-700 ${
                  sourcesReveal.visible
                    ? "opacity-100 translate-y-0"
                    : "opacity-0 translate-y-4"
                }`}
                style={{ transitionDelay: `${100 + i * 50}ms` }}
              >
                <Globe className="w-3 h-3 text-cyan-400 flex-shrink-0" />
                {name}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          FAQ
          ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <section className="py-16 md:py-20 bg-dark-50/40" ref={faqReveal.ref}>
        <div className="max-w-2xl mx-auto px-5 sm:px-8">
          <div
            className={`text-center mb-10 transition-all duration-700 ${
              faqReveal.visible
                ? "opacity-100 translate-y-0"
                : "opacity-0 translate-y-8"
            }`}
          >
            <h2 className="text-2xl md:text-3xl font-extrabold text-dark-900 tracking-tight">
              Frequently Asked Questions
            </h2>
          </div>

          <div className="bg-white rounded-2xl border border-dark-100 px-6 md:px-8">
            <FaqItem
              question="How often will I receive alerts?"
              answer="Email subscribers receive a curated weekly digest every Monday morning. Our Telegram channel posts new high-priority opportunities as they appear throughout the week."
              delay={100}
              visible={faqReveal.visible}
            />
            <FaqItem
              question="Can I filter by sector or donor?"
              answer="Sector and donor filtering is available for email alerts. When you subscribe, we match opportunities to your preferences. Advanced customization is coming soon."
              delay={200}
              visible={faqReveal.visible}
            />
            <FaqItem
              question="Is it free?"
              answer="Yes, completely free. Our mission is to democratize access to development sector opportunities across East Africa."
              delay={300}
              visible={faqReveal.visible}
            />
            <FaqItem
              question="Can I unsubscribe?"
              answer="Absolutely. Every email includes a one-click unsubscribe link. For Telegram, simply leave the channel anytime."
              delay={400}
              visible={faqReveal.visible}
            />
          </div>
        </div>
      </section>

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          BOTTOM CTA
          ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <section className="py-16 md:py-20">
        <div className="max-w-3xl mx-auto px-5 sm:px-8 text-center">
          <h2 className="text-2xl md:text-3xl font-extrabold text-dark-900 tracking-tight mb-4">
            Ready to get started?
          </h2>
          <p className="text-dark-400 mb-8 text-base leading-relaxed max-w-lg mx-auto">
            Join hundreds of development professionals already receiving curated
            opportunities every week.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              href="#"
              onClick={(e) => {
                e.preventDefault();
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
              className="inline-flex items-center gap-2.5 bg-gradient-to-r from-cyan-500 to-teal-500 text-white font-bold px-7 py-4 rounded-xl text-base transition-all duration-300 hover:from-cyan-600 hover:to-teal-600 hover:shadow-lg hover:shadow-cyan-500/20 hover:-translate-y-0.5"
            >
              <Mail className="w-5 h-5" />
              Subscribe via Email
            </Link>
            <a
              href="https://t.me/Devidends_Bot"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2.5 bg-dark-900 text-white font-bold px-7 py-4 rounded-xl text-base transition-all duration-300 hover:bg-dark-800 hover:shadow-xl hover:shadow-dark-900/15 hover:-translate-y-0.5"
            >
              <Send className="w-5 h-5" />
              Start Telegram Bot
            </a>
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
