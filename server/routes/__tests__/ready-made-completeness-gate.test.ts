/**
 * Ready-Made submit/approval completeness gate.
 *
 * These tests invoke the real route handlers with the shared Drizzle instance
 * mocked at its boundary. They prove that submit and approval use the same
 * completeness definition, without creating database fixtures.
 *
 * Run with:
 *   npx tsx --test server/routes/__tests__/ready-made-completeness-gate.test.ts
 */
import { after, afterEach, before, describe, it, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

process.env.DATABASE_URL ||= "postgresql://test:test@localhost:5432/test";
process.env.STRIPE_SECRET_KEY = "sk_test_ready_made_completeness_gate";

const { db } = await import("../../db.js");
const readyMadeRouter = (await import("../ready-made.routes.js")).default;
const { assertReadyMadeComplete, READY_MADE_HERO_REFUSAL, readyMadeHeroRefusal, readyMadeHeroSource } = await import("../ready-made.routes.js");
const adminRouter = (await import("../admin.routes.js")).default;
const { READY_MADE_PLACEHOLDER_TITLE } = await import("../ready-made.routes.js");

const AUTHOR_ID = "author-1";
const ADMIN = { id: "admin-1", role: "admin" };
const LISTING_ID = "listing-1";

function makeChain(rows: unknown): any {
  const chain: any = {};
  const promise = Promise.resolve(rows);
  for (const method of ["from", "leftJoin", "where", "limit", "groupBy", "orderBy", "set"]) {
    chain[method] = () => chain;
  }
  chain.then = promise.then.bind(promise);
  chain.catch = promise.catch.bind(promise);
  chain[Symbol.toStringTag] = "Promise";
  return chain;
}

function queueSelects(...responses: unknown[]) {
  return () => makeChain(responses.shift() ?? []);
}

function getPostHandler(router: any, path: string): (req: any, res: any) => Promise<void> {
  const layer = router.stack.find(
    (candidate: any) => candidate.route?.path === path && candidate.route?.methods?.post,
  );
  assert.ok(layer, `could not find POST ${path}`);
  return layer.route.stack.at(-1).handle;
}

function makeReq(userId: string, listingId = LISTING_ID, body: Record<string, unknown> = {}) {
  return {
    user: { id: userId },
    isAuthenticated: () => true,
    params: { id: listingId },
    body,
    ip: "127.0.0.1",
    get: () => null,
  };
}

function makeRes() {
  const captured = { status: 200, body: null as any };
  const res = {
    status(status: number) {
      captured.status = status;
      return res;
    },
    json(body: any) {
      captured.body = body;
      return res;
    },
  };
  return { captured, res };
}

function completeListing(status: "draft" | "submitted" = "submitted") {
  return {
    id: LISTING_ID,
    sourceTripId: "trip-1",
    title: "Kyoto temple mornings",
    planType: "city_itinerary",
    heroImageUrl: "https://images.unsplash.com/photo-1",
    heroImageMeta: { photographer: "Traveloure photographer" },
    priceCents: 12000,
    market: "Kyoto",
    durationDays: 2,
    status,
  };
}

const submitHandler = getPostHandler(
  readyMadeRouter,
  "/api/expert/ready-made/:id/submit",
);
const approveHandler = getPostHandler(
  adminRouter,
  "/api/admin/ready-made/:id/approve",
);

let originalSelect: typeof db.select;
let originalUpdate: typeof db.update;
let originalInsert: typeof db.insert;
let updateCalls = 0;

before(() => {
  originalSelect = db.select.bind(db);
  originalUpdate = db.update.bind(db);
  originalInsert = db.insert.bind(db);
});

afterEach(() => {
  (db as any).select = originalSelect;
  (db as any).update = originalUpdate;
  (db as any).insert = originalInsert;
  updateCalls = 0;
});

after(() => {
  (db as any).select = originalSelect;
  (db as any).update = originalUpdate;
  (db as any).insert = originalInsert;
});

describe("Ready-Made completeness gate", () => {
  it("submit rejects the placeholder title and returns the exact missing-field message", async () => {
    const listing = { ...completeListing(), title: READY_MADE_PLACEHOLDER_TITLE };
    (db as any).select = queueSelects([listing], [{ dayNumber: 1 }, { dayNumber: 2 }]);

    const { captured, res } = makeRes();
    await submitHandler(makeReq(AUTHOR_ID), res);

    assert.equal(captured.status, 400);
    assert.equal(captured.body?.message, "Not ready to submit");
    assert.deepEqual(captured.body?.missing, [
      { requirement: "title", message: "Give the trip a real title." },
    ]);
  });

  it("approval rejects an incomplete submitted listing before the approval update", async () => {
    const listing = { ...completeListing(), title: READY_MADE_PLACEHOLDER_TITLE };
    (db as any).select = queueSelects(
      [ADMIN],
      [listing],
      [{ dayNumber: 1 }, { dayNumber: 2 }],
    );
    (db as any).update = () => {
      updateCalls += 1;
      return makeChain([]);
    };

    const { captured, res } = makeRes();
    await approveHandler(makeReq(ADMIN.id), res);

    assert.equal(captured.status, 400);
    assert.equal(captured.body?.message, "Not ready to approve");
    assert.equal(captured.body?.missing?.[0]?.requirement, "title");
    assert.equal(updateCalls, 0, "invalid listings must not reach the approval update");
  });

  it("approval rejects a draft listing with 409", async () => {
    (db as any).select = queueSelects([ADMIN], [completeListing("draft")]);
    (db as any).update = () => {
      updateCalls += 1;
      return makeChain([]);
    };

    const { captured, res } = makeRes();
    await approveHandler(makeReq(ADMIN.id), res);

    assert.equal(captured.status, 409);
    assert.equal(captured.body?.message, "Only submitted listings can be approved");
    assert.equal(updateCalls, 0);
  });

  it("approval accepts a complete submitted listing", async () => {
    const listing = completeListing();
    (db as any).select = queueSelects(
      [ADMIN],
      [listing],
      [{ dayNumber: 1 }, { dayNumber: 2 }],
      [{ itemType: "activity", count: 2 }],
      [{ dayNumber: 1 }, { dayNumber: 2 }],
    );
    (db as any).update = () => {
      updateCalls += 1;
      const chain: any = makeChain([{ ...listing, status: "approved" }]);
      chain.returning = () => Promise.resolve([{ ...listing, status: "approved" }]);
      return chain;
    };
    (db as any).insert = () => ({ values: () => Promise.resolve({}) });

    const { captured, res } = makeRes();
    // FIXTURE EDIT (CMS-1 brief §4a, ledger `2026-11-04-cms1-launch-screens`): approval now needs the admin's
    // photo-rights tick; the completeness gate still runs first and is unchanged.
    await approveHandler(makeReq(ADMIN.id, LISTING_ID, { photoRightsTicked: true }), res);

    assert.equal(captured.status, 200);
    assert.equal(captured.body?.success, true);
    assert.equal(captured.body?.listing?.status, "approved");
    assert.equal(updateCalls, 1);
  });

  /**
   * D1 (Leon, Nov 27 2026): the cover photo is OPTIONAL. Submit passes with no hero; an existing hero still passes.
   */
  it("D1: submit with no hero passes", async () => {
    (db as any).select = queueSelects([{ dayNumber: 1 }, { dayNumber: 2 }]);
    const lines = await assertReadyMadeComplete({ ...completeListing(), heroImageUrl: null, heroImageMeta: null } as any);
    const hero = lines.filter((l) => l.requirement === "hero");
    console.log(`[d1-hero] no_hero hero_lines=${hero.length}`);
    assert.deepEqual(hero, []);
  });

  it("D1: an existing hero still passes", async () => {
    (db as any).select = queueSelects([{ dayNumber: 1 }, { dayNumber: 2 }]);
    const lines = await assertReadyMadeComplete({ ...completeListing() } as any);
    const hero = lines.filter((l) => l.requirement === "hero");
    console.log(`[d1-hero] with_hero hero_lines=${hero.length}`);
    assert.deepEqual(hero, []);
  });
});


test("D1: the unused hero-search route is gone", () => {
  const src = fs.readFileSync("server/routes/ready-made.routes.ts", "utf8");
  assert.equal(src.includes("/api/expert/ready-made/hero-search"), false);
  assert.equal(src.includes("[ready-made] hero-search error"), false);
});

test("D1: own upload, official source with credit, and Commons with licence pass", () => {
  assert.equal(readyMadeHeroRefusal("https://storage.googleapis.com/traveloure-uploads/a.jpg", null), null);
  assert.equal(
    readyMadeHeroRefusal("https://www.shokoku-ji.jp/en/ginkakuji/photo.jpg", {
      photographer: "Ginkaku-ji", profileUrl: "https://www.shokoku-ji.jp/en/ginkakuji/",
    }),
    null,
  );
  assert.equal(
    readyMadeHeroRefusal("https://upload.wikimedia.org/wikipedia/commons/a/ab/x.jpg", {
      photographer: "A. Author", profileUrl: "https://commons.wikimedia.org/wiki/File:X.jpg", license: "CC BY-SA 4.0",
    }),
    null,
  );
});

test("D1: Commons without a licence fails", () => {
  assert.equal(
    readyMadeHeroRefusal("https://upload.wikimedia.org/wikipedia/commons/a/ab/x.jpg", {
      photographer: "A. Author", profileUrl: "https://commons.wikimedia.org/wiki/File:X.jpg",
    }),
    READY_MADE_HERO_REFUSAL,
  );
});

test("D1: Unsplash and Pexels are refused", () => {
  assert.equal(readyMadeHeroSource("https://images.unsplash.com/photo-1"), null);
  assert.equal(readyMadeHeroSource("https://plus.unsplash.com/premium_photo-1"), null);
  assert.equal(readyMadeHeroSource("https://images.pexels.com/photos/1/a.jpg"), null);
  assert.equal(
    readyMadeHeroRefusal("https://images.pexels.com/photos/1/a.jpg", {
      photographer: "A", profileUrl: "https://www.pexels.com/@a",
    }),
    READY_MADE_HERO_REFUSAL,
  );
});

test("D1: the refusal is the DRAFT photo-rule sentence", () => {
  assert.equal(
    READY_MADE_HERO_REFUSAL,
    "Use your own photo, an official source's photo with its credit, or a Wikimedia Commons image with its licence.",
  );
  assert.doesNotMatch(READY_MADE_HERO_REFUSAL, /picker/i);
});
