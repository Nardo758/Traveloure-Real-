/**
 * EVERY TICKED EVENT IS WRITTEN ONCE — the proof for ledger `2026-09-06-event-mint-dedupe`.
 * CLAUDE.md Locked Decisions 29 (an event IS a `user_experiences` row), 30 (b) (the pre-trip pen,
 * drained at mint), 33 (the ONE planning modal owns the ONE save) and 35 (`planEventRowValues`).
 *
 * ── THE DEFECT ──────────────────────────────────────────────────────────────────────────────
 * A traveler finishing the modal with "Build it myself" saw each ticked event TWICE (a Kyoto
 * wedding with Ceremony + Reception ticked minted a plan whose header read "4 events"). TWO
 * writers create the same rows in the same click and neither can see the other:
 *
 *   1. the SERVER's pen drain, inside the mint — `storage.createTrip` awaits
 *      `drainPendingEventsIntoTrip` (`server/services/pending-events.service.ts`), which promotes
 *      every title the pre-trip pen holds into a row. It is idempotent against rows that exist
 *      when it runs, and CANNOT be idempotent against rows created a moment LATER;
 *   2. the CLIENT's post-mint commit — `PlanModal.commitPlan` POSTs one `/api/user-experiences`
 *      per on-screen row, and the on-screen rows are SEEDED FROM THAT SAME PEN
 *      (`seedFormFrom` → `readPendingEvents`), so it re-creates exactly what the drain just wrote.
 *
 * The pen is what they share, so any finish that runs with a pen in hand doubles it: a Save on an
 * unbound plan (the modal's Save button writes the pen on every step), a pen left by an earlier
 * session, or a legacy pen hydrated from the server row.
 *
 * ── WHAT IS FIXED, AND WHO THE AUTHOR IS NOW ────────────────────────────────────────────────
 * THE MODAL IS THE AUTHOR of the events it collected: the finish RELEASES its own pen on the
 * server (awaited) before it mints, so the drain has nothing of the modal's to replay, and the
 * modal then creates the rows itself — with the occasion it resolved on screen, which the drain
 * can only guess at from a stored slug (its rule 5 creates NOTHING when that does not resolve).
 * The pen and its drain keep their whole job for every OTHER mint door (the cart auto-trip, the
 * saved-trip conversion, the AI snapshot) and for a pen the modal never comes back for.
 *
 * And because a release can fail and a traveler can finish twice, the modal's create is IDEMPOTENT
 * BY TITLE against what the plan already holds — the SAME rule the drain applies, now stated ONCE
 * in `shared/plan-events.ts` and called by both (§18 rule 1). No UNIQUE index and no DB CHECK: an
 * added constraint is the publish-trap posture this codebase refuses, and deduping in a READER
 * would hide the rows without stopping the second writer.
 *
 * ── WHAT THESE PROOFS HOLD ──────────────────────────────────────────────────────────────────
 *   D1  THE REPRODUCTION, as a model of the two writers over one pen: drain-then-commit yields
 *       ONE row per ticked event, not two.
 *   D2  DOUBLE SUBMIT: a second finish against the same plan creates nothing.
 *   D3  TITLE IS THE IDENTITY and nothing else is: case and surrounding space do not fork a row,
 *       a genuinely different title still creates, and a day/time/place is never part of the test.
 *   D4  THE MODAL'S CREATE LOOP filters through that shared rule instead of posting every row.
 *   D5  THE FINISH RELEASES THE PEN BEFORE IT MINTS, awaited, so the drain never replays it.
 *   D6  THE DRAIN uses the shared rule — one implementation, two callers.
 *   D7  NO CONSTRAINT AND NO READER-SIDE HIDING was added anywhere in this lane.
 *
 * ── NEGATIVE SPACE (stated, because green here is green-within-bounds) ──────────────────────
 * D1–D3 are a MODEL of the two writers, not the writers themselves: the client half lives inside
 * a React component and the server half needs a database, so what is proven behaviourally is the
 * shared decision both of them now make. D4–D7 are STATIC SOURCE PINS — they read the files as
 * text and prove the call sites exist, never that they run in the right order at runtime. The
 * ordering half (release → mint → commit) is an e2e question.
 *
 * Pure: no DOM, no React, no DB, no network.
 * Run: npx tsx --test client/src/lib/__tests__/event-mint-dedupe.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  eventsNotYetOnPlan,
  planEventRowValues,
  planEventTitleKey,
  type PlanEventDraft,
} from "@shared/plan-events";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const read = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");

const MODAL = "client/src/components/trip/plan-modal.tsx";
const DRAIN = "server/services/pending-events.service.ts";
const ORGANIZE = "client/src/lib/organize-events.ts";
const CONTEXT = "client/src/lib/trip-context.ts";
const SHARED = "shared/plan-events.ts";

/** The plan the QA walkthrough described: Kyoto, Nov 20–22 2026, wedding. */
const PLAN = { startDate: "2026-11-20", destination: "Kyoto, Japan" };
/** The two chips that came back four times. */
const TICKED: PlanEventDraft[] = [{ title: "Ceremony" }, { title: "Reception" }];

