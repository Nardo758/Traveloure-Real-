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
import { users, trips, readyMadeTrips, itineraryItems } from "@shared/schema";
import { eq, sql } from "drizzle-orm";

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
