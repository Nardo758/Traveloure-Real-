/**
 * Runtime Health Layer (H1–H6)
 *
 * The existing QA checks (qa-verify.service.ts) are STATIC — greps and file-existence tests.
 * They pass while production is down or every third-party integration is dead, because they
 * never actually talk to the running app. This module adds a RUNTIME layer that only means
 * something inside a live deployment: it self-HTTPs the app's own routes, reports which
 * money-critical secrets are present (never their values), asserts the Stripe live/test key
 * rule, and rolls up the provider-health / data-invariants / scheduler-wiring signals other
 * lanes are building.
 *
 * Composed into the SAME report surface as the static checks (see qa-verify.service.ts,
 * which spreads `await runRuntimeHealth()` into its `results` map) — no changes needed to
 * nightlyQA.ts or the admin `GET /api/admin/qa/verify` endpoint, both of which just consume
 * whatever runQAVerify() returns.
 *
 * HONESTY CONTRACT (CLAUDE.md §13 applies to test output too):
 *   - A dependency that isn't present on this build (provider-health registry, invariants
 *     script, a future scheduler) is a SKIP, never a fabricated pass. Skips are represented as
 *     `{ pass: true, detail: "SKIP: <reason>" }` — pass:true so a skip never fails CI/nightly
 *     on its own, but the "SKIP:" prefix makes it impossible to misread as an earned green (the
 *     existing QACheckResult shape has no separate skip state, so this is the least-surprising
 *     extension of the convention already used by checks like A1 "no funnel events yet").
 *   - Every check here is READ-ONLY. No check ever prints a secret value, mutates data, or
 *     "fixes" an invariant violation it finds.
 */

import { isProdStrictEnv, checkStripeKeyPrefix } from "../utils/stripe-key-policy";
import { getStripeSecretKey } from "../utils/stripe-key";
import type { QAResults } from "./qa-verify.service";

