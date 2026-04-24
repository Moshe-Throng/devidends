/**
 * Devex alert email parser. Handles three flavors that arrive from
 * alerts@devex.com:
 *   1. "Today's Development Jobs" — saved search results for jobs
 *   2. "Devidends Alert" (or any saved-search) — same structure, custom filter
 *   3. "Business Alert" — tenders + grants + programs
 *
 * All three wrap each opportunity in a repeating HTML block with:
 *   - a title link to https://www.devex.com/(jobs|funding)/<id>
 *   - organization line
 *   - country line
 *   - sometimes a posted/deadline date
 *
 * Parser is intentionally tolerant — Devex rolls out small template
 * tweaks. We extract the fields we can and fall back to null otherwise.
 */

export type DevexEntry = {
  title: string;
  url: string;
  organization: string | null;
  country: string | null;
  posted_date: string | null;      // ISO YYYY-MM-DD
  deadline: string | null;
  raw_snippet: string;             // for debugging
};

export type ParsedEmail = {
  alert_type: "devidends_alert" | "jobs" | "business_alert" | "other";
  batch_date: string | null;
  entries: DevexEntry[];
};

function detectAlertType(subject: string, html: string): ParsedEmail["alert_type"] {
  const s = (subject || "").toLowerCase();
  const h = (html || "").toLowerCase().slice(0, 4000);
  if (s.includes("devidends alert") || h.includes("devidends alert")) return "devidends_alert";
  if (s.includes("business alert") || h.includes("business alert")) return "business_alert";
  if (s.includes("saved search: jobs") || h.includes("today&#39;s development jobs") || h.includes("today's development jobs")) return "jobs";
  return "other";
}

function extractBatchDate(html: string): string | null {
  // Look for "April 24, 2026" type phrases in the email body
  const m = html.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s+(\d{4})\b/i);
  if (!m) return null;
  const months: Record<string, string> = {
    january: "01", february: "02", march: "03", april: "04", may: "05", june: "06",
    july: "07", august: "08", september: "09", october: "10", november: "11", december: "12",
  };
  const mm = months[m[1].toLowerCase()];
  const dd = m[2].padStart(2, "0");
  return `${m[3]}-${mm}-${dd}`;
}

function stripTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function decodeEntity(s: string): string {
  return s
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;/gi, "'")
    .replace(/&#039;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&nbsp;/gi, " ");
}

/**
 * Extract each <a href="https://www.devex.com/(jobs|funding)/..."> anchor
 * and walk backwards/forwards in the surrounding markup to find org/country.
 * Works on the current Devex templates as of April 2026.
 */
function extractEntries(html: string): DevexEntry[] {
  // Strip scripts/styles before scanning
  const cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "");

  // Devex link pattern. /jobs/<slug>, /funding/<slug>, /funding-opportunities/<slug>,
  // /tenders/<slug>. Allow any http URL but filter by host.
  const entries: DevexEntry[] = [];
  const seenUrls = new Set<string>();

  // Capture anchor tag + its text content + following ~1500 chars for context
  const anchorRe = /<a\b[^>]*href=["'](https?:\/\/[^"']*devex\.com\/(?:jobs|funding|funding-opportunities|tenders|programs)\/[^"'#\s]+)["'][^>]*>([\s\S]{0,400}?)<\/a>([\s\S]{0,1500})/gi;
  let m: RegExpExecArray | null;
  while ((m = anchorRe.exec(cleaned)) !== null) {
    const url = m[1].split("?")[0].replace(/\/+$/, "");
    if (seenUrls.has(url)) continue;
    seenUrls.add(url);
    const anchorInner = decodeEntity(stripTags(m[2]));
    const ctx = m[3];

    if (!anchorInner || anchorInner.length < 5) continue;
    // Skip nav links (unsubscribe, edit alert, etc)
    if (/edit this alert|unsubscribe|devex logo|view on devex/i.test(anchorInner)) continue;

    // Organization + country usually appear on the next 1-3 lines after the title link
    const ctxText = stripTags(ctx).slice(0, 600);

    // Heuristic extraction for organization: typically right after title, ends at | or end-of-line
    let organization: string | null = null;
    let country: string | null = null;
    let postedDate: string | null = null;
    let deadline: string | null = null;

    // Try to find org: after title, before "|" or "Location"
    const orgMatch = ctxText.match(/^\s*([^|•]+?)\s*(?:\||Location:|Country:|Posted)/i);
    if (orgMatch) organization = orgMatch[1].trim().slice(0, 160) || null;

    // Country: "Location: Ethiopia" or just a known country name in context
    const locMatch = ctxText.match(/Location:\s*([^|•\n]+?)(?:\||$|Posted|Deadline)/i);
    if (locMatch) country = locMatch[1].trim().slice(0, 80);
    else {
      const countries = [
        "Ethiopia", "Djibouti", "Kenya", "Somalia", "Uganda", "Tanzania", "Rwanda",
        "South Sudan", "Sudan", "Eritrea", "Horn of Africa", "East Africa",
      ];
      for (const c of countries) if (ctxText.includes(c)) { country = c; break; }
    }

    // Posted date
    const pMatch = ctxText.match(/Posted:?\s*([A-Za-z]+ \d{1,2},? \d{4})/i);
    if (pMatch) postedDate = normalizeDate(pMatch[1]);

    // Deadline / closing
    const dMatch = ctxText.match(/(?:Deadline|Closing|Closes):?\s*([A-Za-z]+ \d{1,2},? \d{4})/i);
    if (dMatch) deadline = normalizeDate(dMatch[1]);

    entries.push({
      title: anchorInner.slice(0, 300),
      url,
      organization,
      country,
      posted_date: postedDate,
      deadline,
      raw_snippet: (m[2] + m[3]).slice(0, 2000),
    });
  }

  return entries;
}

function normalizeDate(s: string): string | null {
  const m = s.match(/^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})$/);
  if (!m) return null;
  const months: Record<string, string> = {
    january: "01", february: "02", march: "03", april: "04", may: "05", june: "06",
    july: "07", august: "08", september: "09", october: "10", november: "11", december: "12",
  };
  const mm = months[m[1].toLowerCase()];
  if (!mm) return null;
  return `${m[3]}-${mm}-${m[2].padStart(2, "0")}`;
}

export function parseDevexEmail(subject: string, html: string): ParsedEmail {
  const alert_type = detectAlertType(subject, html);
  const batch_date = extractBatchDate(html);
  const entries = extractEntries(html || "");
  return { alert_type, batch_date, entries };
}
