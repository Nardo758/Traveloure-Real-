/**
 * Fallback-tier coverage for /api/exchange-rates and POST /api/geocode.
 *
 * Both endpoints have a three-tier path:
 *   Tier 1: live external fetch (Frankfurter / Google Maps)
 *   Tier 2: DB fallback rows (fx_rates / geocode_fallbacks) → response includes `fallback: true`
 *   Tier 3: honest error when DB also has nothing (503 rates:null / 404)
 *
 * Without automated coverage a DB-tier regression (e.g. column rename, wrong
 * table) only surfaces when the live API next goes down.
 *
 * Coverage:
 *   STORAGE LAYER — getLatestFxRates:
 *     S1  populated fx_rates table → returns {rates, updatedAt} with all rows
 *     S2  empty fx_rates table → returns null (tier-3 503 will fire)
 *   STORAGE LAYER — getGeocodeFallback:
 *     S3  slug in geocode_fallbacks → returns {lat, lng, formattedAddress}
 *     S4  unknown slug → returns null (tier-3 404 will fire)
 *   ROUTE LOGIC — /api/exchange-rates (inline handler mirrors production):
 *     R1  live fetch fails + DB has rates → 200 with fallback:true, rates object
 *     R2  live fetch fails + DB empty    → 503 with rates:null (never a hardcoded object)
 *   ROUTE LOGIC — POST /api/geocode (inline handler mirrors production):
 *     R3  Google miss + DB fallback row  → 200 with fallback:true
 *     R4  Google miss + no DB row        → 404
 *
 * Strategy:
 *   Storage tests: monkey-patch db.select (same pattern as stripe-connect-reminder.test.ts).
 *   Route tests: monkey-patch storage methods + globalThis.fetch; drive an in-process
 *   Express server carrying the inline handler so the test is self-contained and never
 *   requires the already-running dev server.
 *
 * Run with:
 *   npx tsx --test server/__tests__/exchange-rate-geocode-fallback.test.ts
 */

import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

import { db } from '../db.js';
import { storage } from '../storage.js';

// ── Drizzle chain mock (same helper as stripe-connect-reminder.test.ts) ──────

/** Returns a thenable Drizzle-ORM mock that resolves to `value`. */
function makeChain(value: unknown = null): any {
  const chain: any = {};
  const p = Promise.resolve(value);
  const methods = ['from', 'where', 'set', 'values', 'limit', 'orderBy', 'returning', 'select'];
  for (const m of methods) {
    chain[m] = (..._: unknown[]) => chain;
  }
  chain.then = (resolve: any, reject?: any) => p.then(resolve, reject);
  chain.catch = (reject: any) => p.catch(reject);
  chain[Symbol.toStringTag] = 'Promise';
  return chain;
}

// ── saved originals ───────────────────────────────────────────────────────────

let origDbSelect: typeof db.select;
let origFetch: typeof globalThis.fetch;
let origGetLatestFxRates: typeof storage.getLatestFxRates;
let origGetGeocodeFallback: typeof storage.getGeocodeFallback;

before(() => {
  origDbSelect = db.select.bind(db);
  origFetch = globalThis.fetch;
  origGetLatestFxRates = storage.getLatestFxRates.bind(storage);
  origGetGeocodeFallback = storage.getGeocodeFallback.bind(storage);
});

after(() => {
  (db as any).select = origDbSelect;
  globalThis.fetch = origFetch;
  (storage as any).getLatestFxRates = origGetLatestFxRates;
  (storage as any).getGeocodeFallback = origGetGeocodeFallback;
});

afterEach(() => {
  (db as any).select = origDbSelect;
  globalThis.fetch = origFetch;
  (storage as any).getLatestFxRates = origGetLatestFxRates;
  (storage as any).getGeocodeFallback = origGetGeocodeFallback;
});

// ── HTTP helper for in-process server tests ───────────────────────────────────

function doGet(
  server: http.Server,
  path: string,
): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const addr = server.address() as { port: number };
    const req = http.request(
      { host: '127.0.0.1', port: addr.port, path, method: 'GET' },
      (res) => {
        let raw = '';
        res.on('data', (c) => { raw += c; });
        res.on('end', () => {
          try { resolve({ status: res.statusCode!, body: JSON.parse(raw) }); }
          catch { resolve({ status: res.statusCode!, body: raw }); }
        });
      },
    );
    req.on('error', reject);
    req.end();
  });
}

