/**
 * VD-1 — sandbox contract test for the live Viator search (ledger `2026-10-18-viator-direct-live`).
 *
 *   C1 Viator's own destinations list names id 332 as Kyoto (the one destination id the config states)
 *   C2 a live sandbox `/products/search` for Kyoto answers `ok`, and every link it returns is an https
 *      viator.com page carrying our `campaign` and no key
 *
 * It calls the REAL Viator sandbox, so it runs only where `VIATOR_SANDBOX_API_KEY` is set (CI takes it
 * from the GitHub Actions secret of the same name). Without the key it SKIPS and says so — a skip is not a
 * pass. The key is sent in the `exp-api-key` header only and is never printed.
 *
 *   VIATOR_SANDBOX_API_KEY=… npx tsx --test --test-force-exit server/__tests__/vd1-viator-sandbox-contract.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { searchViatorLive } from "../services/viator-live.service";
import { VIATOR_SANDBOX_BASE_URL, VIATOR_DESTINATION_IDS } from "../config/viator.config";

const KEY = process.env.VIATOR_SANDBOX_API_KEY;
const skip = KEY ? false : "VIATOR_SANDBOX_API_KEY is not set — the sandbox contract was NOT checked";
const env = { VIATOR_DIRECT_ENABLED: "1", VIATOR_SANDBOX_API_KEY: KEY, VIATOR_ENV: "sandbox" };

test("C1 Viator's destinations list names 332 as Kyoto", { skip }, async () => {
  const res = await fetch(`${VIATOR_SANDBOX_BASE_URL}/destinations`, {
    headers: { "exp-api-key": KEY!, Accept: "application/json;version=2.0", "Accept-Language": "en-US" },
  });
  assert.equal(res.status, 200, `destinations answered ${res.status}`);
  const data: any = await res.json();
  const list: any[] = data?.destinations ?? [];
  const kyoto = list.find((d) => String(d.destinationId) === VIATOR_DESTINATION_IDS.kyoto);
  assert.ok(kyoto, "destination 332 is listed");
  assert.match(String(kyoto.name), /kyoto/i);
});

test("C2 a live sandbox search for Kyoto answers ok with campaign-tagged viator.com links", { skip }, async () => {
  const res = await searchViatorLive({ city: "Kyoto", surface: "browse", count: 5 }, { env });
  assert.equal(res.status, "ok");
  for (const item of res.items) {
    if (!item.productUrl) continue;
    const u = new URL(item.productUrl);
    assert.equal(u.protocol, "https:");
    assert.match(u.hostname, /(^|\.)viator\.com$/);
    assert.equal(u.searchParams.get("campaign"), "traveloure_browse");
    assert.ok(!item.productUrl.includes(KEY!), "no key in a link");
  }
});
