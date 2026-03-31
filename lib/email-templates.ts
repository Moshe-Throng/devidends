/**
 * Branded HTML email templates for Devidends alerts.
 * Brand: #27ABD2 (cyan), #24CFD6 (teal), #212121 (dark), Montserrat font
 *
 * v2: Single combined daily digest (no more separate job + news emails)
 */

export interface EmailOpp {
  title: string;
  organization: string;
  country?: string;
  deadline?: string | null;
  seniority?: string;
  classified_type?: string;
  type?: string;
  source_url?: string;
}

export interface EmailNewsArticle {
  title: string;
  url: string;
  source_name: string;
  category: string;
}

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://devidends.vercel.app";
const BRAND_CYAN = "#27ABD2";
const BRAND_TEAL = "#24CFD6";
const BRAND_DARK = "#212121";

const CAT_COLORS: Record<string, string> = {
  "Humanitarian": "#E53E3E",
  "Policy & Governance": "#3182CE",
  "Funding & Donors": "#D69E2E",
  "Health": "#38A169",
  "Economy & Trade": "#805AD5",
  "Climate & Environment": "#319795",
  "Education": "#DD6B20",
  "General": "#718096",
};

const TYPE_COLORS: Record<string, { bg: string; fg: string }> = {
  job:         { bg: "#e6f7fc", fg: BRAND_CYAN },
  consultancy: { bg: "#e6fcf5", fg: "#0d9488" },
  tender:      { bg: "#f3e8ff", fg: "#7c3aed" },
  internship:  { bg: "#fef9c3", fg: "#a16207" },
  contract:    { bg: "#e0f2fe", fg: "#0369a1" },
  fellowship:  { bg: "#fce7f3", fg: "#be185d" },
};

const TYPE_LABELS: Record<string, string> = {
  job: "Job", consultancy: "Consultancy", tender: "Tender",
  internship: "Internship", contract: "Contract", fellowship: "Fellowship",
};

