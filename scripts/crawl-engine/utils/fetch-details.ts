/**
 * Shared utility to fetch job descriptions from detail pages.
 *
 * Used by adapters that only scrape list pages (taleo, jobvite, workable, puppeteer-spa generic).
 * Tries multiple CSS selectors to find the main content area.
 */

import { fetchWithRetry, stripHtml } from "./http";

const DETAIL_SELECTORS = [
  // Specific ATS selectors
  ".jd-description",
  ".job-description",
  ".jobdescription",
  ".job-details-description",
  ".job-detail__description",
  ".job-content",
  ".description-content",
  ".requisition-description",
  ".posting-requirements",
  // Generic content selectors
  '[data-automation="jobDescription"]',
  '[class*="description"]',
  '[class*="job-detail"]',
  '[class*="job_detail"]',
  // Workable specific
  '[data-ui="job-description"]',
  ".job-description-wrapper",
  // Taleo specific
  ".oracletaleocwsv2-accordion-body",
  ".requisition-details",
  // Jobvite specific
  ".jv-job-detail-description",
  ".jv-wrapper",
  // Broader fallback
  "article",
  "main",
  '[role="main"]',
];

interface FetchDetailsOptions {
  maxJobs?: number;
  delayMs?: number;
  minLength?: number;
  maxLength?: number;
  log?: { info: (msg: string) => void };
}

/**
 * Fetch descriptions for jobs that have empty descriptions.
 * Mutates the jobs array in-place.
 */
export async function fetchJobDetails(
  jobs: { description: string; source_url: string }[],
  opts: FetchDetailsOptions = {},
): Promise<number> {
  const {
    maxJobs = 20,
    delayMs = 1500,
    minLength = 80,
    maxLength = 8000,
    log,
  } = opts;

  const cheerio = require("cheerio");
  let filled = 0;

  const toFetch = jobs.filter(
    (j) => (!j.description || j.description.trim().length < minLength) && j.source_url,
  );

  const count = Math.min(toFetch.length, maxJobs);
  if (count === 0) return 0;

  log?.info(`Fetching details for ${count}/${toFetch.length} jobs without descriptions...`);

  for (let i = 0; i < count; i++) {
    const job = toFetch[i];
    try {
      const res = await fetchWithRetry(job.source_url, undefined, { timeoutMs: 15000 });
      if (!res.ok) continue;

      const html = await res.text();
      const $ = cheerio.load(html);

      // Remove noise
      $("script, style, nav, header, footer, .sidebar, .related-jobs, .similar-jobs").remove();

      // Try selectors in order of specificity
      let desc = "";
      for (const sel of DETAIL_SELECTORS) {
        const text = $(sel).first().text().trim();
        if (text && text.length >= minLength) {
          desc = text;
          break;
        }
      }

      // Last resort: <body> text minus navigation
      if (!desc || desc.length < minLength) {
        const bodyText = $("body").text().trim();
        if (bodyText.length >= minLength) {
          desc = bodyText;
        }
      }

      if (desc && desc.length >= minLength) {
        // Clean up whitespace
        desc = desc.replace(/\s+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
        job.description = desc.slice(0, maxLength);
        filled++;
      }
    } catch {
      // Skip failed detail pages
    }

    // Rate limit
    if (i < count - 1) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  log?.info(`Filled ${filled}/${count} descriptions from detail pages`);
  return filled;
}
