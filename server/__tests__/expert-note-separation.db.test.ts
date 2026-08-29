/**
 * expert-note-separation.db.test.ts — the §21 three-field note contract
 * (2026-08-29-replit-gem-audit rulings 5+6).
 *
 * Ruling 5: the private/delivered separation is PRESERVED — `trips.expert_notes`
 * (the Workstation's PRIVATE build notes) / `trips.expert_traveler_note`
 * (trip-level DELIVERED) / `itinerary_items.expert_note` (per-item DELIVERED)
 * are three fields, never merged, private never traveler-rendered.
 * Ruling 6: the depth commit adds ONLY per-item note authoring + owner-scoped
 * render — both already exist on main (Workstation textarea → §12-gated PATCH;
 * PlanCard/Slip render). Re-verification found NO test asserting any of it, so
 * this spec is that commit's delivery: the previously missing PROOF.
 *
 * Proves against a real database that:
 *   D1. the owner's assembled plan DELIVERS expert_traveler_note (plancard.trip
 *       + tripNote) and the per-item expert_note — and the PRIVATE
 *       trips.expert_notes value appears NOWHERE in the serialized payload
 *   D2. §12 — a PENDING advisor resolves to NO write role (getTripWriteRole →
 *       null, canMutateTrip false); accepted/assigned resolve to 'expert' with
 *       write access; a rejected advisor has neither
 *   D3. per-item note authoring lands: updateItineraryItem stamps expert_note
 *       and the re-assembled plan renders the new value to the owner
 *   D4. the three columns stay independent: writing each leaves the others
 *       byte-identical (the never-merge pin)
 *
 * Run with:
 *   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/traveloure \
 *   npx tsx --test server/__tests__/expert-note-separation.db.test.ts
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

process.env.DATABASE_URL ??= "postgresql://postgres:postgres@localhost:5432/traveloure";
process.env.STRIPE_SECRET_KEY ??= "[REDACTED_STRIPE_TEST_KEY]";

const { db, pool } = await import("../db");
const { eq, inArray, sql } = await import("drizzle-orm");
const { users, trips, itineraryItems, tripExpertAdvisors } = await import("../../shared/schema");
const { storage } = await import("../storage");
const { assembleTripPlan } = await import("../services/trip-plan.service");
const { getTripWriteRole, canMutateTrip } = await import("../utils/trip-role");
const { isTripAdvisorWithWriteAccess } = await import("../utils/trip-advisor");

// ── Disposable-DB guard (house pattern; never defaults open) ──────────────────
const DISPOSABLE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", ""]);
async function assertDisposableDb(): Promise<void> {
  if (process.env.JOURNEY_DB_WRITES_OK === "1") return;
  let host: string | null = null;
  try {
    host = new URL(process.env.DATABASE_URL ?? "").hostname.toLowerCase();
  } catch {
    host = null;
  }
  let serverAddr: string | null = null;
  try {
    const r = await db.execute(sql`SELECT host(inet_server_addr()) AS addr`);
    serverAddr = ((r.rows[0] as any)?.addr as string) ?? null;
  } catch {
    /* local socket ⇒ NULL ⇒ disposable signal */
  }
  const ok =
    (host !== null && DISPOSABLE_HOSTS.has(host)) ||
    (host === null && (serverAddr === null || DISPOSABLE_HOSTS.has(serverAddr)));
  if (!ok) {
    throw new Error(
      `[expert-note-separation] REFUSING to write fixtures: DATABASE_URL host '${host ?? "<none>"}' is not ` +
        `a recognized disposable dev/CI database. Opt in DELIBERATELY with JOURNEY_DB_WRITES_OK=1. Never against prod.`,
    );
  }
}

const RUN = crypto.randomUUID().slice(0, 8);
const PRIVATE_NOTE = `PRIVATE-BUILD-NOTE-${RUN} — must never reach a traveler surface`;
const DELIVERED_TRIP_NOTE = `DELIVERED-TRIP-NOTE-${RUN} — from your expert`;
const ITEM_NOTE = `ITEM-NOTE-${RUN} — go at dawn`;
const ITEM_NOTE_V2 = `ITEM-NOTE-V2-${RUN} — authored by the advisor`;

const ownerId = crypto.randomUUID();
const advisorId = crypto.randomUUID();
let tripId = "";
let itemId = "";