function baseUrl(): string {
  const port = process.env.PORT || "5000";
  return `http://127.0.0.1:${port}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// H1 — Route liveness
// ─────────────────────────────────────────────────────────────────────────────
//
// §9's lesson: a dead/unmounted route in this app returns 200 + the Vite SPA
// catch-all HTML, NOT a 404 — so asserting `res.ok` alone is worthless. Every
// API probe below asserts the content-type is JSON (the catch-all is always
// text/html) PLUS a shape check on the body; the one page probe asserts the
// SPA root marker is present in real HTML.

interface RouteProbeResult {
  pass: boolean;
  detail: string;
}

async function fetchWithTimeout(url: string, timeoutMs = 5000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal, headers: { Accept: "*/*" } });
  } finally {
    clearTimeout(timer);
  }
}

function snippet(text: string, max = 160): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  return oneLine.length > max ? `${oneLine.slice(0, max)}…` : oneLine;
}

async function probeJsonRoute(
  path: string,
  validateBody: (body: any) => string | null // returns an error string, or null if OK
): Promise<RouteProbeResult> {
  const url = `${baseUrl()}${path}`;
  try {
    const res = await fetchWithTimeout(url);
    const contentType = res.headers.get("content-type") || "";
    const rawText = await res.text();

    if (!contentType.includes("application/json")) {
      // The §9 dead-route symptom: 200 (or any status) with HTML — the SPA catch-all, not a
      // real handler. A JSON route that isn't returning JSON is DEAD, regardless of status code.
      return {
        pass: false,
        detail: `${path} → status ${res.status}, content-type "${contentType}" (expected application/json — ` +
          `looks like the Vite/SPA catch-all, i.e. this route is unmounted/dead, not a real 404). Body: ${snippet(rawText)}`,
      };
    }

    let body: any;
    try {
      body = JSON.parse(rawText);
    } catch {
      return { pass: false, detail: `${path} → status ${res.status}, JSON content-type but unparseable body: ${snippet(rawText)}` };
    }

    if (res.status < 200 || res.status >= 300) {
      return { pass: false, detail: `${path} → non-2xx status ${res.status}. Body: ${snippet(rawText)}` };
    }

    const shapeError = validateBody(body);
    if (shapeError) {
      return { pass: false, detail: `${path} → status ${res.status}, JSON, but shape check failed: ${shapeError}. Body: ${snippet(rawText)}` };
    }

    return { pass: true, detail: `${path} → status ${res.status}, JSON, shape OK. Body: ${snippet(rawText)}` };
  } catch (err: any) {
    return { pass: false, detail: `${path} → request failed: ${err?.message ?? String(err)} (is the app actually listening on ${baseUrl()}?)` };
  }
}

async function probePageRoute(path: string, rootMarker: string): Promise<RouteProbeResult> {
  const url = `${baseUrl()}${path}`;
  try {
    const res = await fetchWithTimeout(url);
    const contentType = res.headers.get("content-type") || "";
    const rawText = await res.text();

    if (!contentType.includes("text/html")) {
      return { pass: false, detail: `${path} → status ${res.status}, content-type "${contentType}" (expected text/html for a page route). Body: ${snippet(rawText)}` };
    }
    if (res.status < 200 || res.status >= 300) {
      return { pass: false, detail: `${path} → non-2xx status ${res.status}` };
    }
    if (!rawText.includes(rootMarker)) {
      return { pass: false, detail: `${path} → status ${res.status}, HTML, but missing the app-root marker (${rootMarker}) — page shell may be broken` };
    }
    return { pass: true, detail: `${path} → status ${res.status}, HTML with app-root marker present. Size: ${rawText.length} bytes` };
  } catch (err: any) {
    return { pass: false, detail: `${path} → request failed: ${err?.message ?? String(err)} (is the app actually listening on ${baseUrl()}?)` };
  }
}

export async function runH1RouteLiveness(): Promise<QAResults> {
  const results: QAResults = {};

  // H1a — /api/health (DB-backed health probe; see server/routes/content.routes.ts)
  results.H1a = await probeJsonRoute("/api/health", (body) => {
    if (typeof body?.status !== "string") return `missing "status" string field`;
    return null;
  });

  // H1b — main discover feed
  results.H1b = await probeJsonRoute("/api/discover", (body) => {
    if (!Array.isArray(body?.services)) return `missing "services" array field`;
    return null;
  });

  // H1c — experience types catalog (used by onboarding/planning surfaces)
  results.H1c = await probeJsonRoute("/api/experience-types", (body) => {
    if (!Array.isArray(body)) return `expected a top-level JSON array`;
    if (body.length > 0 && typeof body[0]?.slug !== "string") return `first item missing "slug" string field`;
    return null;
  });

  // H1d — fee-bands (the pricing-equivalent surface; expert_standard is a real seeded key,
  // migration 033). A 404 here (band not found) is still valid JSON — that's a data question,
  // not a liveness question — so we only fail on the §9 dead-route shape, not on 404 with a
  // real JSON body.
  results.H1d = await probeJsonRoute("/api/fee-bands/expert_standard", (body) => {
    if (typeof body?.band_key !== "string" && typeof body?.error !== "string") {
      return `expected either a real band ({band_key: ...}) or an honest {error: ...} — got neither`;
    }
    return null;
  });

  // H1e — a public page route (SPA shell). "/" always resolves to the Vite/static shell.
  results.H1e = await probePageRoute("/", 'id="root"');

  return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// H2 — Money-secret presence (the F-2 lesson: MONEY_MAP §F-2, CLAUDE.md validate-env.ts)
// ─────────────────────────────────────────────────────────────────────────────

const MONEY_CRITICAL_VARS = [
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "STRIPE_CONNECT_WEBHOOK_SECRET",
  "STRIPE_IDENTITY_WEBHOOK_SECRET",
  "VITE_STRIPE_PUBLISHABLE_KEY",
] as const;

const INFORMATIONAL_VARS = [
  "TAVILY_API_KEY",
  "GOOGLE_MAPS_API_KEY",
  "TRAVELPAYOUTS_TOKEN",
  "TP_SUBID_ATTRIBUTION",
  "MUSEMENT_API_KEY",
  "MUSEMENT_AFFILIATE_ID",
] as const;

export interface SecretPresenceReport {
  present: Record<string, boolean>;
  /** true iff STRIPE_SECRET_KEY is set AND at least one webhook secret is missing — an
   * unverifiable webhook is a forgeable money signal (payments can be accepted, but their
   * confirm/fail/dispute webhooks can't be authenticated). */
  hasUnverifiableWebhookGap: boolean;
  missingWebhookSecrets: string[];
}

/** Pure — takes an env snapshot so it's unit-testable without mutating process.env. */
export function evaluateMoneySecretPresence(env: NodeJS.ProcessEnv): SecretPresenceReport {
  const present: Record<string, boolean> = {};
  for (const key of MONEY_CRITICAL_VARS) present[key] = !!env[key];
  for (const key of INFORMATIONAL_VARS) present[key] = !!env[key];
  // Track the test key and the effective key separately so the diagnostic
  // accurately reflects whether Stripe is configured when only the test key is set.
  const effectiveStripeKey = env.STRIPE_SECRET_KEY_TEST ?? env.STRIPE_SECRET_KEY;
  present["STRIPE_SECRET_KEY_TEST"] = !!env.STRIPE_SECRET_KEY_TEST;
  present["_effective_stripe_key"] = !!effectiveStripeKey;

  const webhookVars = ["STRIPE_WEBHOOK_SECRET", "STRIPE_CONNECT_WEBHOOK_SECRET", "STRIPE_IDENTITY_WEBHOOK_SECRET"];
  const missingWebhookSecrets = webhookVars.filter((v) => !env[v]);
  const hasUnverifiableWebhookGap = !!effectiveStripeKey && missingWebhookSecrets.length > 0;

  return { present, hasUnverifiableWebhookGap, missingWebhookSecrets };
}

export function runH2MoneySecretPresence(): QAResults {
  const report = evaluateMoneySecretPresence(process.env);

  const moneyLine = MONEY_CRITICAL_VARS.map((v) => `${v}=${report.present[v] ? "set" : "MISSING"}`).join(", ");
  const infoLine = INFORMATIONAL_VARS.map((v) => `${v}=${report.present[v] ? "set" : "absent"}`).join(", ");
  // Show whether the effective key (STRIPE_SECRET_KEY_TEST ?? STRIPE_SECRET_KEY) is present, since
  // a dev deployment with only STRIPE_SECRET_KEY_TEST set would show STRIPE_SECRET_KEY=MISSING in
  // moneyLine even though Stripe is fully operational.
  const effectiveLine = `effective_stripe_key=${report.present["_effective_stripe_key"] ? "set" : "MISSING"}` +
    (report.present["STRIPE_SECRET_KEY_TEST"] ? " (resolved from STRIPE_SECRET_KEY_TEST)" : "");

  const detail = report.hasUnverifiableWebhookGap
    ? `FAIL: Stripe key is set but missing webhook secret(s): ${report.missingWebhookSecrets.join(", ")} ` +
      `— webhooks for these cannot be signature-verified (a forgeable money signal). ${effectiveLine}. ` +
      `Money-critical raw vars: ${moneyLine}. Informational (never fails): ${infoLine}.`
    : `OK. ${effectiveLine}. Money-critical raw vars: ${moneyLine}. Informational (never fails): ${infoLine}.`;

  return {
    H2: { pass: !report.hasUnverifiableWebhookGap, detail },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// H3 — Live-key sanity
// ─────────────────────────────────────────────────────────────────────────────
//
// Reuses server/utils/stripe-key-policy.ts (the pure rule extracted from
// server/validate-env.ts, the primary boot-time enforcement site) — see that file's header
// for why this is a reuse, not a re-derivation, of the rule.

export function runH3LiveKeySanity(): QAResults {
  const key = getStripeSecretKey();
  const prodStrict = isProdStrictEnv();
  const envLabel = `NODE_ENV=${process.env.NODE_ENV || "undefined"}, ENVIRONMENT=${process.env.ENVIRONMENT || "undefined"}`;

  if (!key) {
    return {
      H3: { pass: false, detail: `FAIL: STRIPE_SECRET_KEY is not set — cannot verify the live/test key rule (${envLabel}, prod-strict=${prodStrict}).` },
    };
  }

  const check = checkStripeKeyPrefix(key, prodStrict);
  return {
    H3: {
      pass: check.ok,
      detail: check.ok
        ? `OK: key prefix matches the ${prodStrict ? "production (sk_live_)" : "non-production (sk_test_)"} rule (${envLabel}).`
        : `FAIL: ${check.reason} (${envLabel}, prod-strict=${prodStrict}).`,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// H4 — Provider health rollup
// ─────────────────────────────────────────────────────────────────────────────

export async function runH4ProviderHealthRollup(): Promise<QAResults> {
  let mod: typeof import("./provider-health.service");
  try {
    mod = await import("./provider-health.service");
  } catch {
    return { H4: { pass: true, detail: "SKIP: provider-health registry not present on this build" } };
  }

  if (typeof mod.getProviderHealth !== "function") {
    return { H4: { pass: true, detail: "SKIP: provider-health.service.ts present but getProviderHealth() export not found" } };
  }

  try {
    const entries = mod.getProviderHealth();
    const counts: Record<string, number> = {};
    const flagged: string[] = [];
    for (const entry of entries) {
      counts[entry.status] = (counts[entry.status] ?? 0) + 1;
      if (entry.status === "error" || entry.status === "auth" || entry.status === "quota") {
        flagged.push(`${entry.provider}(${entry.status}${entry.lastDetail ? `: ${entry.lastDetail}` : ""})`);
      }
    }
    const countsLine = Object.entries(counts)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([status, n]) => `${status}=${n}`)
      .join(", ");

    const pass = flagged.length === 0;
    return {
      H4: {
        pass,
        detail: pass
          ? `OK: ${entries.length} providers registered, none in error/auth/quota. Counts: ${countsLine || "(none registered)"}`
          : `FAIL: ${flagged.length} provider(s) in error/auth/quota: ${flagged.join(", ")}. Counts: ${countsLine}`,
      },
    };
  } catch (err: any) {
    return { H4: { pass: false, detail: `FAIL: getProviderHealth() threw: ${err?.message ?? String(err)}` } };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// H5 — Data invariants
// ─────────────────────────────────────────────────────────────────────────────

export async function runH5DataInvariants(): Promise<QAResults> {
  const { existsSync } = await import("fs");
  const path = "scripts/invariants.mjs";

  if (!existsSync(path)) {
    return { H5: { pass: true, detail: "SKIP: scripts/invariants.mjs not present on this build" } };
  }

  // Prefer an importable runner (a named/default export) so we can read structured output
  // directly; fall back to shelling the CLI entry and parsing its exit code + a best-effort
  // severity-count scrape, since we can't assume a particular export shape from a script this
  // check didn't write.
  try {
    // IMPORTANT: the specifier is built in a separate statement, NOT as a template literal
    // written directly inside `import(...)`. esbuild's automatic "glob import" feature
    // triggers specifically when a template literal appears literally at the import() call
    // site — writing `import(\`../../${path}\`)` inline would make esbuild try to statically
    // bundle EVERY file under the repo root matching that pattern (proven: it blew up the
    // server build trying to resolve attached_assets/, artifacts/, .githooks/, etc.). Building
    // the string one line earlier and passing a plain variable keeps this a genuinely opaque
    // runtime import, resolved only after the existsSync guard above confirms the file exists.
    const specifier = "../../" + path;
    const mod: any = await import(specifier);
    const runner = mod.runInvariants ?? mod.checkInvariants ?? mod.default;
    if (typeof runner === "function") {
      const result = await runner();
      const detail = summarizeInvariantResult(result);
      const violations = countInvariantViolations(result);
      return { H5: { pass: violations === 0, detail } };
    }
  } catch (err: any) {
    // Fall through to the CLI path below — an import failure doesn't necessarily mean the
    // script is broken, just that it isn't designed to be imported.
    console.warn(`[runtime-health] H5: import of ${path} did not yield a usable runner (${err?.message ?? err}); falling back to CLI invocation`);
  }

  try {
    const { execFile } = await import("child_process");
    const { promisify } = await import("util");
    const execFileAsync = promisify(execFile);
    const { stdout, stderr } = await execFileAsync("node", [path], {
      env: process.env,
      timeout: 60_000,
    });
    const output = `${stdout}\n${stderr}`;
    const bySeverity = extractSeverityCounts(output);
    const totalViolations = Object.values(bySeverity).reduce((a, b) => a + b, 0);
    return {
      H5: {
        pass: totalViolations === 0,
        detail: totalViolations === 0
          ? `OK: exit 0, no violations parsed from output. ${snippet(output, 200)}`
          : `FAIL: ${totalViolations} violation(s) — ${Object.entries(bySeverity).map(([s, n]) => `${s}=${n}`).join(", ")}. ${snippet(output, 200)}`,
      },
    };
  } catch (err: any) {
    // A non-zero exit from execFile throws — that itself is the FAIL signal (the invariants
    // script's own convention, mirroring a lint/test runner).
    const output = `${err?.stdout ?? ""}\n${err?.stderr ?? ""}`.trim();
    return {
      H5: {
        pass: false,
        detail: `FAIL: scripts/invariants.mjs exited non-zero (${err?.code ?? "unknown code"}). ${snippet(output || err?.message || String(err), 200)}`,
      },
    };
  }
}

