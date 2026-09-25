/**
 * Discover impressions admin read (board #621, ledger `2026-09-24-discover-impressions-admin`).
 * DB-backed.
 *   I1 a click is linked to an impression only when that impression exists AND names the same
 *      card; a stale, foreign or missing id links nothing, and a click naming no card keeps none.
 *   I2 the report counts impressions per card once each (a card clicked twice is ONE clicked
 *      impression), sessions distinctly, and the average feed slot.
 *   I3 click-through is counted only over impressions shown from the earliest linked impression; an
 *      older impression is in the impression count and NOT in the click-through denominator.
 *   I4 where nothing is countable yet the rate is null — never 0%.
 *   E1 the earner view counts ONLY the session user's own listings (vendor-service cards whose id
 *      is their provider_services row) — never another earner's listing, never a gem that happens
 *      to share an id, and names each listing from its own row.
 *   E2 someone with no listings gets an empty report, not an error and not anyone else's rows.
 * Needs a disposable Postgres with migrations applied and JOURNEY_DB_WRITES_OK=1.
 * Run: npx tsx --test --test-force-exit server/__tests__/discover-impressions.db.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "../db";
import {
  clickThroughRate,
  loadDiscoverImpressions,
  loadEarnerDiscoverImpressions,
  resolveClickAttribution,
} from "../services/discover-impressions.service";

const RUN = crypto.randomUUID().slice(0, 8);
const CITY = `di-city-${RUN}`;
const OLD_CITY = `di-old-${RUN}`;
const impressionIds: string[] = [];
const clickIds: string[] = [];

async function impression(opts: {
  type: string;
  id: string;
  session: string;
  city: string;
  position?: number | null;
  createdAt?: string;
}): Promise<string> {
  const id = crypto.randomUUID();
  await db.execute(sql`
    INSERT INTO content_impressions (id, content_type, content_id, city, card_position, session_id, created_at)
    VALUES (${id}, ${opts.type}, ${opts.id}, ${opts.city}, ${opts.position ?? null}, ${opts.session},
            COALESCE(${opts.createdAt ?? null}::timestamp, NOW()))`);
  impressionIds.push(id);
  return id;
}

async function click(sourceImpressionId: string | null, type: string, contentId: string): Promise<void> {
  const id = crypto.randomUUID();
  await db.execute(sql`
    INSERT INTO affiliate_clicks (id, initiated_by, session_id, source_impression_id, click_content_type, click_content_id)
    VALUES (${id}, 'user', ${`discover:${CITY}`}, ${sourceImpressionId}, ${type}, ${contentId})`);
  clickIds.push(id);
}

before(() => {
  assert.equal(process.env.JOURNEY_DB_WRITES_OK, "1", "Refusing to write fixtures without JOURNEY_DB_WRITES_OK=1");
});

const earnerA = `di-ea-${RUN}`;
const earnerB = `di-eb-${RUN}`;
const nobody = `di-nb-${RUN}`;
const listingA1 = `di-la1-${RUN}`;
const listingA2 = `di-la2-${RUN}`;
const listingB = `di-lb-${RUN}`;

after(async () => {
  await db.execute(sql`DELETE FROM users WHERE id IN (${earnerA}, ${earnerB}, ${nobody})`);
  if (clickIds.length) {
    await db.execute(sql`DELETE FROM affiliate_clicks WHERE id IN (${sql.join(clickIds.map((i) => sql`${i}`), sql`, `)})`);
  }
  if (impressionIds.length) {
    await db.execute(sql`DELETE FROM content_impressions WHERE id IN (${sql.join(impressionIds.map((i) => sql`${i}`), sql`, `)})`);
  }
});

test("I1 a click links only to an existing impression of the same card", async () => {
  const imp = await impression({ type: "gem", id: `g1-${RUN}`, session: `s-i1-${RUN}`, city: `di-i1-${RUN}` });

  const linked = await resolveClickAttribution({ contentType: "gem", contentId: `g1-${RUN}`, impressionId: imp });
  assert.deepEqual(linked, { clickContentType: "gem", clickContentId: `g1-${RUN}`, sourceImpressionId: imp });

  const otherCard = await resolveClickAttribution({ contentType: "gem", contentId: `g2-${RUN}`, impressionId: imp });
  assert.equal(otherCard.sourceImpressionId, null, "an impression of a different card is not linked");
  assert.equal(otherCard.clickContentId, `g2-${RUN}`, "the card the click named is still recorded");

  const otherType = await resolveClickAttribution({ contentType: "event", contentId: `g1-${RUN}`, impressionId: imp });
  assert.equal(otherType.sourceImpressionId, null);

  const unknown = await resolveClickAttribution({ contentType: "gem", contentId: `g1-${RUN}`, impressionId: crypto.randomUUID() });
  assert.equal(unknown.sourceImpressionId, null);
  // An id that is not even uuid-shaped is a non-match, never an error.
  const malformed = await resolveClickAttribution({ contentType: "gem", contentId: `g1-${RUN}`, impressionId: `nope-${RUN}` });
  assert.equal(malformed.sourceImpressionId, null);

  const noCard = await resolveClickAttribution({ impressionId: imp });
  assert.deepEqual(noCard, { clickContentType: null, clickContentId: null, sourceImpressionId: null });

  const tooLong = await resolveClickAttribution({ contentType: "gem", contentId: "x".repeat(300), impressionId: imp });
  assert.deepEqual(tooLong, { clickContentType: null, clickContentId: null, sourceImpressionId: null });

  const notStrings = await resolveClickAttribution({ contentType: 7, contentId: { a: 1 }, impressionId: [imp] });
  assert.deepEqual(notStrings, { clickContentType: null, clickContentId: null, sourceImpressionId: null });
});

test("I2/I3 the report counts per card, and click-through only since linking began", async () => {
  const card = `g-top-${RUN}`;
  const a = await impression({ type: "gem", id: card, session: `s-a-${RUN}`, city: CITY, position: 1 });
  await impression({ type: "gem", id: card, session: `s-b-${RUN}`, city: CITY, position: 3 });
  await impression({ type: "gem", id: card, session: `s-c-${RUN}`, city: CITY, position: null });
  // Shown long before any click was ever linked: seen, but not countable for click-through.
  await impression({ type: "gem", id: card, session: `s-old-${RUN}`, city: CITY, position: 2, createdAt: "2001-01-01T00:00:00" });
  const ev = await impression({ type: "event", id: `e1-${RUN}`, session: `s-a-${RUN}`, city: CITY, position: 4 });

  // Impression `a` pressed twice — ONE clicked impression. An unlinked click counts for nothing.
  await click(a, "gem", card);
  await click(a, "gem", card);
  await click(null, "gem", card);

  const report = await loadDiscoverImpressions({ window: "all", city: CITY });
  assert.equal(report.city, CITY);
  assert.ok(report.linkingSince, "a linked click exists, so linking has a start");
  assert.ok(report.cities.includes(CITY));

  const top = report.cards.find((c) => c.contentType === "gem" && c.contentId === card);
  assert.ok(top, "the card is listed");
  assert.equal(top.impressions, 4);
  assert.equal(top.sessions, 4);
  assert.equal(top.averagePosition, 2, "average over recorded positions only (1, 3, 2)");
  assert.equal(top.impressionsSinceLinking, 3, "the 2001 impression is not in the denominator");
  assert.equal(top.impressionsClicked, 1, "two presses on one impression are one clicked impression");
  assert.equal(top.clickThroughRate, 33.3);

  const evCard = report.cards.find((c) => c.contentType === "event");
  assert.ok(evCard);
  assert.equal(evCard.impressionsClicked, 0);
  assert.equal(evCard.clickThroughRate, 0, "countable and never clicked is a real 0%");
  assert.ok(ev);

  assert.equal(report.totals.impressions, 5);
  assert.equal(report.totals.sessions, 4, "session a saw two cards and counts once");
  assert.equal(report.totals.cards, 2);
  assert.equal(report.totals.impressionsSinceLinking, 4);
  assert.equal(report.totals.impressionsClicked, 1);

  const gemRow = report.byType.find((r) => r.key === "gem");
  assert.equal(gemRow?.impressions, 4);
  const cityRow = report.byCity.find((r) => r.key === CITY);
  assert.equal(cityRow?.impressions, 5);

  const lastWeek = await loadDiscoverImpressions({ window: "7", city: CITY });
  assert.equal(lastWeek.totals.impressions, 4, "the window drops the 2001 impression");
});

test("I4 nothing countable yet ⇒ no rate, never 0%", async () => {
  await impression({ type: "gem", id: `g-old-${RUN}`, session: `s-o1-${RUN}`, city: OLD_CITY, createdAt: "2001-02-01T00:00:00" });
  const report = await loadDiscoverImpressions({ window: "all", city: OLD_CITY });
  assert.equal(report.totals.impressions, 1);
  assert.equal(report.totals.impressionsSinceLinking, 0);
  assert.equal(report.totals.clickThroughRate, null);
  assert.equal(report.cards[0]?.clickThroughRate, null);

  assert.equal(clickThroughRate(0, 0), null);
  assert.equal(clickThroughRate(3, 0), null);
  assert.equal(clickThroughRate(1, 8), 12.5);
});

test("E1 an earner sees only their own listings", async () => {
  await db.execute(sql`
    INSERT INTO users (id, email, first_name, role)
    VALUES (${earnerA}, ${earnerA + "@t.test"}, 'Ana', 'local_expert'),
           (${earnerB}, ${earnerB + "@t.test"}, 'Ben', 'service_provider'),
           (${nobody}, ${nobody + "@t.test"}, 'Nia', 'user')`);
  await db.execute(sql`
    INSERT INTO provider_services (id, user_id, service_name, description, price, status, approval_status, delivery_method)
    VALUES (${listingA1}, ${earnerA}, ${"Tea ceremony " + RUN}, 'fixture', '40.00', 'active', 'approved', 'in_person'),
           (${listingA2}, ${earnerA}, ${"Night walk " + RUN}, 'fixture', '40.00', 'active', 'approved', 'in_person'),
           (${listingB}, ${earnerB}, ${"Someone else " + RUN}, 'fixture', '40.00', 'active', 'approved', 'in_person')`);

  const city = `di-earn-${RUN}`;
  const a1 = await impression({ type: "vendor-service", id: listingA1, session: `s-e1-${RUN}`, city, position: 3 });
  await impression({ type: "vendor-service", id: listingA1, session: `s-e2-${RUN}`, city, position: 5 });
  await impression({ type: "vendor-service", id: listingA2, session: `s-e3-${RUN}`, city, position: 1 });
  // Not earner A's: another earner's listing, and a gem card that happens to reuse A's id.
  await impression({ type: "vendor-service", id: listingB, session: `s-e4-${RUN}`, city });
  await impression({ type: "gem", id: listingA1, session: `s-e5-${RUN}`, city });
  await click(a1, "vendor-service", listingA1);

  const report = await loadEarnerDiscoverImpressions({ userId: earnerA, window: "all" });
  assert.equal(report.totals.impressions, 3, "three impressions of A's two listings, nothing else");
  assert.deepEqual(report.listings.map((l) => l.serviceId).sort(), [listingA1, listingA2].sort());
  const one = report.listings.find((l) => l.serviceId === listingA1)!;
  assert.equal(one.serviceName, "Tea ceremony " + RUN);
  assert.equal(one.impressions, 2);
  assert.equal(one.averagePosition, 4);
  assert.equal(one.impressionsClicked, 1);
  assert.ok(!JSON.stringify(report).includes(listingB), "another earner's listing never appears");

  const other = await loadEarnerDiscoverImpressions({ userId: earnerB, window: "all" });
  assert.equal(other.totals.impressions, 1);
  assert.deepEqual(other.listings.map((l) => l.serviceId), [listingB]);
});

test("E2 no listings means an empty report", async () => {
  const report = await loadEarnerDiscoverImpressions({ userId: nobody, window: "all" });
  assert.equal(report.totals.impressions, 0);
  assert.equal(report.totals.clickThroughRate, null);
  assert.deepEqual(report.listings, []);
  assert.deepEqual(report.byCity, []);
  await assert.rejects(() => loadEarnerDiscoverImpressions({ userId: "", window: "all" }));
});
