/**
 * blog-series-follow.db.test.ts — blog generator lane, type 2 (ledger `2026-09-30-blog-series-follow`).
 *
 *   S1  fewer than two live upcoming instances ⇒ `series_too_small` with the count, before any model
 *       call; a withdrawn or past instance does not count; a malformed key is `bad_series_key`
 *   S2  the facts list every live instance across markets, soonest first; ids and ticket links never
 *       reach the prompt, and a resale link (R208) never becomes a source
 *   S3  the draft check refuses an invented number, any link, and a market city that is not one of the
 *       instances' — the instances' own cities are allowed
 *   S4  the generator makes a platform DRAFT anchored on the soonest instance; a second run spends no
 *       model call; a series across markets is filed under no market
 *   S5  the public read carries ONE door per LIVE instance, read live: a new instance gains a door, a
 *       withdrawn one loses it, no ids, and no single `planDoor`; a withdrawn anchor ⇒ no doors
 *
 *   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/traveloure \
 *     npx tsx --test --test-force-exit server/services/__tests__/blog-series-follow.db.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { db } from "../../db";
import { cityEvents } from "@shared/schema";
import { BlogError, getPublishedBySlug, publishPost } from "../blog-posts.service";
import { loadSeriesFollowFacts, seriesIdentity } from "../blog-event-facts.service";
import {
  checkSeriesFollowDraft,
  draftSeriesFollow,
  seriesFollowSlug,
  seriesPromptFacts,
} from "../blog-series-follow.service";

const RUN = crypto.randomUUID().slice(0, 8);
const ADMIN = `sfollow-${RUN}-admin`;
const KEY = `sf-${RUN}-festival`;
const SMALL = `sf-${RUN}-small`;
const ID = (s: string) => `sfollow-${RUN}-${s}`;
const DAY = 86_400_000;
const at = (days: number) => new Date(Date.now() + days * DAY);
const noHosts = async () => [] as string[];

function ev(id: string, over: Record<string, unknown>) {
  return {
    id: ID(id), source: "manual", sourceId: `${ID(id)}-src`, series: "Lantern Jazz", title: `Lantern Jazz ${id}`,
    city: "Kyoto", venue: "Hall", startsAt: at(30), nights: 1, seriesKey: KEY, vertical: "music", ...over,
  };
}

before(async () => {
  const host = new URL(process.env.DATABASE_URL ?? "postgres://localhost").hostname.toLowerCase();
  if (process.env.JOURNEY_DB_WRITES_OK !== "1" && !["localhost", "127.0.0.1", "::1", ""].includes(host)) {
    throw new Error("refusing to write fixtures to a non-disposable database");
  }
  await db.execute(sql`INSERT INTO users (id, email, role) VALUES (${ADMIN}, ${`${ADMIN}@t.test`}, 'admin')`);
  await db.insert(cityEvents).values([
    ev("kyoto", { venue: "ROHM Theatre", startsAt: at(20), ticketUrl: "https://www.stubhub.com/lantern" }),
    ev("porto", { city: "Porto", venue: "Casa da Música", startsAt: at(80), ticketUrl: "https://lanternjazz.example/porto" }),
    ev("past", { city: "Goa", venue: "Beach", startsAt: at(-40) }),
    ev("gone", { city: "Mumbai", venue: "NCPA", startsAt: at(50), withdrawnAt: new Date() }),
    ev("small1", { seriesKey: SMALL, startsAt: at(15) }),
    ev("small2", { seriesKey: SMALL, city: "Jaipur", startsAt: at(-5) }),
  ] as any);
});

after(async () => {
  await db.execute(sql`DELETE FROM blog_posts WHERE created_by = ${ADMIN}`).catch(() => {});
  await db.execute(sql`DELETE FROM city_events WHERE id LIKE ${`sfollow-${RUN}-%`}`).catch(() => {});
  await db.execute(sql`DELETE FROM users WHERE id = ${ADMIN}`).catch(() => {});
});

test("S1: under two live upcoming instances refuses with the count, before any model call", async () => {
  let calls = 0;
  const model = async () => { calls++; return {}; };
  await assert.rejects(
    draftSeriesFollow(SMALL, ADMIN, { partnerHosts: noHosts, model }),
    (e: unknown) => e instanceof BlogError && e.code === "series_too_small" && e.details?.instances === 1 && e.details?.minimum === 2,
  );
  await assert.rejects(
    draftSeriesFollow("Not A Key", ADMIN, { partnerHosts: noHosts, model }),
    (e: unknown) => e instanceof BlogError && e.code === "bad_series_key",
  );
  assert.equal(calls, 0);
});

test("S2: every live instance across markets, soonest first; no ids or links in the prompt", async () => {
  const facts = await loadSeriesFollowFacts(KEY, { partnerHosts: noHosts });
  assert.ok(!("refused" in facts));
  assert.deepEqual(facts.instances.map((i) => i.city), ["Kyoto", "Porto"], "past and withdrawn instances are not instances");
  assert.equal(facts.series.name, "Lantern Jazz");
  assert.equal(facts.series.vertical, "music");
  assert.equal(facts.instances[0].ticketUrl, null, "R208: a resale link is dropped");
  assert.equal(facts.instances[1].ticketUrl, "https://lanternjazz.example/porto");
  const prompt = JSON.stringify(seriesPromptFacts(facts));
  assert.equal(prompt.includes(ID("kyoto")), false);
  assert.equal(prompt.includes("lanternjazz.example"), false);
  assert.deepEqual(seriesIdentity([{ series: null, title: "A", vertical: "music" }, { series: null, title: "B", vertical: "fashion" }]), { name: "A", vertical: null }, "disagreeing verticals resolve to none");
});

test("S3: the draft check allows the instances' cities and refuses invented numbers, links and other markets", async () => {
  const facts = await loadSeriesFollowFacts(KEY, { partnerHosts: noHosts });
  assert.ok(!("refused" in facts));
  const d = (body: string) => checkSeriesFollowDraft({ title: "Lantern Jazz", summary: "", body }, facts);
  const [k, p] = facts.instances;
  assert.ok(!("error" in d(`${k.firstDate}: Kyoto, ROHM Theatre. ${p.firstDate}: Porto, Casa da Música.`)));
  assert.deepEqual(d("Tickets from 4500 yen in Kyoto."), { error: "series_follow_unknown_number" });
  assert.deepEqual(d("See https://example.com for Kyoto."), { error: "series_follow_foreign_link" });
  assert.deepEqual(d("Kyoto, then Mumbai."), { error: "series_follow_unknown_market" });
});

test("S4: a platform draft on the soonest instance; re-run spends no model call; cross-market ⇒ no market", async () => {
  const facts = await loadSeriesFollowFacts(KEY, { partnerHosts: noHosts });
  assert.ok(!("refused" in facts));
  let calls = 0;
  const post = await draftSeriesFollow(KEY, ADMIN, {
    partnerHosts: noHosts,
    model: async () => { calls++; return { title: "Following Lantern Jazz", summary: "Two cities.", body: "Kyoto, then Porto. Pick one and start a plan." }; },
  });
  assert.equal(post.status, "draft");
  assert.equal(post.authorship, "platform");
  assert.equal(post.contentType, "series_follow");
  assert.equal(post.cityEventId, ID("kyoto"));
  assert.equal(post.marketSlug, null);
  assert.equal(post.slug, seriesFollowSlug(facts));
  await assert.rejects(
    draftSeriesFollow(KEY, ADMIN, { partnerHosts: noHosts, model: async () => { calls++; return {}; } }),
    (e: unknown) => e instanceof BlogError && e.code === "already_drafted",
  );
  assert.equal(calls, 1);
  const srcs = await db.execute(sql`SELECT s.url FROM blog_post_sources s JOIN blog_posts p ON p.id = s.post_id WHERE p.slug = ${post.slug}`);
  assert.deepEqual((srcs.rows as any[]).map((r) => r.url), ["https://lanternjazz.example/porto"]);
});

test("S5: one live door per instance, read live; no ids; a withdrawn anchor has no doors", async () => {
  const facts = await loadSeriesFollowFacts(KEY, { partnerHosts: noHosts });
  assert.ok(!("refused" in facts));
  const slug = seriesFollowSlug(facts);
  const [row] = (await db.execute(sql`SELECT id FROM blog_posts WHERE slug = ${slug}`)).rows as any[];
  await publishPost(row.id, ADMIN);
  let pub = (await getPublishedBySlug(slug))!;
  assert.equal(pub.planDoor, null, "a follow has per-instance doors, not one");
  assert.deepEqual(pub.seriesDoors?.map((d) => d.city), ["Kyoto", "Porto"]);
  assert.equal(JSON.stringify(pub.seriesDoors).includes(`sfollow-${RUN}`), false, "no ids on the public read");

  await db.insert(cityEvents).values(ev("late", { city: "Edinburgh", venue: "Usher Hall", startsAt: at(120) }) as any);
  await db.update(cityEvents).set({ withdrawnAt: new Date() }).where(eq(cityEvents.id, ID("porto")));
  pub = (await getPublishedBySlug(slug))!;
  assert.deepEqual(pub.seriesDoors?.map((d) => d.city), ["Kyoto", "Edinburgh"], "added gains a door, withdrawn loses it");

  await db.update(cityEvents).set({ withdrawnAt: new Date() }).where(eq(cityEvents.id, ID("kyoto")));
  assert.equal((await getPublishedBySlug(slug))!.seriesDoors, null, "a withdrawn anchor ⇒ no doors");
});