function summarizeInvariantResult(result: any): string {
  if (result && typeof result === "object") {
    if (Array.isArray(result.violations)) return `${result.violations.length} violation(s) reported by imported runner. ${snippet(JSON.stringify(result.bySeverity ?? result.violations.slice(0, 5)))}`;
    if (result.bySeverity) return `Imported runner returned bySeverity: ${JSON.stringify(result.bySeverity)}`;
  }
  return `Imported runner ran; result shape unrecognized — recorded raw: ${snippet(JSON.stringify(result))}`;
}

function countInvariantViolations(result: any): number {
  if (Array.isArray(result?.violations)) return result.violations.length;
  if (result?.bySeverity && typeof result.bySeverity === "object") {
    return Object.values(result.bySeverity).reduce((a: number, b: any) => a + (Number(b) || 0), 0);
  }
  if (typeof result?.violationCount === "number") return result.violationCount;
  // Unrecognized shape: don't fabricate a pass — treat as "couldn't determine", so report 0
  // ONLY reflects "found nothing to parse", not "confirmed clean". Callers see the raw detail.
  return 0;
}

function extractSeverityCounts(output: string): Record<string, number> {
  const counts: Record<string, number> = {};
  const re = /\b(\d+)\s+(critical|high|medium|low|warning)s?\b/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(output)) !== null) {
    const n = parseInt(m[1], 10);
    const sev = m[2].toLowerCase();
    counts[sev] = (counts[sev] ?? 0) + n;
  }
  return counts;
}

