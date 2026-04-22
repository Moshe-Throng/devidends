/**
 * DM Saron + Daruselam cards to Mussie (chat_id 297659579).
 * Admin-only: sends go to Mussie himself, not to the targets.
 */

import * as fs from "fs";
import * as path from "path";

const envPath = path.join(__dirname, "..", ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const idx = t.indexOf("=");
    if (idx < 0) continue;
    const key = t.slice(0, idx).trim();
    const val = t.slice(idx + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = val;
  }
}

const MUSSIE_CHAT = "297659579";
const TOKEN = process.env.TELEGRAM_BOT_TOKEN!;

type Card = { name: string; firstName: string; claimToken: string };

const cards: Card[] = [
  { name: "Saron Berhane", firstName: "Saron", claimToken: "aab733b8" },
  { name: "Daruselam Mohammed", firstName: "Daruselam", claimToken: "0bd767de" },
];

function buildCardText(c: Card): string {
  const link = `https://t.me/Devidends_Bot?start=claim_${c.claimToken}`;
  return [
    `<b>${c.name}</b> — recommender, not yet claimed`,
    ``,
    `<b>Claim link:</b> ${link}`,
    ``,
    `<b>Paste-ready:</b>`,
    `──────────────`,
    `Hi ${c.firstName} — I added your profile to Devidends, a curated Ethiopian development consulting network I'm building with Envest. Tap to claim it (2 minutes):`,
    ``,
    link,
    ``,
    `You'll get daily opportunity briefs and, as a recommender, your own share link to bring peers in.`,
    `──────────────`,
  ].join("\n");
}

async function send(text: string): Promise<void> {
  const res = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: MUSSIE_CHAT,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    }),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(`Telegram: ${data.description}`);
}

async function main() {
  if (!TOKEN) {
    console.error("TELEGRAM_BOT_TOKEN not set");
    process.exit(1);
  }
  for (const c of cards) {
    await send(buildCardText(c));
    console.log(`✓ Sent ${c.name} card`);
    await new Promise((r) => setTimeout(r, 500));
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
