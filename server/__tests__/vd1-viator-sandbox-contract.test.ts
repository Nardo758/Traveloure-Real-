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

const HEADERS = () => ({ "exp-api-key": KEY!, Accept: "application/json;version=2.0", "Accept-Language": "en-US" });

/**
 * The CI job log is not readable from every session, so a failure is ALSO written as a GitHub annotation
 * (`::error`), which the annotations API returns. It names the HTTP status and Viator's own error
 * code/message only — the key is never printed, and is masked if Viator ever echoes it.
 */
function annotate(check: string, detail: string): void {
  const safe = (KEY ? detail.split(KEY).join("[REDACTED]") : detail).replace(/[\r\n]+/g, " ").slice(0, 400);
  console.log(`::error title=Viator sandbox contract ${check}::${safe}`);
}
async function viatorError(res: Response): Promise<string> {
  try {
    const body: any = await res.json();
    return `HTTP ${res.status} code=${body?.code ?? "?"} message=${body?.message ?? "?"}`;
  } catch {
    return `HTTP ${res.status} (no JSON body)`;
  }
}

test("C1 Viator's destinations list names 332 as Kyoto", { skip }, async () => {
  let res: Response;
  try {
    res = await fetch(`${VIATOR_SANDBOX_BASE_URL}/destinations`, { headers: HEADERS() });
  } catch (err) {
    annotate("C1", `GET /destinations did not answer: ${(err as any)?.cause?.code ?? (err as any)?.name ?? "error"}`);
    throw err;
  }
  if (res.status !== 200) {
    const why = await viatorError(res);
    annotate("C1", `GET /destinations: ${why}`);
    assert.fail(`destinations answered ${why}`);
  }
  const data: any = await res.json();
  const list: any[] = data?.destinations ?? [];
  const kyoto = list.find((d) => String(d.destinationId) === VIATOR_DESTINATION_IDS.kyoto);
  if (!kyoto || !/kyoto/i.test(String(kyoto.name))) {
    const named = list.filter((d) => /kyoto/i.test(String(d.name))).map((d) => `${d.destinationId}:${d.name}`).slice(0, 5);
    annotate("C1", `${list.length} destinations; id ${VIATOR_DESTINATION_IDS.kyoto} is ${kyoto ? `"${kyoto.name}"` : "absent"}; Kyoto-named: ${named.join(", ") || "none"}`);
  }
  assert.ok(kyoto, "destination 332 is listed");
  assert.match(String(kyoto.name), /kyoto/i);
});

test("C2 a live sandbox search for Kyoto answers ok with campaign-tagged viator.com links", { skip }, async () => {
  const res = await searchViatorLive({ city: "Kyoto", surface: "browse", count: 5 }, { env });
  if (res.status !== "ok") {
    // Ask once more directly, only to say why (the service deliberately returns a bare status).
    try {
      const raw = await fetch(`${VIATOR_SANDBOX_BASE_URL}/products/search`, {
        method: "POST",
        headers: { ...HEADERS(), "Content-Type": "application/json" },
        body: JSON.stringify({ filtering: { destination: VIATOR_DESTINATION_IDS.kyoto }, sorting: { sort: "DEFAULT" }, pagination: { start: 1, count: 5 }, currency: "USD" }),
      });
      annotate("C2", `service status ${res.status}; POST /products/search: ${raw.ok ? `HTTP ${raw.status}` : await viatorError(raw)}`);
    } catch (err) {
      annotate("C2", `service status ${res.status}; POST /products/search did not answer: ${(err as any)?.cause?.code ?? (err as any)?.name ?? "error"}`);
    }
  }
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
