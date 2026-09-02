/**
 * neighborhood-claims.db.test.ts — expert field knowledge v2, Phase 1 (claims + schema).
 *
 * Proves against a real database (migration 272 applied) that:
 *   C1. a claim is born `draft` (expert-facing: claimed), idempotently — a second create returns
 *       the same row and writes no second diary row
 *   C2. submit materializes TYPED rows for the claim version — P1 nuggets on the gem-candidate
 *       host carrying claim linkage + depth columns, one P2 template, one P3 contingency keyed to
 *       it, P4 rows HELD — writes the diary row in the same transaction, and touches
 *       expert_neighborhoods NOT AT ALL
 *   C3. ops manual entry (actor 'ops', no owner check) produces rows IDENTICAL in shape to console
 *       entry — only the diary's actor_type differs
 *   C4. the forward path: scorer marks scored → admin ratifies → `verified`, and the
 *       expert_neighborhoods row is born carrying claim_id/verified_at/ratified_by; a double
 *       ratify loses (atomic conditional), one row not two
 *   C5. the return path: decline stamps declined_at + the admin-picked dimension; the expert-facing
 *       view carries the §5 sentence with NO digit and the public word `claimed`; a resubmit inside
 *       the cooldown is refused; after the cooldown it bumps the version and the PRIOR version's
 *       rows survive (nothing deleted)
 *   C6. ONE WRITER: a raw insert into expert_neighborhoods is REFUSED by the DB; the scorer path
 *       (markClaimScored) writes nothing there; the lead swap inserts nothing for an expert with
 *       no row; a client-planted claim/web-gap cluster is stripped from createLocalKnowledgeNugget
 *   C7. thresholds_missing blocks BOTH the cooldown check and Ratify — no code default fills in
 *   C8. the scorer-failed path leaves the claim `submitted` with the flag raised, never zeroed
 *   C9. nugget_photos consent invariant (ported from #698): the one read path returns a photo only
 *       when its nugget's claim recorded consent; an unlinked nugget's photo is never returned
 *
 * Run with:
 *   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/traveloure \
 *   npx tsx --test server/__tests__/neighborhood-claims.db.test.ts
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

process.env.DATABASE_URL ??= "postgresql://postgres:postgres@localhost:5432/traveloure";
process.env.STRIPE_SECRET_KEY ??= "sk_test_dummy";

const { db, pool } = await import("../db");
const { and, eq, sql } = await import("drizzle-orm");
const {
  users,
  cityNeighborhoods,
  expertNeighborhoods,
  expertNeighborhoodClaims,
  neighborhoodClaimTransitions,
  localKnowledgeNuggets,
  miniSlipTemplates,
  claimContingencies,
  accessClaims,
  evidenceThresholds,
  nuggetPhotos,
} = await import("../../shared/schema");
const {
  createClaim,
  saveDraftCapture,
  submitClaim,
  markClaimScored,
  markClaimScorerFailed,
  ratifyClaim,
  declineClaim,
  listClaimsForExpert,
  listNeighborhoodOptions,
  stampNoNeighborhoodsAvailable,
  listConsentedNuggetPhotos,
} = await import("../services/neighborhood-claims.service");
const { swapNeighborhoodLeadTx } = await import("../services/admin-query.service");
const { createLocalKnowledgeNugget } = await import("../services/experts-query.service");
const { CAPTURE_SHAPE } = await import("../../shared/neighborhood-claims");

// ── Disposable-DB guard (mirrors gem-promotion's; never defaults open) ──
const DISPOSABLE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", ""]);
async function assertDisposableDb(): Promise<void> {
  if (process.env.JOURNEY_DB_WRITES_OK === "1") return;
  let host: string | null = null;
  try {
    host = new URL(process.env.DATABASE_URL ?? "").hostname.toLowerCase();
  } catch {
    host = null;
  }
  if (host === null || !DISPOSABLE_HOSTS.has(host)) {
    throw new Error(`Refusing to run DB-writing suite against non-local host "${host}" (set JOURNEY_DB_WRITES_OK=1 to override)`);
  }
}

// Letters only: the fixture neighborhood NAME must carry no digit, because C5 asserts the §5
// return sentence (which interpolates the name) never contains one.
const RUN = crypto.randomUUID().slice(0, 8).replace(/[0-9a-f]/g, (ch) => "abcdefghijklmnop"[parseInt(ch, 16)]);
const EXPERT_A = `efk-expert-a-${RUN}`;
const EXPERT_B = `efk-expert-b-${RUN}`;
const ADMIN = `efk-admin-${RUN}`;
const CITY = `Claimtown-${RUN}`;
let NEIGHBORHOOD_ID = "";

function fullCapture(tag: string) {
  return {
    p1: [
      {
        name: `Yasaka Shrine ${tag}`,
        category: "shrine",
        doThis: "Go in from the south gate off Higashiōji, not the main Nishirōmon everyone photographs.",
        when: { hours: "from 18:00", days: "", season: "not 1–3 Jan, not mid-July" },
        watchOut: "The main gate is a queue; the south approach is empty.",
        priceBand: null,
        expertConfidence: "certain",
      },
      {
        name: `Kagizen ${tag}`,
        category: "tea house",
        doThis: "Order the kuzukiri, sit in the back room.",
        when: { hours: "before 16:00", days: "closed Monday", season: "" },
        watchOut: "Last orders are earlier than the posted close.",
        priceBand: "$$",
        expertConfidence: "usually_right",
      },
    ],
    p2: {
      items: [
        { name: `Yasaka Shrine ${tag}`, durationMin: 40, transition: null },
        { name: `Kagizen ${tag}`, durationMin: 50, transition: { mode: "walk", minutes: 8 } },
        { name: `Shirakawa canal ${tag}`, durationMin: 60, transition: { mode: "walk", minutes: 10 } },
      ],
      orderReason: "Lanterns light first, tea before it closes, the canal is best after dark.",
      hardConstraints: [{ kind: "closure_day", detail: "Kagizen closes Monday." }],
    },
    p3: {
      trigger: "rain",
      replacesPosition: 3,
      alternate: { name: `Covered Nishiki arcade ${tag}`, durationMin: 60, transition: { mode: "bus", minutes: 15 } },
      reason: "The canal walk is the one leg that dies in rain; the arcade is covered and open late.",
    },
    p4: [{ venue: `Kagizen ${tag}`, accessType: "reservation", relationshipBasis: "The owner's sister runs the school where I teach." }],
  };
}

async function evidenceCounts(claimId: string, version: number) {
  const [n] = await db.select({ c: sql<number>`count(*)::int` }).from(localKnowledgeNuggets)
    .where(and(eq(localKnowledgeNuggets.claimId, claimId), eq(localKnowledgeNuggets.claimVersion, version)));
  const [t] = await db.select({ c: sql<number>`count(*)::int` }).from(miniSlipTemplates)
    .where(and(eq(miniSlipTemplates.claimId, claimId), eq(miniSlipTemplates.claimVersion, version)));
  const [k] = await db.select({ c: sql<number>`count(*)::int` }).from(claimContingencies)
    .where(and(eq(claimContingencies.claimId, claimId), eq(claimContingencies.claimVersion, version)));
  const [a] = await db.select({ c: sql<number>`count(*)::int` }).from(accessClaims)
    .where(and(eq(accessClaims.claimId, claimId), eq(accessClaims.claimVersion, version)));
  return { nuggets: n.c, templates: t.c, contingencies: k.c, access: a.c };
}

async function neighborhoodRows(expertId: string) {
  return db.select().from(expertNeighborhoods).where(eq(expertNeighborhoods.expertId, expertId));
}

async function diary(claimId: string) {
  return db.select().from(neighborhoodClaimTransitions).where(eq(neighborhoodClaimTransitions.claimId, claimId)).orderBy(neighborhoodClaimTransitions.createdAt);
}

describe("neighborhood claims — Phase 1 (claims + typed evidence + one writer)", () => {
  before(async () => {
    await assertDisposableDb();
    for (const [id, role] of [[EXPERT_A, "local_expert"], [EXPERT_B, "local_expert"], [ADMIN, "admin"]] as const) {
      await db.insert(users).values({ id, email: `${id}@example.test`, firstName: "EFK", lastName: id, role } as any).onConflictDoNothing();
    }
    const [nb] = await db.insert(cityNeighborhoods).values({
      city: CITY, country: "Testland", name: `Gion ${RUN}`, slug: `gion-${RUN}`,
      centroidLat: "35.0036", centroidLng: "135.7748",
    }).returning({ id: cityNeighborhoods.id });
    NEIGHBORHOOD_ID = nb.id;
  });

  after(async () => {
    // users cascade → claims → evidence rows → expert_neighborhoods; then the neighborhood.
    await db.delete(users).where(sql`${users.id} IN (${EXPERT_A}, ${EXPERT_B}, ${ADMIN})`);
    await db.delete(cityNeighborhoods).where(eq(cityNeighborhoods.id, NEIGHBORHOOD_ID));
    await pool.end();
  });

  let claimA = "";

  it("C1. a claim is born draft (expert-facing: claimed), idempotently", async () => {
    const first = await createClaim({ expertId: EXPERT_A, neighborhoodId: NEIGHBORHOOD_ID, actorType: "expert", actorId: EXPERT_A });
    assert.ok(first.ok);
    assert.equal(first.value.created, true);
    assert.equal(first.value.claim.status, "draft");
    claimA = first.value.claim.id;

    const second = await createClaim({ expertId: EXPERT_A, neighborhoodId: NEIGHBORHOOD_ID, actorType: "expert", actorId: EXPERT_A });
    assert.ok(second.ok);
    assert.equal(second.value.created, false);
    assert.equal(second.value.claim.id, claimA);

    const d = await diary(claimA);
    assert.equal(d.length, 1);
    assert.equal(d[0].toStatus, "draft");
    assert.equal(d[0].actorType, "expert");

    const view = (await listClaimsForExpert(EXPERT_A)).find((c) => c.id === claimA)!;
    assert.equal(view.status, "claimed");
    assert.equal(view.canEdit, true);
    assert.equal((view as any).scorerJson, undefined, "expert view never carries scorer output");

    const options = await listNeighborhoodOptions(CITY);
    assert.equal(options.length, 1);
    assert.equal(options[0].daypart, "evening", "NULL default_daypart resolves to evening");
  });

  it("C2. submit materializes typed rows for the version and never touches expert_neighborhoods", async () => {
    const saved = await saveDraftCapture({ claimId: claimA, expertId: EXPERT_A, payload: { p1: [{ name: "half typed" }], p2: null, p3: null, p4: [] } });
    assert.ok(saved.ok, "save-and-finish-later accepts a partial draft");

    const noConsent = await submitClaim({ claimId: claimA, expertId: EXPERT_A, actorType: "expert", actorId: EXPERT_A, consent: false, consentVersion: "t", capture: fullCapture("A") });
    assert.ok(!noConsent.ok && noConsent.code === "consent_required");

    const incomplete = await submitClaim({ claimId: claimA, expertId: EXPERT_A, actorType: "expert", actorId: EXPERT_A, consent: true, consentVersion: "t" });
    assert.ok(!incomplete.ok && incomplete.code === "incomplete_capture", "the half-typed draft is not submittable");
    assert.deepEqual(await evidenceCounts(claimA, 1), { nuggets: 0, templates: 0, contingencies: 0, access: 0 }, "a refused submit writes no evidence rows");

    const cross = await submitClaim({ claimId: claimA, expertId: EXPERT_B, actorType: "expert", actorId: EXPERT_B, consent: true, consentVersion: "t", capture: fullCapture("A") });
    assert.ok(!cross.ok && cross.status === 404, "another expert cannot submit my claim");

    const ok = await submitClaim({ claimId: claimA, expertId: EXPERT_A, actorType: "expert", actorId: EXPERT_A, consent: true, consentVersion: "tos-test", capture: fullCapture("A") });
    assert.ok(ok.ok, (ok as any).message);
    assert.equal(ok.value.status, "submitted");
    assert.equal(ok.value.version, 1);
    assert.ok(ok.value.consentAt);
    assert.equal(ok.value.consentVersion, "tos-test");

    assert.deepEqual(await evidenceCounts(claimA, 1), { nuggets: 2, templates: 1, contingencies: 1, access: 1 });

    const nuggets = await db.select().from(localKnowledgeNuggets).where(eq(localKnowledgeNuggets.claimId, claimA));
    for (const n of nuggets) {
      assert.equal(n.expertUserId, EXPERT_A, "P1 rows carry curated-by attribution from the claim, never a body");
      assert.equal(n.neighborhoodId, NEIGHBORHOOD_ID);
      assert.equal(n.claimVersion, 1);
      assert.ok(n.watchOut && n.whenJson && n.normalizedName, "depth columns populated");
      assert.equal(n.webGap, null, "the scorer, not submit, writes web_gap");
      assert.equal(n.promotionStatus, null, "a P1 row is NOT auto-proposed as a gem");
    }
    const [tpl] = await db.select().from(miniSlipTemplates).where(eq(miniSlipTemplates.claimId, claimA));
    assert.equal((tpl.items as any[]).length, CAPTURE_SHAPE.p2Items);
    assert.equal((tpl.items as any[])[0].transition, null, "first stop has no transition");
    assert.equal((tpl.items as any[])[1].transition.mode, "walk");
    const [cont] = await db.select().from(claimContingencies).where(eq(claimContingencies.claimId, claimA));
    assert.equal(cont.miniSlipTemplateId, tpl.id, "P3 is keyed to the P2 row");
    const [acc] = await db.select().from(accessClaims).where(eq(accessClaims.claimId, claimA));
    assert.equal(acc.verificationStatus, "held", "P4 is held (ruling 2026-09-01-access-claims-held)");

    const d = await diary(claimA);
    assert.deepEqual(d.map((r) => r.toStatus), ["draft", "submitted"]);
    assert.equal((await neighborhoodRows(EXPERT_A)).length, 0, "submit never writes expert_neighborhoods");

    const view = (await listClaimsForExpert(EXPERT_A)).find((c) => c.id === claimA)!;
    assert.equal(view.status, "claimed", "submitted is still `claimed` to the expert");
    assert.equal(view.awaitingReview, true);
    assert.equal(view.canEdit, false);
  });

  it("C3. ops manual entry produces identical rows to console entry (actor_type aside)", async () => {
    const created = await createClaim({ expertId: EXPERT_B, neighborhoodId: NEIGHBORHOOD_ID, actorType: "ops", actorId: ADMIN });
    assert.ok(created.ok);
    const ops = await submitClaim({ claimId: created.value.claim.id, expertId: null, actorType: "ops", actorId: ADMIN, consent: true, consentVersion: "tos-test", capture: fullCapture("A") });
    assert.ok(ops.ok, (ops as any).message);

    const strip = (rows: any[]) => rows
      .map(({ id, claimId, expertId, expertUserId, createdAt, updatedAt, miniSlipTemplateId, ...rest }) => rest)
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    const consoleNuggets = strip(await db.select().from(localKnowledgeNuggets).where(eq(localKnowledgeNuggets.claimId, claimA)));
    const opsNuggets = strip(await db.select().from(localKnowledgeNuggets).where(eq(localKnowledgeNuggets.claimId, created.value.claim.id)));
    assert.deepEqual(opsNuggets, consoleNuggets, "P1 rows identical");
    const consoleTpl = strip(await db.select().from(miniSlipTemplates).where(eq(miniSlipTemplates.claimId, claimA)));
    const opsTpl = strip(await db.select().from(miniSlipTemplates).where(eq(miniSlipTemplates.claimId, created.value.claim.id)));
    assert.deepEqual(opsTpl, consoleTpl, "P2 rows identical");
    const consoleCont = strip(await db.select().from(claimContingencies).where(eq(claimContingencies.claimId, claimA)));
    const opsCont = strip(await db.select().from(claimContingencies).where(eq(claimContingencies.claimId, created.value.claim.id)));
    assert.deepEqual(opsCont, consoleCont, "P3 rows identical");
    const consoleAcc = strip(await db.select().from(accessClaims).where(eq(accessClaims.claimId, claimA)));
    const opsAcc = strip(await db.select().from(accessClaims).where(eq(accessClaims.claimId, created.value.claim.id)));
    assert.deepEqual(opsAcc, consoleAcc, "P4 rows identical");

    const d = await diary(created.value.claim.id);
    assert.deepEqual(d.map((r) => r.actorType), ["ops", "ops"], "only the diary tells the paths apart");
    assert.equal(d[1].actorId, ADMIN);
  });

  it("C6a. ONE WRITER: a raw insert into expert_neighborhoods is refused by the database", async () => {
    // drizzle wraps the driver error ("Failed query: …") and keeps the trigger's message on `cause`.
    const refusedByTrigger = (err: any) =>
      /written only by claim ratification/.test(String(err?.cause?.message ?? "")) ||
      /written only by claim ratification/.test(String(err?.message ?? ""));
    await assert.rejects(
      db.insert(expertNeighborhoods).values({ expertId: EXPERT_A, neighborhoodId: NEIGHBORHOOD_ID, isLead: false, sortOrder: 0 }),
      refusedByTrigger,
    );
    await assert.rejects(
      db.execute(sql`INSERT INTO expert_neighborhoods (expert_id, neighborhood_id, is_lead) VALUES (${EXPERT_A}, ${NEIGHBORHOOD_ID}, true)`),
      refusedByTrigger,
      "the retired raw-SQL upsert shape is refused too",
    );
    assert.equal((await neighborhoodRows(EXPERT_A)).length, 0);
  });

  it("C6b. the scorer path and the lead swap write nothing to expert_neighborhoods", async () => {
    const swap = await swapNeighborhoodLeadTx(NEIGHBORHOOD_ID, EXPERT_A);
    assert.deepEqual(swap, { promoted: false }, "no row → no lead, and no insert");
    assert.equal((await neighborhoodRows(EXPERT_A)).length, 0);

    const scored = await markClaimScored({ claimId: claimA, version: 1, scorerJson: { p1: [], note: "fixture" } });
    assert.ok(scored.ok);
    assert.equal(scored.value.status, "scored");
    assert.equal((await neighborhoodRows(EXPERT_A)).length, 0, "scoring never births a neighborhood row");
    const wrongVersion = await markClaimScored({ claimId: claimA, version: 1, scorerJson: {} });
    assert.ok(!wrongVersion.ok, "rescoring the same version is a no-op (already scored)");
  });

  it("C7. thresholds_missing blocks Ratify — no code default", async () => {
    const [row] = await db.select().from(evidenceThresholds).where(eq(evidenceThresholds.thresholdKey, "resubmit_cooldown_days"));
    assert.ok(row, "migration 272 seeded the thresholds");
    await db.delete(evidenceThresholds).where(eq(evidenceThresholds.thresholdKey, "resubmit_cooldown_days"));
    try {
      const blocked = await ratifyClaim({ claimId: claimA, adminId: ADMIN });
      assert.ok(!blocked.ok && blocked.code === "thresholds_missing" && blocked.status === 503);
      const [still] = await db.select().from(expertNeighborhoodClaims).where(eq(expertNeighborhoodClaims.id, claimA));
      assert.equal(still.status, "scored", "a blocked ratify changes nothing");
      assert.equal((await neighborhoodRows(EXPERT_A)).length, 0);
    } finally {
      await db.insert(evidenceThresholds).values(row).onConflictDoNothing();
    }
  });

  it("C4. scored → ratify births the ONE expert_neighborhoods row; a double ratify loses", async () => {
    const r = await ratifyClaim({ claimId: claimA, adminId: ADMIN });
    assert.ok(r.ok, (r as any).message);
    assert.equal(r.value.claim.status, "verified");
    assert.equal(r.value.claim.ratifiedBy, ADMIN);

    const rows = await neighborhoodRows(EXPERT_A);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].claimId, claimA);
    assert.equal(rows[0].ratifiedBy, ADMIN);
    assert.ok(rows[0].verifiedAt);
    assert.equal(rows[0].isLead, false, "ratification never claims lead");

    const again = await ratifyClaim({ claimId: claimA, adminId: ADMIN });
    assert.ok(!again.ok && again.status === 409);
    assert.equal((await neighborhoodRows(EXPERT_A)).length, 1, "one row, not two");

    const view = (await listClaimsForExpert(EXPERT_A)).find((c) => c.id === claimA)!;
    assert.equal(view.status, "verified");
    assert.ok(view.verifiedAt);

    // Lead is now a toggle on the existing verified row.
    const swap = await swapNeighborhoodLeadTx(NEIGHBORHOOD_ID, EXPERT_A);
    assert.deepEqual(swap, { promoted: true });
    assert.equal((await neighborhoodRows(EXPERT_A))[0].isLead, true);

    const d = await diary(claimA);
    assert.deepEqual(d.map((x) => x.toStatus), ["draft", "submitted", "scored", "verified"]);
    assert.equal(d[3].actorType, "admin");
  });

  it("C5. decline → §5 sentence with no digit → cooldown refuses → resubmit versions, deletes nothing", async () => {
    const [claimB] = await db.select().from(expertNeighborhoodClaims).where(eq(expertNeighborhoodClaims.expertId, EXPERT_B));
    const scored = await markClaimScored({ claimId: claimB.id, version: 1, scorerJson: { note: "fixture" } });
    assert.ok(scored.ok);

    const bad = await declineClaim({ claimId: claimB.id, adminId: ADMIN, dimension: "vibes" as any });
    assert.ok(!bad.ok && bad.status === 400);

    const declined = await declineClaim({ claimId: claimB.id, adminId: ADMIN, dimension: "localness" });
    assert.ok(declined.ok);
    assert.equal(declined.value.declinedDimension, "localness");
    assert.ok(declined.value.declinedAt);

    const view = (await listClaimsForExpert(EXPERT_B)).find((c) => c.id === claimB.id)!;
    assert.equal(view.status, "claimed", "a returned claim is still `claimed` — dark is honest");
    assert.equal(view.canEdit, true);
    assert.ok(view.returnMessage, "the expert gets the §5 sentence");
    assert.doesNotMatch(view.returnMessage!, /\d/, "the return message never contains a digit");
    assert.doesNotMatch(view.returnMessage!, /\b(test|exam|score|pass|fail)\b/i);
    assert.equal(JSON.stringify(view).includes("localness"), false, "the dimension NAME never reaches the expert");

    const tooSoon = await submitClaim({ claimId: claimB.id, expertId: EXPERT_B, actorType: "expert", actorId: EXPERT_B, consent: true, consentVersion: "t", capture: fullCapture("B2") });
    assert.ok(!tooSoon.ok && tooSoon.code === "resubmit_cooldown");
    assert.deepEqual(await evidenceCounts(claimB.id, 2), { nuggets: 0, templates: 0, contingencies: 0, access: 0 });

    // Backdate the decline past the cooldown (the number is read from evidence_thresholds).
    const [{ value: cooldown }] = await db.select({ value: evidenceThresholds.value }).from(evidenceThresholds).where(eq(evidenceThresholds.thresholdKey, "resubmit_cooldown_days"));
    await db.update(expertNeighborhoodClaims)
      .set({ declinedAt: new Date(Date.now() - (cooldown + 1) * 24 * 3600 * 1000) })
      .where(eq(expertNeighborhoodClaims.id, claimB.id));

    const resub = await submitClaim({ claimId: claimB.id, expertId: EXPERT_B, actorType: "expert", actorId: EXPERT_B, consent: true, consentVersion: "t", capture: fullCapture("B2") });
    assert.ok(resub.ok, (resub as any).message);
    assert.equal(resub.value.version, 2);
    assert.equal(resub.value.status, "submitted");
    assert.deepEqual(await evidenceCounts(claimB.id, 1), { nuggets: 2, templates: 1, contingencies: 1, access: 1 }, "version 1 rows survive");
    assert.deepEqual(await evidenceCounts(claimB.id, 2), { nuggets: 2, templates: 1, contingencies: 1, access: 1 }, "version 2 rows added");
    const d = await diary(claimB.id);
    assert.deepEqual(d.map((x) => x.toStatus), ["draft", "submitted", "scored", "declined", "submitted"]);
    assert.equal(d[4].claimVersion, 2);
  });

  it("C8. scorer-failed leaves the claim submitted with the flag raised, never zeroed", async () => {
    const [claimB] = await db.select().from(expertNeighborhoodClaims).where(eq(expertNeighborhoodClaims.expertId, EXPERT_B));
    assert.equal(claimB.status, "submitted");
    assert.equal(await markClaimScorerFailed({ claimId: claimB.id, version: 2, reason: "malformed_json" }), true);
    const [after] = await db.select().from(expertNeighborhoodClaims).where(eq(expertNeighborhoodClaims.id, claimB.id));
    assert.equal(after.status, "submitted");
    assert.equal(after.scorerFailed, true);
    assert.equal(after.scorerJson, null, "no zeroed scores were written");
    const ratifyBlocked = await ratifyClaim({ claimId: claimB.id, adminId: ADMIN });
    assert.ok(!ratifyBlocked.ok && ratifyBlocked.status === 409, "an unscored claim cannot be ratified");
  });

  it("C6c. §19: a client-planted claim / web-gap cluster is stripped at nugget birth", async () => {
    const row = await createLocalKnowledgeNugget({
      expertUserId: EXPERT_A,
      nuggetType: "tip",
      city: CITY,
      insight: "planted",
      claimId: claimA,
      claimVersion: 9,
      webGap: "absent",
      webGapUrl: "https://example.test",
      webGapCheckedAt: new Date(),
    });
    assert.equal(row.claimId, null);
    assert.equal(row.claimVersion, null);
    assert.equal(row.webGap, null);
    assert.equal(row.webGapUrl, null);
    await db.delete(localKnowledgeNuggets).where(eq(localKnowledgeNuggets.id, row.id));
  });

  it("C9. nugget_photos: only a consented claim's photo comes back through the one read path", async () => {
    const [linked] = await db.select({ id: localKnowledgeNuggets.id }).from(localKnowledgeNuggets)
      .where(and(eq(localKnowledgeNuggets.claimId, claimA), eq(localKnowledgeNuggets.claimVersion, 1))).limit(1);
    const unlinked = await createLocalKnowledgeNugget({ expertUserId: EXPERT_A, nuggetType: "tip", city: CITY, insight: "no claim behind me" });
    assert.equal(unlinked.claimId, null);
    await db.insert(nuggetPhotos).values([
      { nuggetId: linked.id, position: 1, photoUrl: "/objects/efk/consented-1.jpg" },
      { nuggetId: unlinked.id, position: 1, photoUrl: "/objects/efk/unanchored-1.jpg" },
    ]);
    try {
      const rows = await listConsentedNuggetPhotos([linked.id, unlinked.id]);
      assert.deepEqual(rows.map((r) => r.nuggetId), [linked.id], "only the consented claim's photo is returned");
      // Withdraw the consent anchor and the same photo disappears — the gate is the join, not the row.
      await db.update(expertNeighborhoodClaims).set({ consentAt: null }).where(eq(expertNeighborhoodClaims.id, claimA));
      assert.deepEqual(await listConsentedNuggetPhotos([linked.id, unlinked.id]), []);
      await db.update(expertNeighborhoodClaims).set({ consentAt: new Date() }).where(eq(expertNeighborhoodClaims.id, claimA));
      assert.equal((await listConsentedNuggetPhotos([linked.id])).length, 1);
    } finally {
      await db.delete(nuggetPhotos).where(sql`${nuggetPhotos.nuggetId} IN (${linked.id}, ${unlinked.id})`);
      await db.delete(localKnowledgeNuggets).where(eq(localKnowledgeNuggets.id, unlinked.id));
    }
  });

  it("D5. the no-neighborhoods stamp is written only when the picker is empty and no claim exists", async () => {
    const { localExpertForms } = await import("../../shared/schema");
    const [form] = await db.insert(localExpertForms).values({ userId: EXPERT_B, name: "EFK B", email: `${EXPERT_B}@example.test`, city: CITY, country: "Testland" } as any).returning({ id: localExpertForms.id });
    try {
      assert.equal(await stampNoNeighborhoodsAvailable({ formId: form.id, userId: EXPERT_B, city: CITY }), false, "options exist → no stamp");
      assert.equal(await stampNoNeighborhoodsAvailable({ formId: form.id, userId: EXPERT_B, city: `Nowhere-${RUN}` }), false, "no options but the expert holds a claim → no stamp");
      const [form2] = await db.insert(localExpertForms).values({ userId: ADMIN, name: "EFK Admin", email: `${ADMIN}@example.test`, city: `Nowhere-${RUN}`, country: "Testland" } as any).returning({ id: localExpertForms.id });
      assert.equal(await stampNoNeighborhoodsAvailable({ formId: form2.id, userId: ADMIN, city: `Nowhere-${RUN}` }), true, "no options, no claim → stamped");
      assert.equal(await stampNoNeighborhoodsAvailable({ formId: form2.id, userId: ADMIN, city: `Nowhere-${RUN}` }), false, "idempotent");
      await db.delete(localExpertForms).where(eq(localExpertForms.id, form2.id));
    } finally {
      await db.delete(localExpertForms).where(eq(localExpertForms.id, form.id));
    }
  });
});
