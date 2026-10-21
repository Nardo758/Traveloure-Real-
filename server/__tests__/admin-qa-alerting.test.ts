/**
 * Admin / QA alerting (ledger `2026-10-21-admin-qa-alerting`).
 *
 * Pure checks always run. The platform_settings claim runs only when
 * JOURNEY_DB_WRITES_OK=1, and it restores whatever row was there.
 *
 *   npx tsx --test --test-concurrency=1 server/__tests__/admin-qa-alerting.test.ts
 */
import assert from "node:assert/strict";
import http from "node:http";
import { execSync } from "node:child_process";
import { test } from "node:test";
import {
  ADMIN_DIGEST_SENT_ON_KEY,
  adminDigestDateKey,
  collapseUnresolvedLeadAlerts,
  dedupeReconciliationMismatches,
  isDigestPayoutExcluded,
  isSystemDriftAlertMessage,
  UNRESOLVED_LEAD_CAP,
} from "../services/admin-digest-shape";
import {
  clientFileHasSecretsRisk,
  isClientSecretsScanExcluded,
  listClientSecretsRiskFiles,
  unsafeClientEnvIdents,
} from "../services/client-secrets-scan";
import { resolveQaProbeBaseUrl, resolveQaProbeTimeoutMs, runH1RouteLiveness } from "../services/runtime-health.service";

const DRIFT = (n: number) =>
  `${n} payment/booking drift exception(s) detected (${n} newly recorded) — see GET /api/admin/reconciliation/exceptions`;

test("digest date key is the UTC calendar day", () => {
  assert.equal(adminDigestDateKey(new Date("2026-10-21T23:30:00.000Z")), "2026-10-21");
  assert.equal(adminDigestDateKey(new Date("2026-10-22T00:30:00.000Z")), "2026-10-22");
  assert.equal(ADMIN_DIGEST_SENT_ON_KEY, "admin_daily_digest_sent_on");
});

test("reconciliation mismatches collapse to one row per booking and type", () => {
  const rows = [];
  for (let i = 0; i < 7; i++) {
    rows.push(
      { type: "booking_confirmed_no_pi", bookingId: "booking-a", amount: 10 + i },
      { type: "booking_confirmed_no_pi", bookingId: "booking-b", amount: 20 + i },
    );
  }
  const deduped = dedupeReconciliationMismatches(rows);
  assert.equal(deduped.length, 2);
  assert.equal(deduped[0].bookingId, "booking-a");
  assert.equal(deduped[0].amount, 10, "newest-first copy is kept");
  assert.equal(deduped[1].bookingId, "booking-b");

  const twoTypes = dedupeReconciliationMismatches([
    { type: "booking_confirmed_no_pi", bookingId: "booking-a" },
    { type: "amount_mismatch", bookingId: "booking-a" },
  ]);
  assert.equal(twoTypes.length, 2);

  const byCharge = dedupeReconciliationMismatches([
    { type: "charge_unrecorded", chargeId: "ch_1", amount: 1 },
    { type: "charge_unrecorded", chargeId: "ch_1", amount: 2 },
  ]);
  assert.equal(byCharge.length, 1);
  assert.equal(byCharge[0].amount, 1);

  const byPi = dedupeReconciliationMismatches([
    { type: "payment_intent_unrecorded", paymentIntentId: "pi_1" },
    { type: "payment_intent_unrecorded", paymentIntentId: "pi_1" },
  ]);
  assert.equal(byPi.length, 1);

  const blankBookingUsesCharge = dedupeReconciliationMismatches([
    { type: "charge_unrecorded", bookingId: "  ", chargeId: "ch_9" },
    { type: "charge_unrecorded", chargeId: "ch_9" },
  ]);
  assert.equal(blankBookingUsesCharge.length, 1);
});

