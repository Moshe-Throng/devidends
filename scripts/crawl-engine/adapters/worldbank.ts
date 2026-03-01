/**
 * World Bank Adapter — Procurement Notices REST API
 * Source: search.worldbank.org/api/v2/procnotices
 */

import type { CrawlAdapter, SourceConfig, RawOpportunity } from "../types";
import { createLogger } from "../utils/logger";

const BASE_URL = "https://search.worldbank.org/api/v2/procnotices";
const DETAIL_BASE = "https://projects.worldbank.org/en/projects-operations/procurement-detail";

export class WorldBankAdapter implements CrawlAdapter {
  name = "worldbank";

  async crawl(source: SourceConfig): Promise<RawOpportunity[]> {
    const log = createLogger(source.id);
    const cfg = source.config as {
      noticeTypes?: string[];
      rows?: number;
      searchTerm?: string;
    };

    const noticeTypes = cfg.noticeTypes || [
      "Request for Expression of Interest",
      "Invitation for Bids",
    ];
    const rows = cfg.rows || 50;
    const searchTerm = cfg.searchTerm || "Ethiopia";

    const allOpps: RawOpportunity[] = [];

    for (const noticeType of noticeTypes) {
      const label = noticeType.includes("Expression") ? "REOI" : "IFB";
      log.info(`Fetching ${label} notices...`);

      const params = new URLSearchParams({
        format: "json",
        qterm: searchTerm,
        notice_type: noticeType,
        rows: String(rows),
        os: "0",
      });

      const res = await fetch(`${BASE_URL}?${params}`);
      if (!res.ok) {
        log.error(`API error ${res.status} for ${label}`);
        continue;
      }

      const data = await res.json();
      const notices = data.procnotices || [];
      log.info(`  ${label}: ${notices.length} notices fetched`);

      const filtered = notices
        .filter((n: any) => {
          const country = (n.project_ctry_name || "").toLowerCase();
          const desc = (n.bid_description || "").toLowerCase();
          return country.includes("ethiopia") || desc.includes("ethiopia");
        })
        .map((n: any): RawOpportunity => {
          const deadline = n.submission_deadline_date
            ? n.submission_deadline_date.split("T")[0]
            : null;

          // Determine opportunity type from procurement method
          const method = (n.procurement_method_name || "").toLowerCase();
          let contentType = source.content_type;
          if (
            method.includes("consultant") ||
            method.includes("individual") ||
            method.includes("quality and cost")
          ) {
            contentType = "tender";
          }

          // Build rich description
          const descParts: string[] = [];
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
            organization: "World Bank",
            description: descParts.join("\n\n"),
            deadline,
            published: null,
            country: n.project_ctry_name || "Ethiopia",
            city: null,
            source_url: `${DETAIL_BASE}/${n.id}`,
            source_domain: "worldbank.org",
            content_type: contentType,
            scraped_at: new Date().toISOString(),
            raw_fields: {
              notice_type: n.notice_type,
              procurement_method: n.procurement_method_name || "",
              project_name: n.project_name || "",
              project_id: n.project_id || "",
              bid_reference: n.bid_reference_no || "",
              sector: sector || "",
            },
          };
        });

      allOpps.push(...filtered);
    }

    // Filter: only keep notices with future deadlines (or no deadline)
    const now = new Date().toISOString().split("T")[0];
    const active = allOpps.filter((j) => !j.deadline || j.deadline >= now);

    log.info(`Total: ${allOpps.length} fetched, ${active.length} active`);
    return active;
  }
}