/**
 * A plan's rows, as the two writers would leave them. Deliberately the DUMBEST possible store —
 * an array — so nothing about the outcome comes from a uniqueness rule the model invented.
 */
function newPlan() {
  const rows: Array<ReturnType<typeof planEventRowValues>> = [];
  return {
    rows,
    titles: () => rows.map((r) => r.title),
    /** ONE writer's pass: create what is not already on the plan, exactly as both rails now do. */
    create(drafts: readonly PlanEventDraft[]) {
      for (const draft of eventsNotYetOnPlan(drafts, rows.map((r) => r.title))) {
        rows.push(planEventRowValues(draft, PLAN));
      }
    },
  };
}

describe("D1 — the reproduction: a pen drained at mint and then committed by the modal", () => {
  it("creates ONE row per ticked event, not two", () => {
    const plan = newPlan();
    // (1) The mint: `storage.createTrip` awaits the drain, which promotes the pen it finds.
    plan.create(TICKED);
    // (2) The modal's post-mint commit, whose on-screen rows were seeded from that same pen.
    plan.create(TICKED);
    assert.deepEqual(plan.titles(), ["Ceremony", "Reception"]);
  });

  it("and the row it leaves carries the plan's own day and place (the inheritance is untouched)", () => {
    const plan = newPlan();
    plan.create(TICKED);
    // `planEventRowValues` writes `location`, never `destination`; the whole row is pinned so a
    // change to the inheritance rule fails here rather than quietly altering what these rails write.
    assert.deepEqual(plan.rows[0], {
      title: "Ceremony",
      eventDate: "2026-11-20",
      location: "Kyoto, Japan",
      startTime: null,
    });
  });
});

describe("D2 — a double submit of the same finish", () => {
  it("creates nothing the second time", () => {
    const plan = newPlan();
    plan.create(TICKED);
    const after = plan.rows.length;
    plan.create(TICKED);
    plan.create(TICKED);
    assert.equal(plan.rows.length, after);
  });

  it("and an event ADDED between the two submits is still created", () => {
    const plan = newPlan();
    plan.create(TICKED);
    plan.create([...TICKED, { title: "Rehearsal dinner" }]);
    assert.deepEqual(plan.titles(), ["Ceremony", "Reception", "Rehearsal dinner"]);
  });
});

describe("D3 — title is the identity, and nothing else is", () => {
  it("case and surrounding space do not fork a row", () => {
    assert.equal(planEventTitleKey("  Ceremony  "), planEventTitleKey("ceremony"));
    const plan = newPlan();
    plan.create([{ title: "Ceremony" }]);
    plan.create([{ title: "  ceremony " }]);
    assert.deepEqual(plan.titles(), ["Ceremony"]);
  });

  it("a day, a time or a place is NEVER part of the test — an edited time cannot fork one event", () => {
    const plan = newPlan();
    plan.create([{ title: "Ceremony", startTime: "15:00" }]);
    plan.create([{ title: "Ceremony", startTime: "16:00", eventDate: "2026-11-21" }]);
    assert.deepEqual(plan.titles(), ["Ceremony"]);
    // The FIRST answer stands: this rule skips, it never rewrites a row (a re-time is an edit,
    // and an edit has its own rail — `PATCH /api/user-experiences/:id`).
    assert.equal(plan.rows[0].startTime, "15:00");
  });

  it("an empty or malformed existing title never swallows a real one (§13 — absent is not a match)", () => {
    assert.deepEqual(
      eventsNotYetOnPlan([{ title: "Ceremony" }], ["", "   ", null, undefined]),
      [{ title: "Ceremony" }],
    );
  });
});