test("repeated system drift alerts collapse to the latest count and real leads stay", () => {
  assert.equal(isSystemDriftAlertMessage(DRIFT(2)), true);
  assert.equal(isSystemDriftAlertMessage("Concierge request from a traveler in Kyoto"), false);

  const drift = Array.from({ length: 19 }, (_, i) => ({
    id: i + 1,
    createdAt: new Date(Date.UTC(2026, 9, 21, 8, i)).toISOString(),
    message: DRIFT(i + 1),
    destination: null,
  }));
  const lead = {
    id: 100,
    createdAt: "2026-10-21T12:00:00.000Z",
    message: "Concierge request from a traveler in Kyoto",
    destination: "Kyoto",
  };
  const collapsed = collapseUnresolvedLeadAlerts([...drift, lead]);
  assert.equal(collapsed.length, 2);
  const driftRow = collapsed.find((row) => isSystemDriftAlertMessage(row.message));
  assert.ok(driftRow);
  assert.equal(driftRow.message, DRIFT(19), "the newest drift notification's count is the one kept");
  assert.equal(collapsed.some((row) => row.id === 100), true);

  const leads = Array.from({ length: 25 }, (_, i) => ({
    id: 200 + i,
    createdAt: new Date(Date.UTC(2026, 9, 20, 0, i)).toISOString(),
    message: `Lead ${i}`,
    destination: null,
  }));
  const capped = collapseUnresolvedLeadAlerts([...leads, ...drift]);
  assert.equal(capped.filter((row) => isSystemDriftAlertMessage(row.message)).length, 1);
  assert.equal(capped.filter((row) => !isSystemDriftAlertMessage(row.message)).length, UNRESOLVED_LEAD_CAP);
});

test("payout gaps exclude test, seed, and house accounts and ignore SHOW_DEMO_EXPERTS", () => {
  const prev = process.env.SHOW_DEMO_EXPERTS;
  process.env.SHOW_DEMO_EXPERTS = "1";
  try {
    assert.equal(isDigestPayoutExcluded({ isTest: false, email: "concierge@traveloure.internal" }, null), true);
    assert.equal(isDigestPayoutExcluded({ isTest: false, email: "Concierge@Traveloure.Internal" }, null), true);
    assert.equal(isDigestPayoutExcluded({ isTest: false, email: "a@traveloure-qa.test" }, null), true);
    assert.equal(isDigestPayoutExcluded({ isTest: false, email: "a@traveloure.test" }, null), true);
    assert.equal(isDigestPayoutExcluded({ isTest: false, email: "a@example.com" }, null), true);
    assert.equal(isDigestPayoutExcluded({ isTest: false, email: "ahmed.hassan@traveloure.com" }, null), true);
    assert.equal(isDigestPayoutExcluded({ isTest: true, email: "real-expert@example.net" }, null), true);
    assert.equal(isDigestPayoutExcluded({ isTest: null, email: "real-expert@example.net" }, null), false);
    assert.equal(isDigestPayoutExcluded({ isTest: false, email: "real-expert@example.net" }, null), false);
    assert.equal(isDigestPayoutExcluded({ isTest: false, email: "a@qa.example" }, "qa.example"), true);
    assert.equal(isDigestPayoutExcluded({ isTest: false, email: "a@sub.qa.example" }, "qa.example"), false);
  } finally {
    if (prev === undefined) delete process.env.SHOW_DEMO_EXPERTS;
    else process.env.SHOW_DEMO_EXPERTS = prev;
  }
});

test("QA probe base URL is env-configurable and does not read APP_BASE_URL", () => {
  assert.equal(resolveQaProbeBaseUrl({}), "http://127.0.0.1:5000");
  assert.equal(resolveQaProbeBaseUrl({ PORT: "5001" }), "http://127.0.0.1:5001");
  assert.equal(
    resolveQaProbeBaseUrl({ PORT: "5001", APP_BASE_URL: "https://wrong.example" }),
    "http://127.0.0.1:5001",
  );
  assert.equal(
    resolveQaProbeBaseUrl({ QA_RUNTIME_BASE_URL: " https://app.example.com/ ", PORT: "9" }),
    "https://app.example.com",
  );
  assert.equal(resolveQaProbeTimeoutMs({}), 20_000);
  assert.equal(resolveQaProbeTimeoutMs({ QA_RUNTIME_PROBE_TIMEOUT_MS: "2500" }), 2500);
  assert.equal(resolveQaProbeTimeoutMs({ QA_RUNTIME_PROBE_TIMEOUT_MS: "50" }), 1_000);
  assert.equal(resolveQaProbeTimeoutMs({ QA_RUNTIME_PROBE_TIMEOUT_MS: "999999" }), 120_000);
  assert.equal(resolveQaProbeTimeoutMs({ QA_RUNTIME_PROBE_TIMEOUT_MS: "nope" }), 20_000);
});

