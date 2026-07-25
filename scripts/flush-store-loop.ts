/**
 * flush-store-loop.ts — ONE continuous end-to-end journey through the Ready-Made store,
 * over real HTTP at every step that has an HTTP surface (the gate script proves sections;
 * this proves the SEAMS between them):
 *
 *   author: create → PATCH (plan type, price, hero) → build itinerary via the REAL trip
 *           endpoints → AI build review → submit
 *   admin:  queue → approve
 *   anon:   shelf feed → detail
 *   buyer:  purchase (Stripe boundary: dummy key → expect honest failure; then the
 *           verified-payment row is inserted and the real fulfilment service runs)
 *           → purchases/mine → open the clone as a TRAVELER (GET /api/trips/:id)
 *           → HTTP refund (ledger settles, Stripe leg 502s on the dummy key → retry
 *           contract) → purchases/mine shows refunded + cloneTripId nulled (FK SET NULL)
 *
 * Self-cleaning.
 */
import { db } from "../server/db";
import {
  users, trips, readyMadeTrips, readyMadePurchases, itineraryItems, expertEarnings,
} from "@shared/schema";
import { eq } from "drizzle-orm";
import { fulfillReadyMadePurchase } from "../server/services/ready-made-purchase.service";

const BASE = process.env.BASE_URL ?? "http://localhost:5000";
const PASSWORD = "FlushLoop!2026";
const UNSPLASH_URL = "https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?w=1080";
const UNSPLASH_META = {
  unsplashId: "photo-1493976040374",
  photographer: "Flush Fixture",
  profileUrl: "https://unsplash.com/@fixture?utm_source=traveloure",
};

