/**
 * PoC Scraper: World Bank
 * Source: search.worldbank.org Procurement Notices API v2
 * Method: REST API (no auth required)
 *
 * API docs: https://search.worldbank.org/api/v2/procnotices
 *
 * Three data sources:
 *   1. Procurement Notices (REOI) — consulting opportunities for firms & individuals
 *   2. Procurement Notices (IFB)  — invitation for bids (goods, works, services)
 *   3. Projects API               — active WB-funded Ethiopia projects (context only)
 *
 * The CSOD careers portal (worldbankgroup.csod.com) requires SAML auth
 * and cannot be scraped via simple API calls.
 */
const fs = require("fs");
const path = require("path");

const BASE_URL = "https://search.worldbank.org/api/v2/procnotices";
const PROJECTS_URL = "https://search.worldbank.org/api/v2/projects";
const DETAIL_BASE = "https://projects.worldbank.org/en/projects-operations/procurement-detail";

/**
 * Fetch Ethiopia procurement notices filtered by notice type.
 * @param {string} noticeType - e.g. "Request for Expression of Interest", "Invitation for Bids"
 * @param {number} rows - max results per page
 */
async function fetchProcNotices(noticeType, rows = 50) {
  const label = noticeType === "Request for Expression of Interest" ? "REOI" : "IFB";
  console.log(`  Fetching ${label} notices (${noticeType})...`);

  const params = new URLSearchParams({
    format: "json",
    qterm: "Ethiopia",
    notice_type: noticeType,
    rows: String(rows),
    os: "0",
  });

  const url = `${BASE_URL}?${params}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Procurement API error: ${res.status}`);

  const data = await res.json();
  const notices = data.procnotices || [];
  const total = data.total || 0;
  console.log(`    API reports ${total} total, fetched ${notices.length}`);

  return notices
    .filter((n) => {
      // Only keep notices with Ethiopia in the country or description
      const country = (n.project_ctry_name || "").toLowerCase();
      const desc = (n.bid_description || "").toLowerCase();
      return country.includes("ethiopia") || desc.includes("ethiopia");
    })
    .map((n) => {
      const deadline = n.submission_deadline_date
        ? n.submission_deadline_date.split("T")[0]
        : null;

      // Determine opportunity type from procurement method
      const method = (n.procurement_method_name || "").toLowerCase();
      let type = "tender";
      if (
        method.includes("consultant") ||
        method.includes("individual") ||
        method.includes("quality and cost")
      ) {
        type = "consulting";
      } else if (method.includes("bid") || method.includes("quotation")) {
        type = "tender";
      }

      // Build rich description from all available fields
      const descParts = [];
      if (n.bid_description) descParts.push(n.bid_description.replace(/\s+/g, " ").trim());
      if (n.project_name) descParts.push(`Project: ${n.project_name}`);
      if (n.procurement_method_name) descParts.push(`Method: ${n.procurement_method_name}`);
      if (n.notice_type) descParts.push(`Notice Type: ${n.notice_type}`);
      if (n.bid_reference_no) descParts.push(`Reference: ${n.bid_reference_no}`);
      if (n.contact_address) descParts.push(`Contact: ${n.contact_address}`);
      const sector = n.sector || n.majorsector_name || "";
      if (sector) descParts.push(`Sector: ${sector}`);

      return {
        title: (n.bid_description || "Untitled").replace(/\s+/g, " ").trim().split("\n")[0].substring(0, 300),
        description: descParts.join("\n\n"),
        deadline,
        organization: "World Bank",
        country: n.project_ctry_name || "Ethiopia",
        source_url: `${DETAIL_BASE}/${n.id}`,
        source_domain: "worldbank.org",
        type,
        notice_type: n.notice_type,
        procurement_method: n.procurement_method_name || "",
        project_name: n.project_name || "",
        project_id: n.project_id || "",
        bid_reference: n.bid_reference_no || "",
        sector: sector || null,
        scraped_at: new Date().toISOString(),
      };
    });
}

// cleanDescription removed — we now keep the full bid_description text

/**
 * Fetch active World Bank projects in Ethiopia (for context/enrichment).
 */