describe("D4 — the modal's create loop is filtered, not unconditional", () => {
  const src = read(MODAL);

  it("filters the rows it is about to POST through the shared idempotency rule", () => {
    assert.match(
      src,
      /eventsNotYetCreated\(/,
      "commitPlan must create only what the plan does not already carry",
    );
  });

  it("reads the plan's existing events before creating (there is something to filter against)", () => {
    assert.match(src, /readExistingEventTitles/);
  });

  it("does not restate the identity rule with its own comparison", () => {
    // A hand-rolled `.some(... .toLowerCase() === ...)` beside the shared call is the drift class
    // §18 rule 1 names — the two would part company the day the identity changes.
    const loop = src.slice(src.indexOf("const rowsToCreate"), src.indexOf("THE STOPS"));
    assert.ok(
      !/toLowerCase\(\)\s*===/.test(loop),
      "the create path must not carry a second copy of the title comparison",
    );
  });
});

describe("D5 — the finish releases its own pen BEFORE it mints", () => {
  const src = read(MODAL);
  const finishBody = src.slice(src.indexOf("const finish = async"), src.indexOf('"CLEAR PLAN"'));

  it("calls the release", () => {
    assert.match(finishBody, /releasePendingEventsPen\(/);
  });

  it("awaits it, and does so before the mint (a release that lands after is no release at all)", () => {
    assert.match(finishBody, /await releasePendingEventsPen\(/);
    assert.ok(
      finishBody.indexOf("releasePendingEventsPen") < finishBody.indexOf("await mintPlan("),
      "the pen must be released before POST /api/trips, whose drain reads it",
    );
  });

  it("and the release is a real awaited server write, not a debounced one", () => {
    const ctx = read(CONTEXT);
    assert.match(ctx, /export async function releasePendingEventsPen/);
    // It must disarm the 1.5s debounce it just armed, or the stale blob lands after the clear —
    // the same race `clearTripContext` closes.
    const body = ctx.slice(ctx.indexOf("export async function releasePendingEventsPen"));
    assert.match(body.slice(0, 2000), /clearTimeout\(pushTimer\)/);
    assert.match(body.slice(0, 2000), /await fetch\(/);
  });
});

describe("D6/D7 — one implementation, and no constraint was added", () => {
  it("the drain uses the shared rule instead of its own title Set", () => {
    const src = read(DRAIN);
    assert.match(src, /eventsNotYetOnPlan/);
    assert.ok(
      !/new Set<string>\(/.test(src),
      "the drain's private existing-title Set must be gone, not shadowed by the shared rule",
    );
  });

  it("the slip's organize rail delegates to the same rule (three copies would be two too many)", () => {
    assert.match(read(ORGANIZE), /eventsNotYetOnPlan/);
  });

  it("the rule lives in shared/ so both sides of the wire read one authority", () => {
    const src = read(SHARED);
    assert.match(src, /export function eventsNotYetOnPlan/);
    assert.match(src, /export function planEventTitleKey/);
  });

  it("no UNIQUE index, no DB CHECK and no reader-side dedupe was introduced", () => {
    // The fix is an AUTHOR decision. A constraint on `user_experiences` would be the publish-trap
    // posture CLAUDE.md refuses, and hiding the rows in a reader would leave the writer in place.
    const shared = read(SHARED);
    assert.ok(!/unique|CHECK \(/i.test(shared.slice(shared.indexOf("eventsNotYetOnPlan"))));
  });
});