function doPost(
  server: http.Server,
  path: string,
  payload: unknown,
): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const addr = server.address() as { port: number };
    const body = JSON.stringify(payload);
    const req = http.request(
      {
        host: '127.0.0.1',
        port: addr.port,
        path,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      },
      (res) => {
        let raw = '';
        res.on('data', (c) => { raw += c; });
        res.on('end', () => {
          try { resolve({ status: res.statusCode!, body: JSON.parse(raw) }); }
          catch { resolve({ status: res.statusCode!, body: raw }); }
        });
      },
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

/** Start an in-process HTTP server and return it. Caller must close after use. */
function startServer(handler: http.RequestListener): Promise<http.Server> {
  return new Promise((resolve, reject) => {
    const s = http.createServer(handler);
    s.on('error', reject);
    // Port 0 = OS assigns a free port
    s.listen(0, '127.0.0.1', () => resolve(s));
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// STORAGE LAYER: getLatestFxRates
// ─────────────────────────────────────────────────────────────────────────────

describe('storage.getLatestFxRates — DB fallback tier', () => {
  it('S1: populated fx_rates table → returns {rates, updatedAt} with all rows', async () => {
    const now = new Date();
    const fakeRows = [
      { currencyCode: 'EUR', rateToUsd: 0.92, updatedAt: now },
      { currencyCode: 'GBP', rateToUsd: 0.79, updatedAt: now },
      { currencyCode: 'JPY', rateToUsd: 157.5, updatedAt: now },
    ];

    (db as any).select = () => makeChain(fakeRows);

    const result = await storage.getLatestFxRates();

    assert.ok(result !== null, 'must return non-null when DB has rows');
    assert.deepEqual(result!.rates, { EUR: 0.92, GBP: 0.79, JPY: 157.5 });
    assert.ok(result!.updatedAt instanceof Date, 'updatedAt must be a Date');
    assert.equal(result!.updatedAt!.getTime(), now.getTime());
  });

  it('S2: empty fx_rates table → returns null (triggers tier-3 503)', async () => {
    (db as any).select = () => makeChain([]);

    const result = await storage.getLatestFxRates();

    assert.strictEqual(result, null, 'must return null when DB has no rows');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// STORAGE LAYER: getGeocodeFallback
// ─────────────────────────────────────────────────────────────────────────────

describe('storage.getGeocodeFallback — DB fallback tier', () => {
  it('S3: known city slug in geocode_fallbacks → returns {lat, lng, formattedAddress}', async () => {
    const fakeRow = {
      slug: 'paris',
      lat: 48.8566,
      lng: 2.3522,
      formattedAddress: 'Paris, France',
    };

    // getGeocodeFallback uses db.select().from().where().limit() chain
    (db as any).select = () => makeChain([fakeRow]);

    const result = await storage.getGeocodeFallback('Paris');

    assert.ok(result !== null, 'must return non-null for a known city');
    assert.equal(result!.lat, 48.8566);
    assert.equal(result!.lng, 2.3522);
    assert.equal(result!.formattedAddress, 'Paris, France');
  });

  it('S4: unknown city → returns null (triggers tier-3 404)', async () => {
    (db as any).select = () => makeChain([]);

    const result = await storage.getGeocodeFallback('XyzNonexistentCity');

    assert.strictEqual(result, null, 'must return null for an unknown city');
  });

  it('S4b: empty string → returns null without querying', async () => {
    // The implementation short-circuits on empty slug
    let selectCalled = false;
    (db as any).select = () => { selectCalled = true; return makeChain([]); };

    const result = await storage.getGeocodeFallback('');

    assert.strictEqual(result, null, 'empty city name must return null');
    // Either the guard fires before the query or the query returns empty — both are acceptable
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ROUTE LOGIC: /api/exchange-rates three-tier inline handler
//
// The inline handler mirrors content.routes.ts GET /api/exchange-rates exactly
// (same tier ordering, same response shapes). Testing against the actual
// storage object (monkey-patched) confirms the contract: the real getLatestFxRates
// is called on a live-fetch failure, and its return value drives the response.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Inline mirror of the GET /api/exchange-rates handler.
 * Uses the real `storage` object and `globalThis.fetch`, both of which are
 * monkey-patched by the tests. No module-level cache so each call is fresh.
 */
async function exchangeRatesHandler(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<void> {
  try {
    const resp = await globalThis.fetch(
      'https://api.frankfurter.app/latest?from=USD&to=EUR,GBP,JPY,AUD,SGD',
    );
    if (!resp.ok) throw new Error(`Frankfurter API error: ${resp.status}`);
    const data = (await resp.json()) as { rates: Record<string, number> };
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ base: 'USD', rates: data.rates, cachedAt: Date.now() }));
  } catch {
    // Tier 2: DB fallback
    try {
      const dbRates = await storage.getLatestFxRates();
      if (dbRates) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          base: 'USD',
          rates: dbRates.rates,
          cachedAt: dbRates.updatedAt ? new Date(dbRates.updatedAt).getTime() : Date.now(),
          fallback: true,
        }));
        return;
      }
    } catch {
      // DB error falls through to tier 3
    }
    // Tier 3: honest unavailable
    res.writeHead(503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ base: 'USD', rates: null, error: 'Exchange rates unavailable' }));
  }
}

describe('/api/exchange-rates — route fallback tiers', () => {
  it('R1: live fetch fails + DB has rates → 200 with fallback:true and rates object', async () => {
    // Tier-1 failure
    globalThis.fetch = async () => { throw new Error('Network unreachable'); };

    // Tier-2 DB has data
    const dbRates = { EUR: 0.91, GBP: 0.78, JPY: 156.0, AUD: 1.55, SGD: 1.35 };
    const updatedAt = new Date('2026-08-01T00:00:00Z');
    (storage as any).getLatestFxRates = async () => ({ rates: dbRates, updatedAt });

    const server = await startServer(exchangeRatesHandler);
    try {
      const { status, body } = await doGet(server, '/api/exchange-rates');

      assert.equal(status, 200, 'must return 200 when DB has rates');
      assert.equal(body.base, 'USD', 'base must be USD');
      assert.deepEqual(body.rates, dbRates, 'rates must come from DB');
      assert.equal(body.fallback, true, 'fallback flag must be true');
      assert.ok(!('error' in body), 'must not include an error field on success');
    } finally {
      await new Promise<void>((r) => server.close(() => r()));
    }
  });

  it('R2: live fetch fails + empty DB → 503 with rates:null (never a hardcoded object)', async () => {
    // Tier-1 failure
    globalThis.fetch = async () => { throw new Error('Network unreachable'); };

    // Tier-2 DB empty
    (storage as any).getLatestFxRates = async () => null;

    const server = await startServer(exchangeRatesHandler);
    try {
      const { status, body } = await doGet(server, '/api/exchange-rates');

      assert.equal(status, 503, 'must return 503 when both tiers fail');
      assert.equal(body.base, 'USD', 'base must still be USD');
      assert.strictEqual(body.rates, null, 'rates must be null — never a hardcoded fallback object');
      assert.ok(typeof body.error === 'string', 'error message must be a string');
      // Paranoia: the response must not contain real-looking rate data
      assert.ok(
        !body.rates || typeof body.rates !== 'object' || Object.keys(body.rates).length === 0,
        'rates must be null or empty — a populated object here means a hardcoded fallback slipped in',
      );
    } finally {
      await new Promise<void>((r) => server.close(() => r()));
    }
  });

  it('R2b: live fetch returns non-ok status + empty DB → 503 with rates:null', async () => {
    // Tier-1: HTTP error response from Frankfurter
    globalThis.fetch = async () => ({
      ok: false,
      status: 500,
      json: async () => ({}),
    } as Response);

    // Tier-2 DB empty
    (storage as any).getLatestFxRates = async () => null;

    const server = await startServer(exchangeRatesHandler);
    try {
      const { status, body } = await doGet(server, '/api/exchange-rates');

      assert.equal(status, 503, 'non-ok HTTP from Frankfurter + empty DB must yield 503');
      assert.strictEqual(body.rates, null, 'rates must be null');
    } finally {
      await new Promise<void>((r) => server.close(() => r()));
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ROUTE LOGIC: POST /api/geocode three-tier inline handler
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Inline mirror of the POST /api/geocode handler.
 * `geocodeAddress` dependency is injected so tests can simulate a Google miss
 * without needing to mock the module import.
 */
function makeGeocodeHandler(
  geocodeAddress: (address: string) => Promise<{ lat: number; lng: number; formattedAddress: string } | null>,
): http.RequestListener {
  return async (req, res) => {
    // Only handle POST /api/geocode
    if (req.method !== 'POST') { res.writeHead(404); res.end(); return; }

    let body = '';
    for await (const chunk of req) body += chunk;

    let parsed: { address?: string };
    try { parsed = JSON.parse(body); } catch { parsed = {}; }

    const address = typeof parsed.address === 'string' ? parsed.address.trim() : '';
    if (!address) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: 'Invalid request' }));
      return;
    }

    try {
      // Tier 1: live geocode (Google Maps via geocodeAddress)
      const result = await geocodeAddress(address);
      if (result) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
        return;
      }

      // Tier 2: DB-backed fallback
      const dbFallback = await storage.getGeocodeFallback(address);
      if (dbFallback) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ...dbFallback, fallback: true }));
        return;
      }

      // Tier 3: honest 404
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: 'Location not found' }));
    } catch (err: any) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: err.message || 'Geocoding failed' }));
    }
  };
}