function wrap(content: string, preheader = ""): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta http-equiv="X-UA-Compatible" content="IE=edge" />
<title>Devidends Daily Brief</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;700;800&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #f0f4f8; font-family: 'Montserrat', Arial, sans-serif; }
  a { color: ${BRAND_CYAN}; text-decoration: none; }
  a:hover { text-decoration: underline; }
  .btn { display: inline-block; padding: 10px 22px; border-radius: 8px; font-weight: 700; font-size: 13px; text-decoration: none !important; }
  .btn-primary { background: linear-gradient(135deg, ${BRAND_CYAN}, ${BRAND_TEAL}); color: #fff !important; }
  .btn-outline { border: 1.5px solid ${BRAND_CYAN}; color: ${BRAND_CYAN} !important; background: transparent; }
  @media (max-width: 600px) {
    .container { width: 100% !important; }
  }
</style>
</head>
<body>
${preheader ? `<div style="display:none;max-height:0;overflow:hidden;color:#f0f4f8">${preheader}</div>` : ""}
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f4f8;padding:24px 8px">
  <tr><td align="center">
    <table class="container" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%">

      <!-- Header -->
      <tr>
        <td style="background:${BRAND_DARK};border-radius:12px 12px 0 0;padding:20px 28px">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td>
                <span style="font-size:22px;font-weight:800;letter-spacing:-0.5px">
                  <span style="color:${BRAND_CYAN}">Dev</span><span style="color:#fff">idends</span>
                </span>
              </td>
              <td align="right">
                <span style="color:rgba(255,255,255,0.5);font-size:11px;font-weight:600;letter-spacing:1px;text-transform:uppercase">
                  Daily Brief
                </span>
              </td>
            </tr>
          </table>
        </td>
      </tr>

      <!-- Body -->
      <tr>
        <td style="background:#fff;padding:28px 28px 20px;border-left:1px solid #e2e8f0;border-right:1px solid #e2e8f0">
          ${content}
        </td>
      </tr>

      <!-- Footer -->
      <tr>
        <td style="background:#f7fafc;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px;padding:16px 28px">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="font-size:11px;color:#a0aec0;line-height:1.6">
                You're receiving this because you subscribed to Devidends alerts.<br/>
                <a href="${SITE_URL}/subscribe" style="color:#a0aec0">Manage preferences</a> &nbsp;&middot;&nbsp;
                <a href="${SITE_URL}" style="color:#a0aec0">Visit Devidends</a>
              </td>
            </tr>
          </table>
        </td>
      </tr>

    </table>
  </td></tr>
</table>
</body>
</html>`;
}

/** Compact opportunity row — cleaner than full cards, less cluttered */
function oppRow(opp: EmailOpp): string {
  const type = (opp.classified_type || opp.type || "opportunity").toLowerCase();
  const typeLabel = TYPE_LABELS[type] || type.charAt(0).toUpperCase() + type.slice(1);
  const colors = TYPE_COLORS[type] || TYPE_COLORS.job;
  const deadline = opp.deadline
    ? new Date(opp.deadline).toLocaleDateString("en-GB", { day: "numeric", month: "short" })
    : "Rolling";
  const url = opp.source_url || `${SITE_URL}/opportunities`;

  return `
<tr>
  <td style="padding:12px 0;border-bottom:1px solid #f0f4f8">
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td style="vertical-align:top;width:100%">
          <span style="display:inline-block;background:${colors.bg};color:${colors.fg};font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;padding:2px 6px;border-radius:3px;margin-bottom:4px">
            ${typeLabel}
          </span>
          ${opp.seniority ? `<span style="display:inline-block;background:#f7fafc;color:#718096;font-size:9px;font-weight:600;padding:2px 6px;border-radius:3px;margin-left:4px">${opp.seniority}</span>` : ""}
          <a href="${url}" style="display:block;color:${BRAND_DARK};font-size:14px;font-weight:700;line-height:1.35;margin-top:4px;text-decoration:none">
            ${opp.title}
          </a>
          <p style="color:#718096;font-size:11px;margin-top:3px;line-height:1.4">
            ${opp.organization}${opp.country ? ` &middot; ${opp.country}` : ""} &middot; ${deadline}
          </p>
        </td>
        <td style="vertical-align:middle;padding-left:12px;white-space:nowrap">
          <a href="${url}" style="display:inline-block;padding:6px 14px;border-radius:6px;background:${BRAND_CYAN};color:#fff;font-size:11px;font-weight:700;text-decoration:none">Apply</a>
        </td>
      </tr>
    </table>
  </td>
</tr>`;
}

/**
 * Combined daily digest email — ONE email with both opportunities + news.
 * Replaces the old separate jobAlertsEmail + newsDigestEmail.
 */
export function dailyDigestEmail(
  opportunities: EmailOpp[],
  articles: EmailNewsArticle[],
  recipientName?: string,
  sectors?: string[],
  newsCategories?: string[]
): string {
  const today = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const greeting = recipientName ? `Hi ${recipientName},` : "Good morning,";

  const oppCount = opportunities.length;
  const newsCount = articles.length;
  const summaryParts: string[] = [];
  if (oppCount > 0) summaryParts.push(`<strong>${oppCount}</strong> new opportunit${oppCount !== 1 ? "ies" : "y"}`);
  if (newsCount > 0) summaryParts.push(`<strong>${newsCount}</strong> article${newsCount !== 1 ? "s" : ""}`);

  const filterNote = sectors?.length
    ? `<p style="color:#a0aec0;font-size:11px;margin-top:6px">Filtered: ${sectors.join(", ")}</p>`
    : "";

  // --- Opportunities section ---
  const toShowOpps = opportunities.slice(0, 8);
  let oppsHtml = "";
  if (toShowOpps.length > 0) {
    oppsHtml = `
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:4px">
        <tr>
          <td style="padding:16px 0 8px">
            <p style="font-size:11px;font-weight:800;color:${BRAND_CYAN};text-transform:uppercase;letter-spacing:1.5px;margin:0">
              Opportunities
            </p>
          </td>
        </tr>
      </table>
      <table width="100%" cellpadding="0" cellspacing="0">
        ${toShowOpps.map(oppRow).join("")}
      </table>
      ${oppCount > 8 ? `<p style="text-align:center;margin:10px 0 0;font-size:11px;color:#a0aec0">+${oppCount - 8} more &rarr; <a href="${SITE_URL}/opportunities" style="color:${BRAND_CYAN};font-weight:600">Browse all</a></p>` : ""}
    `;
  }

  // --- News section ---
  const toShowNews = articles.slice(0, 5);
  let newsHtml = "";
  if (toShowNews.length > 0) {
    // Group by category
    const grouped = new Map<string, EmailNewsArticle[]>();
    for (const a of toShowNews) {
      if (!grouped.has(a.category)) grouped.set(a.category, []);
      grouped.get(a.category)!.push(a);
    }

    let groupedHtml = "";
    for (const [cat, catArticles] of grouped) {
      const catColor = CAT_COLORS[cat] || "#718096";
      groupedHtml += catArticles.map((a) => `
        <tr>
          <td style="padding:8px 0;border-bottom:1px solid #f7fafc">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="width:3px;background:${catColor};border-radius:2px"></td>
                <td style="padding-left:10px">
                  <a href="${a.url}" style="color:${BRAND_DARK};font-size:13px;font-weight:600;line-height:1.35;text-decoration:none;display:block">
                    ${a.title}
                  </a>
                  <p style="color:#a0aec0;font-size:10px;margin-top:2px">
                    ${a.source_name} &middot; <span style="color:${catColor}">${cat}</span>
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>`).join("");
    }

    newsHtml = `
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:16px">
        <tr>
          <td style="padding:16px 0 8px;border-top:2px solid #f0f4f8">
            <p style="font-size:11px;font-weight:800;color:${BRAND_CYAN};text-transform:uppercase;letter-spacing:1.5px;margin:0">
              Development News
            </p>
          </td>
        </tr>
      </table>
      <table width="100%" cellpadding="0" cellspacing="0">
        ${groupedHtml}
      </table>
      ${newsCount > 5 ? `<p style="text-align:center;margin:10px 0 0;font-size:11px;color:#a0aec0">+${newsCount - 5} more &rarr; <a href="${SITE_URL}/news" style="color:${BRAND_CYAN};font-weight:600">Full feed</a></p>` : ""}
    `;
  }

  const content = `
    <h2 style="font-size:18px;font-weight:800;color:${BRAND_DARK};margin-bottom:2px">${greeting}</h2>
    <p style="color:#4a5568;font-size:13px;margin-bottom:0;line-height:1.5">
      Your daily brief for ${today} — ${summaryParts.join(" and ")}.
    </p>
    ${filterNote}
    <div style="height:2px;background:linear-gradient(90deg,${BRAND_CYAN},${BRAND_TEAL},transparent);margin:14px 0 4px;border-radius:2px"></div>

    ${oppsHtml}
    ${newsHtml}

    <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:20px">
      <tr>
        <td align="center" style="padding:0">
          <a href="${SITE_URL}/opportunities" class="btn btn-primary" style="margin-right:8px">Browse Opportunities</a>
          <a href="${SITE_URL}/score" class="btn btn-outline">Score My CV</a>
        </td>
      </tr>
    </table>
  `;

  return wrap(content, `${summaryParts.join(" + ")} — Devidends Daily Brief`);
}

// --- Legacy exports (kept for backwards compatibility) ---

/** @deprecated Use dailyDigestEmail instead */
export function jobAlertsEmail(
  opportunities: EmailOpp[],
  recipientName?: string,
  sectors?: string[]
): string {
  return dailyDigestEmail(opportunities, [], recipientName, sectors);
}

/** @deprecated Use dailyDigestEmail instead */
export function newsDigestEmail(
  articles: EmailNewsArticle[],
  recipientName?: string,
  categories?: string[]
): string {
  return dailyDigestEmail([], articles, recipientName, undefined, categories);
}
