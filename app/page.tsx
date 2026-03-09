"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Search,
  FileText,
  ArrowRight,
  Mail,
  Send,
  Globe,
  Target,
  FileCheck,
  Briefcase,
  ChevronRight,
  Newspaper,
  Clock,
  ExternalLink,
} from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { useAuth } from "@/components/AuthProvider";
import { createSupabaseBrowser } from "@/lib/supabase-browser";

/* ─── Scroll-triggered reveal hook ─────────────────────────── */

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

/* ─── Animated counter ─────────────────────────────────────── */

function AnimatedStat({
  value,
  label,
  suffix = "+",
  visible,
  delay = 0,
}: {
  value: number;
  label: string;
  suffix?: string;
  visible: boolean;
  delay?: number;
}) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!visible) return;
    const timeout = setTimeout(() => {
      const duration = 1800;
      const steps = 40;
      const increment = value / steps;
      let current = 0;
      const interval = setInterval(() => {
        current += increment;
        if (current >= value) {
          setCount(value);
          clearInterval(interval);
        } else {
          setCount(Math.floor(current));
        }
      }, duration / steps);
      return () => clearInterval(interval);
    }, delay);
    return () => clearTimeout(timeout);
  }, [visible, value, delay]);

  return (
    <div
      className={`flex flex-col items-center px-3 sm:px-6 py-5 sm:py-6 transition-all duration-700 ${
        visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
      }`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      <span className="text-3xl sm:text-4xl md:text-5xl font-extrabold tabular-nums">
        <span className="bg-gradient-to-r from-cyan-500 to-teal-400 bg-clip-text text-transparent">
          {count}
        </span>
        <span className="text-cyan-400/70 text-2xl sm:text-3xl">{suffix}</span>
      </span>
      <span className="text-dark-400 text-xs sm:text-sm font-semibold mt-2 tracking-[0.1em] sm:tracking-[0.15em] uppercase">
        {label}
      </span>
    </div>
  );
}

/* ─── Source badge ──────────────────────────────────────────── */

