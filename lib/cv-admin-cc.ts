/**
 * Forward a CV upload (file + metadata) to the admin Telegram chat(s).
 * Called from every CV ingestion entry point so admins see what users are
 * submitting, regardless of success or failure.
 *
 * Envelope: ADMIN_TELEGRAM_IDS env (comma-separated), TELEGRAM_BOT_TOKEN.
 */

export interface ForwardCvArgs {
  buffer: Buffer;
  filename: string;
  senderName?: string | null;
  senderEmail?: string | null;
  senderTelegramId?: string | number | null;
  senderIp?: string | null;
  source:
    | "web_builder"
    | "web_score"
    | "tg_bot_dm"
    | "tg_mini_app"
    | "admin_ingest"
    | "tg_group_ingest";
  status: "success" | "rejected" | "error";
  resultSummary?: string | null;
  /** Pass the extracted CV JSON to enable automatic quality scoring + low-quality flagging. */
  extractedCv?: any;
}

/** Computes 0-100 quality score and a list of human-readable warnings from extracted CV data. */
export function assessCvQuality(cv: any): { score: number; warnings: string[] } {
  if (!cv) return { score: 0, warnings: ["No structured data extracted"] };
  const w: string[] = [];
  let score = 100;
  const p = cv.personal || {};
  if (!p.full_name) { score -= 15; w.push("missing name"); }
  if (!p.email) { score -= 10; w.push("missing email"); }
  if (!p.phone) { score -= 5; w.push("missing phone"); }
  const emp = Array.isArray(cv.employment) ? cv.employment : [];
  if (emp.length === 0) { score -= 30; w.push("no employment history"); }
  else {
    const noDesc = emp.filter((e: any) => !(e.description_of_duties || "").trim()).length;
    if (noDesc > 0) { score -= Math.min(20, noDesc * 5); w.push(`${noDesc} role(s) missing duties`); }
    const noDates = emp.filter((e: any) => !e.from_date).length;
    if (noDates > 0) { score -= Math.min(10, noDates * 3); w.push(`${noDates} role(s) missing dates`); }
  }
  const edu = Array.isArray(cv.education) ? cv.education : [];
  if (edu.length === 0) { score -= 10; w.push("no education entries"); }
  if (!cv.key_qualifications && !cv.professional_summary) { score -= 10; w.push("no summary or qualifications"); }
  if (typeof cv._confidence === "number" && cv._confidence < 0.6) { w.push(`low extractor confidence (${Math.round(cv._confidence * 100)}%)`); }
  return { score: Math.max(0, score), warnings: w };
}

export async function forwardCvToAdmin(args: ForwardCvArgs): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;
  const adminIds = (process.env.ADMIN_TELEGRAM_IDS || "297659579")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (adminIds.length === 0) return;

  const quality = args.extractedCv ? assessCvQuality(args.extractedCv) : null;
  const lowQuality = quality !== null && quality.score < 70 && args.status === "success";

  const statusIcon = lowQuality
    ? "⚠️"
    : args.status === "success"
    ? "✅"
    : args.status === "rejected"
    ? "⚠️"
    : "❌";
  const sourceLabel = {
    web_builder: "Web CV Builder",
    web_score: "Web CV Scorer",
    tg_bot_dm: "Telegram Bot DM",
    tg_mini_app: "Telegram Mini App",
    admin_ingest: "Admin Ingest",
    tg_group_ingest: "Group Ingest",
  }[args.source];

  const headerSuffix = lowQuality ? ` · LOW QUALITY (${quality!.score}/100)` : "";
  const qualityLine = lowQuality
    ? `\n🔍 Issues: ${quality!.warnings.slice(0, 5).join(", ")}`
    : null;

  const lines = [
    `${statusIcon} <b>CV ${args.status}</b> · ${sourceLabel}${headerSuffix}`,
    args.senderName ? `👤 ${args.senderName}` : null,
    args.senderEmail ? `📧 ${args.senderEmail}` : null,
    args.senderTelegramId ? `📱 TG: <code>${args.senderTelegramId}</code>` : null,
    args.senderIp ? `🌐 ${args.senderIp}` : null,
    args.resultSummary ? `\n${args.resultSummary}` : null,
    qualityLine,
  ].filter(Boolean);

  const caption = lines.join("\n").slice(0, 1024);

  // Send in background — never block the main request on admin CC
  for (const chatId of adminIds) {
    try {
      const form = new FormData();
      form.append("chat_id", chatId);
      form.append(
        "document",
        new Blob([new Uint8Array(args.buffer)]),
        args.filename
      );
      form.append("caption", caption);
      form.append("parse_mode", "HTML");
      const res = await fetch(
        `https://api.telegram.org/bot${token}/sendDocument`,
        { method: "POST", body: form }
      );
      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        console.warn(`[cv-admin-cc] forward to ${chatId} failed: ${res.status} ${errText.slice(0, 120)}`);
      }
    } catch (e) {
      console.warn("[cv-admin-cc] send error:", (e as Error).message);
    }
  }
}
