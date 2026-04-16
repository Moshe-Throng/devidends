/**
 * ReliefWeb Adapter — REST API (POST)
 * Source: api.reliefweb.int/v1/jobs
 * Appname: DevidendslWobR5bzg4nrbI2JUvPj
 */

import type { CrawlAdapter, SourceConfig, RawOpportunity } from "../types";
import { stripHtml } from "../utils/http";
import { createLogger } from "../utils/logger";

export class ReliefWebAdapter implements CrawlAdapter {
  name = "reliefweb";

  async crawl(source: SourceConfig): Promise<RawOpportunity[]> {
    const log = createLogger(source.id);
    const cfg = source.config as {
      url?: string;
      appname?: string;
      limit?: number;
      countryFilter?: string[];
    };

    const apiUrl = cfg.url || "https://api.reliefweb.int/v2/jobs";
    const appname = cfg.appname || "DevidendslWobR5bzg4nrbI2JUvPj";
    const limit = cfg.limit || 50;
    const countries = cfg.countryFilter || ["Ethiopia"];

    log.info(`Fetching jobs via API (limit=${limit})...`);

    const body = {
      filter: { field: "country.name", value: countries },
      fields: {
        include: [
          "title", "body", "body-html", "how_to_apply",
          "date.closing", "date.created",
          "source.name", "country.name", "city.name",
          "url", "status", "type.name",
          "career_categories.name", "theme.name",
          "experience.name", "language.name",
        ],
      },
      sort: ["date.created:desc"],
      limit,
    };

    const res = await fetch(
      `${apiUrl}?appname=${encodeURIComponent(appname)}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "*/*",
          "User-Agent": "curl/8.0.0",
        },
        body: JSON.stringify(body),
      }
    );

    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(`ReliefWeb API error ${res.status}: ${errBody.slice(0, 200)}`);
    }

    const data = await res.json();
    const items = data.data || [];
    log.info(`API returned ${items.length} results (${data.totalCount || 0} total)`);

    return items.map((item: any): RawOpportunity => {
      const f = item.fields || {};

      // Build full description
      const rawBody = f["body-html"] || f.body || "";
      const description = stripHtml(rawBody);
      const howToApply = stripHtml(f.how_to_apply || "");
      const fullDescription = [
        description,
        howToApply ? `\n\nHow to Apply: ${howToApply}` : "",
      ].join("").trim();

      const careerCategories = Array.isArray(f.career_categories)
        ? f.career_categories.map((c: any) => c.name)
        : [];
      const themes = Array.isArray(f.theme) ? f.theme.map((t: any) => t.name) : [];
      const experience = Array.isArray(f.experience)
        ? f.experience.map((e: any) => e.name)
        : [];
      const languages = Array.isArray(f.language)
        ? f.language.map((l: any) => l.name)
        : [];
      const cities = Array.isArray(f.city) ? f.city.map((c: any) => c.name) : [];
      const jobType = Array.isArray(f.type) ? f.type.map((t: any) => t.name).join(", ") : "";

      return {
        title: f.title || "",
        organization: Array.isArray(f.source) ? f.source.map((s: any) => s.name).join(", ") : "",
        description: fullDescription,
        deadline: f.date?.closing || null,
        published: f.date?.created || null,
        country: Array.isArray(f.country) ? f.country.map((c: any) => c.name).join(", ") : "Ethiopia",
        city: cities.join(", ") || null,
        source_url: f.url || `https://reliefweb.int/job/${item.id}`,
        source_domain: "reliefweb.int",
        content_type: source.content_type,
        scraped_at: new Date().toISOString(),
        raw_fields: {
          career_categories: careerCategories,
          themes,
          experience: experience.join(", "),
          languages,
          work_type: jobType,
        },
      };
    });
  }
}
