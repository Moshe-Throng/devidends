"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Search,
  MapPin,
  Clock,
  ExternalLink,
  Loader2,
  Filter,
  X,
} from "lucide-react";
import { useTelegram } from "@/components/TelegramProvider";
import type { SampleOpportunity } from "@/lib/types/cv-score";

const SECTOR_CHIPS = [
  "All",
  "Health",
  "Finance",
  "ICT",
  "Agriculture",
  "Education",
  "WASH",
  "Governance",
  "Gender",
  "Environment",
  "Humanitarian",
  "Energy",
  "Economic",
  "Legal",
  "Research",
  "Media",
  "Project Management",
];

// Map each chip to the canonical sector labels produced by
// scripts/crawl-engine/normalize.ts. Chips that don't substring-match the
// canonical name (ICT, Agriculture, Humanitarian, Energy, Research, Media,
// Project Management) need an explicit mapping to avoid silently returning
// zero. Each chip can also list extra title keywords used as a fallback for
// rows whose `sectors[]` is still empty.
const CHIP_FILTER: Record<string, { sectors: string[]; titleKeywords: string[] }> = {
  Health: { sectors: ["Health"], titleKeywords: ["health", "medical", "nutrition", "clinical", "epidemiol", "hiv", "malaria", "doctor", "nurse"] },
  Finance: { sectors: ["Admin & Finance"], titleKeywords: ["finance", "accountant", "audit", "compliance", "procurement", "grants management"] },
  ICT: { sectors: ["IT & Technology"], titleKeywords: ["ict", "digital", "software", "developer", "data analyst", "engineering", "it support"] },
  Agriculture: { sectors: ["Food Security & Livelihoods"], titleKeywords: ["agriculture", "agronom", "livestock", "crop", "farm", "food security", "livelihood"] },
  Education: { sectors: ["Education"], titleKeywords: ["education", "teacher", "school", "learning", "training"] },
  WASH: { sectors: ["WASH"], titleKeywords: ["wash", "water", "sanitation", "hygiene"] },
  Governance: { sectors: ["Governance"], titleKeywords: ["governance", "rule of law", "anti-corruption", "civil society", "justice", "decentrali", "pfm"] },
  Gender: { sectors: ["Gender", "Protection & Human Rights"], titleKeywords: ["gender", "women", "gbv", "gender-based"] },
  Environment: { sectors: ["Environment"], titleKeywords: ["environment", "climate", "conservation", "natural resources"] },
  Humanitarian: { sectors: ["Protection & Human Rights", "Food Security & Livelihoods"], titleKeywords: ["humanitarian", "refugee", "displacement", "emergency", "protection"] },
  Energy: { sectors: ["Environment"], titleKeywords: ["energy", "renewable", "solar", "electric"] },
  Economic: { sectors: ["Economic Development"], titleKeywords: ["economic", "trade", "private sector", "enterprise", "value chain", "sme"] },
  Legal: { sectors: ["Legal"], titleKeywords: ["legal", "lawyer", "law"] },
  Research: { sectors: ["M&E"], titleKeywords: ["research", "monitoring", "evaluation", "m&e", "meal"] },
  Media: { sectors: ["Communications"], titleKeywords: ["media", "communications", "journalism", "public relations", "advocacy"] },
  "Project Management": { sectors: ["Program/Project Management"], titleKeywords: ["program manager", "project manager", "coordinator", "country director", "chief of party"] },
};

