/**
 * PRODUCTION NEVER SHOWS GENERATED EVENTS — board task #317, ledger `2026-09-23-phase2-honesty`.
 *
 * When Fever is not configured, has no catalog, or its API fails, `feverService` used to answer with
 * generated events — invented names, dates, venues and prices — on every surface that lists events,
 * including production. A traveler could plan around an event that does not exist (§13).
 *
 *   F1  In a prod-strict boot an unreadable Fever answers an EMPTY search and no event by id.
 *   F2  Outside production (and in CI's ALLOW_TEST_ACCOUNTS=1 boot) the generated set is kept for
 *       development, under the same `demoSeedsAllowed` predicate that gates all demo content.
 *
 * No network: the service has no credentials in this test, so it never calls Fever.
 *   npx tsx --test server/__tests__/fever-no-generated-events.test.ts
 */
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { feverService } from "../services/fever.service";

const saved = { NODE_ENV: process.env.NODE_ENV, ALLOW_TEST_ACCOUNTS: process.env.ALLOW_TEST_ACCOUNTS, ENVIRONMENT: process.env.ENVIRONMENT };

function setEnv(values: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries(values)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

afterEach(() => setEnv(saved));

test("F1: prod-strict — no generated events, no generated event by id", async () => {
  assert.equal(feverService.isCatalogReady(), false, "precondition: Fever is not configured here");
  setEnv({ NODE_ENV: "production", ALLOW_TEST_ACCOUNTS: undefined, ENVIRONMENT: undefined });
  const result = await feverService.searchEvents({ city: "Kyoto", limit: 5 });
  assert.ok(result, "a supported city still answers");
  assert.deepEqual(result.events, [], "an empty list, never invented events");
  assert.equal(result.total, 0);
  assert.equal(await feverService.getEventById("mock-kyo-1"), null);
});

test("F2: development and the CI escape hatch keep the generated set", async () => {
  setEnv({ NODE_ENV: "development", ALLOW_TEST_ACCOUNTS: undefined, ENVIRONMENT: undefined });
  const dev = await feverService.searchEvents({ city: "Kyoto", limit: 3 });
  assert.ok(dev && dev.events.length > 0, "development still has sample events");

  setEnv({ NODE_ENV: "production", ALLOW_TEST_ACCOUNTS: "1" });
  const ci = await feverService.searchEvents({ city: "Kyoto", limit: 3 });
  assert.ok(ci && ci.events.length > 0, "the CI boot keeps them too");
});
