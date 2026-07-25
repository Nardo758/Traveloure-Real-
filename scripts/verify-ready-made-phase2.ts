/**
 * verify-ready-made-phase2.ts — behavioral gate for the ready-made LISTING endpoints
 * (PATCH allow-list, D2 hero provenance, §10-A3 re-review, fee-band earnings preview,
 * hero-search key gate, cross-author isolation).
 *
 * Runs over real HTTP against a running server so the zod/strict allow-list, the session
 * gate and the DB writes are all exercised the way a client would hit them.
 *
 * Usage:
 *   DATABASE_URL=... npm run dev          # in another shell
 *   DATABASE_URL=... BASE_URL=http://localhost:5000 npx tsx scripts/verify-ready-made-phase2.ts
 *
 * Self-cleaning: registers two throwaway accounts, promotes them, and deletes everything
 * it created (listings, trips, users) in a finally block.
 */
import { db } from "../server/db";
import { users, trips, readyMadeTrips, readyMadePurchases, itineraryItems, expertEarnings } from "@shared/schema";
import { and, eq, sql } from "drizzle-orm";
import { fulfillReadyMadePurchase, refundReadyMadePurchaseLedger } from "../server/services/ready-made-purchase.service";

const BASE = process.env.BASE_URL ?? "http://localhost:5000";
const PASSWORD = "VerifyPhase2!2026";
// A real images.unsplash.com URL shape — provenance is checked by host, not by fetching it.
const UNSPLASH_URL = "https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?w=1080";
const UNSPLASH_META = {
  unsplashId: "photo-1493976040374",
  photographer: "Verify Fixture",
  profileUrl: "https://unsplash.com/@fixture?utm_source=traveloure",
};

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ""}`); }
}

/** Minimal cookie jar — enough to carry one passport session per actor. */
function makeActor() {
  let cookie = "";
  return {
    get cookie() { return cookie; },
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
      try { json = JSON.parse(text); } catch { /* HTML = the Vite catch-all, i.e. a dead route */ }
      return { status: res.status, json, text };
    },
  };
}

async function registerAndPromote(email: string, role: string) {
  const actor = makeActor();
  // /api/auth/register is rate-limited (60s window), which back-to-back gate runs trip.
  // Wait out the limiter rather than reporting a red that isn't about the code under test.
  let reg = await actor.req("POST", "/api/auth/register", {
    email, password: PASSWORD, firstName: "Verify", lastName: "Phase2",
  });
  if (reg.status === 429) {
    const waitSec = Number(reg.json?.retryAfter ?? 60) + 2;
    console.log(`  ⏳ register rate-limited — waiting ${waitSec}s (limiter, not a failure)`);
    await new Promise((r) => setTimeout(r, waitSec * 1000));
    reg = await actor.req("POST", "/api/auth/register", {
      email, password: PASSWORD, firstName: "Verify", lastName: "Phase2",
    });
  }
  if (reg.status !== 200 && reg.status !== 201) {
    throw new Error(`register failed for ${email}: ${reg.status} ${reg.text.slice(0, 200)}`);
  }
  // Role upgrades are deliberately impossible over the API (registration forces 'user'),
  // so the fixture promotes in the DB — the same thing an approved application does.
  await db.update(users).set({ role } as any).where(eq(users.email, email.toLowerCase()));
  const login = await actor.req("POST", "/api/auth/login", { email, password: PASSWORD });
  if (login.status !== 200) throw new Error(`login failed for ${email}: ${login.status} ${login.text.slice(0, 200)}`);
  return actor;
}

async function main() {
  const stamp = Date.now();
  const authorEmail = `rm2-author-${stamp}@t.test`;
  const strangerEmail = `rm2-stranger-${stamp}@t.test`;
  let listingId = "";
  let tripId = "";

  try {
    console.log(`\n── setup (${BASE}) ──`);
    const author = await registerAndPromote(authorEmail, "local_expert");
    const stranger = await registerAndPromote(strangerEmail, "local_expert");
    console.log("  two local_expert sessions established");

    const created = await author.req("POST", "/api/expert/ready-made", {
      title: "Phase2 verify listing", market: "Kyoto", durationDays: 3,
    });
    if (created.status !== 201) throw new Error(`create failed: ${created.status} ${created.text.slice(0, 300)}`);
    listingId = created.json.listingId;
    tripId = created.json.tripId;
    console.log(`  listing ${listingId} · trip ${tripId}`);

    console.log("\n── 1: PATCH allow-list (mass-assignment closed, §10 Gap 2) ──");
    for (const forbidden of [
      { status: "approved" },
      { authorId: "someone-else" },
      { feeBandKey: "expert_standard" },
      { insideCounts: { days: 99 } },
      { badge: "Editor's pick" },
      { active: false },
      { reviewedBy: "me" },
    ]) {
      const key = Object.keys(forbidden)[0];
      const r = await author.req("PATCH", `/api/expert/ready-made/${listingId}`, forbidden);
      check(`PATCH rejects self-set '${key}'`, r.status === 400, `got ${r.status}`);
    }
    const stillDraft = await author.req("GET", "/api/expert/ready-made/mine");
    const mine = stillDraft.json?.listings?.find((l: any) => l.id === listingId);
    check("listing is still 'draft' after the rejected writes", mine?.status === "draft", mine?.status);

    console.log("\n── 2: hero provenance (D2 — Unsplash proves the photo) ──");
    const badHost = await author.req("PATCH", `/api/expert/ready-made/${listingId}`, {
      heroImageUrl: "https://evil.example.com/stolen.jpg", heroImageMeta: UNSPLASH_META,
    });
    check("non-Unsplash hero host rejected", badHost.status === 400, `got ${badHost.status}`);

    const noAttribution = await author.req("PATCH", `/api/expert/ready-made/${listingId}`, {
      heroImageUrl: UNSPLASH_URL,
    });
    check("Unsplash hero WITHOUT attribution rejected", noAttribution.status === 400, `got ${noAttribution.status}`);

    const goodHero = await author.req("PATCH", `/api/expert/ready-made/${listingId}`, {
      heroImageUrl: UNSPLASH_URL, heroImageMeta: UNSPLASH_META,
    });
    check("Unsplash hero WITH attribution accepted", goodHero.status === 200, `got ${goodHero.status}`);
    check("hero + credit both persisted",
      goodHero.json?.listing?.heroImageUrl === UNSPLASH_URL &&
      goodHero.json?.listing?.heroImageMeta?.photographer === UNSPLASH_META.photographer);

    const cleared = await author.req("PATCH", `/api/expert/ready-made/${listingId}`, { heroImageUrl: null });
    check("clearing the hero also clears its credit",
      cleared.status === 200 && cleared.json?.listing?.heroImageUrl === null &&
      cleared.json?.listing?.heroImageMeta === null);
    await author.req("PATCH", `/api/expert/ready-made/${listingId}`, {
      heroImageUrl: UNSPLASH_URL, heroImageMeta: UNSPLASH_META,
    });

    console.log("\n── 3: editable fields + bounds ──");
    const edit = await author.req("PATCH", `/api/expert/ready-made/${listingId}`, {
      title: "Three days in Higashiyama", bestSeason: "Autumn", pricingMode: "per_traveler", priceCents: 4900,
    });
    check("title/season/pricingMode/price accepted", edit.status === 200, `${edit.status} ${edit.text.slice(0, 160)}`);
    check("values persisted",
      edit.json?.listing?.title === "Three days in Higashiyama" &&
      edit.json?.listing?.pricingMode === "per_traveler" && edit.json?.listing?.priceCents === 4900);
    const tooCheap = await author.req("PATCH", `/api/expert/ready-made/${listingId}`, { priceCents: 1 });
    check("price below the floor rejected", tooCheap.status === 400, `got ${tooCheap.status}`);
    const badMode = await author.req("PATCH", `/api/expert/ready-made/${listingId}`, { pricingMode: "auction" });
    check("pricingMode outside the CHECK set rejected", badMode.status === 400, `got ${badMode.status}`);
    const empty = await author.req("PATCH", `/api/expert/ready-made/${listingId}`, {});
    check("empty patch rejected", empty.status === 400, `got ${empty.status}`);

    console.log("\n── 4: §10-A3 material-change re-review ──");
    await db.update(readyMadeTrips).set({ status: "approved" } as any).where(eq(readyMadeTrips.id, listingId));
    const nonMaterial = await author.req("PATCH", `/api/expert/ready-made/${listingId}`, { bestSeason: "Spring" });
    check("non-material edit keeps 'approved'",
      nonMaterial.json?.listing?.status === "approved" && nonMaterial.json?.reReviewRequired === false,
      `${nonMaterial.json?.listing?.status} / reReview=${nonMaterial.json?.reReviewRequired}`);
    const material = await author.req("PATCH", `/api/expert/ready-made/${listingId}`, { priceCents: 9900 });
    check("price change on an approved listing → back to 'submitted'",
      material.json?.listing?.status === "submitted" && material.json?.reReviewRequired === true,
      `${material.json?.listing?.status} / reReview=${material.json?.reReviewRequired}`);

    await db.update(readyMadeTrips).set({ status: "approved" } as any).where(eq(readyMadeTrips.id, listingId));
    const sameValue = await author.req("PATCH", `/api/expert/ready-made/${listingId}`, { priceCents: 9900 });
    check("re-sending the SAME price is not a material change",
      sameValue.json?.listing?.status === "approved" && sameValue.json?.reReviewRequired === false,
      `${sameValue.json?.listing?.status}`);

    console.log("\n── 5: earnings preview resolves from the fee band (§8, no literal) ──");
    const band = await db.execute(
      sql`SELECT CAST(default_rate AS FLOAT) AS rate, rate_type FROM fee_bands WHERE band_key = 'ready_made_trip'`,
    );
    const bandRow = band.rows?.[0] as any;
    check("fee band 'ready_made_trip' exists (migration 133 seed)", !!bandRow, JSON.stringify(bandRow));
    const preview = await author.req("GET", `/api/expert/ready-made/${listingId}/earnings-preview`);
    check("preview available", preview.json?.available === true, JSON.stringify(preview.json));
    check("platform rate === the band's default_rate (not a hardcoded 0.25)",
      preview.json?.platformFeeRate === bandRow?.rate,
      `${preview.json?.platformFeeRate} vs band ${bandRow?.rate}`);
    check("expert share === 1 − platform rate",
      Math.abs((preview.json?.expertShareRate ?? -1) - (1 - bandRow.rate)) < 1e-9);
    const expectedFee = Math.round(9900 * bandRow.rate);
    check("split arithmetic on the stored price",
      preview.json?.platformFeeCents === expectedFee &&
      preview.json?.expertEarningsCents === 9900 - expectedFee,
      `${preview.json?.platformFeeCents}/${preview.json?.expertEarningsCents}`);

    // The real §8 proof: PERTURB the band and require the preview to follow. Comparing the
    // preview against the band's current value would pass even for a hardcoded 0.25, because
    // the seed happens to be 0.25 — only a change the code has to track distinguishes them.
    await db.execute(sql`UPDATE fee_bands SET default_rate = 0.30 WHERE band_key = 'ready_made_trip'`);
    const perturbed = await author.req("GET", `/api/expert/ready-made/${listingId}/earnings-preview`);
    check("preview TRACKS an admin band change (proves no hardcoded rate)",
      perturbed.json?.platformFeeRate === 0.3 &&
      perturbed.json?.expertEarningsCents === 9900 - Math.round(9900 * 0.3),
      `rate=${perturbed.json?.platformFeeRate} earn=${perturbed.json?.expertEarningsCents}`);
    await db.execute(
      sql`UPDATE fee_bands SET default_rate = ${bandRow.rate} WHERE band_key = 'ready_made_trip'`,
    );

    // An inactive band must not silently price the listing — honest unavailability, no fallback.
    await db.execute(sql`UPDATE fee_bands SET is_active = false WHERE band_key = 'ready_made_trip'`);
    const noBand = await author.req("GET", `/api/expert/ready-made/${listingId}/earnings-preview`);
    check("deactivated band → available:false (never a fabricated fallback split)",
      noBand.json?.available === false && noBand.json?.reason === "fee_band_missing",
      JSON.stringify(noBand.json));
    await db.execute(sql`UPDATE fee_bands SET is_active = true WHERE band_key = 'ready_made_trip'`);

    // Priceless listing → null amounts, never a placeholder number (§13).
    await db.update(readyMadeTrips).set({ priceCents: null } as any).where(eq(readyMadeTrips.id, listingId));
    const noPrice = await author.req("GET", `/api/expert/ready-made/${listingId}/earnings-preview`);
    check("unpriced listing returns NULL amounts, not a placeholder",
      noPrice.json?.available === true && noPrice.json?.priceCents === null &&
      noPrice.json?.expertEarningsCents === null);

    console.log("\n── 5b: submit gate — the workstation→store push ──");
    // Reset to a draft with hero+price but NO plan type and NO items.
    await db.update(readyMadeTrips)
      .set({ status: "draft", planType: null, priceCents: 9900 } as any)
      .where(eq(readyMadeTrips.id, listingId));

    const notReady = await author.req("POST", `/api/expert/ready-made/${listingId}/submit`);
    const missingReqs = (notReady.json?.missing ?? []).map((m: any) => m.requirement);
    check("incomplete listing refused with NAMED requirements (not a bare 400)",
      notReady.status === 400 && missingReqs.includes("planType") && missingReqs.includes("itinerary"),
      `${notReady.status} ${JSON.stringify(missingReqs)}`);

    const badPlanType = await author.req("PATCH", `/api/expert/ready-made/${listingId}`, { planType: "scam_plan" });
    check("plan type outside the vocabulary rejected", badPlanType.status === 400, `got ${badPlanType.status}`);
    const setPlan = await author.req("PATCH", `/api/expert/ready-made/${listingId}`, { planType: "hiking_itinerary" });
    check("vocabulary plan type accepted + persisted",
      setPlan.status === 200 && setPlan.json?.listing?.planType === "hiking_itinerary");

    // Fill days 1 and 3 only — day 2 stays empty, and the refusal must SAY so.
    for (const day of [1, 3]) {
      await db.insert(itineraryItems).values({
        tripId, title: `Gate item day ${day}`, dayNumber: day, itemType: "activity",
      } as any);
    }
    const emptyDay = await author.req("POST", `/api/expert/ready-made/${listingId}/submit`);
    check("empty day named in the refusal (no scaffold reaches the shelf)",
      emptyDay.status === 400 &&
      (emptyDay.json?.missing ?? []).some((m: any) => m.requirement === "itinerary" && m.message.includes("2")),
      JSON.stringify(emptyDay.json?.missing));

    await db.insert(itineraryItems).values({
      tripId, title: "Gate item day 2", dayNumber: 2, itemType: "activity",
    } as any);
    const submitted = await author.req("POST", `/api/expert/ready-made/${listingId}/submit`);
    check("complete listing submits (draft → submitted, submittedAt stamped)",
      submitted.status === 200 && submitted.json?.listing?.status === "submitted" &&
      !!submitted.json?.listing?.submittedAt,
      `${submitted.status} ${submitted.json?.listing?.status}`);
    check("submit can NEVER self-approve (D1a)", submitted.json?.listing?.status !== "approved");

    const dupSubmit = await author.req("POST", `/api/expert/ready-made/${listingId}/submit`);
    check("double-submit → 409 (atomic conditional, §15)", dupSubmit.status === 409, `got ${dupSubmit.status}`);

    // Rejected → resubmit clears the rejection.
    await db.update(readyMadeTrips)
      .set({ status: "rejected", rejectionReason: "needs work" } as any)
      .where(eq(readyMadeTrips.id, listingId));
    const resubmit = await author.req("POST", `/api/expert/ready-made/${listingId}/submit`);
    check("rejected → resubmit allowed + rejection reason cleared",
      resubmit.status === 200 && resubmit.json?.listing?.status === "submitted" &&
      resubmit.json?.listing?.rejectionReason === null);

    const strangerSubmit = await stranger.req("POST", `/api/expert/ready-made/${listingId}/submit`);
    check("another expert cannot submit this listing", strangerSubmit.status === 404, `got ${strangerSubmit.status}`);

    // planType is a headline claim: changing it on an approved listing re-enters review (§10 A3).
    await db.update(readyMadeTrips).set({ status: "approved" } as any).where(eq(readyMadeTrips.id, listingId));
    const planFlip = await author.req("PATCH", `/api/expert/ready-made/${listingId}`, { planType: "road_trip_itinerary" });
    check("plan-type change on an approved listing → back to 'submitted'",
      planFlip.json?.listing?.status === "submitted" && planFlip.json?.reReviewRequired === true);

    console.log("\n── 5c: admin approval + insideCounts snapshot + public shelf feed ──");
    // Admin actor (registered like the others, promoted in DB — same as an approved application).
    const adminEmail = `rm2-admin-${stamp}@t.test`;
    const admin = makeActor();
    {
      let reg = await admin.req("POST", "/api/auth/register", {
        email: adminEmail, password: PASSWORD, firstName: "Verify", lastName: "Admin",
      });
      if (reg.status === 429) {
        const waitSec = Number(reg.json?.retryAfter ?? 60) + 2;
        console.log(`  ⏳ register rate-limited — waiting ${waitSec}s`);
        await new Promise((r) => setTimeout(r, waitSec * 1000));
        reg = await admin.req("POST", "/api/auth/register", {
          email: adminEmail, password: PASSWORD, firstName: "Verify", lastName: "Admin",
        });
      }
      await db.update(users).set({ role: "admin" } as any).where(eq(users.email, adminEmail));
      await admin.req("POST", "/api/auth/login", { email: adminEmail, password: PASSWORD });
    }

    // Ensure the listing is 'submitted' with a priced, plan-typed, 3-day build (state from 5b).
    await db.update(readyMadeTrips)
      .set({ status: "submitted", priceCents: 9900 } as any)
      .where(eq(readyMadeTrips.id, listingId));

    const nonAdminPending = await author.req("GET", "/api/admin/ready-made/pending");
    check("non-admin cannot read the queue (§2 default-deny)",
      nonAdminPending.status === 401 || nonAdminPending.status === 403, `got ${nonAdminPending.status}`);

    const pending = await admin.req("GET", "/api/admin/ready-made/pending");
    const pendingRow = (pending.json?.pending ?? []).find((p: any) => p.id === listingId);
    check("submitted listing appears in the admin queue", !!pendingRow, JSON.stringify(pending.json).slice(0, 160));
    check("queue row carries author identity + build coverage",
      pendingRow?.author_role === "local_expert" && pendingRow?.item_count === 3 && pendingRow?.days_with_items === 3,
      JSON.stringify({ role: pendingRow?.author_role, items: pendingRow?.item_count, days: pendingRow?.days_with_items }));

    const feedBefore = await author.req("GET", "/api/ready-made");
    check("shelf feed hides the SUBMITTED listing (approval read-gate)",
      !(feedBefore.json?.listings ?? []).some((l: any) => l.id === listingId));

    const rejectNoReason = await admin.req("POST", `/api/admin/ready-made/${listingId}/reject`, {});
    check("reject without a reason refused", rejectNoReason.status === 400, `got ${rejectNoReason.status}`);

    const approved = await admin.req("POST", `/api/admin/ready-made/${listingId}/approve`, {});
    check("admin approve → 'approved'", approved.status === 200 && approved.json?.listing?.status === "approved",
      `${approved.status}`);
    const snap = approved.json?.listing?.insideCounts;
    check("insideCounts SNAPSHOT taken from the real build (3 days, 3 items)",
      snap?.days === 3 && snap?.items === 3 && typeof snap?.byType === "object",
      JSON.stringify(snap));
    check("reviewer stamped", !!approved.json?.listing?.reviewedBy && !!approved.json?.listing?.reviewedAt);

    const dupApprove = await admin.req("POST", `/api/admin/ready-made/${listingId}/approve`, {});
    check("double-approve → 409 (atomic conditional, §15)", dupApprove.status === 409, `got ${dupApprove.status}`);

    const feedAfter = await author.req("GET", "/api/ready-made");
    const shelfRow = (feedAfter.json?.listings ?? []).find((l: any) => l.id === listingId);
    check("APPROVED listing appears on the public shelf feed", !!shelfRow);
    check("shelf row is a teaser: no sourceTripId, has plan type + snapshot + author section",
      shelfRow && !("sourceTripId" in shelfRow) && shelfRow.planType === "road_trip_itinerary" &&
      shelfRow.insideCounts?.days === 3 && shelfRow.section === "trips_by_locals",
      JSON.stringify(shelfRow ?? {}).slice(0, 200));

    // Reject path on a fresh submitted state.
    await db.update(readyMadeTrips).set({ status: "submitted" } as any).where(eq(readyMadeTrips.id, listingId));
    const rejected = await admin.req("POST", `/api/admin/ready-made/${listingId}/reject`, { reason: "Day 2 needs a lunch stop" });
    check("reject with reason → 'rejected' + reason persisted",
      rejected.status === 200 && rejected.json?.listing?.status === "rejected" &&
      rejected.json?.listing?.rejectionReason === "Day 2 needs a lunch stop");
    const feedRejected = await author.req("GET", "/api/ready-made");
    check("REJECTED listing is off the shelf feed",
      !(feedRejected.json?.listings ?? []).some((l: any) => l.id === listingId));

    await db.delete(users).where(eq(users.email, adminEmail));

    console.log("\n── 5d: purchase gates + clone fulfillment (commerce lane) ──");
    // Restore an APPROVED, priced listing (the shelf/buy gate state).
    await db.update(readyMadeTrips)
      .set({ status: "approved", priceCents: 9900 } as any)
      .where(eq(readyMadeTrips.id, listingId));

    // Pre-Stripe gates over HTTP (the Stripe call itself needs a real key — deploy-only).
    const buyOwn = await author.req("POST", `/api/ready-made/${listingId}/purchase`);
    check("author cannot buy their own listing", buyOwn.status === 400, `got ${buyOwn.status}`);
    const buyMissing = await stranger.req("POST", `/api/ready-made/00000000-0000-0000-0000-000000000000/purchase`);
    check("unknown listing → 404", buyMissing.status === 404, `got ${buyMissing.status}`);
    await db.update(readyMadeTrips).set({ status: "submitted" } as any).where(eq(readyMadeTrips.id, listingId));
    const buyUnapproved = await stranger.req("POST", `/api/ready-made/${listingId}/purchase`);
    check("unapproved listing not purchasable (buy gate = shelf gate)", buyUnapproved.status === 400, `got ${buyUnapproved.status}`);
    await db.update(readyMadeTrips).set({ status: "approved" } as any).where(eq(readyMadeTrips.id, listingId));

    // Fulfillment, Stripe-free: insert the purchase row a VERIFIED payment would create
    // (confirm's insert), then run the real fulfillment service.
    const strangerId = (await db.select({ id: users.id }).from(users).where(eq(users.email, strangerEmail)))[0].id;
    const [purchaseRow] = await db.insert(readyMadePurchases).values({
      buyerId: strangerId, readyMadeTripId: listingId, pricePaidCents: 9900,
      currency: "USD", stripePaymentIntentId: `pi_gate_${stamp}`, status: "paid",
    } as any).returning();

    const fulfil = await fulfillReadyMadePurchase(purchaseRow.id);
    check("fulfil: purchase paid → cloned", fulfil.purchase.status === "cloned" && !fulfil.alreadyFulfilled);
    check("clone trip created and linked", !!fulfil.cloneTripId);

    const [cloneTrip] = await db.select().from(trips).where(eq(trips.id, fulfil.cloneTripId!));
    check("BUYER owns the clone (their traveler surfaces see it)", cloneTrip?.userId === strangerId);
    check("clone is a normal trip, never authoring-mode", cloneTrip?.authorId === null);
    const cloneItems = await db.select({ dayNumber: itineraryItems.dayNumber, title: itineraryItems.title })
      .from(itineraryItems).where(eq(itineraryItems.tripId, fulfil.cloneTripId!));
    check("all 3 itinerary items copied into the clone", cloneItems.length === 3,
      JSON.stringify(cloneItems.map((i) => i.dayNumber)));

    // Author credited on the escrow spine: born held, D7 7-day window, band-resolved share.
    const [earning] = await db.select().from(expertEarnings)
      .where(and(eq(expertEarnings.referenceId, purchaseRow.id), eq(expertEarnings.type, "ready_made_sale")));
    check("author earning recorded (type ready_made_sale)", !!earning);
    check("earning born HELD on the escrow spine", earning?.status === "held", earning?.status);
    const expectedShare = (9900 / 100) * (1 - 0.25); // band default_rate restored to 0.25 in §5
    check("share is band-resolved (75% of $99 = $74.25)", Number(earning?.amount) === expectedShare,
      `${earning?.amount}`);
    const daysOut = earning?.availableAt
      ? Math.round((new Date(earning.availableAt).getTime() - Date.now()) / 86400000) : -1;
    check("availableAt ≈ +7 days (D7 ready_made_sale window)", daysOut >= 6 && daysOut <= 8, `${daysOut}d`);

    // §15 both directions: re-fulfil is a no-op — same clone, no second trip, no second earning.
    const refulfil = await fulfillReadyMadePurchase(purchaseRow.id);
    check("re-fulfil idempotent (same clone, alreadyFulfilled)",
      refulfil.alreadyFulfilled && refulfil.cloneTripId === fulfil.cloneTripId);
    const earnCount = await db.select({ id: expertEarnings.id }).from(expertEarnings)
      .where(eq(expertEarnings.referenceId, purchaseRow.id));
    check("exactly ONE earning after duplicate fulfil", earnCount.length === 1, `${earnCount.length}`);

    // Owned listing blocks a second purchase attempt up front.
    const buyAgain = await stranger.req("POST", `/api/ready-made/${listingId}/purchase`);
    check("buyer who owns the trip gets 409 on re-purchase", buyAgain.status === 409, `got ${buyAgain.status}`);

    console.log("\n── 5e: D7 refund — ledger half (escrow-window enforced) ──");
    // Wrong buyer → 404 (no purchase-id oracle).
    const authorId2 = (await db.select({ id: users.id }).from(users).where(eq(users.email, authorEmail)))[0].id;
    const wrongBuyer = await refundReadyMadePurchaseLedger(purchaseRow.id, authorId2);
    check("refund by a non-buyer → 404", !wrongBuyer.ok && wrongBuyer.status === 404);

    // Window closed: backdate the purchase past the 7-day window → 409, nothing reversed.
    await db.update(readyMadePurchases)
      .set({ purchasedAt: new Date(Date.now() - 9 * 86400000) } as any)
      .where(eq(readyMadePurchases.id, purchaseRow.id));
    const closed = await refundReadyMadePurchaseLedger(purchaseRow.id, strangerId);
    check("refund after the D7 window → 409 refund_window_closed",
      !closed.ok && closed.status === 409 && closed.message.includes("refund_window_closed"));
    const [stillCloned] = await db.select().from(readyMadePurchases).where(eq(readyMadePurchases.id, purchaseRow.id));
    check("window-closed refund left the purchase untouched", stillCloned.status === "cloned");

    // Inside the window: full refund effects.
    await db.update(readyMadePurchases)
      .set({ purchasedAt: new Date() } as any)
      .where(eq(readyMadePurchases.id, purchaseRow.id));
    const refunded = await refundReadyMadePurchaseLedger(purchaseRow.id, strangerId);
    check("refund inside the window succeeds", refunded.ok && !("alreadyRefunded" in refunded && refunded.alreadyRefunded));
    const [afterRefund] = await db.select().from(readyMadePurchases).where(eq(readyMadePurchases.id, purchaseRow.id));
    check("purchase → 'refunded'", afterRefund.status === "refunded");
    const [reversedEarning] = await db.select().from(expertEarnings)
      .where(eq(expertEarnings.referenceId, purchaseRow.id));
    check("author's escrowed earning REVERSED (never paid out inside the window)",
      reversedEarning?.status === "reversed", reversedEarning?.status);
    const cloneGone = await db.select({ id: trips.id }).from(trips).where(eq(trips.id, fulfil.cloneTripId!));
    check("clone trip revoked — a refunded buyer keeps nothing", cloneGone.length === 0);

    const dupRefund = await refundReadyMadePurchaseLedger(purchaseRow.id, strangerId);
    check("duplicate refund idempotent (alreadyRefunded, no error)",
      dupRefund.ok && dupRefund.alreadyRefunded === true);
    const earnAfterDup = await db.select({ id: expertEarnings.id, status: expertEarnings.status })
      .from(expertEarnings).where(eq(expertEarnings.referenceId, purchaseRow.id));
    check("still exactly one reversed earning after duplicate refund",
      earnAfterDup.length === 1 && earnAfterDup[0].status === "reversed");

    // Cleanup the commerce fixtures (clone already revoked by the refund).
    await db.delete(expertEarnings).where(eq(expertEarnings.referenceId, purchaseRow.id));
    await db.delete(readyMadePurchases).where(eq(readyMadePurchases.id, purchaseRow.id));
    // Back to rejected for the downstream sections' expectations.
    await db.update(readyMadeTrips).set({ status: "rejected", rejectionReason: "gate reset" } as any)
      .where(eq(readyMadeTrips.id, listingId));

    console.log("\n── 5f: public detail + author preview (Phase 4 redacted DTO) ──");
    // Listing is currently 'rejected' (5e reset). Anonymous → 404 (no draft oracle).
    const anonDetail = makeActor();
    const anonRejected = await anonDetail.req("GET", `/api/ready-made/${listingId}`);
    check("non-approved listing is 404 to the public (no draft oracle)", anonRejected.status === 404);
    // The AUTHOR gets the same redacted DTO flagged preview.
    const authorPreview = await author.req("GET", `/api/ready-made/${listingId}`);
    check("author preview of unapproved listing → 200 + preview:true",
      authorPreview.status === 200 && authorPreview.json?.preview === true);
    check("preview DTO is the redacted teaser (no sourceTripId/status leak)",
      authorPreview.json?.listing && !("sourceTripId" in authorPreview.json.listing) &&
      !("status" in authorPreview.json.listing));
    const strangerPreviewDetail = await stranger.req("GET", `/api/ready-made/${listingId}`);
    check("another expert cannot preview it", strangerPreviewDetail.status === 404, `got ${strangerPreviewDetail.status}`);
    // Approved → public, preview:false.
    await db.update(readyMadeTrips).set({ status: "approved" } as any).where(eq(readyMadeTrips.id, listingId));
    const publicDetail = await anonDetail.req("GET", `/api/ready-made/${listingId}`);
    check("approved listing public → 200 + preview:false",
      publicDetail.status === 200 && publicDetail.json?.preview === false &&
      publicDetail.json?.listing?.section === "trips_by_locals");
    await db.update(readyMadeTrips).set({ status: "rejected" } as any).where(eq(readyMadeTrips.id, listingId));

    console.log("\n── 5g: AI build review (optimizer engine, advisory) + buyer purchases list ──");
    // Build review reuses the optimizer's analyzeItinerary on the AUTHORING trip (decision-maker:
    // "same code as the AI optimization but applied differently"). Advisory: never gates submit.
    const review = await author.req("POST", `/api/expert/ready-made/${listingId}/build-review`);
    check("author can run the build review", review.status === 200, `${review.status} ${review.text.slice(0, 160)}`);
    check("review returns a numeric score + issue/suggestion arrays",
      typeof review.json?.buildReview?.score === "number" &&
      Array.isArray(review.json?.buildReview?.issues) && Array.isArray(review.json?.buildReview?.suggestions),
      JSON.stringify(review.json?.buildReview ?? {}).slice(0, 160));
    check("engine provenance is the optimizer's analyzer",
      review.json?.buildReview?.engine === "itinerary-intelligence", review.json?.buildReview?.engine);
    const [reviewedRow] = await db.select({ buildReview: readyMadeTrips.buildReview })
      .from(readyMadeTrips).where(eq(readyMadeTrips.id, listingId));
    check("verdict PERSISTED to the listing (admin queue sees the same score)",
      (reviewedRow?.buildReview as any)?.score === review.json?.buildReview?.score &&
      !!(reviewedRow?.buildReview as any)?.reviewedAt);
    const strangerReview = await stranger.req("POST", `/api/expert/ready-made/${listingId}/build-review`);
    check("another expert cannot run a review on this listing", strangerReview.status === 404, `got ${strangerReview.status}`);
    const anonReview = await makeActor().req("POST", `/api/expert/ready-made/${listingId}/build-review`);
    check("unauthenticated build review is 401", anonReview.status === 401, `got ${anonReview.status}`);

    // Buyer purchases list: session-scoped, refundEligible computed SERVER-side on the D7 clock.
    const strangerId5g = (await db.select({ id: users.id }).from(users).where(eq(users.email, strangerEmail)))[0].id;
    const [freshPurchase] = await db.insert(readyMadePurchases).values({
      buyerId: strangerId5g, readyMadeTripId: listingId, pricePaidCents: 9900,
      currency: "USD", stripePaymentIntentId: `pi_gate5g_${stamp}`, status: "cloned",
      purchasedAt: new Date(),
    } as any).returning();
    try {
      const minePurchases = await stranger.req("GET", "/api/ready-made/purchases/mine");
      const mineRow = (minePurchases.json?.purchases ?? []).find((p: any) => p.id === freshPurchase.id);
      check("buyer sees their purchase with the listing teaser joined",
        !!mineRow && mineRow.title === "Three days in Higashiyama" && mineRow.pricePaidCents === 9900,
        JSON.stringify(mineRow ?? {}).slice(0, 160));
      check("fresh purchase is refund-eligible (inside the D7 window)",
        mineRow?.refundEligible === true, `${mineRow?.refundEligible}`);
      const notMine = await author.req("GET", "/api/ready-made/purchases/mine");
      check("purchases list is buyer-scoped (author does not see it)",
        !(notMine.json?.purchases ?? []).some((p: any) => p.id === freshPurchase.id));

      await db.update(readyMadePurchases)
        .set({ purchasedAt: new Date(Date.now() - 9 * 86400000) } as any)
        .where(eq(readyMadePurchases.id, freshPurchase.id));
      const stale = await stranger.req("GET", "/api/ready-made/purchases/mine");
      const staleRow = (stale.json?.purchases ?? []).find((p: any) => p.id === freshPurchase.id);
      check("past the D7 window → refundEligible false (server clock, same as the refund gate)",
        staleRow?.refundEligible === false, `${staleRow?.refundEligible}`);

      await db.update(readyMadePurchases)
        .set({ purchasedAt: new Date(), status: "refunded" } as any)
        .where(eq(readyMadePurchases.id, freshPurchase.id));
      const refundedList = await stranger.req("GET", "/api/ready-made/purchases/mine");
      const refundedRow = (refundedList.json?.purchases ?? []).find((p: any) => p.id === freshPurchase.id);
      check("a refunded purchase is never refund-eligible again",
        refundedRow?.refundEligible === false, `${refundedRow?.refundEligible}`);
    } finally {
      await db.delete(readyMadePurchases).where(eq(readyMadePurchases.id, freshPurchase.id));
    }

    console.log("\n── 6: hero-search key gate (§13 honest unavailability) ──");
    const search = await author.req("GET", "/api/expert/ready-made/hero-search?q=kyoto");
    if (process.env.UNSPLASH_ACCESS_KEY) {
      check("keyed: ready true", search.json?.ready === true, JSON.stringify(search.json).slice(0, 200));
    } else {
      check("keyless: ready=false + explicit reason (NOT an empty 'no results')",
        search.json?.ready === false && search.json?.reason === "unsplash_not_configured",
        JSON.stringify(search.json).slice(0, 200));
    }

    console.log("\n── 7: cross-author isolation ──");
    const strangerPatch = await stranger.req("PATCH", `/api/expert/ready-made/${listingId}`, { title: "hijacked" });
    check("another expert cannot PATCH this listing", strangerPatch.status === 404, `got ${strangerPatch.status}`);
    const strangerPreview = await stranger.req("GET", `/api/expert/ready-made/${listingId}/earnings-preview`);
    check("another expert cannot read its earnings", strangerPreview.status === 404, `got ${strangerPreview.status}`);
    const strangerMine = await stranger.req("GET", "/api/expert/ready-made/mine");
    check("'mine' is author-scoped",
      !(strangerMine.json?.listings ?? []).some((l: any) => l.id === listingId));

    const anon = makeActor();
    const anonPatch = await anon.req("PATCH", `/api/expert/ready-made/${listingId}`, { title: "anon" });
    check("unauthenticated PATCH is 401", anonPatch.status === 401, `got ${anonPatch.status}`);

    console.log("\n── 8: role gate (D3) ──");
    await db.update(users).set({ role: "user" } as any).where(eq(users.email, strangerEmail));
    const demoted = await stranger.req("POST", "/api/expert/ready-made", { title: "nope" });
    check("a plain traveler cannot create a ready-made listing", demoted.status === 403, `got ${demoted.status}`);
    const demotedSearch = await stranger.req("GET", "/api/expert/ready-made/hero-search?q=kyoto");
    check("a plain traveler cannot use the Unsplash proxy", demotedSearch.status === 403, `got ${demotedSearch.status}`);
  } finally {
    console.log("\n── cleanup ──");
    try {
      if (listingId) await db.delete(readyMadeTrips).where(eq(readyMadeTrips.id, listingId));
      if (tripId) await db.delete(trips).where(eq(trips.id, tripId));
      await db.delete(users).where(eq(users.email, authorEmail));
      await db.delete(users).where(eq(users.email, strangerEmail));
      console.log("  removed test rows");
    } catch (e: any) {
      console.log(`  cleanup warning: ${e.message}`);
    }
  }

  console.log(`\n${fail === 0 ? "✅" : "❌"} ready-made phase-2 gate: ${pass} passed, ${fail} failed\n`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error("verify failed:", e); process.exit(1); });
