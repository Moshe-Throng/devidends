/**
 * Base adapter and adapter registry.
 *
 * Each platform adapter implements the CrawlAdapter interface.
 * The registry maps adapter names to their implementations.
 */

import type { CrawlAdapter } from "../types";

// Import all adapters
import { ReliefWebAdapter } from "./reliefweb";
import { WorldBankAdapter } from "./worldbank";
import { WorkdayAdapter } from "./workday";
import { CheerioHtmlAdapter } from "./cheerio-html";
import { PuppeteerSpaAdapter } from "./puppeteer-spa";
import { OracleHcmAdapter } from "./oracle-hcm";
import { GreenhouseAdapter } from "./greenhouse";
import { SmartRecruitersAdapter } from "./smartrecruiters";
import { JobviteAdapter } from "./jobvite";
import { IcimsAdapter } from "./icims";
import { WorkableAdapter } from "./workable";
import { TaleoAdapter } from "./taleo";

/**
 * Get the adapter registry — maps adapter name to implementation.
 */
export function getAdapterRegistry(): Map<string, CrawlAdapter> {
  const registry = new Map<string, CrawlAdapter>();

  // Existing source adapters (migrated from PoC)
  registry.set("reliefweb", new ReliefWebAdapter());
  registry.set("worldbank", new WorldBankAdapter());
  registry.set("workday", new WorkdayAdapter());
  registry.set("cheerio-html", new CheerioHtmlAdapter());
  registry.set("puppeteer-spa", new PuppeteerSpaAdapter());
  registry.set("oracle-hcm", new OracleHcmAdapter());

  // New ATS platform adapters
  registry.set("greenhouse", new GreenhouseAdapter());
  registry.set("smartrecruiters", new SmartRecruitersAdapter());
  registry.set("jobvite", new JobviteAdapter());
  registry.set("icims", new IcimsAdapter());
  registry.set("workable", new WorkableAdapter());
  registry.set("taleo", new TaleoAdapter());

  return registry;
}
