/**
 * Production API surface audit. Hits every public-facing endpoint we run,
 * with both happy-path-ish and validation-edge inputs, and asserts the
 * status code we expect. No mutation — read-only or rejection-only paths.
 */
const SITE = process.env.SITE || "https://www.devidends.net";
const REC_TOKEN = "a136c0a8"; // Yixin Yu (recommender, unclaimed)
const EXP_TOKEN = "bf683ff8"; // Zenebe Burka Waktoli (expert, unclaimed)

interface Test {
  label: string;
  method: "GET" | "POST";
  path: string;
  body?: any;
  expect: number | number[];
  expectBody?: (j: any) => boolean;
}

const TESTS: Test[] = [
  // ── Health / public read endpoints ─────────────────────────────────────
  { label: "GET /api/inbound/devex (health ping)", method: "GET", path: "/api/inbound/devex", expect: 200,
    expectBody: (j) => j.ok === true && j.service === "devex-inbound" },

  { label: "GET /api/claim?token=<recommender>", method: "GET", path: `/api/claim?token=${REC_TOKEN}`, expect: 200,
    expectBody: (j) => j.success && j.profile?.is_recommender === true },

  { label: "GET /api/claim?token=<expert>", method: "GET", path: `/api/claim?token=${EXP_TOKEN}`, expect: 200,
    expectBody: (j) => j.success && j.profile?.is_recommender === false },

  { label: "GET /api/claim?token=NONEXISTENT", method: "GET", path: "/api/claim?token=NONEXISTENT", expect: 404 },
  { label: "GET /api/claim (no token)", method: "GET", path: "/api/claim", expect: 400 },

  // ── /api/claim/email validation ─────────────────────────────────────────
  { label: "POST /api/claim/email — empty body", method: "POST", path: "/api/claim/email", body: {}, expect: 400 },
  { label: "POST /api/claim/email — missing email", method: "POST", path: "/api/claim/email", body: { token: REC_TOKEN }, expect: 400 },
  { label: "POST /api/claim/email — bad email format", method: "POST", path: "/api/claim/email", body: { token: REC_TOKEN, email: "not-an-email" }, expect: 400 },
  { label: "POST /api/claim/email — unknown token", method: "POST", path: "/api/claim/email", body: { token: "INVALID-TOKEN-XYZ", email: "test@example.com" }, expect: 404 },

  // ── Telegram webhook ────────────────────────────────────────────────────
  { label: "POST /api/telegram/webhook — empty (silent ack)", method: "POST", path: "/api/telegram/webhook", body: {}, expect: 200 },

  // ── Devex matcher (cron, but GET-callable) ──────────────────────────────
  { label: "GET /api/cron/devex-match", method: "GET", path: "/api/cron/devex-match", expect: 200 },

  // ── Public landing pages ────────────────────────────────────────────────
  { label: `GET /claim/${REC_TOKEN}`, method: "GET", path: `/claim/${REC_TOKEN}`, expect: 200 },
  { label: `GET /claim/${EXP_TOKEN}`, method: "GET", path: `/claim/${EXP_TOKEN}`, expect: 200 },
  { label: "GET /claim/NONEXISTENT", method: "GET", path: "/claim/NONEXISTENT", expect: 200 /* renders friendly error */ },
  { label: "GET / (landing)", method: "GET", path: "/", expect: 200 },
  { label: "GET /opportunities", method: "GET", path: "/opportunities", expect: 200 },
  { label: "GET /for-firms", method: "GET", path: "/for-firms", expect: 200 },
];

(async () => {
  let pass = 0, fail = 0;
  const fails: string[] = [];

  for (const t of TESTS) {
    const url = `${SITE}${t.path}`;
    let resp: Response;
    try {
      resp = await fetch(url, {
        method: t.method,
        headers: t.body ? { "Content-Type": "application/json" } : undefined,
        body: t.body ? JSON.stringify(t.body) : undefined,
      });
    } catch (e: any) {
      console.log(`✗ ${t.label}  →  network error: ${e.message}`);
      fail++; fails.push(t.label);
      continue;
    }
    const expects = Array.isArray(t.expect) ? t.expect : [t.expect];
    const statusOk = expects.includes(resp.status);
    let bodyOk = true;
    let bodyDetail = "";
    if (t.expectBody) {
      try {
        const j = await resp.json();
        bodyOk = t.expectBody(j);
        if (!bodyOk) bodyDetail = ` body: ${JSON.stringify(j).slice(0, 100)}`;
      } catch {
        bodyOk = false;
        bodyDetail = " body: not JSON";
      }
    }
    const ok = statusOk && bodyOk;
    console.log(`${ok ? "✓" : "✗"} ${t.label}  →  ${resp.status}${bodyDetail}${ok ? "" : ` (expected ${expects.join("|")})`}`);
    if (ok) pass++; else { fail++; fails.push(t.label); }
  }

  console.log(`\n══ pass=${pass}  fail=${fail} ══`);
  if (fails.length) {
    console.log("Failures:");
    for (const f of fails) console.log(`  - ${f}`);
  }
  process.exit(fail > 0 ? 1 : 0);
})();
