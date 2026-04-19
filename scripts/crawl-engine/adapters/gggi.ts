/**
 * GGGI Adapter — iCAMS JSON Feed API
 *
 * GGGI's public careers page (careers.gggi.org/vacancies.html) is JS-rendered.
 * The actual data lives at an iCAMS JSON feed:
 *   https://careers.gggi.org/utf8/ic_job_feeds.feed_engine?p_web_site_id=5514&p_published_to=WWW&p_language=DEFAULT&p_direct=Y&p_format=MOBILE
 *
 * Returns: { jobs: [{ id, title, weblink, timestamp, publication: {internet: {closing_date}}, classifications: {class_14803 Location, class_14846 Contract Type}, ...}] }
 */

import type { CrawlAdapter, SourceConfig, RawOpportunity } from "../types";
import { createLogger } from "../utils/logger";

interface GggiConfig {
  webSiteId?: string | number; // defaults to 5514
  orgName?: string;
  countryFilter?: string[]; // optional list of countries to include (case-insensitive)
}

interface GggiJob {
  id: number;
  title: string;
  weblink: string;
  timestamp: string;
  status: string;
  publication?: {
    internet?: {
      live?: string;
      publish_date?: string;
      closing_date?: string;
    };
  };
  classifications?: Record<
    string,
    { id: number; name: string; values: { class_val: string }[] }
  >;
}

function classVal(job: GggiJob, className: string): string[] {
  const cls = Object.values(job.classifications || {}).find(
    (c) => (c.name || "").toLowerCase() === className.toLowerCase()
  );
  return cls?.values?.map((v) => v.class_val).filter(Boolean) || [];
}

export class GggiAdapter implements CrawlAdapter {
  name = "gggi-api";

  async crawl(source: SourceConfig): Promise<RawOpportunity[]> {
    const log = createLogger(source.id);
    const cfg = source.config as GggiConfig;
    const siteId = cfg.webSiteId || 5514;
    const orgName = cfg.orgName || "Global Green Growth Institute (GGGI)";

    const url = `https://careers.gggi.org/utf8/ic_job_feeds.feed_engine?p_web_site_id=${siteId}&p_published_to=WWW&p_language=DEFAULT&p_direct=Y&p_format=MOBILE`;
    log.info("Fetching GGGI job feed JSON...");

    const res = await fetch(url, {
      headers: {
        Accept: "application/json,*/*",
        "User-Agent":
          "Mozilla/5.0 (compatible; Devidends/1.0; +https://devidends.net)",
      },
    });
    if (!res.ok) {
      throw new Error(`GGGI feed error ${res.status}`);
    }

    const body = await res.json();
    const all: GggiJob[] = body?.jobs || [];
    log.info(`Feed returned ${all.length} jobs total`);

    const countryFilter = (cfg.countryFilter || [])
      .map((c) => c.toLowerCase())
      .filter(Boolean);

    const out: RawOpportunity[] = [];
    for (const job of all) {
      if (job.status && job.status !== "open") continue;

      const locations = classVal(job, "Location");
      const cities = classVal(job, "City");
      const contractTypes = classVal(job, "Contract Type");

      // Filter by country if filter provided
      if (countryFilter.length > 0) {
        const locText = [...locations, ...cities].join(" ").toLowerCase();
        if (!countryFilter.some((c) => locText.includes(c))) continue;
      }

      const country = locations[0] || cities[0] || "Various";
      const city = cities.join(", ") || null;
      const deadline = job.publication?.internet?.closing_date || null;
      const published = job.publication?.internet?.publish_date || job.timestamp || null;

      out.push({
        title: job.title,
        organization: orgName,
        description: contractTypes.length
          ? `Contract type: ${contractTypes.join(", ")}`
          : "",
        deadline,
        published,
        country,
        city,
        source_url: job.weblink,
        source_domain: "careers.gggi.org",
        content_type: source.content_type,
        scraped_at: new Date().toISOString(),
        raw_fields: {
          contract_type: contractTypes.join(", ") || null,
          all_locations: locations,
        },
      });
    }

    log.info(`After filter: ${out.length} opportunities`);
    return out;
  }
}
