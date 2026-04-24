/**
 * Send the two email drafts (Thomas at Landell Mills + Deven at AESA) to
 * Mussie's Telegram (297659579) so he can copy + send from his own email
 * client. Plain text inside a <pre> block so formatting is preserved.
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

const CHAT = "297659579";
const BOT = process.env.TELEGRAM_BOT_TOKEN!;

const THOMAS = {
  label: "📧 TO THOMAS (Landell Mills)",
  to: "Thomas Patiallot",
  subject: "Re: IRMAW — rate / Market Linkage role",
  body: `Hi Thomas,

Thanks for the honest framing. Happy to make this work.

Two options, whichever fits your budget math:

1. Same rate, fewer input days. My WB Horn of Africa Initiative corridor assignment overlaps directly with the IRMAW geography, so baseline and mapping days can be compressed. Happy to propose a revised day-count against the ToR.

2. Adjust the daily rate for this bid specifically, tied to the AFD budget context.

20 minutes tomorrow to walk through the numbers? What time works?

Separately, if LM is still filling other IRMAW slots (M&E, Gender, Training, PSD), I work with a curated pool of Ethiopian consultants through Envest (devidends.net) and can shortlist within 24 hours.

Best,
Mussie`,
};

const DEVEN = {
  label: "📧 TO DEVEN (AESA)",
  to: "Deven Padiachy",
  subject: "Re: Women-in-Trade TA in Ethiopia — PSD Expert",
  body: `Dear Deven,

Thanks for your patience. My customized CV is attached.

I also want to flag a strong alternative for the PSD slot in case you're weighing options: Daniel Dendir Abshir, Manager of Research and Project Management at the Addis Ababa Chamber of Commerce and Sectoral Associations (AACCSA) and Manager of the BIC Project. 20 years of experience, prior GIZ/Sequa work on private-public sectoral dialogue. MA in Economics, Addis Ababa University. He's confirmed availability and will send his CV within 48 hours (danieldendir@gmail.com, +251 911 795680).

Happy to jump on a short call to walk through either.

Separately: Helen and I collaborate through Devidends (devidends.net), a curated pool of around 1,000 Ethiopian consultants we've built over the past two years. If AESA is filling other IRMAW slots, we can shortlist within 24 hours.

Best,
Mussie`,
};

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function sendDraft(d: { label: string; to: string; subject: string; body: string }) {
  const msg = [
    `<b>${d.label}</b>`,
    ``,
    `<b>To:</b> ${d.to}`,
    `<b>Subject:</b> ${d.subject}`,
    ``,
    `<pre>${escapeHtml(d.body)}</pre>`,
  ].join("\n");
  const res = await fetch(`https://api.telegram.org/bot${BOT}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: CHAT,
      text: msg,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    }),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(`TG: ${data.description}`);
}

async function main() {
  await sendDraft(THOMAS);
  await new Promise((r) => setTimeout(r, 800));
  await sendDraft(DEVEN);
  console.log("Both drafts sent to chat 297659579.");
}

main().catch((e) => { console.error(e); process.exit(1); });
