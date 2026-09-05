/**
 * payment-method-posture.test.ts — CLAUDE.md Locked Decision 43; ledger
 * `2026-09-05-payment-method-posture` (the ruling) and `2026-09-05-wallets-on-platform-intents`
 * (this lane).
 *
 * THE RULING: every PLATFORM PaymentIntent offers wallets — Apple Pay, Google Pay, Link — through
 * Stripe's `automatic_payment_methods`. The failure this pins against is not a crash: a site that
 * quietly goes back to `payment_method_types: ['card']`, or a NEW charge path written card-only,
 * simply shows one fewer button and nothing anywhere reports it. So the check is a census: EVERY
 * `paymentIntents.create` under `server/` either carries automatic methods or is on a PRINTED
 * exemption list with its reason, and the list is printed on every run so an exemption cannot
 * become a silent baseline (the §18d posture that `phase2-fee-gate`'s `fee-literal-debt` takes).
 *
 * NEGATIVE SPACE — read this before trusting a green result:
 *   • It is a SOURCE census, not a runtime one. It proves the parameter is written, never that
 *     Stripe rendered a wallet: that depends on the traveler's device, the methods enabled in the
 *     Stripe dashboard, and — for Apple Pay — the one-time domain registration LD 43(e) records as
 *     an OPERATOR step. No test can assert an operator did that.
 *   • It scans `paymentIntents.create` only. `checkout.sessions.create` is a different rail whose
 *     method set is dashboard-configured; the two sites that use it are pinned below as
 *     deliberately unchanged so that decision stays visible, not so it is blessed.
 *   • It says nothing about AMOUNTS or IDEMPOTENCY. Those are §14/§15 and have their own suites;
 *     the A-block here only pins that this lane did not disturb the keys it walked past.
 *
 * Run: npx tsx --test server/__tests__/payment-method-posture.test.ts
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SERVER = join(ROOT, "server");

/** Every `.ts` under server/, excluding tests and migrations. */
function serverSources(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "__tests__" || entry === "node_modules" || entry === "migrations") continue;
      serverSources(full, out);
    } else if (entry.endsWith(".ts")) {
      out.push(full);
    }
  }
  return out;
}

interface Site {
  file: string;
  line: number;
  /** Raw window — annotations live in comments, so C2 reads this one. */
  window: string;
  /** Same window with comment lines removed — so a comment that MENTIONS a parameter
   *  (this lane's own explanatory notes do) can never be mistaken for the parameter. */
  code: string;
}

function stripComments(block: string): string {
  return block
    .split("\n")
    .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
    .join("\n");
}

/**
 * A "site" is one `paymentIntents.create(` call. The window is generous on BOTH sides on purpose:
 * the params object may be built a few lines above the call (`buildPaymentIntentParams`), and the
 * annotation may sit above the call rather than inside the object.
 */
function paymentIntentSites(): Site[] {
  const sites: Site[] = [];
  for (const file of serverSources(SERVER)) {
    const src = readFileSync(file, "utf-8");
    if (!src.includes("paymentIntents.create(")) continue;
    const lines = src.split("\n");
    lines.forEach((line, i) => {
      // Comments that merely MENTION the call (the reconciliation job's prose) are not sites.
      const code = line.replace(/^\s*(\/\/|\*).*$/, "");
      if (!code.includes("paymentIntents.create(")) return;
      const window = lines.slice(Math.max(0, i - 30), i + 42).join("\n");
      sites.push({ file: relative(ROOT, file), line: i + 1, window, code: stripComments(window) });
    });
  }
  return sites;
}

const SITES = paymentIntentSites();

// ── C: the census ───────────────────────────────────────────────────────────────────────────────

test("C1: at least one PaymentIntent site is found (the census is not vacuously green)", () => {
  assert.ok(SITES.length >= 5, `expected ≥5 paymentIntents.create sites, found ${SITES.length}`);
});

test("C2: EVERY paymentIntents.create site offers automatic payment methods, or is a printed exemption", () => {
  const offering: string[] = [];
  const exempt: string[] = [];
  const missing: string[] = [];

  for (const site of SITES) {
    const where = `${site.file}:${site.line}`;
    if (/ld43-wallets-exempt:/.test(site.window)) {
      const reason = site.window.split(/ld43-wallets-exempt:/)[1].split("\n")[0].trim();
      exempt.push(`${where} — ${reason}`);
    } else if (/automatic_payment_methods/.test(site.code) || /ld43-wallets-ok:/.test(site.window)) {
      offering.push(where);
    } else {
      missing.push(where);
    }
  }

  // Printed on every run — an exemption that stops being justified has to be re-read, not inherited.
  console.log(`\n[LD 43] PaymentIntent sites offering wallets (${offering.length}):`);
  for (const s of offering) console.log(`   ✓ ${s}`);
  console.log(`[LD 43] PRINTED EXEMPTIONS (${exempt.length}) — each must state why:`);
  for (const s of exempt) console.log(`   • ${s}`);

  assert.deepEqual(
    missing,
    [],
    `these PaymentIntent sites neither offer automatic payment methods nor carry an ` +
      `\`ld43-wallets-exempt: <reason>\` annotation:\n  ${missing.join("\n  ")}`,
  );
});

test("C3: no PaymentIntent site pins payment_method_types (that is what suppresses wallets)", () => {
  const pinned = SITES.filter((s) => /payment_method_types/.test(s.code)).map((s) => `${s.file}:${s.line}`);
  assert.deepEqual(pinned, [], `payment_method_types found at a PaymentIntent site: ${pinned.join(", ")}`);
});

