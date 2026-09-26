/**
 * A DESTINATION TRANSFER'S PARTNER LINK IS NEVER SHIPPED TO THE CLIENT (§16, ledger
 * `2026-09-26-transfer-link-tracked`). DB-backed (the builder reads provider_services and
 * affiliate_partners, and tolerates either being empty).
 *
 *   T1 the public list carries NO `externalUrl` on any option, only `hasPartnerLink`.
 *   T2 the tracked resolver returns the partner URL for a partner option, from the SAME builder.
 *   T3 an unknown option id, and an option with no partner link, resolve to null (the route's 404).
 *   T4 the Partnerize copy no longer promises a booking the platform does not take.
 *
 * Run: npx tsx --test --test-force-exit server/__tests__/transfer-link-tracked.db.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  getDestinationTransportOptions,
  resolveDestinationTransportOptionLink,
} from "../services/transport-booking-options.service";

const DEST = "Kyoto";

test("T1 the public list never carries a partner URL", async () => {
  const options = await getDestinationTransportOptions(DEST, 2, "2026-11-01");
  assert.ok(options.length > 0, "the builder always yields the search-link partners");
  for (const o of options) {
    assert.ok(!("externalUrl" in o), `option ${o.id} must not carry externalUrl`);
    assert.equal(typeof o.hasPartnerLink, "boolean");
  }
  const go12 = options.find((o) => o.id === "affiliate-12go");
  assert.ok(go12, "12Go search link is listed");
  assert.equal(go12!.hasPartnerLink, true);
  assert.doesNotMatch(JSON.stringify(options), /https?:\/\//, "no URL anywhere in the payload");
});

test("T2 the tracked resolver returns the partner URL from the same builder", async () => {
  const link = await resolveDestinationTransportOptionLink(DEST, "affiliate-12go", "2026-11-01", 2);
  assert.ok(link, "a partner option resolves");
  assert.equal(link!.source, "12go");
  assert.match(link!.url, /^https:\/\/12go\.asia\/en\/travel\/to\/kyoto\?/);
  assert.match(link!.url, /date=2026-11-01/, "the trip's start date is threaded server-side");
});

test("T3 an unknown option, or one with no partner link, resolves to null", async () => {
  assert.equal(await resolveDestinationTransportOptionLink(DEST, "affiliate-nope"), null);
  const options = await getDestinationTransportOptions(DEST);
  const platform = options.find((o) => !o.hasPartnerLink);
  if (platform) {
    assert.equal(await resolveDestinationTransportOptionLink(DEST, platform.id), null);
  }
});

test("T4 no option says the platform books it off-site", async () => {
  const options = await getDestinationTransportOptions(DEST);
  for (const o of options) assert.doesNotMatch(o.description, /completed on their site/);
});