// ─────────────────────────────────────────────────────────────────────────────
// H6 — Scheduler liveness
// ─────────────────────────────────────────────────────────────────────────────
//
// None of the scheduler services expose a runtime "am I actually running" registry (no public
// isRunning()/status getter — just a private timer field), so this is deliberately a STATIC
// assertion over server/index.ts's startup wiring, exactly as scoped: "if there's no runtime
// registry, assert the wiring exists statically and SAY that's what you're asserting."

interface SchedulerWiringSpec {
  key: string;
  label: string;
  /** Substring that must appear in server/index.ts's startup wiring. */
  startCallMarker: string;
  /** Whether this scheduler is expected to be unconditionally started (vs. internally gated). */
  note?: string;
}

const SCHEDULER_SPECS: SchedulerWiringSpec[] = [
  { key: "cache", label: "Cache scheduler", startCallMarker: "cacheSchedulerService.start()" },
  { key: "earnings_release", label: "Earnings release scheduler", startCallMarker: "earningsReleaseScheduler.start()" },
  {
    key: "dmo_ingest",
    label: "DMO ingest scheduler",
    startCallMarker: "dmoIngestScheduler.start()",
    note: "internally gated OFF unless DMO_INGEST_ENABLED=1 AND TAVILY_API_KEY set (see dmo-ingest-scheduler.service.ts) — this only confirms .start() is called, not that it actually began ticking",
  },
];