async function fetchActiveProjects() {
  console.log("  Fetching active Ethiopia projects...");

  const params = new URLSearchParams({
    format: "json",
    countrycode: "ET",
    rows: "50",
    os: "0",
  });

  const url = `${PROJECTS_URL}?${params}`;
  const res = await fetch(url);
  if (!res.ok) {
    console.log("    Projects API error:", res.status);
    return [];
  }

  const data = await res.json();
  const projects = data.projects || {};
  const total = data.total || 0;
  console.log(`    ${total} active Ethiopia projects found`);

  return Object.entries(projects).map(([id, p]) => ({
    id: p.id || id,
    name: p.project_name || "",
    status: p.projectstatusdisplay || "",
    sector: p.sector1?.Name || "",
    total_commitment: p.curr_total_commitment || "",
    approval_date: p.boardapprovaldate || "",
    closing_date: p.closingdate || "",
    implementing_agency: p.impagency || "",
  }));
}

async function main() {
  console.log("World Bank Scraper — Procurement Notices API v2");
  console.log("================================================\n");

  try {
    // 1. Fetch REOI (consulting opportunities — most relevant for consultants)
    const reoiResults = await fetchProcNotices(
      "Request for Expression of Interest",
      50
    );
    console.log(`    => ${reoiResults.length} Ethiopia REOI notices\n`);

    // 2. Fetch IFB (bids — relevant for firms)
    const ifbResults = await fetchProcNotices("Invitation for Bids", 30);
    console.log(`    => ${ifbResults.length} Ethiopia IFB notices\n`);

    // 3. Fetch active projects (for enrichment context)
    const projects = await fetchActiveProjects();
    console.log("");

    // Combine all procurement results
    const allNotices = [...reoiResults, ...ifbResults];

    // Deduplicate by source_url
    const seen = new Set();
    const unique = allNotices.filter((j) => {
      if (seen.has(j.source_url)) return false;
      seen.add(j.source_url);
      return true;
    });

    // Sort by deadline (soonest first), nulls last
    unique.sort((a, b) => {
      if (!a.deadline && !b.deadline) return 0;
      if (!a.deadline) return 1;
      if (!b.deadline) return -1;
      return a.deadline.localeCompare(b.deadline);
    });

    // Filter: only keep notices with future deadlines (or no deadline)
    const now = new Date().toISOString().split("T")[0];
    const active = unique.filter((j) => !j.deadline || j.deadline >= now);

    // Write results
    const outDir = path.join(__dirname, "../../test-output");
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

    const outPath = path.join(outDir, "worldbank.json");
    const output = {
      metadata: {
        scraped_at: new Date().toISOString(),
        total_fetched: allNotices.length,
        unique_count: unique.length,
        active_count: active.length,
        active_projects: projects.length,
        sources: {
          reoi: reoiResults.length,
          ifb: ifbResults.length,
        },
      },
      opportunities: active,
      projects: projects.slice(0, 10), // Top 10 projects for reference
    };

    fs.writeFileSync(outPath, JSON.stringify(output, null, 2));

    console.log("Results:");
    console.log(`  Total fetched:        ${allNotices.length}`);
    console.log(`  After dedup:          ${unique.length}`);
    console.log(`  Active (future deadline): ${active.length}`);
    console.log(`  Active projects:      ${projects.length}`);
    console.log(`  Output: ${outPath}\n`);

    if (active.length > 0) {
      console.log("Sample opportunities (next 5 deadlines):");
      for (const opp of active.slice(0, 5)) {
        console.log(`  [${opp.deadline || "no deadline"}] [${opp.notice_type}]`);
        console.log(`    ${opp.title.substring(0, 100)}`);
        console.log(`    Method: ${opp.procurement_method}`);
        console.log(`    Project: ${opp.project_name.substring(0, 80)}`);
        console.log(`    URL: ${opp.source_url}`);
        console.log("");
      }
    }

    console.log(`Done. ${active.length} active World Bank opportunities for Ethiopia.`);
  } catch (err) {
    console.error(`World Bank scraper failed: ${err.message}`);
    console.error(err.stack);
    process.exit(1);
  }
}

main();