export default function TgAppOpportunities() {
  const { profile } = useTelegram();
  const [opportunities, setOpportunities] = useState<SampleOpportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeSector, setActiveSector] = useState("All");
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    async function fetchOpps() {
      try {
        const res = await fetch(
          "/api/opportunities/sample?hideExpired=true&minQuality=20"
        );
        if (res.ok) {
          const data = await res.json();
          setOpportunities(data.opportunities || []);
        }
      } catch {
        // Silent fail
      } finally {
        setLoading(false);
      }
    }
    fetchOpps();
  }, []);

  // Filter opportunities
  const filtered = useMemo(() => {
    let result = opportunities;

    // Sector filter — primary path is the sectors[] column (canonical
    // taxonomy from normalize.ts) using an explicit chip→sector map. Falls
    // back to a title-only keyword match for rows whose sectors[] hasn't
    // been backfilled yet. Never substrings on organization or
    // classified_type — those caused massive false positives (every UNEP
    // role looking like "Environment", every Economic Commission role
    // looking like "Economic").
    if (activeSector !== "All") {
      const cfg = CHIP_FILTER[activeSector];
      result = result.filter((o) => {
        if (cfg && o.sectors?.some((s) => cfg.sectors.includes(s))) return true;
        const t = o.title?.toLowerCase() ?? "";
        const kws = cfg?.titleKeywords ?? [activeSector.toLowerCase()];
        return kws.some((kw) => t.includes(kw));
      });
    }

    // Search filter
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      result = result.filter(
        (o) =>
          o.title?.toLowerCase().includes(q) ||
          o.organization?.toLowerCase().includes(q) ||
          o.country?.toLowerCase().includes(q)
      );
    }

    return result;
  }, [opportunities, activeSector, search]);

  // Show all opportunities by default — user can filter manually

  return (
    <div className="pb-6">
      {/* ── Header ── */}
      <div className="bg-white border-b border-dark-100 px-4 pt-3 pb-3 sticky top-0 z-30">
        <div className="flex items-center gap-3 mb-3">
          <Link href="/tg-app" className="text-dark-400 hover:text-dark-600">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-lg font-extrabold text-dark-900 tracking-tight">
            Opportunities
          </h1>
          <span className="ml-auto text-xs font-semibold text-dark-400">
            {filtered.length} found
          </span>
        </div>

        {/* Search bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-300" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by title, org, country..."
            className="w-full pl-9 pr-10 py-2.5 rounded-xl border border-dark-100 text-sm bg-dark-50 focus:bg-white focus:border-cyan-400 focus:outline-none placeholder:text-dark-300"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-dark-300"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Sector chips */}
        <div className="flex gap-1.5 mt-2.5 overflow-x-auto pb-1 -mx-4 px-4 scrollbar-none">
          {SECTOR_CHIPS.map((sector) => (
            <button
              key={sector}
              onClick={() => setActiveSector(sector)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                activeSector === sector
                  ? "bg-cyan-500 text-white"
                  : "bg-dark-50 text-dark-500 hover:bg-dark-100"
              }`}
            >
              {sector}
            </button>
          ))}
        </div>
      </div>

      {/* ── Results ── */}
      <div className="px-4 mt-3">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-cyan-500" />
            <p className="text-xs text-dark-400 mt-2">
              Loading opportunities...
            </p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <Filter className="w-8 h-8 text-dark-200 mx-auto mb-2" />
            <p className="text-sm font-semibold text-dark-500">
              No matches found
            </p>
            <p className="text-xs text-dark-400 mt-1">
              Try a different search or sector filter
            </p>
            {activeSector !== "All" && (
              <button
                onClick={() => setActiveSector("All")}
                className="mt-3 text-xs font-semibold text-cyan-600"
              >
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-2.5">
            {filtered.map((opp, i) => (
              <Link
                key={i}
                href={`/tg-app/opportunities/${opp.id}`}
                className="block bg-white border border-dark-100 rounded-xl p-4 active:bg-dark-50 transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-dark-900 leading-snug line-clamp-2">
                      {opp.title}
                    </p>
                    <p className="text-xs text-dark-500 mt-1">
                      {opp.organization}
                    </p>
                  </div>
                  <ExternalLink className="w-3.5 h-3.5 text-dark-300 shrink-0 mt-0.5" />
                </div>

                <div className="flex items-center flex-wrap gap-x-3 gap-y-1 mt-2.5">
                  {opp.country && (
                    <span className="flex items-center gap-1 text-[11px] text-dark-400">
                      <MapPin className="w-3 h-3" />
                      {opp.country}
                    </span>
                  )}
                  {opp.deadline && (
                    <span className="flex items-center gap-1 text-[11px] text-dark-400">
                      <Clock className="w-3 h-3" />
                      {new Date(opp.deadline).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1.5 mt-2">
                  {opp.type && (
                    <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-cyan-50 text-cyan-700">
                      {opp.type}
                    </span>
                  )}
                  {opp.seniority && (
                    <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-teal-50 text-teal-700">
                      {opp.seniority}
                    </span>
                  )}
                  {opp.classified_type && (
                    <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-dark-50 text-dark-500">
                      {opp.classified_type}
                    </span>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
