/**
 * One-time script to register the Telegram webhook and set bot commands.
 *
 * Run with:
 *   npx tsx scripts/setup-telegram.ts
 *
 * Prerequisites:
 *   - TELEGRAM_BOT_TOKEN set in .env.local
 *   - NEXT_PUBLIC_SITE_URL set in .env.local (e.g. https://devidends.net)
 */

import fs from "fs";
import path from "path";

// Load .env.local manually (no dotenv dependency needed)
function loadEnvFile(filePath: string) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();
    // Strip surrounding quotes
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

loadEnvFile(path.resolve(__dirname, "..", ".env.local"));
loadEnvFile(path.resolve(__dirname, "..", ".env"));

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL;

if (!BOT_TOKEN) {
  console.error("ERROR: TELEGRAM_BOT_TOKEN is not set in .env.local");
  process.exit(1);
}

if (!SITE_URL) {
  console.error("ERROR: NEXT_PUBLIC_SITE_URL is not set in .env.local");
  process.exit(1);
}

const API_BASE = `https://api.telegram.org/bot${BOT_TOKEN}`;
const WEBHOOK_URL = `${SITE_URL}/api/telegram/webhook`;

async function telegramApi(method: string, body?: Record<string, unknown>) {
  const res = await fetch(`${API_BASE}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!data.ok) {
    throw new Error(`Telegram API error (${method}): ${JSON.stringify(data)}`);
  }
  return data;
}

async function main() {
  console.log("=== Devidends Telegram Bot Setup ===\n");

  // Step 1: Get bot info
  console.log("1. Fetching bot info...");
  const meResult = await telegramApi("getMe");
  const botUsername = meResult.result.username;
  console.log(`   Bot: @${botUsername} (${meResult.result.first_name})`);
  console.log(`   Expected: @Devidends_Bot`);
  if (botUsername !== "Devidends_Bot") {
    console.log(`   WARNING: Bot username does not match expected @Devidends_Bot`);
  }
  console.log();

  // Step 2: Set webhook
  console.log("2. Setting webhook...");
  console.log(`   URL: ${WEBHOOK_URL}`);
  await telegramApi("setWebhook", {
    url: WEBHOOK_URL,
    allowed_updates: ["message", "callback_query"],
    drop_pending_updates: true,
  });
  console.log("   Webhook set successfully.");
  console.log();

  // Step 3: Set bot commands menu
  console.log("3. Setting bot commands menu...");
  await telegramApi("setMyCommands", {
    commands: [
      { command: "start", description: "Welcome + main menu" },
      { command: "subscribe", description: "Select sector alerts" },
      { command: "search", description: "Search opportunities by keyword" },
      { command: "score", description: "Upload CV for AI scoring" },
      { command: "profile", description: "View your profile" },
      { command: "help", description: "List all commands" },
    ],
  });
  console.log("   Commands menu set successfully.");
  console.log();

  // Step 4: Set Mini App menu button
  console.log("4. Setting Mini App menu button...");
  const MINI_APP_URL = `${SITE_URL}/tg-app`;
  await telegramApi("setChatMenuButton", {
    menu_button: {
      type: "web_app",
      text: "Open App",
      web_app: { url: MINI_APP_URL },
    },
  });
  console.log(`   Menu button set to: ${MINI_APP_URL}`);
  console.log();

  // Step 5: Verify webhook
  console.log("5. Verifying webhook info...");
  const webhookInfo = await telegramApi("getWebhookInfo");
  const info = webhookInfo.result;
  console.log(`   URL:                ${info.url}`);
  console.log(`   Has custom cert:    ${info.has_custom_certificate}`);
  console.log(`   Pending updates:    ${info.pending_update_count}`);
  console.log(`   Max connections:    ${info.max_connections || "default"}`);
  console.log(`   Allowed updates:    ${(info.allowed_updates || []).join(", ") || "all"}`);
  if (info.last_error_date) {
    const errorDate = new Date(info.last_error_date * 1000).toISOString();
    console.log(`   Last error:         ${errorDate} — ${info.last_error_message}`);
  } else {
    console.log(`   Last error:         None`);
  }
  console.log();

  // Done
  console.log("=== Setup Complete ===");
  console.log();
  console.log(`Bot:     @${botUsername}`);
  console.log(`Webhook: ${WEBHOOK_URL}`);
  console.log();
  console.log("Test by sending /start to your bot on Telegram.");
}

main().catch((err) => {
  console.error("Setup failed:", err);
  process.exit(1);
});