test("H1 probes QA_RUNTIME_BASE_URL and aborts at the configured timeout", async () => {
  const ok = http.createServer((req, res) => {
    if (req.url === "/") {
      res.setHeader("content-type", "text/html");
      res.end('<div id="root"></div>');
      return;
    }
    res.setHeader("content-type", "application/json");
    if (req.url === "/api/health") res.end(JSON.stringify({ status: "ok" }));
    else if (req.url === "/api/discover") res.end(JSON.stringify({ services: [] }));
    else if (req.url === "/api/experience-types") res.end(JSON.stringify([]));
    else if (req.url === "/api/fee-bands/expert_standard") res.end(JSON.stringify({ band_key: "expert_standard" }));
    else {
      res.statusCode = 404;
      res.end("{}");
    }
  });
  const hang = http.createServer(() => {
    /* never respond — the probe must abort */
  });
  await new Promise<void>((resolve) => ok.listen(0, "127.0.0.1", () => resolve()));
  await new Promise<void>((resolve) => hang.listen(0, "127.0.0.1", () => resolve()));
  const okPort = (ok.address() as { port: number }).port;
  const hangPort = (hang.address() as { port: number }).port;
  const prevUrl = process.env.QA_RUNTIME_BASE_URL;
  const prevTimeout = process.env.QA_RUNTIME_PROBE_TIMEOUT_MS;
  try {
    process.env.QA_RUNTIME_BASE_URL = `http://127.0.0.1:${okPort}`;
    delete process.env.QA_RUNTIME_PROBE_TIMEOUT_MS;
    const live = await runH1RouteLiveness();
    for (const id of ["H1a", "H1b", "H1c", "H1d", "H1e"] as const) {
      assert.equal(live[id].pass, true, live[id].detail);
    }

    process.env.QA_RUNTIME_BASE_URL = `http://127.0.0.1:${hangPort}`;
    process.env.QA_RUNTIME_PROBE_TIMEOUT_MS = "1000";
    const stalled = await runH1RouteLiveness();
    assert.equal(stalled.H1a.pass, false);
    assert.match(stalled.H1a.detail, /aborted/i);
    assert.match(stalled.H1a.detail, new RegExp(String(hangPort)));
  } finally {
    if (prevUrl === undefined) delete process.env.QA_RUNTIME_BASE_URL;
    else process.env.QA_RUNTIME_BASE_URL = prevUrl;
    if (prevTimeout === undefined) delete process.env.QA_RUNTIME_PROBE_TIMEOUT_MS;
    else process.env.QA_RUNTIME_PROBE_TIMEOUT_MS = prevTimeout;
    await new Promise((resolve) => ok.close(resolve));
    await new Promise((resolve) => hang.close(resolve));
  }
});

test("S4 ignores test fixtures and checklist prose and still flags a real env access by file name only", () => {
  const secretValue = "sk_live_not_a_real_key_do_not_print";
  const testPath = "client/src/lib/__tests__/trip-pass-copy.test.ts";
  assert.equal(isClientSecretsScanExcluded(testPath), true);
  assert.equal(
    clientFileHasSecretsRisk(testPath, `process.env.STRIPE_SECRET_KEY = "${secretValue}"`),
    false,
  );

  const checklist = 'detail: "grep process.env ./client — only NODE_ENV in App.tsx"';
  assert.equal(clientFileHasSecretsRisk("client/src/pages/admin/qa-checklist.tsx", checklist), false);
  assert.equal(clientFileHasSecretsRisk("client/src/App.tsx", 'process.env.NODE_ENV === "development"'), false);
  assert.equal(clientFileHasSecretsRisk("client/src/App.tsx", 'process.env["NODE_ENV"]'), false);

  const risky = "client/src/lib/payments.ts";
  const source = `const key = process.env.STRIPE_SECRET_KEY ?? "${secretValue}";`;
  assert.equal(clientFileHasSecretsRisk(risky, source), true);
  assert.deepEqual(unsafeClientEnvIdents(source), ["STRIPE_SECRET_KEY"]);
  const report = `Secrets risk: ./${risky}`;
  assert.equal(report.includes(secretValue), false);
  assert.match(report, /payments\.ts/);

  assert.equal(clientFileHasSecretsRisk("client/src/lib/dyn.ts", "const v = process.env[name];"), true);
  assert.equal(clientFileHasSecretsRisk("client/src/lib/db.ts", "const v = process.env.DATABASE_URL;"), true);

  const live = listClientSecretsRiskFiles("client");
  assert.deepEqual(live, [], live.join(", "));
});

