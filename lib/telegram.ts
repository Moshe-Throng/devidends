import TelegramBot from "node-telegram-bot-api";

let botInstance: TelegramBot | null = null;

/**
 * Get or create the Telegram bot instance.
 * Uses webhook mode (polling: false) — critical for Vercel serverless.
 * The same instance is reused across invocations within the same
 * serverless container lifetime.
 */
export function getTelegramBot(): TelegramBot {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    throw new Error("TELEGRAM_BOT_TOKEN not configured");
  }
  if (!botInstance) {
    botInstance = new TelegramBot(token, { polling: false });
  }
  return botInstance;
}

/**
 * Get the Telegram channel ID for broadcasting.
 */
export function getChannelId(): string {
  const id = process.env.TELEGRAM_CHANNEL_ID;
  if (!id) {
    throw new Error("TELEGRAM_CHANNEL_ID not configured");
  }
  return id;
}