function SourceBadge({
  name,
  visible,
  delay,
}: {
  name: string;
  visible: boolean;
  delay: number;
}) {
  return (
    <div
      className={`flex items-center gap-2 px-3.5 sm:px-5 py-2 sm:py-2.5 bg-white border border-dark-100 rounded-full text-dark-500 text-xs sm:text-sm font-medium transition-all duration-500 hover:border-cyan-300 hover:text-cyan-700 hover:shadow-md hover:shadow-cyan-500/5 ${
        visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
      }`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      <Globe className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0" />
      {name}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   LANDING PAGE
   ═══════════════════════════════════════════════════════════════ */

interface NewsItem {
  id: string;
  title: string;
  summary: string;
  url: string;
  source_name: string;
  published_at: string | null;
  category: string;
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export default function LandingPage() {
  const { user } = useAuth();
  const doors = useReveal(0.1);
  const howItWorks = useReveal(0.15);
  const sourcesReveal = useReveal(0.1);
  const statsReveal = useReveal(0.15);
  const newsReveal = useReveal(0.1);
  const ctaReveal = useReveal(0.1);

  const [newsItems, setNewsItems] = useState<NewsItem[]>([]);
  const [hasCV, setHasCV] = useState(false);

  useEffect(() => {
    fetch("/api/news?limit=6")
      .then((r) => r.json())
      .then((d) => setNewsItems(d.articles || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!user) return;
    const sb = createSupabaseBrowser();
    (async () => {
      try {
        const { data } = await sb.from("profiles").select("cv_structured_data").eq("user_id", user.id).single();
        if (data?.cv_structured_data) setHasCV(true);
      } catch { /* silent */ }
    })();
  }, [user]);

  return (
    <div className="min-h-screen bg-white">
      <SiteHeader activeHref="/" />

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          HERO
          ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <section className="relative overflow-hidden">
        {/* Dot-grid background */}
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              "radial-gradient(circle, #212121 1px, transparent 1px)",
            backgroundSize: "28px 28px",
          }}
        />

        {/* Floating decorative elements */}
        <div className="absolute top-20 right-[10%] w-64 h-64 rounded-full bg-gradient-to-br from-cyan-500/8 to-teal-400/5 blur-3xl animate-blobMove" />
        <div
          className="absolute bottom-10 left-[5%] w-48 h-48 rounded-full bg-gradient-to-tr from-teal-400/6 to-cyan-500/4 blur-2xl animate-blobMove"
          style={{ animationDelay: "-3s" }}
        />

        {/* Geometric accents */}
        <div className="hidden lg:block absolute top-32 right-[15%] w-16 h-16 border-2 border-cyan-200/30 rounded-xl rotate-12 animate-float" />
        <div
          className="hidden lg:block absolute top-48 right-[22%] w-8 h-8 rounded-full bg-teal-400/15 animate-float"
          style={{ animationDelay: "-2s" }}
        />
        <div
          className="hidden lg:block absolute bottom-24 right-[8%] w-12 h-12 border-2 border-teal-300/25 rounded-full animate-float"
          style={{ animationDelay: "-1s" }}
        />
        {/* Diagonal line accent */}
        <div className="hidden xl:block absolute top-28 right-[18%] w-[120px] h-[2px] bg-gradient-to-r from-transparent via-cyan-300/30 to-transparent rotate-[35deg]" />

        <div className="relative max-w-7xl mx-auto px-5 sm:px-8 pt-16 pb-12 md:pt-24 md:pb-20">
          <div className="max-w-3xl">
            {/* Eyebrow */}
            <div className="animate-staggerFadeUp inline-flex items-center gap-2.5 px-4 py-2 rounded-full bg-dark-900 mb-8">
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
              <span className="text-[11px] font-bold text-dark-200 tracking-[0.18em] uppercase">
                84+ Sources Monitored Daily
              </span>
            </div>

            {/* Headline */}
            <h1
              className="animate-staggerFadeUp text-4xl sm:text-5xl md:text-[3.75rem] font-extrabold text-dark-900 leading-[1.08] tracking-tight"
              style={{ animationDelay: "0.1s" }}
            >
              Empowering Your
              <br />
              Ventures in{" "}
              <span
                className="bg-gradient-to-r from-cyan-500 via-teal-400 to-cyan-500 bg-clip-text text-transparent animate-gradientShift"
                style={{ backgroundSize: "200% 200%" }}
              >
                International
                <br className="hidden sm:block" />
                Development
              </span>
            </h1>

            {/* Subtext */}
            <p
              className="animate-staggerFadeUp mt-6 text-lg md:text-xl text-dark-400 leading-relaxed max-w-xl"
              style={{ animationDelay: "0.2s" }}
            >
              Your gateway to jobs and tenders. Strengthen your profile
              with AI-powered tools or discover your next assignment across East
              Africa.
            </p>

            {/* Hero CTAs */}
            <div
              className="animate-staggerFadeUp mt-9 flex flex-col sm:flex-row gap-3"
              style={{ animationDelay: "0.3s" }}
            >
              <Link
                href="#two-doors"
                className="inline-flex items-center justify-center gap-2.5 bg-dark-900 text-white font-bold px-8 py-4 rounded-xl text-base transition-all duration-300 hover:bg-dark-800 hover:shadow-xl hover:shadow-dark-900/15 hover:-translate-y-0.5"
              >
                Get Started
                <ArrowRight className="w-4 h-4" />
              </Link>
              <Link
                href="/opportunities"
                className="inline-flex items-center justify-center gap-2.5 bg-white text-dark-900 font-bold px-8 py-4 rounded-xl text-base border-2 border-dark-100 transition-all duration-300 hover:border-cyan-300 hover:shadow-lg hover:shadow-cyan-500/5 hover:-translate-y-0.5"
              >
                Browse Opportunities
              </Link>
            </div>
          </div>
        </div>

        {/* Bottom fade */}
        <div className="h-20 bg-gradient-to-b from-transparent to-white" />
      </section>

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          TWO DOORS
          ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <section id="two-doors" className="py-16 md:py-24" ref={doors.ref}>
        <div className="max-w-7xl mx-auto px-5 sm:px-8">
          {/* Section header */}
          <div
            className={`text-center mb-14 transition-all duration-700 ${
              doors.visible
                ? "opacity-100 translate-y-0"
                : "opacity-0 translate-y-8"
            }`}
          >
            <p className="text-[11px] font-bold text-dark-300 tracking-[0.25em] uppercase mb-3">
              Choose Your Path
            </p>
            <h2 className="text-3xl md:text-4xl font-extrabold text-dark-900 tracking-tight">
              Two Ways to{" "}
              <span className="bg-gradient-to-r from-cyan-500 to-teal-400 bg-clip-text text-transparent">
                Advance
              </span>
            </h2>
          </div>

          {/* The two doors */}
          <div className="grid lg:grid-cols-2 gap-6 lg:gap-8">
            {/* ── DOOR 1: Strengthen Your Profile (Cyan) ─── */}
            <div
              className={`group relative transition-all duration-700 ${
                doors.visible
                  ? "opacity-100 translate-x-0"
                  : "opacity-0 -translate-x-10"
              }`}
              style={{ transitionDelay: "200ms" }}
            >
              {/* Gradient border wrapper */}
              <div className="absolute -inset-[1px] rounded-3xl bg-gradient-to-br from-cyan-400 via-cyan-500/50 to-cyan-300/30 opacity-0 group-hover:opacity-100 transition-opacity duration-500 blur-[0.5px]" />

              <div className="relative bg-white border border-dark-100 group-hover:border-transparent rounded-3xl p-8 lg:p-10 transition-all duration-500 group-hover:shadow-2xl group-hover:shadow-cyan-500/10 group-hover:-translate-y-1 overflow-hidden">
                {/* Background accent */}
                <div className="absolute top-0 right-0 w-72 h-72 rounded-full bg-gradient-to-bl from-cyan-50 to-transparent -translate-y-1/3 translate-x-1/3" />
                <div className="absolute bottom-0 left-0 w-40 h-40 rounded-full bg-cyan-50/50 translate-y-1/2 -translate-x-1/4" />

                <div className="relative">
                  {/* Badge */}
                  <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-cyan-50 border border-cyan-100 mb-6">
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-500" />
                    <span className="text-[10px] font-bold text-cyan-700 tracking-[0.15em] uppercase">
                      CV Tools
                    </span>
                  </div>

                  <h3 className="text-2xl lg:text-3xl font-extrabold text-dark-900 tracking-tight mb-3">
                    Strengthen Your
                    <br />
                    <span className="text-cyan-500">Profile</span>
                  </h3>

                  <p className="text-dark-400 text-sm leading-relaxed mb-8 max-w-sm">
                    AI-powered tools to analyze, score, and transform your CV
                    into donor-ready format. Stand out in competitive screening
                    processes.
                  </p>

                  {/* Tool cards */}
                  <div className="space-y-3 mb-8">
                    <div className="flex items-start gap-4 p-4 rounded-xl bg-cyan-50/60 border border-cyan-100/60 transition-all duration-300 hover:bg-cyan-50">
                      <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-cyan-500 to-cyan-600 flex items-center justify-center flex-shrink-0 shadow-md shadow-cyan-500/20">
                        <Target className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-dark-900">
                          CV Scorer
                        </p>
                        <p className="text-xs text-dark-400 mt-0.5 leading-relaxed">
                          Get scored across 6 dimensions with AI. Compare
                          against specific opportunities.
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start gap-4 p-4 rounded-xl bg-cyan-50/60 border border-cyan-100/60 transition-all duration-300 hover:bg-cyan-50">
                      <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-cyan-400 to-cyan-500 flex items-center justify-center flex-shrink-0 shadow-md shadow-cyan-400/20">
                        <FileCheck className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-dark-900">
                          CV Builder
                        </p>
                        <p className="text-xs text-dark-400 mt-0.5 leading-relaxed">
                          Transform any CV into World Bank / UN format. AI
                          extraction + DOCX export.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* CTAs */}
                  <div className="flex flex-wrap gap-3">
                    {hasCV ? (
                      <Link
                        href="/cv-builder"
                        className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-cyan-600 text-white font-bold text-sm transition-all duration-300 hover:from-cyan-600 hover:to-cyan-700 hover:shadow-lg hover:shadow-cyan-500/25 hover:-translate-y-0.5"
                      >
                        Edit My CV
                        <ArrowRight className="w-4 h-4" />
                      </Link>
                    ) : (
                      <>
                        <Link
                          href="/score"
                          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-cyan-600 text-white font-bold text-sm transition-all duration-300 hover:from-cyan-600 hover:to-cyan-700 hover:shadow-lg hover:shadow-cyan-500/25 hover:-translate-y-0.5 animate-pulseGlow"
                        >
                          Score My CV
                          <ArrowRight className="w-4 h-4" />
                        </Link>
                        <Link
                          href="/cv-builder"
                          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl border-2 border-cyan-200 text-cyan-700 font-bold text-sm transition-all duration-300 hover:bg-cyan-50 hover:border-cyan-300"
                        >
                          Build CV
                          <ChevronRight className="w-4 h-4" />
                        </Link>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* ── DOOR 2: Find Your Next Assignment (Teal) ── */}
            <div
              className={`group relative transition-all duration-700 ${
                doors.visible
                  ? "opacity-100 translate-x-0"
                  : "opacity-0 translate-x-10"
              }`}
              style={{ transitionDelay: "400ms" }}
            >
              {/* Gradient border wrapper */}
              <div className="absolute -inset-[1px] rounded-3xl bg-gradient-to-br from-teal-400 via-teal-500/50 to-teal-300/30 opacity-0 group-hover:opacity-100 transition-opacity duration-500 blur-[0.5px]" />

              <div className="relative bg-white border border-dark-100 group-hover:border-transparent rounded-3xl p-8 lg:p-10 transition-all duration-500 group-hover:shadow-2xl group-hover:shadow-teal-500/10 group-hover:-translate-y-1 overflow-hidden">
                {/* Background accent */}
                <div className="absolute top-0 right-0 w-72 h-72 rounded-full bg-gradient-to-bl from-teal-50 to-transparent -translate-y-1/3 translate-x-1/3" />
                <div className="absolute bottom-0 left-0 w-40 h-40 rounded-full bg-teal-50/50 translate-y-1/2 -translate-x-1/4" />

                <div className="relative">
                  {/* Badge */}
                  <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-teal-50 border border-teal-100 mb-6">
                    <span className="w-1.5 h-1.5 rounded-full bg-teal-500" />
                    <span className="text-[10px] font-bold text-teal-700 tracking-[0.15em] uppercase">
                      Opportunities
                    </span>
                  </div>

                  <h3 className="text-2xl lg:text-3xl font-extrabold text-dark-900 tracking-tight mb-3">
                    Find Your Next
                    <br />
                    <span className="text-teal-500">Assignment</span>
                  </h3>

                  <p className="text-dark-400 text-sm leading-relaxed mb-8 max-w-sm">
                    Browse curated opportunities from top development
                    organizations. Jobs, tenders, and consulting — filtered,
                    deduplicated, and quality-checked.
                  </p>

                  {/* Opportunity types */}
                  <div className="space-y-3 mb-8">
                    <div className="flex items-start gap-4 p-4 rounded-xl bg-teal-50/60 border border-teal-100/60 transition-all duration-300 hover:bg-teal-50">
                      <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-teal-500 to-teal-600 flex items-center justify-center flex-shrink-0 shadow-md shadow-teal-500/20">
                        <Search className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-dark-900">
                          Jobs & Positions
                        </p>
                        <p className="text-xs text-dark-400 mt-0.5 leading-relaxed">
                          UN agencies, NGOs, and international organizations
                          across East Africa.
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start gap-4 p-4 rounded-xl bg-teal-50/60 border border-teal-100/60 transition-all duration-300 hover:bg-teal-50">
                      <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-teal-400 to-teal-500 flex items-center justify-center flex-shrink-0 shadow-md shadow-teal-400/20">
                        <FileText className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-dark-900">
                          Tenders & Consulting
                        </p>
                        <p className="text-xs text-dark-400 mt-0.5 leading-relaxed">
                          Procurement notices from World Bank, GIZ, EU, and
                          major donors.
                        </p>
                      </div>
                    </div>

                  </div>

                  {/* CTA */}
                  <Link
                    href="/opportunities"
                    className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-teal-500 to-teal-600 text-white font-bold text-sm transition-all duration-300 hover:from-teal-600 hover:to-teal-700 hover:shadow-lg hover:shadow-teal-500/25 hover:-translate-y-0.5"
                  >
                    Browse Opportunities
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          HOW IT WORKS
          ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <section
        className="py-20 md:py-28 bg-dark-50/40"
        ref={howItWorks.ref}
      >
        <div className="max-w-5xl mx-auto px-5 sm:px-8">
          <div
            className={`text-center mb-16 transition-all duration-700 ${
              howItWorks.visible
                ? "opacity-100 translate-y-0"
                : "opacity-0 translate-y-8"
            }`}
          >
            <p className="text-[11px] font-bold text-dark-300 tracking-[0.25em] uppercase mb-3">
              How It Works
            </p>
            <h2 className="text-3xl md:text-4xl font-extrabold text-dark-900 tracking-tight">
              Three Steps to Success
            </h2>
          </div>

          <div className="relative grid md:grid-cols-3 gap-8 md:gap-6">
            {/* Connecting line (desktop only) */}
            <div className="hidden md:block absolute top-14 left-[20%] right-[20%] h-[2px]">
              <div
                className={`h-full bg-gradient-to-r from-cyan-300 via-teal-300 to-cyan-300 transition-all duration-1000 ${
                  howItWorks.visible ? "scale-x-100" : "scale-x-0"
                }`}
                style={{
                  transformOrigin: "left",
                  transitionDelay: "500ms",
                }}
              />
            </div>

            {/* Step 1: Discover */}
            <div
              className={`relative text-center transition-all duration-700 ${
                howItWorks.visible
                  ? "opacity-100 translate-y-0"
                  : "opacity-0 translate-y-8"
              }`}
              style={{ transitionDelay: "200ms" }}
            >
              <div className="relative w-28 h-28 mx-auto mb-6">
                <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-cyan-100 to-cyan-50 rotate-6" />
                <div className="absolute inset-0 rounded-2xl bg-white border border-cyan-100 shadow-lg shadow-cyan-500/5 flex items-center justify-center">
                  <Search className="w-8 h-8 text-cyan-500" />
                </div>
                {/* Step number */}
                <div className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-gradient-to-br from-cyan-500 to-teal-500 flex items-center justify-center text-white text-xs font-extrabold shadow-md shadow-cyan-500/25">
                  1
                </div>
              </div>
              <h3 className="text-xl font-extrabold text-dark-900 mb-2">
                Discover
              </h3>
              <p className="text-sm text-dark-400 leading-relaxed max-w-[220px] mx-auto">
                Browse 845+ opportunities from 84 trusted sources, updated daily
              </p>
            </div>

            {/* Step 2: Prepare */}
            <div
              className={`relative text-center transition-all duration-700 ${
                howItWorks.visible
                  ? "opacity-100 translate-y-0"
                  : "opacity-0 translate-y-8"
              }`}
              style={{ transitionDelay: "400ms" }}
            >
              <div className="relative w-28 h-28 mx-auto mb-6">
                <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-teal-100 to-teal-50 rotate-6" />
                <div className="absolute inset-0 rounded-2xl bg-white border border-teal-100 shadow-lg shadow-teal-500/5 flex items-center justify-center">
                  <Target className="w-8 h-8 text-teal-500" />
                </div>
                <div className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-gradient-to-br from-teal-500 to-cyan-500 flex items-center justify-center text-white text-xs font-extrabold shadow-md shadow-teal-500/25">
                  2
                </div>
              </div>
              <h3 className="text-xl font-extrabold text-dark-900 mb-2">
                Prepare
              </h3>
              <p className="text-sm text-dark-400 leading-relaxed max-w-[220px] mx-auto">
                Score and build your CV with AI — tailored for donor screening
              </p>
            </div>

            {/* Step 3: Succeed */}
            <div
              className={`relative text-center transition-all duration-700 ${
                howItWorks.visible
                  ? "opacity-100 translate-y-0"
                  : "opacity-0 translate-y-8"
              }`}
              style={{ transitionDelay: "600ms" }}
            >
              <div className="relative w-28 h-28 mx-auto mb-6">
                <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-cyan-100 to-teal-50 rotate-6" />
                <div className="absolute inset-0 rounded-2xl bg-white border border-cyan-100 shadow-lg shadow-cyan-500/5 flex items-center justify-center">
                  <Briefcase className="w-8 h-8 text-cyan-600" />
                </div>
                <div className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-gradient-to-br from-cyan-600 to-teal-500 flex items-center justify-center text-white text-xs font-extrabold shadow-md shadow-cyan-500/25">
                  3
                </div>
              </div>
              <h3 className="text-xl font-extrabold text-dark-900 mb-2">
                Succeed
              </h3>
              <p className="text-sm text-dark-400 leading-relaxed max-w-[220px] mx-auto">
                Apply with confidence — optimized CV, clear match insights
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          STATS
          ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <section className="border-y border-dark-100" ref={statsReveal.ref}>
        <div className="max-w-7xl mx-auto px-5 sm:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-dark-100">
            <AnimatedStat
              value={845}
              label="Opportunities"
              visible={statsReveal.visible}
              delay={0}
            />
            <AnimatedStat
              value={84}
              label="Sources"
              visible={statsReveal.visible}
              delay={150}
            />
            <AnimatedStat
              value={30}
              label="Sectors"
              visible={statsReveal.visible}
              delay={300}
            />
            <AnimatedStat
              value={150}
              label="Experts"
              visible={statsReveal.visible}
              delay={450}
            />
          </div>
        </div>
      </section>

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          LATEST DEV NEWS
          ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      {newsItems.length > 0 && (
        <section className="py-16 md:py-20 bg-dark-50/40" ref={newsReveal.ref}>
          <div className="max-w-7xl mx-auto px-5 sm:px-8">
            <div
              className={`flex items-center justify-between mb-8 transition-all duration-700 ${
                newsReveal.visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
              }`}
            >
              <div>
                <div className="flex items-center gap-2.5 mb-2">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-teal-400 flex items-center justify-center">
                    <Newspaper className="w-4 h-4 text-white" />
                  </div>
                  <p className="text-[11px] font-bold text-dark-300 tracking-[0.25em] uppercase">
                    Intel Feed
                  </p>
                </div>
                <h2 className="text-2xl md:text-3xl font-extrabold text-dark-900 tracking-tight">
                  Development News
                </h2>
              </div>
              <Link
                href="/news"
                className="hidden sm:inline-flex items-center gap-1.5 text-sm font-bold text-cyan-600 hover:text-cyan-700 transition-colors"
              >
                View all
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {newsItems.slice(0, 6).map((article, i) => (
                <a
                  key={article.id}
                  href={article.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`group block transition-all duration-500 ${
                    newsReveal.visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
                  }`}
                  style={{ transitionDelay: `${150 + i * 80}ms` }}
                >
                  <div className="h-full bg-white border border-dark-100 rounded-xl p-5 hover:border-cyan-300 hover:shadow-lg hover:shadow-cyan-500/5 transition-all duration-200 hover:-translate-y-0.5">
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-50 text-cyan-700 border border-cyan-200">
                        {article.category}
                      </span>
                      <ExternalLink className="w-3.5 h-3.5 text-dark-200 group-hover:text-cyan-500 shrink-0 transition-colors" />
                    </div>
                    <h3 className="text-sm font-bold text-dark-900 leading-snug line-clamp-2 group-hover:text-cyan-700 transition-colors">
                      {article.title}
                    </h3>
                    {article.summary && (
                      <p className="mt-1.5 text-xs text-dark-400 leading-relaxed line-clamp-2">
                        {article.summary}
                      </p>
                    )}
                    <div className="flex items-center gap-2.5 mt-3 text-[11px] text-dark-400">
                      <span className="flex items-center gap-1">
                        <Globe className="w-3 h-3" />
                        {article.source_name}
                      </span>
                      {article.published_at && (
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {timeAgo(article.published_at)}
                        </span>
                      )}
                    </div>
                  </div>
                </a>
              ))}
            </div>

            <div className="mt-6 text-center sm:hidden">
              <Link
                href="/news"
                className="inline-flex items-center gap-1.5 text-sm font-bold text-cyan-600"
              >
                View all news
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          TRUSTED SOURCES
          ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <section className="py-16 md:py-20" ref={sourcesReveal.ref}>
        <div className="max-w-7xl mx-auto px-5 sm:px-8">
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
              "UNOPS",
              "ReliefWeb",
            ].map((name, i) => (
              <SourceBadge
                key={name}
                name={name}
                visible={sourcesReveal.visible}
                delay={100 + i * 60}
              />
            ))}
          </div>
        </div>
      </section>

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          CTA
          ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <section className="py-16 md:py-24" ref={ctaReveal.ref}>
        <div className="max-w-7xl mx-auto px-5 sm:px-8">
          <div className="relative overflow-hidden rounded-3xl bg-slate-800 p-10 md:p-16">
            {/* Animated gradient blobs */}
            <div className="absolute top-0 right-0 w-[400px] h-[400px] rounded-full bg-gradient-to-br from-cyan-500/12 to-teal-400/6 blur-3xl animate-blobMove" />
            <div
              className="absolute bottom-0 left-0 w-[300px] h-[300px] rounded-full bg-gradient-to-tr from-teal-500/8 to-cyan-400/4 blur-3xl animate-blobMove"
              style={{ animationDelay: "-4s" }}
            />

            {/* Decorative dot grid */}
            <div
              className="absolute inset-0 opacity-[0.04]"
              style={{
                backgroundImage:
                  "radial-gradient(circle, #27ABD2 1px, transparent 1px)",
                backgroundSize: "24px 24px",
              }}
            />

            <div
              className={`relative max-w-2xl transition-all duration-700 ${
                ctaReveal.visible
                  ? "opacity-100 translate-y-0"
                  : "opacity-0 translate-y-8"
              }`}
            >
              <h2 className="text-3xl md:text-4xl font-extrabold text-white tracking-tight">
                Never miss an{" "}
                <span className="bg-gradient-to-r from-cyan-400 to-teal-400 bg-clip-text text-transparent">
                  opportunity
                </span>
              </h2>
              <p className="mt-4 text-slate-300 text-lg leading-relaxed">
                Get curated opportunities delivered to your inbox or Telegram
                every week. Filtered by your sector, donor preference, and
                location.
              </p>

              <div
                className={`mt-8 flex flex-col sm:flex-row gap-3 transition-all duration-700 ${
                  ctaReveal.visible
                    ? "opacity-100 translate-y-0"
                    : "opacity-0 translate-y-6"
                }`}
                style={{ transitionDelay: "200ms" }}
              >
                <Link
                  href="/subscribe"
                  className="inline-flex items-center justify-center gap-2.5 bg-gradient-to-r from-cyan-500 to-teal-500 text-white font-bold px-7 py-4 rounded-xl text-base transition-all duration-300 hover:from-cyan-400 hover:to-teal-400 hover:shadow-lg hover:shadow-cyan-500/30 hover:-translate-y-0.5"
                >
                  <Mail className="w-5 h-5" />
                  Subscribe via Email
                </Link>
                <Link
                  href="/subscribe"
                  className="inline-flex items-center justify-center gap-2.5 bg-white/10 text-white font-bold px-7 py-4 rounded-xl text-base border border-white/10 transition-all duration-300 hover:bg-white/15 hover:border-white/20 hover:-translate-y-0.5"
                >
                  <Send className="w-5 h-5" />
                  Join Telegram Channel
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
