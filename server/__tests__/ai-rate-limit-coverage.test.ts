/**
 * ai-rate-limit-coverage.test.ts — audit finding 9 (ledger `2026-09-03-security-9-11-13`).
 *
 * THE CLASS: an LLM-calling endpoint registered with `isAuthenticated` alone. The project's own
 * `aiRateLimiter` (10/min/IP, `server/infrastructure/rate-limiter.ts`) was applied to five AI
 * routes and to the `/api/ai` prefix in `server/index.ts` — but the `/api/claude/*` and
 * `/api/grok/*` families sit outside that prefix, so nine LLM endpoints ran behind nothing but the
 * general 100/min IP limiter. `POST /api/grok/chat` forwards arbitrary `messages` and
 * `systemContext` to the model, i.e. an open LLM proxy on the platform's keys for any account.
 *
 * WHY THIS IS A STATIC TEST, NOT AN HTTP ONE: importing `content.routes.ts` starts the TravelPulse
 * daily-refresh timer at module scope (audit finding 17), and ~700 of its routes are registered by
 * `registerDiscoveryRoutes()` at startup rather than at import — so a router-mounting suite is both
 * process-leaking and prone to passing for the wrong reason (a 404 that never reached a handler).
 * The registration LINE is the artifact under audit, so the line is what is asserted.
 *
 * STATED NEGATIVE SPACE (§18d): this proves the nine registrations NAME the shared limiter and that
 * the name resolves to the one shared import. It does NOT execute the limiter, does not prove the
 * 10/min number, does not prove middleware ORDER beyond "the limiter is in the chain", and knows
 * nothing about any AI endpoint outside the two families listed here — a tenth LLM route added
 * under a new prefix is invisible to it, exactly as `/api/claude/*` was invisible to the `/api/ai`
 * prefix mount.
 *
 * Run: npx tsx --test server/__tests__/ai-rate-limit-coverage.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const CONTENT_ROUTES = path.join(ROOT, "server", "routes", "content.routes.ts");
const source = fs.readFileSync(CONTENT_ROUTES, "utf8");

/** The nine endpoints audit finding 9 names, by their registration path. */
const NINE_LLM_ENDPOINTS = [
  "/api/claude/optimize-itinerary",
  "/api/claude/transportation-analysis",
  "/api/claude/full-itinerary-graph",
  "/api/claude/recommendations",
  "/api/grok/match-experts",
  "/api/grok/content/generate",
  "/api/grok/intelligence",
  "/api/grok/itinerary/generate",
  "/api/grok/chat",
];

/**
 * The middleware list of a `router.<verb>("<path>", …)` registration: everything between the path
 * literal and the handler that opens the body. Returns null when the path is not registered at all.
 */
function middlewareChainFor(routePath: string): string | null {
  const escaped = routePath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(
    `router\\.(?:post|get|put|patch|delete)\\(\\s*["'\`]${escaped}["'\`]\\s*,([^\\n]*)`,
  );
  const match = source.match(re);
  return match ? match[1] : null;
}

test("A1: all nine LLM endpoints carry the shared aiRateLimiter", () => {
  const missing: string[] = [];
  for (const routePath of NINE_LLM_ENDPOINTS) {
    const chain = middlewareChainFor(routePath);
    assert.notEqual(
      chain,
      null,
      `${routePath} is no longer registered in content.routes.ts — if it moved, move this pin with it rather than deleting the row.`,
    );
    if (!/\baiRateLimiter\b/.test(chain!)) missing.push(routePath);
  }
  assert.deepEqual(
    missing,
    [],
    `LLM endpoints registered with NO AI rate limit (audit finding 9 regrown): ${missing.join(", ")}`,
  );
});

test("A2: the limiter each of the nine names is the ONE shared limiter, not a local re-definition", () => {
  // The import must come from the single shared module (§18 rule 1 — one implementation).
  assert.match(
    source,
    /import\s*\{[^}]*\baiRateLimiter\b[^}]*\}\s*from\s*["']\.\.\/infrastructure\/rate-limiter["']/,
    "content.routes.ts must import aiRateLimiter from ../infrastructure/rate-limiter",
  );
  // And nothing in this file may mint a second limiter under that name.
  assert.equal(
    /(?:const|let|var|function)\s+aiRateLimiter\b/.test(source),
    false,
    "a locally-defined aiRateLimiter would shadow the shared one — that is the second implementation §18 rule 1 forbids",
  );
});

test("A3: the AI limiter is defined once, in the shared infrastructure module", () => {
  const limiterModule = fs.readFileSync(
    path.join(ROOT, "server", "infrastructure", "rate-limiter.ts"),
    "utf8",
  );
  assert.match(
    limiterModule,
    /export const aiRateLimiter = createRateLimiter\(/,
    "the shared AI limiter must remain defined in server/infrastructure/rate-limiter.ts",
  );
  // server/middleware/rateLimiter.ts is a re-export alias (`aiRateLimit`), not a second limiter.
  const alias = fs.readFileSync(path.join(ROOT, "server", "middleware", "rateLimiter.ts"), "utf8");
  assert.match(
    alias,
    /aiRateLimiter as aiRateLimit,/,
    "server/middleware/rateLimiter.ts must stay a re-export of the shared limiter",
  );
  assert.equal(
    /createRateLimiter\(/.test(alias),
    false,
    "server/middleware/rateLimiter.ts must not mint its own limiter",
  );
});

test("A4: the five endpoints that were already covered are still covered (no limits changed)", () => {
  const alreadyCovered: Array<[string, string]> = [
    ["server/routes/advisor.routes.ts", "/api/trips/:tripId/advisor/narration"],
    ["server/routes/demand.routes.ts", "/api/me/business-advisor"],
    ["server/routes/trip-context.routes.ts", "/api/trip-context/extract"],
    ["server/routes/content.routes.ts", "/api/transport-packages/generate"],
  ];
  for (const [file, routePath] of alreadyCovered) {
    const text = fs.readFileSync(path.join(ROOT, file), "utf8");
    const escaped = routePath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(
      `router\\.post\\(\\s*["'\`]${escaped}["'\`]\\s*,([^\\n]*)`,
    );
    const match = text.match(re);
    assert.notEqual(match, null, `${routePath} is no longer registered in ${file}`);
    assert.match(
      match![1],
      /\baiRateLimit(?:er)?\b/,
      `${routePath} lost its AI rate limit`,
    );
  }
  // The fifth lives in the routes.ts monolith and uses the `aiRateLimit` alias.
  const monolith = fs.readFileSync(path.join(ROOT, "server", "routes.ts"), "utf8");
  assert.match(
    monolith,
    /app\.get\(\s*"\/api\/trips\/:tripId\/itinerary\/recommendations",\s*aiRateLimit\b/,
    "the itinerary-recommendations route lost its AI rate limit",
  );
});