test("C4: every site that offers automatic methods sets allow_redirects: never", () => {
  // Every sheet in this app confirms with `redirect: 'if_required'`, and StripeCheckout's single
  // return_url (/booking/confirmation) is wrong for the pass, ready-made, optimizer and fee flows
  // that share it. A redirect-based method enabled in the dashboard would strand the traveler.
  // Wallets are NOT redirect methods, so nothing the ruling asks for is suppressed by this.
  const offenders: string[] = [];
  for (const site of SITES) {
    if (!/automatic_payment_methods/.test(site.code)) continue;
    if (!/allow_redirects:\s*["']never["']/.test(site.code)) offenders.push(`${site.file}:${site.line}`);
  }
  assert.deepEqual(offenders, [], `automatic methods without allow_redirects:"never": ${offenders.join(", ")}`);
});

// ── A: the shipped artifacts ────────────────────────────────────────────────────────────────────

const paymentSvc = readFileSync(join(SERVER, "services", "stripe-payment.service.ts"), "utf-8");
const stripeSvc = readFileSync(join(SERVER, "services", "stripe.service.ts"), "utf-8");
const tripPass = readFileSync(join(SERVER, "routes", "trip-pass.routes.ts"), "utf-8");
const readyMade = readFileSync(join(SERVER, "routes", "ready-made.routes.ts"), "utf-8");
const optimization = readFileSync(join(SERVER, "routes", "optimization.routes.ts"), "utf-8");
const monolith = readFileSync(join(SERVER, "routes.ts"), "utf-8");

test("A1: the shared createPaymentIntent's INTERACTIVE branch offers wallets — one author, every caller", () => {
  // §18 rule 1: cart checkout, deposits and balances all reach Stripe through this ONE builder, so
  // the ruling is applied here rather than at each caller.
  assert.match(
    paymentSvc,
    /:\s*\{\s*automatic_payment_methods:\s*\{\s*enabled:\s*true,\s*allow_redirects:\s*'never'\s*as const\s*\}\s*\}\)/,
  );
});

test("A2: the one-click OFF-SESSION branches stay named-method + confirm (Stripe rejects the alternative)", () => {
  // The exemption is not a shortcut: `automatic_payment_methods` is mutually exclusive with
  // `payment_method` + `confirm: true` + `off_session: true`. The wallet choice on this path was
  // made when the card was vaulted.
  assert.match(paymentSvc, /payment_method:\s*offSessionMethodId,\s*off_session:\s*true,\s*confirm:\s*true/);
  assert.match(paymentSvc, /off_session:\s*true,\s*\n\s*confirm:\s*true,/);
  assert.match(paymentSvc, /ld43-wallets-exempt:/);
});

test("A3: the add-card SetupIntent offers wallets too (LD 43(b) — one vaulting rail, same methods)", () => {
  const block = paymentSvc.slice(paymentSvc.indexOf("stripe.setupIntents.create(")).slice(0, 1400);
  assert.match(block, /automatic_payment_methods:\s*\{\s*enabled:\s*true,\s*allow_redirects:\s*'never'/);
  assert.match(block, /usage:\s*'off_session'/); // still says what it is saving FOR
});

test("A4: Trip Pass, ready-made, optimizer-run and coordination-fee intents each carry the parameter", () => {
  for (const [name, src] of [
    ["trip-pass", tripPass],
    ["ready-made", readyMade],
    ["optimizer run", optimization],
    ["coordination fee", monolith],
  ] as const) {
    assert.match(
      src,
      /automatic_payment_methods:\s*\{\s*enabled:\s*true,\s*allow_redirects:\s*"never"/,
      `${name} intent does not offer wallets`,
    );
  }
});

test("A5: §15 — this lane changed no idempotency key", () => {
  assert.match(tripPass, /idempotencyKey:\s*`tp-buy-\$\{trip!\.id\}-\$\{userId\}`/);
  assert.match(readyMade, /idempotencyKey:\s*`rm-buy-\$\{listing\.id\}-\$\{userId\}`/);
  assert.match(monolith, /idempotencyKey:\s*`coord-fee-\$\{coordinationId\}`/);
  assert.match(optimization, /buildOptimizationFeeIdempotencyKey\(userId, tripId \?\? userExperienceId\)/);
  assert.match(paymentSvc, /idempotencyKey:\s*`pi-\$\{idempotencyKey\}`/);
  assert.match(paymentSvc, /idempotencyKey:\s*`expert-svc-/);
});

test("A6: §14 — this lane changed no amount, and none is body-sourced at the sites it touched", () => {
  assert.match(tripPass, /amount:\s*plan\.priceCents/); // server-resolved from the plans row
  assert.match(readyMade, /amount:\s*listing\.priceCents/); // server-derived from the listing
  assert.match(optimization, /amount:\s*priceCents/);
  assert.match(monolith, /amount:\s*netFeeCents/);
  for (const [name, src] of [["trip-pass", tripPass], ["ready-made", readyMade]] as const) {
    assert.equal(/amount:\s*req\.body/.test(src), false, `${name} reads an amount off the body`);
  }
});

test("A7: the two hosted Checkout Sessions stay card-pinned AND stay annotated as a live decision", () => {
  // Not a PaymentIntent rail. Recorded rather than quietly skipped: a hosted session's method set
  // is dashboard-configured, and widening it also admits delayed-notification methods whose
  // `checkout.session.completed` can arrive unpaid — a webhook change this lane did not audit.
  for (const [name, src] of [["transport", stripeSvc], ["expert-service", paymentSvc]] as const) {
    assert.match(src, /LD 43 audit note/, `${name} Checkout Session lost its audit note`);
    assert.match(src, /payment_method_types:\s*\[["']card["']\]/, `${name} Checkout Session changed unexpectedly`);
  }
});
