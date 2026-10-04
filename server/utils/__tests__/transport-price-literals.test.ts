/**
 * No literal prices in the transport resolver (decision-maker, Oct 3, 2026 — ledger
 * `2026-10-03-transport-price-literals`). A price comes from the partner payload, an admin config or
 * the listing itself; otherwise the option shows NO price. And a platform option with no listed price
 * is never charged.
 *   T1 the affiliate route options ("From $5" 12Go, "From $25/day" DiscoverCars, "From $50" Kiwi)
 *      carry no price
 *   T2 no rideshare estimate from hard-coded per-km rates or a "surge" multiplier
 *   T3 the hard-coded multi-day pass catalog (a literal $30 Paris pass) is gone
 *   T4 a platform listing with no price is NOT estimated ("$2/km, $5 minimum")
 *   T5 the platform checkout refuses an option with no listed price — at the route (409) and in the
 *      service — instead of charging an estimate or $0
 *
 * Source pins only (no DB import). Run: npx tsx --test server/utils/__tests__/transport-price-literals.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
const svc = strip(readFileSync(path.join(repo, "server/services/transport-booking-options.service.ts"), "utf8"));

test("T1 affiliate route options carry no literal price", () => {
  assert.doesNotMatch(svc, /From \$\d/);
  assert.doesNotMatch(svc, /priceCentsLow:\s*[1-9][\d_]*/);
});

test("T2 no rideshare estimate from literal rates", () => {
  assert.doesNotMatch(svc, /baseCostPerKm|flagFall/);
  assert.doesNotMatch(svc, /\*\s*1\.5/);
});

test("T3 the literal pass catalog is gone", () => {
  assert.doesNotMatch(svc, /pricePerPerson:\s*\d/);
  assert.doesNotMatch(svc, /Navigo/);
});

test("T4 a listing with no price is not estimated", () => {
  const fn = svc.slice(svc.indexOf("function calculateProviderPrice"), svc.indexOf("function getModeIcon"));
  assert.match(fn, /return null;/);
  assert.doesNotMatch(fn, /Math\.max\(\s*5/);
  assert.doesNotMatch(fn, /distanceKm \* 2\b/);
});

test("T5 the platform checkout refuses an option with no listed price", () => {
  const route = readFileSync(path.join(repo, "server/routes/transport-hub.routes.ts"), "utf8");
  assert.match(route, /status\(409\)\.json\(\{[^}]*code: "no_listed_price"/);
  const stripe = strip(readFileSync(path.join(repo, "server/services/stripe.service.ts"), "utf8"));
  assert.match(stripe, /if \(!option\.priceCentsLow \|\| option\.priceCentsLow <= 0\) \{\s*throw new Error/);
  assert.doesNotMatch(stripe, /option\.priceCentsLow \|\| 0/);
});