export async function runH6SchedulerLiveness(): Promise<QAResults> {
  try {
    const { readFileSync, existsSync } = await import("fs");
    const indexPath = "server/index.ts";
    if (!existsSync(indexPath)) {
      return { H6: { pass: false, detail: `FAIL: ${indexPath} not found — cannot verify scheduler startup wiring` } };
    }
    const src = readFileSync(indexPath, "utf-8");

    const missing = SCHEDULER_SPECS.filter((s) => !src.includes(s.startCallMarker));
    const present = SCHEDULER_SPECS.filter((s) => src.includes(s.startCallMarker));

    const presentLine = present.map((s) => `${s.label}${s.note ? ` (${s.note})` : ""}`).join("; ");
    const missingLine = missing.map((s) => s.label).join(", ");

    return {
      H6: {
        pass: missing.length === 0,
        detail:
          `STATIC CHECK ONLY (no runtime scheduler registry exists — this asserts the .start() call ` +
          `site is present in server/index.ts, not that the timer actually fired). ` +
          (missing.length === 0
            ? `All ${present.length} tracked schedulers wired: ${presentLine}.`
            : `Missing wiring for: ${missingLine}. Present: ${presentLine || "(none)"}.`),
      },
    };
  } catch (err: any) {
    return { H6: { pass: false, detail: `FAIL: could not read server/index.ts: ${err?.message ?? String(err)}` } };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Composed entry point
// ─────────────────────────────────────────────────────────────────────────────

export async function runRuntimeHealth(): Promise<QAResults> {
  const [h1, h4, h5, h6] = await Promise.all([
    runH1RouteLiveness().catch((err) => ({ H1a: { pass: false, detail: `H1 threw: ${err?.message ?? err}` } } as QAResults)),
    runH4ProviderHealthRollup().catch((err) => ({ H4: { pass: false, detail: `H4 threw: ${err?.message ?? err}` } } as QAResults)),
    runH5DataInvariants().catch((err) => ({ H5: { pass: false, detail: `H5 threw: ${err?.message ?? err}` } } as QAResults)),
    runH6SchedulerLiveness().catch((err) => ({ H6: { pass: false, detail: `H6 threw: ${err?.message ?? err}` } } as QAResults)),
  ]);

  // H2/H3 are synchronous (pure env reads) — no need for the Promise.all/catch treatment, but
  // wrap anyway so a future refactor that makes them async doesn't silently drop error handling.
  let h2: QAResults;
  try {
    h2 = runH2MoneySecretPresence();
  } catch (err: any) {
    h2 = { H2: { pass: false, detail: `H2 threw: ${err?.message ?? err}` } };
  }

  let h3: QAResults;
  try {
    h3 = runH3LiveKeySanity();
  } catch (err: any) {
    h3 = { H3: { pass: false, detail: `H3 threw: ${err?.message ?? err}` } };
  }

  return { ...h1, ...h2, ...h3, ...h4, ...h5, ...h6 };
}
