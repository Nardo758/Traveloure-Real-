/**
 * "Getting there" with a FAKE adapter (surface spec §5, R-j; step 2, ledger
 * `2026-10-03-surface-step2-tools-tray`). Nothing here calls the network or the database.
 *   F1  found: the flight comes back, ONE billed call, a cost row written, and the answer cached
 *   F2  the same (flight, date) again is a cache hit — no adapter call, no cost row, not counted
 *   F3  the daily cap refuses BEFORE the adapter is called, and only billed calls count toward it
 *   F4  flag off ⇒ "off" (the sheet's manual path); no call, no row
 *   F5  invalid number / date ⇒ refused before any call; a failed call still writes its cost row
 *   F6  the AeroDataBox body parses to the adapter contract (both time formats)
 *   F7  the anchor body: arrival / departure type, local wall-clock, buffers, flight named;
 *       it passes the anchor route's own admission (insertTemporalAnchorSchema + coerced date)
 *   F8  the manual body: the traveler's own time, never an invented one; flight number normalized
 *   F9  the route: a .strict() body, write-gated, 429 at the cap, and no key in a tracked file
 *   F10 smoke 8 item 3 — the row line: "<flight as entered> · lands <IATA> <HH:MM> · entered by you" /
 *       "… · departs <IATA> <HH:MM> · from lookup", leading zeros kept
 *   F11 smoke 8 item 4 — buffers: arrival after 120 international / 60 domestic, departure before
 *       150 / 90; the far end's country decides, unknown ⇒ international; the route returns it
 *   F12 smoke 8 — a provider failure logs its class, status and message, never the key
 *   F13 smoke 8 item 4 — the draft prompt and the optimizer READ the stored buffer: a 09:05 landing
 *       with 120 min keeps day 1 free until 11:05; a 07:40 departure with 150 min ends day N at 05:10
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { lookupFlight, type FlightLookupDeps } from "../../services/flight-lookup/flight-lookup.core";
import { FlightLookupError, aeroDataBoxAdapter, parseAeroDataBox } from "../../services/flight-lookup/adapter";
import {
  FLIGHT_BUFFER_MIN,
  flightAnchorBody,
  flightBuffers,
  flightRowLine,
  isInternationalFlight,
  manualFlightAnchorBody,
  normalizeFlightNumber,
  type FlightInfo,
} from "@shared/getting-there";
import { insertTemporalAnchorSchema } from "@shared/schema";
import { buildAnchorPromptBlock, parseAnchorConstraints } from "../../services/smart-sequencing.service";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const JL61: FlightInfo = { carrier: "Japan Airlines", number: "JL 61", depAirport: "LAX", arrAirport: "KIX", depAt: "2026-11-10T11:00", arrAt: "2026-11-11T15:25", terminal: "1", depCountry: null, arrCountry: null };

function fakeDeps(over: Partial<FlightLookupDeps> & { answer?: FlightInfo | null; throws?: boolean } = {}) {
  const calls: string[] = [];
  const rows: any[] = [];
  const cache = new Map<string, { flight: FlightInfo | null }>();
  const deps: FlightLookupDeps = {
    adapter: {
      provider: "fake",
      async lookup(no, date) {
        calls.push(`${no}:${date}`);
        if (over.throws) throw new Error("boom");
        return over.answer === undefined ? JL61 : over.answer;
      },
    },
    enabled: () => true,
    cap: () => 2,
    costCents: () => 1,
    cacheGet: async (k) => cache.get(k) ?? null,
    cacheSet: async (k, v) => void cache.set(k, v),
    countToday: async () => rows.length,
    logUsage: async (r) => void rows.push(r),
    ...over,
  };
  return { deps, calls, rows, cache };
}

test("F1 + F2: found, billed once, cached", async () => {
  const f = fakeDeps();
  const a = await lookupFlight({ flightNumber: "jl 061", date: "2026-11-11", userId: "u1" }, f.deps);
  assert.deepEqual(a, { kind: "found", flight: JL61, cached: false });
  assert.deepEqual(f.calls, ["JL61:2026-11-11"]);
  assert.equal(f.rows.length, 1);
  assert.equal(f.rows[0].costCents, 1);
  const b = await lookupFlight({ flightNumber: "JL61", date: "2026-11-11", userId: "u2" }, f.deps);
  assert.deepEqual(b, { kind: "found", flight: JL61, cached: true });
  assert.equal(f.calls.length, 1, "no second call");
  assert.equal(f.rows.length, 1, "a cache hit writes no cost row");
});

test("F3: the cap refuses before the adapter; only billed calls count", async () => {
  const f = fakeDeps();
  await lookupFlight({ flightNumber: "JL61", date: "2026-11-11", userId: null }, f.deps);
  await lookupFlight({ flightNumber: "JL61", date: "2026-11-11", userId: null }, f.deps); // cache hit, not counted
  await lookupFlight({ flightNumber: "NH5", date: "2026-11-11", userId: null }, f.deps);
  const capped = await lookupFlight({ flightNumber: "UA837", date: "2026-11-11", userId: null }, f.deps);
  assert.deepEqual(capped, { kind: "cap_reached", cap: 2 });
  assert.equal(f.calls.length, 2);
});

test("F4: flag off ⇒ off", async () => {
  const f = fakeDeps({ enabled: () => false });
  assert.deepEqual(await lookupFlight({ flightNumber: "JL61", date: "2026-11-11", userId: null }, f.deps), { kind: "off" });
  assert.equal(f.calls.length + f.rows.length, 0);
});

test("F5: invalid input refused; a failed call still records its cost; not found is cached", async () => {
  const f = fakeDeps();
  assert.deepEqual(await lookupFlight({ flightNumber: "hello", date: "2026-11-11", userId: null }, f.deps), { kind: "invalid", reason: "flight_number" });
  assert.deepEqual(await lookupFlight({ flightNumber: "JL61", date: "11/11/2026", userId: null }, f.deps), { kind: "invalid", reason: "date" });
  assert.equal(f.calls.length, 0);
  const e = fakeDeps({ throws: true });
  assert.deepEqual(await lookupFlight({ flightNumber: "JL61", date: "2026-11-11", userId: null }, e.deps), { kind: "error" });
  assert.equal(e.rows.length, 1);
  assert.equal(e.rows[0].success, false);
  const n = fakeDeps({ answer: null });
  assert.deepEqual(await lookupFlight({ flightNumber: "JL61", date: "2026-11-11", userId: null }, n.deps), { kind: "not_found", cached: false });
  assert.deepEqual(await lookupFlight({ flightNumber: "JL61", date: "2026-11-11", userId: null }, n.deps), { kind: "not_found", cached: true });
  assert.equal(n.calls.length, 1);
});

test("F6: AeroDataBox parse", () => {
  const newer = [{ number: "JL 61", airline: { name: "Japan Airlines" }, departure: { airport: { iata: "LAX" }, scheduledTime: { local: "2026-11-10 11:00-08:00" } }, arrival: { airport: { iata: "KIX" }, scheduledTime: { local: "2026-11-11 15:25+09:00" }, terminal: "1" } }];
  assert.deepEqual(parseAeroDataBox(newer), JL61);
  const older = [{ number: "JL 61", airline: { name: "Japan Airlines" }, departure: { airport: { iata: "LAX" }, scheduledTimeLocal: "2026-11-10 11:00-08:00" }, arrival: { airport: { iata: "KIX" }, scheduledTimeLocal: "2026-11-11 15:25+09:00", terminal: "1" } }];
  assert.deepEqual(parseAeroDataBox(older), JL61);
  // Each airport's country, when the provider gives it.
  const withCountries = [{ ...newer[0], departure: { ...newer[0].departure, airport: { iata: "LAX", countryCode: "us" } }, arrival: { ...newer[0].arrival, airport: { iata: "KIX", countryCode: "JP" } } }];
  assert.deepEqual(parseAeroDataBox(withCountries), { ...JL61, depCountry: "US", arrCountry: "JP" });
  assert.equal(parseAeroDataBox([]), null);
  assert.equal(parseAeroDataBox([{ number: "X", departure: {}, arrival: {} }]), null);
  assert.equal(normalizeFlightNumber("ba 0283"), "BA283");
  assert.equal(normalizeFlightNumber("12345"), null);
});

const anchorAdmission = insertTemporalAnchorSchema.extend({ anchorDatetime: z.coerce.date() });

test("F7: the anchor body and the route's admission", () => {
  const arr = flightAnchorBody("arrival", JL61, { entered: "JL 061", international: true });
  assert.equal(arr.anchorType, "flight_arrival");
  assert.equal(arr.anchorDatetime, "2026-11-11T15:25:00");
  assert.equal(arr.bufferAfter, 120);
  assert.equal(arr.location, "KIX");
  assert.equal(arr.description, "JL 061 · lands KIX 15:25 · from lookup");
  const dep = flightAnchorBody("departure", { ...JL61, depAirport: "KIX", arrAirport: "HND", depAt: "2026-11-15T07:40", arrAt: "2026-11-15T09:00", terminal: null }, { entered: "JL 226", international: false });
  assert.equal(dep.anchorType, "flight_departure");
  assert.equal(dep.anchorDatetime, "2026-11-15T07:40:00");
  assert.equal(dep.bufferBefore, 90);
  assert.equal(dep.description, "JL 226 · departs KIX 07:40 · from lookup");
  // No entered text ⇒ the provider's number stands in.
  assert.equal(flightAnchorBody("arrival", JL61).description, "JL 61 · lands KIX 15:25 · from lookup");
  for (const body of [arr, dep]) assert.ok(anchorAdmission.safeParse({ ...body, tripId: "t1" }).success);
});

test("F8: the manual body", () => {
  const m = manualFlightAnchorBody("arrival", { date: "2026-11-11", time: "09:05", flightNumber: "JL 061", airport: "kix" });
  assert.equal(m.anchorDatetime, "2026-11-11T09:05:00");
  assert.equal(m.description, "JL 061 · lands KIX 09:05 · entered by you");
  assert.equal(m.bufferAfter, 120, "the manual path does not know the origin ⇒ the international buffer");
  assert.ok(anchorAdmission.safeParse({ ...m, tripId: "t1" }).success);
  assert.equal(manualFlightAnchorBody("departure", { date: "2026-11-15", time: "09:00" }).description, "departs 09:00 · entered by you");
  assert.equal(manualFlightAnchorBody("departure", { date: "2026-11-15", time: "09:00" }).bufferBefore, 150);
});

test("F9: the route, and no key in a tracked file", () => {
  const src = readFileSync(path.join(repo, "server/routes/trips.routes.ts"), "utf8");
  const at = src.indexOf('router.post("/api/trips/:tripId/flight-lookup"');
  assert.ok(at > 0);
  const route = src.slice(src.lastIndexOf("const flightLookupBody", at), src.indexOf("\n});\n", at));
  assert.match(route, /\.strict\(\)/);
  assert.match(route, /requireWriteAccess: true/);
  assert.match(route, /status\(429\)/);
  // The key lives in deployment config only.
  const cfg = readFileSync(path.join(repo, "server/config/flight-lookup.config.ts"), "utf8");
  assert.match(cfg, /process\.env\.FLIGHT_LOOKUP_API_KEY/);
  const offenders: string[] = [];
  const walk = (dir: string) => {
    for (const e of readdirSync(dir)) {
      if (["node_modules", ".git", "dist", "attached_assets"].includes(e)) continue;
      const full = path.join(dir, e);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(ts|tsx|js|cjs|json|ya?ml|env|md)$/.test(e) && /FLIGHT_LOOKUP_API_KEY\s*[=:]\s*["']?[A-Za-z0-9]{16,}/.test(readFileSync(full, "utf8"))) offenders.push(full);
    }
  };
  for (const d of ["server", "shared", "client/src", ".github", "scripts"]) walk(path.join(repo, d));
  assert.deepEqual(offenders, []);
});

test("F10: the flight row line", () => {
  assert.equal(flightRowLine({ direction: "arrival", entered: "  JL  061 ", airport: "kix", time: "09:05", source: "entered" }), "JL 061 · lands KIX 09:05 · entered by you");
  assert.equal(flightRowLine({ direction: "departure", entered: "NH 0007", airport: "KIX", time: "07:40", source: "lookup" }), "NH 0007 · departs KIX 07:40 · from lookup");
  // A part nobody gave is omitted, never invented.
  assert.equal(flightRowLine({ direction: "arrival", entered: null, airport: null, time: "09:05", source: "entered" }), "lands 09:05 · entered by you");
  assert.equal(flightRowLine({ direction: "arrival", entered: "JL 61", airport: "KIX", time: "9:05", source: "entered" }), "JL 61 · lands KIX · entered by you");
});

test("F11: buffers follow the far end's country; unknown ⇒ international", () => {
  assert.deepEqual(FLIGHT_BUFFER_MIN, { arrivalAfter: { international: 120, domestic: 60 }, departureBefore: { international: 150, domestic: 90 } });
  assert.deepEqual(flightBuffers("arrival", true), { bufferBefore: 0, bufferAfter: 120 });
  assert.deepEqual(flightBuffers("arrival", false), { bufferBefore: 0, bufferAfter: 60 });
  assert.deepEqual(flightBuffers("arrival", null), { bufferBefore: 0, bufferAfter: 120 });
  assert.deepEqual(flightBuffers("departure", true), { bufferBefore: 150, bufferAfter: 0 });
  assert.deepEqual(flightBuffers("departure", false), { bufferBefore: 90, bufferAfter: 0 });
  assert.deepEqual(flightBuffers("departure", null), { bufferBefore: 150, bufferAfter: 0 });
  const lax = { ...JL61, depCountry: "US", arrCountry: "JP" };
  assert.equal(isInternationalFlight("arrival", lax, "JP"), true, "an arrival from LAX into Japan");
  assert.equal(isInternationalFlight("arrival", { ...lax, depCountry: "JP" }, "jp"), false, "HND → KIX");
  assert.equal(isInternationalFlight("departure", { ...lax, depCountry: "JP", arrCountry: "US" }, "JP"), true);
  assert.equal(isInternationalFlight("departure", { ...lax, arrCountry: null }, "JP"), null);
  assert.equal(isInternationalFlight("arrival", lax, null), null);
  // The route answers it for the plan's own market.
  const src = readFileSync(path.join(repo, "server/routes/trips.routes.ts"), "utf8");
  const at = src.indexOf('router.post("/api/trips/:tripId/flight-lookup"');
  const route = src.slice(at, src.indexOf("\n});\n", at));
  assert.match(route, /isInternationalFlight\("arrival"/);
  assert.match(route, /isInternationalFlight\("departure"/);
  assert.match(route, /marketKey === trip\.marketSlug/);
});

test("F12: a provider failure logs class, status and message — never the key", async () => {
  const saved = { fetch: globalThis.fetch, key: process.env.FLIGHT_LOOKUP_API_KEY, warn: console.warn };
  process.env.FLIGHT_LOOKUP_API_KEY = "test-key-should-never-be-logged-0123456789";
  (globalThis as any).fetch = async () => ({ ok: false, status: 403, text: async () => JSON.stringify({ message: "You are not subscribed to this API." }) });
  const lines: string[] = [];
  console.warn = (...a: unknown[]) => void lines.push(a.map(String).join(" "));
  try {
    await assert.rejects(aeroDataBoxAdapter.lookup("JL61", "2026-11-11"), (e: any) => e instanceof FlightLookupError && e.status === 403 && e.providerMessage === "You are not subscribed to this API.");
    const { deps } = fakeDeps({ adapter: aeroDataBoxAdapter });
    assert.deepEqual(await lookupFlight({ flightNumber: "JL61", date: "2026-11-11", userId: null }, deps), { kind: "error" });
  } finally {
    (globalThis as any).fetch = saved.fetch;
    if (saved.key === undefined) delete process.env.FLIGHT_LOOKUP_API_KEY;
    else process.env.FLIGHT_LOOKUP_API_KEY = saved.key;
    console.warn = saved.warn;
  }
  const line = lines.find((l) => l.startsWith("[flight-lookup]"))!;
  assert.match(line, /class=FlightLookupError/);
  assert.match(line, /status=403/);
  assert.match(line, /You are not subscribed to this API\./);
  assert.doesNotMatch(lines.join("\n"), /test-key-should-never-be-logged/);
});

test("F13: the draft prompt and the optimizer read the buffer", () => {
  const arr = manualFlightAnchorBody("arrival", { date: "2027-11-11", time: "09:05", flightNumber: "JL 061", airport: "KIX" });
  const dep = flightAnchorBody("departure", { ...JL61, depAirport: "KIX", arrAirport: "LAX", depAt: "2027-11-15T07:40", arrAt: "2027-11-15T01:00", terminal: null }, { international: true });
  const anchors = [arr, dep].map((b) => ({ ...b, anchorDatetime: String(b.anchorDatetime) })) as any[];
  // The free draft's prompt block (both generator rails call it).
  const block = buildAnchorPromptBlock(anchors, [], "2027-11-11");
  assert.match(block, /Day 1: .*09:05.*before 11:05/);
  assert.match(block, /Day 5: .*07:40.*after 05:10/);
  // The optimizer's own parse carries the same minutes into its constraints and its prompt.
  const parsed = parseAnchorConstraints(anchors, "2027-11-11");
  assert.deepEqual(parsed.map((a) => [a.anchorType, a.bufferBefore, a.bufferAfter]), [["flight_arrival", 0, 120], ["flight_departure", 150, 0]]);
  const opt = readFileSync(path.join(repo, "server/itinerary-optimizer.ts"), "utf8");
  assert.match(opt, /anchorConstraints = parseAnchorConstraints\(anchors, startDate\)/);
  assert.match(opt, /anchor\.bufferAfter\}min buffer after/);
});
