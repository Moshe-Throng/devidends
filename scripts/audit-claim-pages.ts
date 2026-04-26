/**
 * Puppeteer audit of the universal claim landing /claim/<token>.
 * Renders both the recommender and expert variants in production, captures
 * screenshots, validates that the page contains the right copy + the right
 * CTAs (Telegram deep link + email form), and screenshots edge cases:
 *   - invalid token
 *   - already-claimed (still renders, both options offered)
 *   - claim/<token>/finalize without a session (must show retry, not crash)
 */
import * as fs from "fs";
import * as path from "path";
import { getBrowser, createStealthPage, closeBrowser } from "./crawl-engine/utils/browser";

const SITE = "https://www.devidends.net";
const REC_TOKEN = "a136c0a8"; // Yixin Yu (recommender)
const EXP_TOKEN = "bf683ff8"; // Zenebe Burka Waktoli (expert)
const OUT_DIR = path.join(__dirname, "..", ".tmp", "audit-claim");

async function snap(page: any, label: string) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  await page.screenshot({ path: path.join(OUT_DIR, `${label}.png`), fullPage: true });
}

async function bodyText(page: any): Promise<string> {
  return page.evaluate(`document.body.innerText`);
}

async function expect(label: string, ok: boolean, detail?: string) {
  const tag = ok ? "✓" : "✗";
  console.log(`  ${tag} ${label}${detail ? ` — ${detail}` : ""}`);
  return ok;
}

(async () => {
  const browser = await getBrowser();
  const page = await createStealthPage(browser);
  let pass = 0, fail = 0;

  // ── Test 1: recommender variant ─────────────────────────────────────────
  console.log(`\n══ Test 1 — Recommender variant (Yixin Yu) ══`);
  const recUrl = `${SITE}/claim/${REC_TOKEN}`;
  const recRes = await page.goto(recUrl, { waitUntil: "networkidle2", timeout: 30000 });
  if (await expect("page status 200", recRes.status() === 200, `got ${recRes.status()}`)) pass++; else fail++;
  await new Promise(r => setTimeout(r, 1000));
  let txt = await bodyText(page);
  if (await expect("Co-Creator framing present", /Co-Creator/i.test(txt))) pass++; else fail++;
  if (await expect("Welcome <name> visible", /Welcome,/i.test(txt))) pass++; else fail++;
  if (await expect("Telegram CTA present", /Open in Telegram/i.test(txt))) pass++; else fail++;
  if (await expect("Email form present", /Email me a magic link/i.test(txt))) pass++; else fail++;
  if (await expect("Recommender body copy (network/intros)", /referrals|intros|network you/i.test(txt))) pass++; else fail++;
  // Validate Telegram link
  const tgHref = await page.evaluate(`(function(){const a=document.querySelector("a[href*='t.me/Devidends_Bot']");return a?a.getAttribute('href'):null})()`);
  if (await expect("TG href contains correct token", typeof tgHref === "string" && tgHref.includes(REC_TOKEN), tgHref || "missing")) pass++; else fail++;
  await snap(page, "1-recommender");

  // ── Test 2: expert variant ──────────────────────────────────────────────
  console.log(`\n══ Test 2 — Expert variant (Zenebe Burka Waktoli) ══`);
  const expUrl = `${SITE}/claim/${EXP_TOKEN}`;
  const expRes = await page.goto(expUrl, { waitUntil: "networkidle2", timeout: 30000 });
  if (await expect("page status 200", expRes.status() === 200, `got ${expRes.status()}`)) pass++; else fail++;
  await new Promise(r => setTimeout(r, 1000));
  txt = await bodyText(page);
  if (await expect("Expert framing (intel + scoring)", /Daily intel|CV scoring/i.test(txt))) pass++; else fail++;
  if (await expect("NOT Co-Creator framing", !/Co-Creator/i.test(txt))) pass++; else fail++;
  if (await expect("Telegram CTA present", /Open in Telegram/i.test(txt))) pass++; else fail++;
  if (await expect("Email form present", /Email me a magic link/i.test(txt))) pass++; else fail++;
  await snap(page, "2-expert");

  // ── Test 3: invalid token ───────────────────────────────────────────────
  console.log(`\n══ Test 3 — Invalid token ══`);
  const badRes = await page.goto(`${SITE}/claim/THISTOKENDOESNOTEXIST`, { waitUntil: "networkidle2", timeout: 30000 });
  await new Promise(r => setTimeout(r, 800));
  txt = await bodyText(page);
  if (await expect("page renders (not crash)", badRes.status() < 500, `status ${badRes.status()}`)) pass++; else fail++;
  if (await expect("invalid-token message visible", /Link not valid|isn't valid|invalid/i.test(txt))) pass++; else fail++;
  await snap(page, "3-invalid");

  // ── Test 4: finalize without session ────────────────────────────────────
  console.log(`\n══ Test 4 — /claim/<token>/finalize without session ══`);
  const finRes = await page.goto(`${SITE}/claim/${REC_TOKEN}/finalize`, { waitUntil: "networkidle2", timeout: 30000 });
  await new Promise(r => setTimeout(r, 800));
  txt = await bodyText(page);
  if (await expect("renders without crash", finRes.status() < 500, `status ${finRes.status()}`)) pass++; else fail++;
  if (await expect("no-session error visible (graceful)", /verify|expire|try again/i.test(txt))) pass++; else fail++;
  await snap(page, "4-finalize-no-session");

  // ── Test 5: email API rejects bad input ─────────────────────────────────
  console.log(`\n══ Test 5 — POST /api/claim/email validation ══`);
  const fetchPage = await createStealthPage(browser);
  const tests: Array<[string, any, number]> = [
    ["empty body", {}, 400],
    ["missing email", { token: REC_TOKEN }, 400],
    ["bad email format", { token: REC_TOKEN, email: "not-an-email" }, 400],
    ["unknown token", { token: "INVALID", email: "test@example.com" }, 404],
  ];
  for (const [label, body, expectedStatus] of tests) {
    const res = await fetchPage.evaluate((args: any) => {
      return fetch(args.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(args.body),
      }).then(r => ({ status: r.status }));
    }, { url: `${SITE}/api/claim/email`, body });
    if (await expect(`${label} → ${expectedStatus}`, res.status === expectedStatus, `got ${res.status}`)) pass++; else fail++;
  }
  await fetchPage.close();

  await page.close();
  await closeBrowser();

  console.log(`\n══ Total ══`);
  console.log(`  pass=${pass}  fail=${fail}`);
  console.log(`  screenshots in ${OUT_DIR}`);
  process.exit(fail > 0 ? 1 : 0);
})();
