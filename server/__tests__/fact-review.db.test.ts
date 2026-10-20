/**
 * CS-1 item 3 — a dated fact shows only after a person has reviewed it, on a real database (ledger
 * `2026-10-19-cs1-fact-review`).
 *
 *   RV1  a machine writer never sets verified_by: recordMachineFacts stores NULL even when a draft names a reviewer
 *   RV2  an unreviewed official-refresh last entry is not read (plan facts, feasibility), is listed for review, and
 *        the stop carries the waiting line with the source's top-level link
 *   RV3  approving a safety fact: no expiry ⇒ expiry_required; later than the source's setting ⇒ expiry_after_limit;
 *        a valid one writes a NEW reviewed row (the admin, the original check date, the entered expiry) and
 *        supersedes the old — which is never deleted; readers now show it as "Checked <date> · Source: <site>"
 *   RV4  a second approval of the same fact is refused (already_reviewed)
 *   RV5  approving hours with no expiry takes the latest allowed date (check date + the source's interval)
 *   RV6  a bot's last-admission proposal needs an entered expiry, no later than the source's setting
 *   RV7  a store/extract source with an approved sign-off now activates (item 1's review_gate_not_built is lifted)
 *
 * DISPOSABLE DB ONLY: rows keyed by a per-run prefix and deleted afterwards.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql } from "drizzle-orm";
import { db, pool } from "../db";
import { factsForTrip, feasibilityFactsForTrip, lastEntryWaitingForTrip, recordMachineFacts } from "../services/content-facts/place-facts.service";
import { approveRefreshFact, listRefreshFactsForReview } from "../services/fact-review.service";
import { approveBotProposal, createBotAccount, fileBotProposal } from "../services/bot-proposals.service";
import { activateContentSource, createContentSource, signoffContentSource } from "../services/content-sources.service";

const RUN = crypto.randomUUID().slice(0, 8).replace(/-/g, "");
const id = (s: string) => `rv_${RUN}_${s}`;
const admin = id("admin");
const owner = id("owner");
const trip = id("trip");
const SRC = id("src");
const PLACE = `ChIJ-${RUN}-kinkaku`;
const PLACE_H = `ChIJ-${RUN}-ginkaku`;
const PLACE_BOT = `ChIJ-${RUN}-ryoanji`;
const DAY = 86_400_000;
const CHECKED = new Date(Date.now() - 2 * DAY);
const SETTING = "bot_fact_default_expiry_days";
let originalSetting: string | null = null;

const refreshDraft = (over: Record<string, unknown>) =>
  ({
    placeRefKind: "place_id",
    placeRef: PLACE,
    placeLat: null,
    placeLng: null,
    market: "kyoto",
    need: "stop.hours",
    factType: "last_admission",
    value: { byWeekday: { "1": "16:30", "2": "16:30", "3": "16:30", "4": "16:30", "5": "16:30", "6": "16:30", "0": "16:30" }, quote: "Last admission 16:30" },
    origin: "official_refresh",
    sourceId: SRC,
    sourceUrl: "https://www.shokoku-ji.jp/kinkakuji/visit/",
    license: "official",
    fetchedAt: CHECKED,
    expiresAt: new Date(CHECKED.getTime() + 30 * DAY),
    verifiedAt: CHECKED,
    costCents: 0,
    ...over,
  }) as any;

const rows = async (ref: string) => ((await db.execute(sql`SELECT * FROM place_facts WHERE place_ref = ${ref} ORDER BY created_at`)) as any).rows as any[];

before(async () => {
  const host = new URL(process.env.DATABASE_URL ?? "postgres://localhost").hostname.toLowerCase();
  if (process.env.JOURNEY_DB_WRITES_OK !== "1" && !["localhost", "127.0.0.1", "::1", ""].includes(host)) {
    throw new Error("refusing to write fixtures to a non-disposable database");
  }
  await db.execute(sql`INSERT INTO users (id, email, role) VALUES (${admin}, ${`${admin}@t.test`}, 'admin'), (${owner}, ${`${owner}@t.test`}, 'traveler')`);
  await db.execute(sql`INSERT INTO content_sources (id, name, homepage, market, adapter, covers, does_not_cover, license_class, terms_checked_at, active, refresh_interval_days)
    VALUES (${SRC}, 'Kinkaku-ji', 'https://www.shokoku-ji.jp/kinkakuji/', 'kyoto', 'tavily_extract', ARRAY['stop.hours'], ARRAY[]::text[], 'official', now(), true, 30)`);
  const r = await db.execute(sql`SELECT setting_value FROM platform_settings WHERE setting_key = ${SETTING}`);
  originalSetting = ((r as any).rows?.[0]?.setting_value as string) ?? null;
  await db.execute(sql`INSERT INTO platform_settings (setting_key, setting_value) VALUES (${SETTING}, '90') ON CONFLICT (setting_key) DO UPDATE SET setting_value = '90'`);
  await db.execute(sql`INSERT INTO trips (id, user_id, title, destination, market_slug, start_date, end_date, status)
    VALUES (${trip}, ${owner}, 'RV', 'Kyoto, Japan', 'kyoto', '2027-05-10', '2027-05-12', 'draft')`);
  await db.execute(sql`INSERT INTO itinerary_items (id, trip_id, day_number, title, start_time, duration_minutes, origin, sort_order, google_place_id, routing_status) VALUES
    (${id("k")}, ${trip}, 1, 'Kinkaku-ji', '16:45', 60, 'traveler', 1, ${PLACE}, 'in_planning'),
    (${id("g")}, ${trip}, 1, 'Ginkaku-ji', '10:00', 60, 'traveler', 2, ${PLACE_H}, 'in_planning')`);
});

after(async () => {
  await db.execute(sql`DELETE FROM place_facts WHERE place_ref LIKE ${`ChIJ-${RUN}-%`}`).catch(() => {});
  await db.execute(sql`DELETE FROM itinerary_items WHERE trip_id = ${trip}`).catch(() => {});
  await db.execute(sql`DELETE FROM trips WHERE id = ${trip}`).catch(() => {});
  await db.execute(sql`DELETE FROM bot_accounts WHERE name LIKE ${`rv_${RUN}_%`}`).catch(() => {});
  await db.execute(sql`DELETE FROM content_sources WHERE id LIKE ${`rv_${RUN}_%`}`).catch(() => {});
  await db.execute(sql`DELETE FROM users WHERE id IN (${admin}, ${owner})`).catch(() => {});
  if (originalSetting === null) await db.execute(sql`DELETE FROM platform_settings WHERE setting_key = ${SETTING}`).catch(() => {});
  else await db.execute(sql`UPDATE platform_settings SET setting_value = ${originalSetting} WHERE setting_key = ${SETTING}`).catch(() => {});
  await pool.end();
});

test("RV1 — a machine writer never sets verified_by", async () => {
  const n = await recordMachineFacts([refreshDraft({ verifiedBy: admin })], { planId: null, itemId: null });
  assert.equal(n, 1);
  const [r] = await rows(PLACE);
  assert.equal(r.verified_by, null, "the reviewer named on a machine draft is stripped");
});

test("RV2 — an unreviewed last entry is not read, is listed, and the stop waits", async () => {
  const views = await factsForTrip(trip);
  assert.equal((views[id("k")] ?? []).some((v) => v.factType === "last_admission"), false);
  const feas = await feasibilityFactsForTrip(trip, "kyoto");
  assert.equal(JSON.stringify(feas).includes("16:30"), false, "the feasibility checks never read it");
  const queue = await listRefreshFactsForReview();
  const mine = queue.find((q) => q.placeRef === PLACE);
  assert.ok(mine, "listed for review");
  assert.equal(mine!.safety, true);
  assert.equal(mine!.latestExpiry, new Date(CHECKED.getTime() + 30 * DAY).toISOString());
  const waiting = await lastEntryWaitingForTrip(trip);
  assert.deepEqual(waiting[id("k")], {
    text: "Last entry not checked yet. See Kinkaku-ji's official site before you go.",
    linkText: "Kinkaku-ji's official site",
    url: "https://www.shokoku-ji.jp/",
  });
  assert.equal(waiting[id("g")], undefined);
});

test("RV3 + RV4 — approving a safety fact needs the source's date; the reviewed row replaces the old one", async () => {
  const [pending] = await rows(PLACE);
  assert.deepEqual(await approveRefreshFact(pending.id, admin, {}), { ok: false, reason: "expiry_required" });
  const tooLate = new Date(CHECKED.getTime() + 31 * DAY).toISOString();
  assert.deepEqual(await approveRefreshFact(pending.id, admin, { expiresAt: tooLate }), { ok: false, reason: "expiry_after_limit" });
  const seasonEnd = new Date(CHECKED.getTime() + 20 * DAY);
  const out = await approveRefreshFact(pending.id, admin, { expiresAt: seasonEnd.toISOString() });
  assert.equal(out.ok, true);
  const all = await rows(PLACE);
  assert.equal(all.length, 2, "nothing is deleted");
  const old = all.find((r) => r.id === pending.id)!;
  const fresh = all.find((r) => r.id !== pending.id)!;
  assert.equal(old.superseded_by, fresh.id);
  assert.equal(fresh.verified_by, admin);
  assert.equal(new Date(fresh.fetched_at).getTime(), CHECKED.getTime(), "the check date is the read, not the review");
  assert.equal(new Date(fresh.expires_at).getTime(), seasonEnd.getTime());
  const views = await factsForTrip(trip);
  const shown = (views[id("k")] ?? []).find((v) => v.factType === "last_admission");
  assert.ok(shown, "now read");
  assert.match(shown!.provenance, /^Checked .* · Source: Kinkaku-ji$/);
  assert.doesNotMatch(shown!.provenance, /verified/i);
  assert.equal((await lastEntryWaitingForTrip(trip))[id("k")], undefined, "nothing waits once reviewed");
  assert.equal((await listRefreshFactsForReview()).some((q) => q.placeRef === PLACE), false);
  assert.deepEqual(await approveRefreshFact(pending.id, admin, { expiresAt: seasonEnd.toISOString() }), { ok: false, reason: "already_reviewed" });
});

test("RV5 — hours with no expiry take the latest allowed date", async () => {
  await recordMachineFacts(
    [refreshDraft({ placeRef: PLACE_H, factType: "hours", value: { text: "9:00–17:00", quote: "9:00–17:00", weekdayDescriptions: ["Monday: 9:00 AM – 5:00 PM"] } })],
    { planId: null, itemId: null },
  );
  const [pending] = await rows(PLACE_H);
  const out = await approveRefreshFact(pending.id, admin, {});
  assert.equal(out.ok, true);
  const fresh = (await rows(PLACE_H)).find((r) => r.id !== pending.id)!;
  assert.equal(new Date(fresh.expires_at).getTime(), CHECKED.getTime() + 30 * DAY);
});

test("RV6 — a bot's last-admission proposal needs an entered expiry", async () => {
  const b = await createBotAccount({ name: id("bot"), scopes: ["proposals:write", "proposals:read"], createdBy: admin });
  assert.equal(b.ok, true);
  if (!b.ok) return;
  const filed = await fileBotProposal(b.bot, {
    kind: "place_fact.last_admission",
    placeId: PLACE_BOT,
    sourceId: SRC,
    sourceUrl: "https://www.shokoku-ji.jp/kinkakuji/visit/",
    checkedAt: new Date().toISOString(),
    text: "Last admission 16:30",
    quote: "Last admission 16:30",
    fields: { byWeekday: { "1": "16:30" } },
  });
  assert.equal(filed.ok, true, JSON.stringify(filed));
  if (!filed.ok) return;
  const pid = filed.proposal.id;
  assert.deepEqual(await approveBotProposal(pid, admin), { ok: false, reason: "expiry_required" });
  assert.deepEqual(await approveBotProposal(pid, admin, new Date(), { expiresAt: new Date(Date.now() + 40 * DAY).toISOString() }), { ok: false, reason: "expiry_after_limit" });
  const ok = await approveBotProposal(pid, admin, new Date(), { expiresAt: new Date(Date.now() + 10 * DAY).toISOString() });
  assert.equal(ok.ok, true);
  const [fact] = await rows(PLACE_BOT);
  assert.equal(fact.verified_by, admin);
});

test("RV7 — an approved store/extract source now activates", async () => {
  process.env.CONTENT_SOURCE_ACTIVATOR_USER_IDS = admin;
  await createContentSource(
    { id: id("extract"), name: "Extract source", homepage: "https://example.org/", market: "kyoto", adapter: "tavily_extract", covers: ["stop.hours"], doesNotCover: [], licenseClass: "official", termsUrl: "https://example.org/terms", termsClass: "extract", automatedAccessAllowed: true },
    owner,
  );
  await signoffContentSource(id("extract"), { decision: "approved" }, admin);
  const row = await activateContentSource(id("extract"), admin);
  assert.equal(row.active, true);
});