let pass = 0, fail = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ""}`); }
}

function makeActor() {
  let cookie = "";
  return {
    async req(method: string, path: string, body?: any) {
      const res = await fetch(`${BASE}${path}`, {
        method,
        headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const setCookie = res.headers.get("set-cookie");
      if (setCookie) cookie = setCookie.split(";")[0];
      const text = await res.text();
      let json: any = null;
      try { json = JSON.parse(text); } catch { /* HTML catch-all */ }
      return { status: res.status, json, text };
    },
  };
}

async function register(email: string, role: string | null) {
  const actor = makeActor();
  let reg = await actor.req("POST", "/api/auth/register", {
    email, password: PASSWORD, firstName: "Flush", lastName: "Loop",
  });
  if (reg.status === 429) {
    const waitSec = Number(reg.json?.retryAfter ?? 60) + 2;
    console.log(`  ⏳ register rate-limited — waiting ${waitSec}s`);
    await new Promise((r) => setTimeout(r, waitSec * 1000));
    reg = await actor.req("POST", "/api/auth/register", {
      email, password: PASSWORD, firstName: "Flush", lastName: "Loop",
    });
  }
  if (reg.status !== 200 && reg.status !== 201) throw new Error(`register ${email}: ${reg.status} ${reg.text.slice(0, 200)}`);
  if (role) await db.update(users).set({ role } as any).where(eq(users.email, email.toLowerCase()));
  const login = await actor.req("POST", "/api/auth/login", { email, password: PASSWORD });
  if (login.status !== 200) throw new Error(`login ${email}: ${login.status}`);
  return actor;
}

async function main() {
  const stamp = Date.now();
  const authorEmail = `flush-author-${stamp}@t.test`;
  const adminEmail = `flush-admin-${stamp}@t.test`;
  const buyerEmail = `flush-buyer-${stamp}@t.test`;
  let listingId = "", tripId = "", cloneTripId = "", purchaseId = "";

  try {
    console.log(`\n━━ setup (${BASE}) ━━`);
    const author = await register(authorEmail, "local_expert");
    const admin = await register(adminEmail, "admin");
    const buyer = await register(buyerEmail, null); // a plain traveler — the real buyer role
    console.log("  author (local_expert) · admin · buyer (plain user)");

    console.log("\n━━ 1: author builds the listing (workstation lane) ━━");
    const created = await author.req("POST", "/api/expert/ready-made", {});
    check("create pair (listing + authoring trip)", created.status === 201 && !!created.json?.listingId,
      `${created.status} ${created.text.slice(0, 160)}`);
    listingId = created.json.listingId; tripId = created.json.tripId;

    const patched = await author.req("PATCH", `/api/expert/ready-made/${listingId}`, {
      title: "Flush: 3 days in Arashiyama", planType: "hiking_itinerary", priceCents: 12900,
      heroImageUrl: UNSPLASH_URL, heroImageMeta: UNSPLASH_META, bestSeason: "Autumn",
    });
    check("listing details set in one PATCH", patched.status === 200 && patched.json?.listing?.priceCents === 12900,
      `${patched.status} ${patched.text.slice(0, 160)}`);

    // The REAL trip endpoints — the same calls the workspace builder makes.
    const items = [
      { dayNumber: 1, title: "Bamboo grove dawn walk", itemType: "activity", startTime: "06:30", endTime: "08:30" },
      { dayNumber: 1, title: "Tenryu-ji temple + gardens", itemType: "activity", startTime: "09:00", endTime: "11:30" },
      { dayNumber: 2, title: "Monkey park hike", itemType: "activity", startTime: "10:00", endTime: "13:00" },
      { dayNumber: 3, title: "Hozugawa river boat", itemType: "activity", startTime: "11:00", endTime: "13:30" },
    ];
    let itemsOk = true, itemDetail = "";
    for (const it of items) {
      const r = await author.req("POST", `/api/trips/${tripId}/itinerary-items`, it);
      if (r.status !== 201) { itemsOk = false; itemDetail = `${r.status} ${r.text.slice(0, 200)}`; break; }
    }
    check("itinerary built through the REAL trip endpoint (authoring-mode access)", itemsOk, itemDetail);

    console.log("\n━━ 2: AI build review (optimizer engine, advisory) ━━");
    const review = await author.req("POST", `/api/expert/ready-made/${listingId}/build-review`);
    check("review runs on the real build", review.status === 200 && typeof review.json?.buildReview?.score === "number",
      `${review.status} ${review.text.slice(0, 160)}`);
    console.log(`     score=${review.json?.buildReview?.score} issues=${review.json?.buildReview?.issues?.length} suggestions=${review.json?.buildReview?.suggestions?.length}`);

    console.log("\n━━ 3: submit → admin approve ━━");
    const submitted = await author.req("POST", `/api/expert/ready-made/${listingId}/submit`);
    check("submit passes the completeness gate", submitted.status === 200 && submitted.json?.listing?.status === "submitted",
      `${submitted.status} ${JSON.stringify(submitted.json?.missing ?? submitted.json).slice(0, 200)}`);

    const pending = await admin.req("GET", "/api/admin/ready-made/pending");
    const qRow = (pending.json?.pending ?? []).find((p: any) => p.id === listingId);
    check("listing in the admin queue with build coverage", !!qRow && qRow.item_count === 4 && qRow.days_with_items === 3,
      JSON.stringify({ items: qRow?.item_count, days: qRow?.days_with_items }));
    const approved = await admin.req("POST", `/api/admin/ready-made/${listingId}/approve`, {});
    check("admin approve", approved.status === 200 && approved.json?.listing?.status === "approved", `${approved.status}`);

    console.log("\n━━ 4: shelf + detail (anonymous shopper) ━━");
    const anon = makeActor();
    const feed = await anon.req("GET", "/api/ready-made");
    const shelfRow = (feed.json?.listings ?? []).find((l: any) => l.id === listingId);
    check("listing on the public shelf", !!shelfRow && shelfRow.section === "trips_by_locals",
      JSON.stringify(shelfRow ?? {}).slice(0, 160));
    const detail = await anon.req("GET", `/api/ready-made/${listingId}`);
    check("public detail: teaser DTO, no itinerary leak",
      detail.status === 200 && detail.json?.preview === false &&
      !("sourceTripId" in (detail.json?.listing ?? {})) && detail.json?.listing?.insideCounts?.items === 4,
      JSON.stringify(detail.json?.listing ?? {}).slice(0, 200));

    console.log("\n━━ 5: buyer purchase (Stripe boundary honest-failure, then verified-payment fulfilment) ━━");
    const buyAttempt = await buyer.req("POST", `/api/ready-made/${listingId}/purchase`);
    check("dummy-key Stripe create fails HONESTLY (5xx, no purchase row, no fake success)",
      buyAttempt.status >= 500, `${buyAttempt.status} ${buyAttempt.text.slice(0, 120)}`);
    const orphanCheck = await db.select({ id: readyMadePurchases.id }).from(readyMadePurchases)
      .where(eq(readyMadePurchases.readyMadeTripId, listingId));
    check("failed Stripe create left NO purchase row (no pre-payment state)", orphanCheck.length === 0, `${orphanCheck.length}`);

    // The Stripe boundary is the ONLY simulated seam: insert the row a verified payment
    // creates, then run the real fulfilment service (same as confirm does).
    const buyerId = (await db.select({ id: users.id }).from(users).where(eq(users.email, buyerEmail)))[0].id;
    const [purchaseRow] = await db.insert(readyMadePurchases).values({
      buyerId, readyMadeTripId: listingId, pricePaidCents: 12900,
      currency: "USD", stripePaymentIntentId: `pi_flush_${stamp}`, status: "paid",
    } as any).returning();
    purchaseId = purchaseRow.id;
    const fulfil = await fulfillReadyMadePurchase(purchaseId);
    check("fulfilment clones the trip", fulfil.purchase.status === "cloned" && !!fulfil.cloneTripId);
    cloneTripId = fulfil.cloneTripId!;

    console.log("\n━━ 6: buyer surfaces (my-bookings contract + the clone as a traveler trip) ━━");
    const mine = await buyer.req("GET", "/api/ready-made/purchases/mine");
    const mineRow = (mine.json?.purchases ?? []).find((p: any) => p.id === purchaseId);
    check("purchases/mine: cloned + refundEligible + clone link",
      mineRow?.status === "cloned" && mineRow?.refundEligible === true && mineRow?.cloneTripId === cloneTripId,
      JSON.stringify(mineRow ?? {}).slice(0, 200));

    const cloneTrip = await buyer.req("GET", `/api/trips/${cloneTripId}`);
    check("buyer opens the clone via GET /api/trips/:id (traveler surface)",
      cloneTrip.status === 200, `${cloneTrip.status} ${cloneTrip.text.slice(0, 120)}`);
    const cloneItems = await buyer.req("GET", `/api/trips/${cloneTripId}/itinerary-items`);
    // Endpoint shape is grouped-by-day: { days: [{ dayNumber, items: [...] }] }.
    const cloneItemCount = (cloneItems.json?.days ?? [])
      .reduce((n: number, d: any) => n + (d.items?.length ?? 0), 0);
    check("clone carries all 4 items across 3 days for the buyer",
      cloneItems.status === 200 && cloneItemCount === 4 && (cloneItems.json?.days ?? []).length === 3,
      `${cloneItems.status} items=${cloneItemCount} days=${(cloneItems.json?.days ?? []).length}`);

    const strangerOpen = await anon.req("GET", `/api/trips/${cloneTripId}`);
    check("anonymous cannot open the buyer's clone", strangerOpen.status === 401 || strangerOpen.status === 403,
      `got ${strangerOpen.status}`);

    console.log("\n━━ 7: HTTP refund — ledger-first, Stripe 502 contract on the dummy key ━━");
    const refund = await buyer.req("POST", `/api/ready-made/purchases/${purchaseId}/refund`);
    check("refund: ledger settled, Stripe leg fails → honest 502 retry contract",
      refund.status === 502 && refund.json?.purchase?.status === "refunded",
      `${refund.status} ${refund.text.slice(0, 160)}`);
    const [afterRefund] = await db.select().from(readyMadePurchases).where(eq(readyMadePurchases.id, purchaseId));
    check("purchase 'refunded' + cloneTripId NULLED (migration-135 FK SET NULL)",
      afterRefund?.status === "refunded" && afterRefund?.cloneTripId === null,
      JSON.stringify({ status: afterRefund?.status, clone: afterRefund?.cloneTripId }));
    const cloneGone = await db.select({ id: trips.id }).from(trips).where(eq(trips.id, cloneTripId));
    check("clone trip revoked", cloneGone.length === 0);
    const earnRows = await db.select({ status: expertEarnings.status }).from(expertEarnings)
      .where(eq(expertEarnings.referenceId, purchaseId));
    check("author earning reversed (exactly one row)", earnRows.length === 1 && earnRows[0].status === "reversed",
      JSON.stringify(earnRows));

    const retry = await buyer.req("POST", `/api/ready-made/purchases/${purchaseId}/refund`);
    check("retry re-runs ONLY the Stripe leg (ledger idempotent → 502 again, state unchanged)",
      retry.status === 502, `got ${retry.status}`);
    const earnRows2 = await db.select({ status: expertEarnings.status }).from(expertEarnings)
      .where(eq(expertEarnings.referenceId, purchaseId));
    check("still exactly one reversed earning after retry", earnRows2.length === 1 && earnRows2[0].status === "reversed");

    const mineAfter = await buyer.req("GET", "/api/ready-made/purchases/mine");
    const mineRow2 = (mineAfter.json?.purchases ?? []).find((p: any) => p.id === purchaseId);
    check("purchases/mine: refunded, no refund button, no clone link",
      mineRow2?.status === "refunded" && mineRow2?.refundEligible === false && mineRow2?.cloneTripId === null,
      JSON.stringify(mineRow2 ?? {}).slice(0, 160));

    console.log("\n━━ 8: the listing survives the refund (store integrity) ━━");
    const feedAfter = await anon.req("GET", "/api/ready-made");
    check("listing still on the shelf for the next buyer",
      (feedAfter.json?.listings ?? []).some((l: any) => l.id === listingId));
    const authorConsole = await author.req("GET", "/api/expert/ready-made/mine");
    const consoleRow = (authorConsole.json?.listings ?? []).find((l: any) => l.id === listingId);
    check("author console still shows it approved", consoleRow?.status === "approved", consoleRow?.status);
  } finally {
    console.log("\n━━ cleanup ━━");
    try {
      if (purchaseId) {
        await db.delete(expertEarnings).where(eq(expertEarnings.referenceId, purchaseId));
        await db.delete(readyMadePurchases).where(eq(readyMadePurchases.id, purchaseId));
      }
      if (cloneTripId) await db.delete(trips).where(eq(trips.id, cloneTripId));
      if (listingId) await db.delete(readyMadeTrips).where(eq(readyMadeTrips.id, listingId));
      if (tripId) await db.delete(trips).where(eq(trips.id, tripId));
      for (const email of [authorEmail, adminEmail, buyerEmail]) {
        await db.delete(users).where(eq(users.email, email));
      }
      console.log("  removed flush rows");
    } catch (e: any) {
      console.log(`  cleanup warning: ${e.message}`);
    }
  }

  console.log(`\n${fail === 0 ? "✅" : "❌"} store-loop flush: ${pass} passed, ${fail} failed\n`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error("flush failed:", e); process.exit(1); });