test("R4 payment routes have no console.log", () => {
  const out = execSync(
    "grep -r 'console\\.log' ./server/routes --include='*.ts' | grep -i 'payment\\|stripe\\|charge' | grep -v 'console\\.error\\|console\\.warn\\|console\\.info' | wc -l",
    { encoding: "utf8" },
  ).trim();
  assert.equal(parseInt(out, 10), 0);
});

test("digest claim is once per UTC date and a release allows a retry", { skip: process.env.JOURNEY_DB_WRITES_OK !== "1" }, async () => {
  const { sql } = await import("drizzle-orm");
  const { db } = await import("../db");
  const { claimAdminDigestSend, releaseAdminDigestClaim } = await import("../services/admin-digest-claim");
  const { digestPayoutExcludedSql: excludedSql, isDigestPayoutExcluded: excluded } = await import("../services/admin-digest-shape");

  const cases = [
    { isTest: false, email: "concierge@traveloure.internal" },
    { isTest: false, email: "a@traveloure-qa.test" },
    { isTest: true, email: "real-expert@example.net" },
    { isTest: false, email: "real-expert@example.net" },
  ];
  for (const row of cases) {
    const result = await db.execute(sql`
      SELECT ${excludedSql(sql`${row.isTest}`, sql`${row.email}`)} AS excluded
    `);
    const value = (result as { rows: Array<{ excluded: boolean }> }).rows[0]?.excluded;
    assert.equal(value === true, excluded(row), `${row.email} sql=${String(value)}`);
  }

  const prev = await db.execute(sql`
    SELECT setting_value, description FROM platform_settings WHERE setting_key = ${ADMIN_DIGEST_SENT_ON_KEY}
  `);
  const previous = (prev as { rows: Array<{ setting_value: string; description: string | null }> }).rows[0];
  await db.execute(sql`DELETE FROM platform_settings WHERE setting_key = ${ADMIN_DIGEST_SENT_ON_KEY}`);
  try {
    const [first, second] = await Promise.all([
      claimAdminDigestSend("2099-01-01"),
      claimAdminDigestSend("2099-01-01"),
    ]);
    assert.equal([first, second].filter(Boolean).length, 1, "one of two same-day claims wins");
    assert.equal(await claimAdminDigestSend("2099-01-01"), false);
    assert.equal(await claimAdminDigestSend("2099-01-02"), true);
    await releaseAdminDigestClaim("2099-01-01");
    const still = await db.execute(sql`
      SELECT setting_value FROM platform_settings WHERE setting_key = ${ADMIN_DIGEST_SENT_ON_KEY}
    `);
    assert.equal((still as { rows: Array<{ setting_value: string }> }).rows[0]?.setting_value, "2099-01-02");
    await releaseAdminDigestClaim("2099-01-02");
    assert.equal(await claimAdminDigestSend("2099-01-02"), true);
  } finally {
    await db.execute(sql`DELETE FROM platform_settings WHERE setting_key = ${ADMIN_DIGEST_SENT_ON_KEY}`);
    if (previous) {
      await db.execute(sql`
        INSERT INTO platform_settings (setting_key, setting_value, description, updated_at)
        VALUES (${ADMIN_DIGEST_SENT_ON_KEY}, ${previous.setting_value}, ${previous.description}, NOW())
      `);
    }
  }
});
