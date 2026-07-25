/**
 * verify-ready-made-auth.ts — the Phase-1 GATE for ready-made authoring (brief v1.1 §5).
 *
 * Proves the dual-path authorization matrix at the DB/helper level (no HTTP needed):
 *   1. isTripAuthor is TRUE for the author of an authoring trip.
 *   2. isTripAuthor is FALSE for a non-author expert (the unauthorized case).
 *   3. isTripAuthor is FALSE for a NORMAL traveler trip (author_id NULL) — proves the
 *      `null === null` bug class cannot re-enter (a null author must never match anyone).
 *   4. isTripAuthor is FALSE when the caller id is null/undefined.
 *   5. authorizeTripLogistics returns null (authorized) for the author, and 403 for a stranger.
 *   6. Authoring trips are EXCLUDED from traveler surfaces: a userId-scoped trip list for any
 *      user never contains the authoring trip (userId IS NULL by construction, §2a).
 *   7. The listing is born 'draft' (D1a) and the source trip is uniquely linked.
 *
 * Usage: DATABASE_URL=... npx tsx scripts/verify-ready-made-auth.ts
 * Read-mostly: creates two temp users + trips, asserts, then deletes everything it made.
 */
import { db } from "../server/db";
import { users, trips, readyMadeTrips } from "@shared/schema";
import { and, eq, isNull } from "drizzle-orm";
import { isTripAuthor } from "../server/utils/trip-authorship";
import { authorizeTripLogistics } from "../server/utils/trip-logistics-auth";

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ""}`); }
}

async function main() {
  const stamp = Date.now();
  const authorId = `rmtest-author-${stamp}`;
  const strangerId = `rmtest-stranger-${stamp}`;
  const travelerId = `rmtest-traveler-${stamp}`;
  let authoringTripId = "";
  let travelerTripId = "";
  let listingId = "";

  try {
    console.log("\n── setup ──");
    await db.insert(users).values([
      { id: authorId, email: `${authorId}@t.test`, role: "local_expert" },
      { id: strangerId, email: `${strangerId}@t.test`, role: "local_expert" },
      { id: travelerId, email: `${travelerId}@t.test`, role: "user" },
    ] as any);

    // Authoring trip: userId NULL + authorId set (§2a).
    const [authoringTrip] = await db.insert(trips).values({
      userId: null, authorId,
      title: "RM auth test (authoring)", destination: "Kyoto",
      startDate: "2026-08-01", endDate: "2026-08-03", status: "draft",
    } as any).returning();
    authoringTripId = authoringTrip.id;

    // Normal traveler trip: userId set, authorId NULL.
    const [travelerTrip] = await db.insert(trips).values({
      userId: travelerId,
      title: "RM auth test (traveler)", destination: "Kyoto",
      startDate: "2026-08-01", endDate: "2026-08-03", status: "draft",
    } as any).returning();
    travelerTripId = travelerTrip.id;

    const [listing] = await db.insert(readyMadeTrips).values({
      authorId, sourceTripId: authoringTripId, market: "Kyoto",
      title: "RM auth test listing", durationDays: 3,
    } as any).returning();
    listingId = listing.id;
    console.log(`  authoring trip ${authoringTripId} · traveler trip ${travelerTripId}`);

    console.log("\n── 1-4: isTripAuthor matrix ──");
    check("author → TRUE on their authoring trip", await isTripAuthor(authoringTripId, authorId));
    check("non-author expert → FALSE (unauthorized)", !(await isTripAuthor(authoringTripId, strangerId)));
    check("author_id NULL trip → FALSE for everyone (no null===null match)",
      !(await isTripAuthor(travelerTripId, authorId)) && !(await isTripAuthor(travelerTripId, travelerId)));
    check("null/undefined caller → FALSE",
      !(await isTripAuthor(authoringTripId, null)) && !(await isTripAuthor(authoringTripId, undefined)));

    console.log("\n── 5: authorizeTripLogistics dual path ──");
    const authorAuthz = await authorizeTripLogistics(authoringTripId, authorId, "verify");
    check("author authorized (null result)", authorAuthz === null, JSON.stringify(authorAuthz));
    const strangerAuthz = await authorizeTripLogistics(authoringTripId, strangerId, "verify");
    check("stranger 403", strangerAuthz?.status === 403, JSON.stringify(strangerAuthz));

    console.log("\n── 6: traveler-surface exclusion (§2a) ──");
    const authorOwned = await db.select({ id: trips.id }).from(trips).where(eq(trips.userId, authorId));
    check("authoring trip NOT in the author's userId-scoped trips", authorOwned.length === 0,
      `${authorOwned.length} rows`);
    const nullOwner = await db.select({ id: trips.id }).from(trips)
      .where(and(eq(trips.id, authoringTripId), isNull(trips.userId)));
    check("authoring trip has userId IS NULL", nullOwner.length === 1);

    console.log("\n── 7: listing born-draft (D1a) ──");
    const [fresh] = await db.select().from(readyMadeTrips).where(eq(readyMadeTrips.id, listingId));
    check("listing status = 'draft'", fresh?.status === "draft", fresh?.status);
    check("listing hero is null (nullable-until-submit)", fresh?.heroImageUrl == null);
    check("listing links the source trip", fresh?.sourceTripId === authoringTripId);
  } finally {
    console.log("\n── cleanup ──");
    if (listingId) await db.delete(readyMadeTrips).where(eq(readyMadeTrips.id, listingId));
    if (authoringTripId) await db.delete(trips).where(eq(trips.id, authoringTripId));
    if (travelerTripId) await db.delete(trips).where(eq(trips.id, travelerTripId));
    await db.delete(users).where(eq(users.id, authorId));
    await db.delete(users).where(eq(users.id, strangerId));
    await db.delete(users).where(eq(users.id, travelerId));
    console.log("  removed test rows");
  }

  console.log(`\n${fail === 0 ? "✅" : "❌"} ready-made auth gate: ${pass} passed, ${fail} failed\n`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error("verify failed:", e); process.exit(1); });