describe("expert-note separation + per-item authoring (rulings 5+6, §12/§21)", () => {
  before(async () => {
    await assertDisposableDb();
    for (const [id, role, first] of [
      [ownerId, "user", "Owner"],
      [advisorId, "local_expert", "Advisor"],
    ] as const) {
      await db.insert(users).values({
        id,
        email: `note-sep-${id.slice(0, 8)}@test.invalid`,
        firstName: first,
        lastName: `Tester${RUN}`,
        role,
      } as any);
    }
    const [trip] = await db.insert(trips).values({
      userId: ownerId,
      title: `Note Separation ${RUN}`,
      destination: "Kyoto",
      startDate: "2026-10-01",
      endDate: "2026-10-05",
      status: "planning",
      expertNotes: PRIVATE_NOTE,
      expertTravelerNote: DELIVERED_TRIP_NOTE,
    } as any).returning();
    tripId = trip.id;
    const [item] = await db.insert(itineraryItems).values({
      tripId,
      title: "Tatsumi Bridge walk",
      itemType: "activity",
      dayNumber: 1,
      status: "in_planning",
      expertNote: ITEM_NOTE,
    } as any).returning();
    itemId = item.id;
  });

  after(async () => {
    await db.delete(itineraryItems).where(eq(itineraryItems.tripId, tripId));
    await db.delete(tripExpertAdvisors).where(eq(tripExpertAdvisors.tripId, tripId));
    await db.delete(trips).where(eq(trips.id, tripId));
    await db.delete(users).where(inArray(users.id, [ownerId, advisorId]));
    await pool.end();
  });

  it("D1: the owner's plan delivers both DELIVERED notes and never the PRIVATE one", async () => {
    const plan = await assembleTripPlan(tripId, "full", { viewerId: ownerId, tripRole: "owner" });

    // Trip-level delivered note: both the plancard trip object and tripNote.
    assert.equal((plan as any).plancard.trip.expertTravelerNote, DELIVERED_TRIP_NOTE);
    assert.equal((plan as any).tripNote, DELIVERED_TRIP_NOTE);

    // Per-item delivered note renders on the owner's activities.
    const activities = (plan as any).days.flatMap((d: any) => d.activities ?? []);
    const withNote = activities.find((a: any) => a.expertNote === ITEM_NOTE);
    assert.ok(withNote, "per-item expert_note must reach the owner's plan");

    // The PRIVATE build note appears NOWHERE in the serialized payload — not
    // under any key, not inside any nested object (§21; the leak class).
    const serialized = JSON.stringify(plan);
    assert.equal(
      serialized.includes(PRIVATE_NOTE),
      false,
      "trips.expert_notes (private build notes) must never appear in the assembled plan",
    );
  });

  it("D2: §12 — pending has NO write role; accepted/assigned do; rejected has neither", async () => {
    const [advisor] = await db.insert(tripExpertAdvisors).values({
      tripId,
      localExpertId: advisorId,
      status: "pending",
    } as any).returning();

    assert.equal(await isTripAdvisorWithWriteAccess(tripId, advisorId), false);
    assert.equal(await getTripWriteRole(tripId, advisorId), null);
    assert.equal(canMutateTrip(await getTripWriteRole(tripId, advisorId)), false);

    for (const status of ["accepted", "assigned"]) {
      await db.update(tripExpertAdvisors).set({ status } as any).where(eq(tripExpertAdvisors.id, advisor.id));
      assert.equal(await isTripAdvisorWithWriteAccess(tripId, advisorId), true, `${status} grants write`);
      assert.equal(await getTripWriteRole(tripId, advisorId), "expert", `${status} resolves expert role`);
      assert.equal(canMutateTrip("expert"), true);
    }

    await db.update(tripExpertAdvisors).set({ status: "rejected" } as any).where(eq(tripExpertAdvisors.id, advisor.id));
    assert.equal(await isTripAdvisorWithWriteAccess(tripId, advisorId), false, "rejected grants nothing");
    assert.equal(await getTripWriteRole(tripId, advisorId), null);

    // Leave the advisor with write access for D3.
    await db.update(tripExpertAdvisors).set({ status: "accepted" } as any).where(eq(tripExpertAdvisors.id, advisor.id));
  });

  it("D3: per-item note authoring lands and renders to the owner", async () => {
    // The write path's §12 gate (D2) has admitted this advisor; the authoring
    // core is updateItineraryItem — the same call the PATCH route makes after
    // getTripWriteRole passes.
    assert.equal(await getTripWriteRole(tripId, advisorId), "expert");
    const updated = await storage.updateItineraryItem(itemId, { expertNote: ITEM_NOTE_V2 } as any);
    assert.equal((updated as any)?.expertNote, ITEM_NOTE_V2);

    const plan = await assembleTripPlan(tripId, "full", { viewerId: ownerId, tripRole: "owner" });
    const activities = (plan as any).days.flatMap((d: any) => d.activities ?? []);
    assert.ok(
      activities.some((a: any) => a.expertNote === ITEM_NOTE_V2),
      "the authored note must reach the owner's plan",
    );
    assert.equal(JSON.stringify(plan).includes(PRIVATE_NOTE), false, "still no private leak");
  });

  it("D4: the three note columns stay independent — writing each leaves the others intact", async () => {
    await db.update(trips).set({ expertNotes: `${PRIVATE_NOTE} (edited)` } as any).where(eq(trips.id, tripId));
    let [t] = await db.select().from(trips).where(eq(trips.id, tripId));
    assert.equal((t as any).expertTravelerNote, DELIVERED_TRIP_NOTE, "private write must not touch delivered");

    await db.update(trips).set({ expertTravelerNote: `${DELIVERED_TRIP_NOTE} (edited)` } as any).where(eq(trips.id, tripId));
    [t] = await db.select().from(trips).where(eq(trips.id, tripId));
    assert.equal((t as any).expertNotes, `${PRIVATE_NOTE} (edited)`, "delivered write must not touch private");

    const [i] = await db.select().from(itineraryItems).where(eq(itineraryItems.id, itemId));
    assert.equal((i as any).expertNote, ITEM_NOTE_V2, "trip-level writes must not touch the item note");
  });
});
