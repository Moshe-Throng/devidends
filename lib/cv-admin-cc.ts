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
}

export async function forwardCvToAdmin(args: ForwardCvArgs): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;
  const adminIds = (process.env.ADMIN_TELEGRAM_IDS || "297659579")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (adminIds.length === 0) return;

  const statusIcon =
    args.status === "success" ? "✅" : args.status === "rejected" ? "⚠️" : "❌";
  const sourceLabel = {
    web_builder: "Web CV Builder",
    web_score: "Web CV Scorer",
    tg_bot_dm: "Telegram Bot DM",
    tg_mini_app: "Telegram Mini App",
    admin_ingest: "Admin Ingest",
    tg_group_ingest: "Group Ingest",
  }[args.source];

  const lines = [
    `${statusIcon} <b>CV ${args.status}</b> · ${sourceLabel}`,
    args.senderName ? `👤 ${args.senderName}` : null,
    args.senderEmail ? `📧 ${args.senderEmail}` : null,
    args.senderTelegramId ? `📱 TG: <code>${args.senderTelegramId}</code>` : null,
    args.senderIp ? `🌐 ${args.senderIp}` : null,
    args.resultSummary ? `\n${args.resultSummary}` : null,
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