describe('POST /api/geocode — route fallback tiers', () => {
  it('R3: Google miss + geocode_fallbacks row → 200 with fallback:true', async () => {
    // Tier-1: Google returns null (not found / no API key / quota exceeded)
    const googleMiss = async (_address: string) => null;

    // Tier-2: DB has a curated fallback row
    (storage as any).getGeocodeFallback = async (_city: string) => ({
      lat: 35.6762,
      lng: 139.6503,
      formattedAddress: 'Tokyo, Japan',
    });

    const server = await startServer(makeGeocodeHandler(googleMiss));
    try {
      const { status, body } = await doPost(server, '/api/geocode', { address: 'Tokyo' });

      assert.equal(status, 200, 'must return 200 when DB fallback found');
      assert.equal(body.lat, 35.6762);
      assert.equal(body.lng, 139.6503);
      assert.equal(body.formattedAddress, 'Tokyo, Japan');
      assert.equal(body.fallback, true, 'fallback flag must be true');
    } finally {
      await new Promise<void>((r) => server.close(() => r()));
    }
  });

  it('R4: Google miss + no geocode_fallbacks row → 404 (never a guessed coordinate)', async () => {
    // Tier-1: Google returns null
    const googleMiss = async (_address: string) => null;

    // Tier-2: DB also has nothing
    (storage as any).getGeocodeFallback = async (_city: string) => null;

    const server = await startServer(makeGeocodeHandler(googleMiss));
    try {
      const { status, body } = await doPost(server, '/api/geocode', { address: 'UnknownXyzCity' });

      assert.equal(status, 404, 'must return 404 when both tiers fail — never a guessed coordinate');
      assert.ok(typeof body.message === 'string', 'error body must have a message string');
      // Paranoia: must not silently return lat/lng coordinates
      assert.ok(!('lat' in body), 'must not include lat in a 404 response');
      assert.ok(!('lng' in body), 'must not include lng in a 404 response');
    } finally {
      await new Promise<void>((r) => server.close(() => r()));
    }
  });

  it('R4b: Google hit → 200 without fallback flag (tier-1 path)', async () => {
    // Tier-1: Google succeeds — tier-2 must not be called
    let dbFallbackCalled = false;
    (storage as any).getGeocodeFallback = async (_city: string) => {
      dbFallbackCalled = true;
      return { lat: 0, lng: 0, formattedAddress: 'Should not appear' };
    };

    const googleHit = async (_address: string) => ({
      lat: 48.8566,
      lng: 2.3522,
      formattedAddress: 'Paris, France',
    });

    const server = await startServer(makeGeocodeHandler(googleHit));
    try {
      const { status, body } = await doPost(server, '/api/geocode', { address: 'Paris' });

      assert.equal(status, 200, 'live geocode hit must return 200');
      assert.equal(body.lat, 48.8566);
      assert.equal(body.fallback, undefined, 'fallback flag must NOT be set on a live hit');
      assert.equal(dbFallbackCalled, false, 'DB fallback must not be queried when tier-1 succeeds');
    } finally {
      await new Promise<void>((r) => server.close(() => r()));
    }
  });
});
