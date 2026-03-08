/**
 * Branded HTML email templates for Devidends alerts.
 * Brand: #27ABD2 (cyan), #24CFD6 (teal), #212121 (dark), Montserrat font
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

const TYPE_LABELS: Record<string, string> = {
  job: "Full-time", consultancy: "Consultancy", tender: "Tender",
  internship: "Internship", contract: "Contract", fellowship: "Fellowship",
};

function wrap(content: string, preheader = ""): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta http-equiv="X-UA-Compatible" content="IE=edge" />
<title>Devidends Alert</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;700;800&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #f0f4f8; font-family: 'Montserrat', Arial, sans-serif; }
  a { color: ${BRAND_CYAN}; text-decoration: none; }
  a:hover { text-decoration: underline; }
  .btn { display: inline-block; padding: 10px 22px; border-radius: 8px; font-weight: 700; font-size: 13px; text-decoration: none !important; }
  .btn-primary { background: linear-gradient(135deg, ${BRAND_CYAN}, ${BRAND_TEAL}); color: #fff !important; }
  .btn-outline { border: 1.5px solid ${BRAND_CYAN}; color: ${BRAND_CYAN} !important; }
  @media (max-width: 600px) {
    .container { width: 100% !important; }
    .card-grid td { display: block; width: 100% !important; }
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
                  Daily Alert
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
                <a href="${SITE_URL}/subscribe" style="color:#a0aec0">Manage preferences</a> &nbsp;·&nbsp;
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

function oppCard(opp: EmailOpp): string {
  const type = (opp.classified_type || opp.type || "opportunity").toLowerCase();
  const typeLabel = TYPE_LABELS[type] || type.charAt(0).toUpperCase() + type.slice(1);
  const deadline = opp.deadline
    ? new Date(opp.deadline).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
    : "Rolling";
  const url = opp.source_url || `${SITE_URL}/opportunities`;

  return `
<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:12px;border:1.5px solid #e2e8f0;border-radius:10px;overflow:hidden">
  <tr>
    <td style="padding:0">
      <!-- Color strip -->
      <div style="height:3px;background:linear-gradient(90deg,${BRAND_CYAN},${BRAND_TEAL})"></div>
      <div style="padding:16px">
        <!-- Type badge + title -->
        <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:8px">
          <tr>
            <td>
              <span style="display:inline-block;background:#e6f7fc;color:${BRAND_CYAN};font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;padding:2px 8px;border-radius:4px">
                ${typeLabel}
              </span>
            </td>
          </tr>
        </table>
        <a href="${url}" style="color:${BRAND_DARK};font-size:14px;font-weight:700;line-height:1.4;display:block;margin-bottom:6px;text-decoration:none">
          ${opp.title}
        </a>
        <p style="color:#4a5568;font-size:12px;margin-bottom:10px;font-weight:600">
          ${opp.organization}
        </p>
        <!-- Meta row -->
        <table cellpadding="0" cellspacing="0" style="margin-bottom:12px">
          <tr>
            ${opp.country ? `<td style="padding-right:14px;font-size:11px;color:#718096">📍 ${opp.country}</td>` : ""}
            <td style="padding-right:14px;font-size:11px;color:#718096">⏰ ${deadline}</td>
            ${opp.seniority ? `<td style="font-size:11px;color:#718096">🎯 ${opp.seniority}</td>` : ""}
          </tr>
        </table>
        <a href="${url}" class="btn btn-primary" style="font-size:12px;padding:8px 18px">Apply Now →</a>
      </div>
    </td>
  </tr>
</table>`;
}

/** Generate job alerts email HTML */
export function jobAlertsEmail(
  opportunities: EmailOpp[],
  recipientName?: string,
  sectors?: string[]
): string {
  const today = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const toShow = opportunities.slice(0, 8);

  const greeting = recipientName ? `Hi ${recipientName},` : "Hi there,";
  const sectorNote = sectors?.length
    ? `<p style="color:#718096;font-size:12px;margin-bottom:20px">Filtered for: <strong>${sectors.join(", ")}</strong></p>`
    : "";

  const content = `
    <h2 style="font-size:20px;font-weight:800;color:${BRAND_DARK};margin-bottom:4px">${greeting}</h2>
    <p style="color:#4a5568;font-size:13px;margin-bottom:6px">
      Here are <strong>${toShow.length} new opportunit${toShow.length !== 1 ? "ies" : "y"}</strong> matching your interests — ${today}
    </p>
    ${sectorNote}
    <div style="height:2px;background:linear-gradient(90deg,${BRAND_CYAN},${BRAND_TEAL},transparent);margin-bottom:20px;border-radius:2px"></div>

    ${toShow.map(oppCard).join("")}

    ${opportunities.length > 8 ? `
    <p style="text-align:center;margin:16px 0 4px;font-size:12px;color:#718096">
      +${opportunities.length - 8} more opportunities available
    </p>` : ""}

    <div style="text-align:center;margin-top:20px">
      <a href="${SITE_URL}/opportunities" class="btn btn-outline">Browse All Opportunities</a>
    </div>
  `;

  return wrap(content, `${toShow.length} new opportunities matching your profile`);
}

/** Generate news digest email HTML */
export function newsDigestEmail(
  articles: EmailNewsArticle[],
  recipientName?: string,
  categories?: string[]
): string {
  const today = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const toShow = articles.slice(0, 6);
  const greeting = recipientName ? `Hi ${recipientName},` : "Hi there,";
  const catNote = categories?.length
    ? `<p style="color:#718096;font-size:12px;margin-bottom:20px">Categories: <strong>${categories.join(", ")}</strong></p>`
    : "";

  // Group by category
  const grouped = new Map<string, EmailNewsArticle[]>();
  for (const a of toShow) {
    if (!grouped.has(a.category)) grouped.set(a.category, []);
    grouped.get(a.category)!.push(a);
  }

  let articleHtml = "";
  for (const [cat, catArticles] of grouped) {
    const catColor = CAT_COLORS[cat] || "#718096";
    articleHtml += `
      <div style="margin-bottom:16px">
        <div style="display:inline-block;background:${catColor};color:#fff;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;padding:3px 10px;border-radius:4px;margin-bottom:10px">
          ${cat}
        </div>
        ${catArticles.map((a) => `
        <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:8px;border-left:3px solid ${catColor};padding-left:12px">
          <tr><td style="padding-left:12px">
            <a href="${a.url}" style="color:${BRAND_DARK};font-size:13px;font-weight:600;line-height:1.4;display:block;margin-bottom:3px">
              ${a.title}
            </a>
            <span style="color:#a0aec0;font-size:11px">${a.source_name}</span>
          </td></tr>
        </table>`).join("")}
      </div>`;
  }

  const content = `
    <h2 style="font-size:20px;font-weight:800;color:${BRAND_DARK};margin-bottom:4px">${greeting}</h2>
    <p style="color:#4a5568;font-size:13px;margin-bottom:6px">
      Your development news digest for <strong>${today}</strong>
    </p>
    ${catNote}
    <div style="height:2px;background:linear-gradient(90deg,${BRAND_CYAN},${BRAND_TEAL},transparent);margin-bottom:20px;border-radius:2px"></div>

    ${articleHtml}

    ${articles.length > 6 ? `
    <p style="text-align:center;margin:8px 0 4px;font-size:12px;color:#718096">
      +${articles.length - 6} more articles on the feed
    </p>` : ""}

    <div style="text-align:center;margin-top:20px">
      <a href="${SITE_URL}/news" class="btn btn-primary">Read Full Feed</a>
    </div>
  `;

  return wrap(content, `Development news digest — ${today}`);
}
