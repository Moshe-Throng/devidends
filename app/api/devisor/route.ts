// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

interface DevisorOpportunity {
  title: string;
  organization: string;
  description: string;
  deadline: string | null;
  published: string | null;
  country: string;
  city: string | null;
  source_url: string;
  source_domain: string;
  content_type: string;
  scraped_at: string;
  sector_norm?: string;
  work_type_norm?: string;
  raw_fields?: {
    budget_min?: number | null;
    budget_max?: number | null;
    procurement_method?: string | null;
    pipeline_stage?: string | null;
    donor_ref?: string | null;
    framework?: string | null;
    signal_type?: string | null;
    signal_confidence?: string | null;
    [key: string]: unknown;
  };
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const tab = searchParams.get("tab") || "all"; // pipeline | tenders | all
    const signalType = searchParams.get("signal_type");
    const sector = searchParams.get("sector");
    const stage = searchParams.get("stage");
    const search = searchParams.get("q")?.toLowerCase();
    const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 200);
    const offset = parseInt(searchParams.get("offset") || "0");

    // Try multiple paths — process.cwd() may differ between dev and production
    let filePath = path.join(process.cwd(), "test-output", "_all_normalized.json");
    if (!fs.existsSync(filePath)) {
      filePath = path.join(process.cwd(), "devidends", "test-output", "_all_normalized.json");
    }
    if (!fs.existsSync(filePath)) {
      return NextResponse.json(
        { items: [], total: 0, sectors: [], signalTypes: [] },
        { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } }
      );
    }

    console.log("[devisor API] Reading from:", filePath, "size:", fs.statSync(filePath).size);
    const raw = fs.readFileSync(filePath, "utf-8");
    let items: DevisorOpportunity[] = JSON.parse(raw);
    console.log("[devisor API] Loaded", items.length, "total items");

    // Only include items with devisor signal fields
    items = items.filter(
      (i) => i.raw_fields?.signal_type || i.raw_fields?.pipeline_stage || i.content_type === "tender" || i.content_type === "pipeline"
    );

    // Quality gate: only show actionable items
    // Must have EITHER a future deadline OR a meaningful title + organization
    const now = new Date();
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

    items = items.filter((i) => {
      // Has a future deadline = definitely actionable
      if (i.deadline) {
        const dl = new Date(i.deadline);
        return dl >= threeMonthsAgo; // Keep recent or future deadlines
      }
      // No deadline: keep IATI planned items (they're forward-looking intelligence)
      if (i.raw_fields?.signal_type === "iati_planned") return true;
      // Keep if it has budget data (concrete signal)
      if (i.raw_fields?.budget_min || i.raw_fields?.budget_max) return true;
      // Keep if published recently
      if (i.published) {
        const pub = new Date(i.published);
        return pub >= threeMonthsAgo;
      }
      // No deadline, no budget, no recent publish date = too vague
      return false;
    });

    // Add relevance score and action note for each item
    const ENVEST_KEYWORDS = ["private sector", "trade", "investment", "market systems", "business environment", "capacity building", "digital", "governance", "psd", "sme", "enterprise", "economic growth", "economic development"];
    items = items.map((i) => {
      const text = `${i.title} ${i.description} ${i.sector_norm || ""}`.toLowerCase();
      const matches = ENVEST_KEYWORDS.filter((kw) => text.includes(kw));
      const relevance = matches.length > 2 ? "high" : matches.length > 0 ? "medium" : "low";

      // Generate action note
      let actionNote = "";
      const st = i.raw_fields?.signal_type;
      const budget = i.raw_fields?.budget_max as number;
      const budgetStr = budget ? (budget >= 1e6 ? `$${(budget/1e6).toFixed(1)}M` : `$${(budget/1e3).toFixed(0)}K`) : "";

      if (st === "iati_winding_down") {
        actionNote = `Project ending soon${budgetStr ? ` (${budgetStr})` : ""} — follow-on procurement likely. Position Envest for Phase 2.`;
      } else if (st === "iati_planned") {
        actionNote = `New planned activity${budgetStr ? ` (${budgetStr})` : ""} — procurement 6-18 months away. Monitor and identify lead firms.`;
      } else if (st === "tender_published") {
        actionNote = `Live tender${budgetStr ? ` (${budgetStr})` : ""} — identify bidding firms, offer Envest as local partner.`;
      } else if (st === "donor_hiring") {
        actionNote = `Donor hiring in this area — programme procurement follows in 6-12 months.`;
      } else if (st === "usaid_forecast") {
        actionNote = `USAID planning this solicitation — prepare CV roster and approach potential primes.`;
      }

      return { ...i, raw_fields: { ...i.raw_fields, relevance, action_note: actionNote, envest_keywords: matches } };
    });

    // Collect unique values for filter dropdowns
    const allSectors = [...new Set(items.map((i) => i.sector_norm).filter(Boolean))].sort();
    const allSignalTypes = [...new Set(items.map((i) => i.raw_fields?.signal_type).filter(Boolean))].sort();

    // Tab filter
    if (tab === "pipeline") {
      items = items.filter((i) => {
        const stage = i.raw_fields?.pipeline_stage;
        return stage === "forecast" || stage === "pipeline" || i.content_type === "pipeline";
      });
    } else if (tab === "tenders") {
      items = items.filter((i) => {
        const stage = i.raw_fields?.pipeline_stage;
        return stage === "published" || stage === "awarded" || i.content_type === "tender";
      });
    }

    // Filters
    if (signalType) {
      items = items.filter((i) => i.raw_fields?.signal_type === signalType);
    }
    if (sector) {
      items = items.filter((i) => i.sector_norm === sector);
    }
    if (stage) {
      items = items.filter((i) => i.raw_fields?.pipeline_stage === stage);
    }
    if (search) {
      items = items.filter(
        (i) =>
          i.title.toLowerCase().includes(search) ||
          i.organization.toLowerCase().includes(search) ||
          (i.description || "").toLowerCase().includes(search)
      );
    }

    // Sort: Envest relevance first, then published tenders by deadline, then budget
    const relOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
    items.sort((a, b) => {
      // 1. Envest relevance
      const aRel = relOrder[a.raw_fields?.relevance as string || "low"] ?? 2;
      const bRel = relOrder[b.raw_fields?.relevance as string || "low"] ?? 2;
      if (aRel !== bRel) return aRel - bRel;

      // 2. Published tenders with deadlines first
      const aStage = a.raw_fields?.pipeline_stage || "";
      const bStage = b.raw_fields?.pipeline_stage || "";
      if (aStage === "published" && bStage !== "published") return -1;
      if (bStage === "published" && aStage !== "published") return 1;
      if (a.deadline && b.deadline) return a.deadline.localeCompare(b.deadline);

      // 3. By budget (higher first)
      const aBudget = (a.raw_fields?.budget_max as number) || 0;
      const bBudget = (b.raw_fields?.budget_max as number) || 0;
      return bBudget - aBudget;
    });

    const total = items.length;
    items = items.slice(offset, offset + limit);

    return NextResponse.json(
      { items, total, sectors: allSectors, signalTypes: allSignalTypes },
      { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } }
    );
  } catch (err) {
    console.error("[devisor API]", err);
    return NextResponse.json({ items: [], total: 0, sectors: [], signalTypes: [], error: "Failed to load data" }, { status: 500 });
  }
}
