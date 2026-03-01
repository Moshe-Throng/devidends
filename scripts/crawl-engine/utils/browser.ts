/**
 * Shared Puppeteer browser launcher — reuses a single browser instance.
 */

let browserInstance: any = null;

/**
 * Get or create a shared Puppeteer browser instance.
 * Lazy-imports puppeteer so the engine works without it (adapters that don't need it skip it).
 */
export async function getBrowser(): Promise<any> {
  if (browserInstance) return browserInstance;

  const puppeteer = require("puppeteer");
  browserInstance = await puppeteer.launch({
    headless: "new",
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-blink-features=AutomationControlled",
      "--disable-dev-shm-usage",
    ],
  });
  return browserInstance;
}

/**
 * Create a new page with stealth settings.
 */
export async function createStealthPage(browser: any): Promise<any> {
  const page = await browser.newPage();
  await page.setViewport({ width: 1366, height: 768 });
  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
  );
  // Remove webdriver flag
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
  });
  return page;
}

/**
 * Close the shared browser instance.
 */
export async function closeBrowser(): Promise<void> {
  if (browserInstance) {
    await browserInstance.close();
    browserInstance = null;
  }
}
