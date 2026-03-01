/**
 * Oracle HCM Adapter — API intercept + DOM fallback
 *
 * Used for:
 *   - NRC (Norwegian Refugee Council): ekum.fa.em2.oraclecloud.com
 *   - Other Oracle HCM portals
 */

import type { CrawlAdapter, SourceConfig, RawOpportunity } from "../types";
import { getBrowser, createStealthPage } from "../utils/browser";
import { sleep } from "../utils/http";
import { createLogger } from "../utils/logger";

interface OracleHcmConfig {
  portalUrl: string; // Full URL to requisitions page
  orgName: string;
  sourceDomain: string;
  searchText?: string;
  defaultCountry?: string;
}

const NAV_PATTERNS = /^(about|home|menu|search|login|apply|contact|privacy|cookie|terms|faq|help|back|skip|close)/i;

export class OracleHcmAdapter implements CrawlAdapter {
  name = "oracle-hcm";

  async crawl(source: SourceConfig): Promise<RawOpportunity[]> {
    const log = createLogger(source.id);
    const cfg = source.config as OracleHcmConfig;

    const browser = await getBrowser();
    const page = await createStealthPage(browser);
    const jobs: RawOpportunity[] = [];
    const interceptedJobs: any[] = [];

    try {
      // Set up API response interception
      page.on("response", async (response: any) => {
        try {
          const url = response.url();
          if (
            url.includes("recruitingCEJobRequisitions") ||
            url.includes("requisitions") ||
            url.includes("jobRequisition")
          ) {
            const data = await response.json();
            if (data?.items) {
              interceptedJobs.push(...data.items);
            }
          }
        } catch {
          // Ignore non-JSON responses
        }
      });

      log.info(`Loading ${cfg.portalUrl}...`);
      await page.goto(cfg.portalUrl, { waitUntil: "networkidle2", timeout: 45000 });
      await sleep(3000);

      // Try to search for Ethiopia
      if (cfg.searchText) {
        try {
          const searchInput = await page.$(
            'input[type="search"], input[type="text"], input[placeholder*="Search"], input[aria-label*="Search"]'
          );
          if (searchInput) {
            await searchInput.click();
            await searchInput.type(cfg.searchText, { delay: 100 });
            await page.keyboard.press("Enter");
            await sleep(3000);
          }
        } catch {
          log.warn("Could not interact with search input");
        }
      }

      // Scroll to trigger lazy loading
      for (let i = 0; i < 3; i++) {
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await sleep(2000);
      }

      // Strategy 1: Use intercepted API data
      if (interceptedJobs.length > 0) {
        log.info(`API intercept: ${interceptedJobs.length} jobs`);
        for (const item of interceptedJobs) {
          const title = item.Title || item.RequisitionTitle || item.title || "";
          if (!title || title.length < 5 || NAV_PATTERNS.test(title)) continue;

          jobs.push({
            title,
            organization: cfg.orgName,
            description: item.Description || item.ShortDescriptionStr || "",
            deadline: item.ExternalCloseDate || item.CloseDate || null,
            published: item.PostedDate || null,
            country: item.PrimaryLocation || cfg.defaultCountry || "Ethiopia",
            city: null,
            source_url: item.Id
              ? `${new URL(cfg.portalUrl).origin}/hcmUI/CandidateExperience/en/sites/CX_1001/requisitions/${item.Id}`
              : cfg.portalUrl,
            source_domain: cfg.sourceDomain,
            content_type: source.content_type,
            scraped_at: new Date().toISOString(),
          });
        }
      }

      // Strategy 2: DOM fallback
      if (jobs.length === 0) {
        log.info("Trying DOM extraction...");
        const rawJobs = await page.evaluate(() => {
          const results: any[] = [];
          const selectors = [
            'a[href*="requisition"]',
            'a[href*="job/"]',
            ".card",
            '[role="list"] [role="listitem"]',
          ];

          for (const sel of selectors) {
            document.querySelectorAll(sel).forEach((el) => {
              const title = el.textContent?.trim().split("\n")[0]?.trim() || "";
              const href = (el as HTMLAnchorElement).href || "";
              if (title && title.length > 5 && title.length < 200) {
                results.push({ title, link: href });
              }
            });
            if (results.length > 0) break;
          }
          return results;
        });

        for (const raw of rawJobs) {
          if (NAV_PATTERNS.test(raw.title)) continue;
          jobs.push({
            title: raw.title,
            organization: cfg.orgName,
            description: "",
            deadline: null,
            published: null,
            country: cfg.defaultCountry || "Ethiopia",
            city: null,
            source_url: raw.link || cfg.portalUrl,
            source_domain: cfg.sourceDomain,
            content_type: source.content_type,
            scraped_at: new Date().toISOString(),
          });
        }
      }

      log.info(`Done: ${jobs.length} jobs`);
    } finally {
      await page.close();
    }

    return jobs;
  }
}
