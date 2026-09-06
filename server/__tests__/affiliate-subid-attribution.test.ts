/**
 * AFFILIATE ATTRIBUTION IS PER REQUEST — the sub_id seam, proved.
 * Ledger `2026-09-05-affiliate-subid-live`; MONEY_MAP F-5 (was DORMANT, now LIVE).
 *
 * Every proof below is a §13/§16 honesty rule a plausible-looking implementation gets wrong:
 *
 *   B1  a partner whose link carries an attribution parameter gets the booking-request id
 *       appended to it — `<marker>.<requestId>`, the Travelpayouts convention.
 *   B2  a partner with NO attribution parameter gets the URL back BYTE-IDENTICAL — never a
 *       fabricated `?sub_id=` the partner never asked for — and the return shape SAYS SO.
 *   B3  the rest of the query string survives untouched.
 *   B4  the link's OWN marker half survives; the account marker is only the empty-value fallback.
 *   B5  the builder never throws — a malformed URL and an absent request id come back unchanged
 *       with a stated reason, because a booking link matters more than a token.
 *   B6  it is IDEMPOTENT: the tracked open re-runs it on a stored URL and gets the same bytes.
 *   R1  the builder's output ROUND-TRIPS through `parseAttributionSubId` back to exactly the
 *       request id — the equality the reconciliation matcher keys on.
 *   R2  a partner report row whose sub_id was built by the builder resolves to that request id,
 *       from `sub_id` or from the `long_sub_id` fallback.
 *   R3  an UNPARSEABLE sub_id (a bare marker, an unrelated format) yields a NULL token and the
 *       raw value verbatim — it is reported, never guessed onto a nearby booking request.
 *   R4  the token match is EXACT string equality on the internal row's recorded request id, and
 *       an unparseable case therefore stays UNMATCHED (no fuzzy fallback can rescue it, because
 *       the only rows this pass exists for carry a 0.00 commission the fuzzy pass rejects).
 *   S1  §16 STATIC PIN: the outbound URL never leaves in a response BODY. The tracked open 302s,
 *       both list readers strip `affiliate_url`, and the PATCH strips it too.
 *
 * PURE — no DB, no server, no network, no DOM. `affiliate-attribution.service.ts` deliberately
 * imports nothing that reaches `server/db` (which throws without DATABASE_URL), which is exactly
 * why the matcher's two decisions live there beside the builder rather than in
 * `affiliate-reconciliation.service.ts`.
 *
 * Run: npx tsx --test server/__tests__/affiliate-subid-attribution.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

process.env.TRAVELPAYOUTS_MARKER = "405110";

const {
  buildAttributedAffiliateUrl,
  supportsAttributionSubId,
  resolveExternalAttributionToken,
  selectTokenMatchCandidate,
  ATTRIBUTION_PARAMS,
} = await import("../services/affiliate-attribution.service");
const { parseAttributionSubId } = await import("../services/travelpayouts/travelpayouts-client");

const REQUEST_ID = "b7c2f0a1-1111-4222-8333-444455556666";

// Real link shapes, taken from the partner services that build them.
const WEGOTRIP = "https://wegotrip.com/rome-d123/colosseum-tour-p456/?sub_id=405110";
const GETTRANSFER = "https://www.gettransfer.com/en/transfers/new?from=FCO&to=Rome&marker=405110";
const AVIASALES = "https://www.aviasales.com/search/LON20260401ROM1?marker=405110";
const VIATOR = "https://www.viator.com/tours/Rome/Colosseum/d511-1234?mcid=42383";
const TWELVEGO = "https://12go.asia/en?affiliate_id=abc123&q=Bangkok";
const FEVER = "https://feverup.com/en?utm_source=impact&utm_medium=affiliate&utm_campaign=15532";
const KLOOK = "https://www.klook.com/en-US/search/?query=Rome%20tours&aff_code=travelpayouts";

// ---------------------------------------------------------------------------
// B — the builder
// ---------------------------------------------------------------------------

describe("buildAttributedAffiliateUrl — the ONE builder", () => {
  it("B1 sub_id partner: the booking-request id is appended to the partner's own sub_id", () => {
    const out = buildAttributedAffiliateUrl({ affiliateUrl: WEGOTRIP, requestId: REQUEST_ID });
    assert.equal(out.attributed, true);
    assert.equal(out.parameter, "sub_id");
    assert.equal(out.subId, `405110.${REQUEST_ID}`);
    assert.equal(out.reason, null);
    assert.equal(new URL(out.url).searchParams.get("sub_id"), `405110.${REQUEST_ID}`);
  });

  it("B1b marker partner: the marker parameter carries the token, per the <marker>.<SubID> convention", () => {
    for (const url of [GETTRANSFER, AVIASALES]) {
      const out = buildAttributedAffiliateUrl({ affiliateUrl: url, requestId: REQUEST_ID });
      assert.equal(out.attributed, true, url);
      assert.equal(out.parameter, "marker", url);
      assert.equal(new URL(out.url).searchParams.get("marker"), `405110.${REQUEST_ID}`, url);
    }
  });

  it("B2 a partner with no attribution parameter gets the URL back byte-identical, and says why", () => {
    for (const url of [VIATOR, TWELVEGO, FEVER, KLOOK]) {
      const out = buildAttributedAffiliateUrl({ affiliateUrl: url, requestId: REQUEST_ID });
      assert.equal(out.url, url, `${url} must come back byte-identical`);
      assert.equal(out.attributed, false, url);
      assert.equal(out.parameter, null, url);
      assert.equal(out.subId, null, url);
      assert.equal(out.reason, "partner_carries_no_attribution_parameter", url);
      // §13: never a fabricated parameter the partner never asked for.
      assert.equal(new URL(out.url).searchParams.has("sub_id"), false, url);
      assert.equal(supportsAttributionSubId(url), false, url);
    }
  });

  it("B2b supportsAttributionSubId is true for exactly the two parameters we may extend", () => {
    assert.deepEqual([...ATTRIBUTION_PARAMS], ["sub_id", "marker"]);
    assert.equal(supportsAttributionSubId(WEGOTRIP), true);
    assert.equal(supportsAttributionSubId(GETTRANSFER), true);
    assert.equal(supportsAttributionSubId("not a url at all"), false);
  });

  it("B3 the existing query string is preserved", () => {
    const url = "https://wegotrip.com/rome-d1/tour-p2/?sub_id=405110&currency=EUR&lang=en";
    const out = buildAttributedAffiliateUrl({ affiliateUrl: url, requestId: REQUEST_ID });
    const params = new URL(out.url).searchParams;
    assert.equal(params.get("currency"), "EUR");
    assert.equal(params.get("lang"), "en");
    assert.equal(params.get("sub_id"), `405110.${REQUEST_ID}`);
    assert.equal(new URL(out.url).pathname, "/rome-d1/tour-p2/");
  });

  it("B4 a campaign-specific marker survives; the account marker is only the empty-value fallback", () => {
    const campaign = buildAttributedAffiliateUrl({
      affiliateUrl: "https://www.gettransfer.com/en/x?marker=999999",
      requestId: REQUEST_ID,
    });
    assert.equal(campaign.subId, `999999.${REQUEST_ID}`);

    const empty = buildAttributedAffiliateUrl({
      affiliateUrl: "https://wegotrip.com/x/?sub_id=",
      requestId: REQUEST_ID,
    });
    assert.equal(empty.subId, `405110.${REQUEST_ID}`);
  });

  it("B4b re-stamping a link that already carries a token replaces the token, not the marker", () => {
    const first = buildAttributedAffiliateUrl({ affiliateUrl: WEGOTRIP, requestId: "req-one" });
    const second = buildAttributedAffiliateUrl({ affiliateUrl: first.url, requestId: "req-two" });
    assert.equal(second.subId, "405110.req-two");
  });

  it("B5 never throws: a malformed URL and an absent request id come back unchanged with a reason", () => {
    const malformed = buildAttributedAffiliateUrl({ affiliateUrl: "not-a-url?sub_id=1", requestId: REQUEST_ID });
    assert.equal(malformed.url, "not-a-url?sub_id=1");
    assert.equal(malformed.attributed, false);
    assert.equal(malformed.reason, "unparseable_url");

    for (const missing of [null, undefined, ""]) {
      const out = buildAttributedAffiliateUrl({ affiliateUrl: WEGOTRIP, requestId: missing as any });
      assert.equal(out.url, WEGOTRIP);
      assert.equal(out.attributed, false);
      assert.equal(out.reason, "no_request_id");
    }
  });

  it("B5b the click id is echoed, never written into the URL", () => {
    const out = buildAttributedAffiliateUrl({
      affiliateUrl: WEGOTRIP,
      requestId: REQUEST_ID,
      clickId: "click-abc",
    });
    assert.equal(out.clickId, "click-abc");
    assert.equal(out.url.includes("click-abc"), false);
  });

  it("B6 idempotent: the tracked open re-runs it on the stored URL and gets the same bytes", () => {
    const once = buildAttributedAffiliateUrl({ affiliateUrl: WEGOTRIP, requestId: REQUEST_ID });
    const twice = buildAttributedAffiliateUrl({ affiliateUrl: once.url, requestId: REQUEST_ID });
    assert.equal(twice.url, once.url);
    assert.equal(twice.attributed, true);
  });
});

// ---------------------------------------------------------------------------
// R — the round trip and the matcher's two decisions
// ---------------------------------------------------------------------------

describe("attribution round-trip and token matching", () => {
  it("R1 the builder's value parses back to EXACTLY the request id", () => {
    for (const url of [WEGOTRIP, GETTRANSFER, "https://www.gettransfer.com/en/x?marker=999999"]) {
      const out = buildAttributedAffiliateUrl({ affiliateUrl: url, requestId: REQUEST_ID });
      assert.equal(parseAttributionSubId(out.subId!).token, REQUEST_ID, url);
    }
  });

  it("R2 a partner row carrying the built value resolves to the request id (sub_id, then long_sub_id)", () => {
    const built = buildAttributedAffiliateUrl({ affiliateUrl: WEGOTRIP, requestId: REQUEST_ID }).subId!;

    const fromSubId = resolveExternalAttributionToken({ subId: built, rawData: {} });
    assert.equal(fromSubId.token, REQUEST_ID);
    assert.equal(fromSubId.rawSubId, built);

    // sub_id shortened/absent → the long_sub_id fallback carries the full value.
    const fromLong = resolveExternalAttributionToken({ subId: null, rawData: { long_sub_id: built } });
    assert.equal(fromLong.token, REQUEST_ID);

    // A truncated sub_id must not win over a parseable long_sub_id.
    const preferParseable = resolveExternalAttributionToken({
      subId: "405110",
      rawData: { sub_id: "405110", long_sub_id: built },
    });
    assert.equal(preferParseable.token, REQUEST_ID);
  });

  it("R3 an unparseable sub_id yields a NULL token and the raw value verbatim", () => {
    for (const raw of ["405110", "impact-conversion-99", "405110."]) {
      const out = resolveExternalAttributionToken({ subId: raw, rawData: {} });
      assert.equal(out.token, null, raw);
      assert.equal(out.rawSubId, raw, raw);
    }
    // No sub_id at all (Viator / Impact / Partnerize) — nothing echoed, nothing invented.
    const none = resolveExternalAttributionToken({ subId: null, rawData: { Id: "IMP-1" } });
    assert.equal(none.token, null);
    assert.equal(none.rawSubId, null);
  });

  it("R4 the match is EXACT, and an unparseable case stays unmatched", () => {
    const rows = [
      {
        id: "earn-1",
        reconciliation_status: "unmatched",
        total_commission: "0.00",
        external_report_data: { affiliateBookingRequestId: REQUEST_ID },
      },
      {
        id: "earn-2",
        reconciliation_status: "unmatched",
        total_commission: "0.00",
        external_report_data: { affiliateBookingRequestId: "some-other-request" },
      },
    ];
    const consumed = new Set<string>();

    const built = buildAttributedAffiliateUrl({ affiliateUrl: WEGOTRIP, requestId: REQUEST_ID }).subId!;
    const { token } = resolveExternalAttributionToken({ subId: built, rawData: {} });
    assert.equal(selectTokenMatchCandidate(token!, rows, consumed)!.id, "earn-1");

    // Unparseable → no token → the matcher is never even reached, and the row stays unmatched.
    const unparseable = resolveExternalAttributionToken({ subId: "405110", rawData: {} });
    assert.equal(unparseable.token, null);

    // A token that names nothing on the table matches nothing — no nearest-neighbour, no prefix.
    assert.equal(selectTokenMatchCandidate("no-such-request", rows, consumed), null);
    assert.equal(selectTokenMatchCandidate(REQUEST_ID.slice(0, 10), rows, consumed), null);

    // A row already consumed in this pass, or already matched, is never re-adopted.
    consumed.add("earn-1");
    assert.equal(selectTokenMatchCandidate(REQUEST_ID, rows, consumed), null);
    consumed.delete("earn-1");
    rows[0].reconciliation_status = "matched";
    assert.equal(selectTokenMatchCandidate(REQUEST_ID, rows, consumed), null);
  });
});

// ---------------------------------------------------------------------------
// S — §16 static pins
// ---------------------------------------------------------------------------

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");

describe("§16 — the attributed URL never reaches a client", () => {
  const routes = read("server/routes/content.routes.ts");
  const storage = read("server/storage.ts");

  it("S1 the tracked open resolves server-side and 302s — it never returns the URL in a body", () => {
    const start = routes.indexOf('router.get("/api/affiliate-booking-requests/:id/open"');
    assert.ok(start > -1, "the tracked-open route must exist");
    const handler = routes.slice(start, start + 5000);
    assert.match(handler, /res\.redirect\(302,\s*attribution\.url\)/);
    assert.match(handler, /buildAttributedAffiliateUrl\(/);
    assert.match(handler, /bookingRequestId:\s*row\.id/);
    // No response body anywhere in the handler may carry the URL.
    assert.equal(/res\.json\([^)]*attribution\.url/.test(handler), false);
    assert.equal(/res\.json\([^)]*affiliateUrl/.test(handler), false);
  });

  it("S2 both list readers strip affiliate_url, and the PATCH response strips it too", () => {
    assert.match(
      storage,
      /getAffiliateBookingRequestsByExpert\([\s\S]{0,400}?Omit<AffiliateBookingRequest, "affiliateUrl">\[\]>/,
    );
    assert.match(
      storage,
      /getAffiliateBookingRequestsByUser\([\s\S]{0,400}?Omit<AffiliateBookingRequest, "affiliateUrl">\[\]>/,
    );
    assert.match(routes, /const \{ affiliateUrl: _patchedUrl, \.\.\.safeUpdated \} = updated;/);
    assert.equal(/\/\/ Include affiliateUrl for expert responses/.test(routes), false);
  });

  it("S3 both create rails go through the ONE builder and strip the URL from their response", () => {
    const matches = routes.match(/buildAttributedAffiliateUrl\(\{/g) ?? [];
    assert.equal(matches.length, 3, "two create rails + the tracked open");
    // The flag-gated dormant rewriter has no production call site left.
    assert.equal(/applyAttributionSubId\(/.test(routes), false);
    assert.match(routes, /const \{ affiliateUrl: _url, \.\.\.safe \} = record;/);
    assert.match(routes, /const \{ affiliateUrl: _url2, \.\.\.safe \} = record;/);
  });

  it("S4 the client links to the tracked-open route, never to a partner URL", () => {
    const workspace = read("client/src/pages/expert/workspace.tsx");
    assert.match(workspace, /href=\{`\/api\/affiliate-booking-requests\/\$\{req\.id\}\/open`\}/);
    assert.equal(/href=\{req\.affiliateUrl\}/.test(workspace), false);
  });

  it("S5 no money decision lives in this lane — no rate, amount or payout is touched", () => {
    // Comments legitimately DISCUSS money to say the lane does not touch it — strip them and pin
    // the CODE.
    const attribution = read("server/services/affiliate-attribution.service.ts")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    // Word-boundary regexes, not substrings: "Travelpayouts" legitimately contains "payout".
    const forbidden: Array<[string, RegExp]> = [
      ["resolveCommissionRates", /\bresolveCommissionRates\b/],
      ["req.body", /\breq\.body\b/],
      ["stripe", /\bstripe\b/i],
      ["payout", /\bpayouts?\b/i],
      ["expert_earnings", /\bexpert_earnings\b/],
      ["amount", /\bamount\b/i],
    ];
    for (const [name, pattern] of forbidden) {
      assert.equal(pattern.test(attribution), false, `${name} must not appear in the attribution builder`);
    }
  });
});
