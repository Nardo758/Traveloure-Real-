# QA Punch List — Workstation / expert build-content pass (started Aug 1, 2026)

Living list from the decision-maker's hands-on QA + the exploratory build-content test pass.
Items are struck through when merged to main (with the PR). Decision-maker calls are marked **[DM]**.

**Naming (DECISIONS.md ruling 37):** the waves below are this lane's own — read every "Wave N" here as
**QA Punch List Wave N**. They are unrelated to the journey suite's **Journey Wave 1–4**
(`docs/planning/JOURNEY_TEST_SUITE_BRIEF.md` §7). The two series collided on the bare name "Wave 1"
and made a real status question unanswerable; new prose in either lane must namespace it.

## Fixed (Aug 1 round — PRs #359 / #360 / #361)

- ~~Platform-services search box was a no-op within a destination~~ (#361 — query text now actually filters)
- ~~No item-level delete in the build editor~~ (#361 — Remove button via the trip-scoped, author-aware endpoint)
- ~~First-item CTA landed new experts on Custom instead of DMO Library~~ (#361)
- ~~Custom items were never geocoded~~ (#361 — best-effort geocode of "venue, destination" at add; honest null on miss)
- ~~Social caption showed stale duration/price after saving listing details~~ (#361 — query invalidation)
- ~~"Days" meant two different things on the home list vs the build header~~ (#361 — relabeled "N-day trip")
- ~~No way to delete a Workstation draft build~~ (#359 — v1: never-shipped drafts only; author-gated;
  refuses shipped listings / client assignments / purchased items)
- ~~Seeded provider_services rows had NULL coordinates → no map pins~~ (#360 — migration 162 re-backfill
  + seeders born-coordinated; needs a Replit publish to apply on prod)

## Fixed (Wave 1, Aug 1 — PRs #363 / #364 / #365)

- ~~Items 1+2+3 (partner log-booking loop; Platform-content pill; My-services pill)~~ (#364 — all six
  Add-panel pills live; the "Soon pills" [DM] is RESOLVED, both got real reads)
- ~~Item 15 minimal (traveler /chat conversation-threads list)~~ (#363; the unified-Inbox [DM] stays open)
- ~~Item 5 (expert Return-to-planning button)~~, ~~item 7 (+Day persistence)~~, ~~item 8 (dashboard
  trip chip persists)~~, ~~item 9 (rating||4.5 + metrics buckets)~~ (#365)

## Fixed (Wave 2, Aug 1 — PRs #367 / #368)

- ~~Item 4 (withdraw-from-store + delete withdrawn unsold shipped builds)~~ (#367 — migration 163
  CHECK-widen; resubmit re-enters the admin queue; sold history never deletable)
- ~~Items 11 + 13 + 14b (delivery handshake, ratified approval mode-flip, reverse notification)~~
  (#368 — migration 164; post-approval expert edits 409 into suggest-mode; owner/author never gated)

## Fixed (Wave 3, Aug 1 — PRs #369 / #371 / #372)

- ~~Item 14(a) (email channel for trip lifecycle events)~~ (#369 — delivered/approved/changes-requested
  /post-approval-suggestion emails via the existing Resend cluster; key-gated honest skip; also closed
  a TOCTOU on the delivered transition with an atomic conditional guard)
- ~~Item 10 tiers (a)+(c) (partner catalog drawer + customer-approval gate on the Booking Brief)~~
  (#371 — §16 proven: all five feeds' affiliate URLs stripped before display. **Platform-wide fix
  riding along: suggestion approval now MATERIALIZES a real `itinerary_items` row** — previously it
  only wrote the legacy `generated_itineraries` blob nothing renders, so approved suggestions never
  appeared on the actual plan; + §15 atomic-conditional suggestion decision. Tier (b) per-partner
  availability APIs stays [DM]-gated.)
- ~~Item 12 (per-item comment threads)~~ (#372 — migration 165; owner ‖ canonical-advisor ‖ author
  gates; counterpart bell notifications; threads on Trip Card + Workstation editor)

**New [DM] (found by W3-C):** a pre-existing `activity_comments` backend (plancard.routes.ts,
owner-only, denormalized names) has ZERO client callers — retire as dead code or fold into the new
`trip_item_comments` system; do not build on it meanwhile.

## Fixed (Wave 4, Aug 1 — PR #374)

- ~~Items 16 + 17 + 18 (the canvas lane: plan map ON the build canvas — plan layer, day-filtered,
  error-bounded, honest unlocated count; Places autocomplete on Custom location + new-build
  destination with proven plain-text fallback; per-item reorder + confirm-gated "Suggest best
  order" + the mode-flip 409 extended to reorder/optimize-order advisor paths)~~ (#374 — the
  item-19 DISCOVERY layer stays pending [DM] ratification of the layered-map model)

## Fixed (Wave 5, Aug 1 — PRs #376 / #377 / #378 / #379 / #380)

- ~~Item 6 (DMO refine read-back)~~ (#376 — library/picker render the expert's own refinements,
  per-expert scoped, proven both directions; add-to-trip carries refined content)
- ~~activity_comments dead backend~~ (#377 — retired incl. a hidden count consumer; guarded drop,
  migration 167. **activity_bookings half REFUSED — premise corrected**: its schema declaration
  deliberately guards a prod table holding a real booking with a live Stripe PaymentIntent;
  removing it would make the publish push DROP that data. Re-framed [DM] below.)
- ~~Items 20 + 21 (content-logistics envelope, migration 166 + rules-first transport-gap checker
  in the AI Gaps tab, "Propose leg" wired to the live leg engine)~~ (#378)
- ~~Item 15 unified-Inbox half (traveler /inbox: Messages + Updates, honest badge)~~ (#379 —
  found+filed: chat read_at machinery exists server-side with zero client consumers; a real
  unread-messages badge is a future lane that must wire mark-read into chat first)
- ~~Item 19 (canvas map DISCOVERY layer — the ratified layered model complete)~~ (#380)

**Resolved by principle (no code): non-catalog checkout routing.** Items without a server-side
catalog price can never be §14-compliantly charged (no server price authority) — display-only in
the cart IS the design, not a gap. CLOSED.

## Deposits / partial payments (Lane 7 — LANDED, DECISIONS.md ruling 72, Aug 11 2026)

**LANDED (ruling 72).** Deposits on the cart-checkout rail, ratified shape: MANUAL BALANCE + PROVIDER
OPT-IN PER LISTING. Config on `provider_services` (`provider_pricing` audited as an orphan and NOT
reused); deposit/balance state mirrored onto `service_bookings` (migration 200, additive-nullable,
declared in `shared/schema.ts`). A deposit line checks out through the EXISTING §15 claim machine and
lands in `status='deposit_paid'` (distinguishable by construction from `confirmed` and from an
unauthorized claim; releases no earning — D8 completion still requires `confirmed`). Balance is a
second, owner-gated checkout (`POST /api/bookings/:id/pay-balance`) with its own PaymentIntent on
`stripe_balance_intent_id`, promoted `deposit_paid → confirmed` by `promoteBalancePayment` (the same
atomic shape, parameterised — no fork). ServiceForm gains a deposit config section. Proofs:
`server/__tests__/deposit-checkout.db.test.ts` D1–D9 (10, green); §15 spine + fee suites unchanged.

Follow-ups (filed, NOT built):

- **DEP-1 — overdue-balance SWEEP** [future lane]: v1 builds DETECTION only
  (`GET /api/admin/bookings/balance-overdue`; the state reads as `deposit_paid`, never `confirmed`).
  The automatic cancel/refund-or-forfeit at the cutoff — running per the listing's EXISTING
  `cancellationPolicyType` (no new refund policy), modelled on the TTL sweep (atomic conditional,
  never voiding a row whose PI may exist) — is deferred.
- **DEP-2 — deposit-aware reconciliation** [future lane]: the daily drift job's §17 expected-charge is
  `SUM(total_amount + platform_fee)` over a PI's bookings; a fully-paid deposit booking is a `confirmed`
  two-PI row whose deposit PI covered only part, which that check would flag. `deposit_paid` rows are
  skipped by the scan today; make the scan deposit-aware (sum deposit+balance PIs) before deposits see
  real volume. Does not affect the detection suite's fixtures.
- **DEP-3 — auto-charge v2** [DM]: the ratified v1 is deliberately manual-balance-only. A future
  stored-card / off-session / SCA-mandate auto-charge at the cutoff is a separate decision-maker call
  (it leaves the one-intent-per-claim shape and needs its own consent/mandate design).

## Open — [DM] / externally-gated only (the buildable column is EMPTY as of Wave 5)

- **activity_bookings** [DM, re-framed]: keep the declaration + accept the publish prompt (safe,
  current state, recommended), or deliberately archive the one real booking row (live Stripe PI)
  somewhere durable and then drop table + declaration together. Never just delete the declaration.
- **Partner tier-b live availability + commission attribution** [externally gated]: needs partner
  API keys/agreements (Klook/Musement; 12Go via Travelpayouts) only the decision-maker can obtain.
- **Chat unread-messages badge** [future lane]: wire real mark-read into chat.tsx first (the found
  never-consumed /api/messages read-tracking API), then the Inbox badge can count messages.
- **Curated testimonials + per-experience-type stats** [DM, editorial]: which reviews get featured
  is a decision-maker call; never invent either source (§13, filed long-standing).

## Verification record — Aug 10–11, 2026 (Service Fundamentals lane, D1–D5 + dispatch v1.3)

One-page state of everything that failed or was found across the day's verification passes, so the
next lane does not have to reconstruct it from commit archaeology. Cross-machine: findings came from
both the build bench and the Replit workspace.

| # | Finding | Status | Where |
|---|---------|--------|-------|
| 1 | **F2 publish gate blocked experts from publishing.** `if (provForm)` passed users with NO form row before `be78a9c`; after it, every user without a *provider* form row was blocked — all experts (they use `local_expert_forms`) plus providers with no form. **Fixed in TWO phases, not one:** `92030ea` corrected the gate (shared helper, DB role lookup, role-aware branches); `726de79` corrected its PLACEMENT (see #7). Crediting `92030ea` alone implies the gate was sound after phase 1 — it was not. | FIXED | `92030ea` + `726de79`; rulings 53, 56 |
| 2 | **Migration 193 (`short_links.frame`) not applied at boot.** Root cause is NOT a runner bug: `runMigrations()` imports `MIGRATION_FILES` once at process start, so a server already running when the commit was pulled never sees the new migration. A hot-reload is not a restart. The runner logs `[Migrations] Done — N newly applied, M already recorded` every boot; that line is the diagnostic. | FIXED (doc + restart) | `92030ea` → `server/migrations/AUTHORING.md` |
| 3 | **Frame dedupe collapsed all variants to one code.** Pure downstream symptom of #2 — the Drizzle cache had no `frame` column, so the dedupe key ignored it. No code defect. | FIXED by restart | — |
| 4 | **`POST /api/geocode` fabricated coordinates.** A hardcoded `FALLBACK_COORDINATES` city-centre dictionary answered Google misses, against §13 / migration-129. Removed; routes through the single geocode path; honest 404 on a miss. Both client callers already handled a non-ok response. | FIXED | `92030ea` |
| 5 | **`suggestedFrame` open-slot branch never exercised.** No dev service had `service_route_points`, so only the `feed` branch ran live. | FIXED (coverage) | `posting-opportunities-frame.http.test.ts` (2) |
| 6 | **Instagram publish round-trip unproven.** No connected account in any dev environment; the Graph API fetches the image from ITS servers, so reachability is untestable without a live account. The button self-gates honestly (disconnected / unapproved listing / route frame with no stops). | **OPEN** (externally gated) | needs a real connected IG account |
| 7 | **The gate sat where experts do not publish.** `checkPublishVerificationGate` fired only on `/api/provider/services` with `status:'active'`, which the expert ServiceForm never sends (it sends `approvalStatus:'submitted'` + `status:'draft'`). Public visibility needs approved AND active, and BOTH producing paths were ungated: `approveProviderServiceListing` set approved+active in one update, and `PATCH /api/expert/services/:id/status` accepted `active` unchecked. Decision-maker ruled **option B**. | FIXED | `726de79`; ruling 56 |
| 8 | **CI build gate failed on PR #451.** The tsc ratchet is down-only: the branch removed 7 errors (190 → 183) and the gate refuses to let an improvement survive as headroom for the next lane. | FIXED (baseline locked) | `a6938de`; ruling 54 |
| 9 | **38 proofs ran nowhere in CI.** Five suites protecting twice-regressed work were script-only — per rulings 26/27, script-only = MISSING. Now a blocking PR-triggered workflow. | FIXED | `00ec75d`; ruling 57 |
| 10 | **Ledger number collision.** The Stripe-only KYB ruling was written as a prose section headed "Decision #39" while 39 was already taken in the numeric table; the lint parses table rows only, so CI never saw it. Its publish-gate clause was also stale (identity AND business for every publisher — provider-only truth). | RECORDED | ruling 55 |
| 11 | **D3 deliverable is LINK delivery, not protected delivery.** See the P1 entry below. Object Storage is now **provisioned** (bucket attached in `.replit`, wrapper at `server/infrastructure/object-storage.ts`) — but it is consumed only by `vendor-management.service.ts` for vendor CONTRACT documents. The deliverable rail is **untouched**: `ServiceForm` still renders "Deliverable File URL" as a pasted-URL input, and the entitlement endpoint still returns that raw URL verbatim. The infrastructure unblocks R4; it does not constitute R4. | **OPEN** | P1 below |
| 12 | **No completion event exists for pdf bookings.** See the P2 entry below. **Wider than reported:** the only writer of `service_bookings.status='completed'` on `main` was the admin dispute-REJECT — the owner rail refuses `completed` and `confirm-completion` demands it, a closed loop — so no completion event existed for **any** delivery method. Closed for pdf/property (timer) and call/video/async/bundle (owner rail) by ruling 66; `in_person`/`hybrid` was left as ruling 63 ordered ("unchanged") and re-filed — **that half is now CLOSED too** (ruling 69 disposition 1 AMENDED ruling 63's clause; built as `service_date_timer` in ruling 70, `a1231ac`). Every delivery method now has a completion writer. | FIXED (ruling 66 `f3984da` + ruling 70 `a1231ac`) | P2 below; rulings 66/69/70 |
| 13 | **The rails fee lane had no way to be switched on.** `resolveProviderRate`'s `isRails` flag — CI-pinned since ruling 48 as min(category band, rails) + the traveler-fee waiver — had **zero callers in the repo**: nothing at checkout ever told the resolver a booking arrived through a provider's own link, so the whole dual-rate model was a capability with no input. Closed by the D6 chain (validation → resolver input → ledger stamp). | FIXED (ruling 68) | `server/services/rails-attribution.service.ts`; ruling 61 |
| 14 | **`fee_ledger` (migration 179) had no writer at all.** The table, its CHECKs, its UNIQUE idempotency index and its full fee-type taxonomy have been on disk since the fee-ledger lane's Phase 1B with **no INSERT anywhere in application code** — so every "the ledger records X" reading of migration 179 described an empty table. This lane adds the FIRST writer and it covers **rails bookings only**; direct checkout, the legacy rail, ready-mades, templates, coordination, tips and affiliate margin still write nothing, so the per-booking invariant is **not yet assertable platform-wide**. Do not aggregate the table as if it were complete. **Unchanged by ruling 70's 1C repoint (`d5c2aa7`):** the direct lane now RESOLVES through the D1 resolver but still writes NO ledger row, so the slice is exactly as narrow as it was. | PARTIAL (rails slice only) | `server/services/fee-ledger.service.ts`; rulings 68/70 |
| 15 | **`short_links` had no expiry of any kind**, so ruling 61's "expired ref → full rate" refusal had nothing to key on. Migration 198 adds `expires_at` (nullable; NULL = never expires, no backfill, no behaviour change to any link already shared) and it binds in the MONEY decision only — `/r/:code` still redirects and still counts the click, and S4 analytics attribution is unchanged. **CLOSED (ruling 70, `6b2f840`)** — `PATCH /api/short-links/:id` is the writer the disposition named: owner + admin only, §19 allowlist of exactly `{expiresAt}`, NULL = never expires, a set value must be in the future (a past date is a retire-now action wearing a schedule's name). No default TTL on minting — that option was NOT chosen. End-to-end proof E4: an expiry a user actually sets is the expiry the rails money decision refuses on. | FIXED (ruling 70) | migration 198; `6b2f840`; ruling 69 disposition 7 |

**Standing lessons worth carrying forward:** (a) a fix that closes a reported symptom may not close the class — #1 needed a second pass because the first proved the gate *correct* without proving it *reachable*; (b) duplicated branches at two call sites drifted twice, which is why the resolver is now a single shared function; (c) a guard that is not wired into CI is not a guard, and green means green-within-stated-bounds (ruling 57 states its negative space).


## Open — build items

~~**P1 (new, Aug 11) — "adding pins to the map didn't work as intended" (decision-maker report at the
ruling-62 ballot; diagnosis pending their symptom description).** Code review found three candidate
causes, most likely compounding: (a) **env timing** — both Google keys were only just set;
`VITE_GOOGLE_MAPS_API_KEY` is read at Vite dev-server start (and baked into builds), and the server's
`GOOGLE_MAPS_API_KEY` is read per-request but the workflow predates the secret — until a FULL workflow
restart the pin picker renders null and `POST /api/geocode` returns honest 404 for every query;
(b) **route-stop UX** — `catalog-map-view.tsx` locates stops ONLY by name→geocode (`locateStop`); there
is NO click-the-map-to-place and NO drag-to-adjust for a stop, so a stop the geocoder misses or
mislocates cannot be pinned by hand — if "adding pins" meant dropping pins, that affordance genuinely
does not exist on the route editor (the meeting pin has it; stops don't); (c) **key restrictions** —
a fresh Google key without Maps JavaScript API + Geocoding API enabled (or with referrer restrictions)
yields gm_authFailure / REQUEST_DENIED, which surfaces as the same "No match found" toast. Fix ships
with the ruling-62 D7 work (same surface): restart-first diagnosis, then click-to-place + drag-adjust
for route stops on the L27-P3 confirm posture.~~
**RESOLVED (ruling 64, Aug 11 2026) — candidate (b) was the whole of it.** The decision-maker
verified (a) and (c) live before this build started: the Google keys work, the meeting-pin picker
renders with click-to-place AND drag-adjust, and `POST /api/geocode` resolves correctly — so
neither env timing nor key restrictions was the fault. The real gap was exactly (b): route stops
in `client/src/components/provider/catalog-map-view.tsx` could be located ONLY by name→geocode,
and their Leaflet markers were static. **Closed here:** located stop markers are draggable
(drag end moves the DRAFT stop and sets the existing `dirty` flag), and an explicitly ARMED
"Place a stop here" / per-stop "Place on map" mode turns the next canvas click into that stop's
coordinates — a bare map click still does nothing, so pan/zoom is untouched. A newly placed pin is
prompted inline for its name and cannot be saved unnamed. Nothing persists until the pre-existing
"Save route" button; that dirty→Save step IS the L27-P3 confirm posture on this surface. Geocode
Locate, the off-map listing of unlocated stops, server-derived positions and the replace-list PUT
with its 409 handling are all unchanged. Proven by 14 chromium UI proofs (drag→Save→reload
persists; canvas click places a named stop; an unlocated stop gains a pin by hand).

~~**P0 — ruling 53's publish gate sits where experts DON'T publish; the two paths that actually
take an expert listing live are UNGATED (found Aug 11, 2026 by the R2 lane; verified in code).**
Ruling 53 records verify-to-publish as enforced. It is enforced — but only on
`POST`/`PATCH /api/provider/services` when the request carries `status:"active"`, and **the expert
UI never sends that**: `ServiceForm.tsx`'s Submit-for-Approval sets `approvalStatus:"submitted"` +
`status:"draft"` (the expert branch), so `checkPublishVerificationGate` is unreachable through the
button experts actually use. It has exactly two call sites (`server/routes.ts:2366`, `:2539`).
Public visibility requires **both** `approval_status='approved'` AND `status='active'`
(storage.ts:1649, :1994; storefront.routes.ts:557). The two paths that produce that state:
1. **ADMIN APPROVAL — the real hole.** `storage.approveProviderServiceListing`
   (server/storage.ts:3223) sets `approvalStatus:"approved"` **and** `status:"active"` in one
   update, with no verification check anywhere. This is the canonical way an expert listing goes
   live, and an admin approving an UNVERIFIED expert's listing publishes it — exactly the outcome
   ruling 53 exists to prevent.
2. **The owner's own Activate toggle.** `PATCH /api/expert/services/:id/status`
   (server/routes.ts:4521) accepts `status:"active"`, is ownership-checked but NOT verification-
   checked, and calls `storage.toggleServiceStatus` directly. Narrower (it only re-lives an
   already-approved listing, e.g. one paused after approval or after verification lapsed) but it
   is a second ungated door.
**Ledger consequence (DECISIONS.md's own rule — a ledger-vs-code disagreement is a finding, never
a silent divergence):** ruling 53 as appended **overclaims**. It describes the gate's placement
accurately but implies an enforcement completeness the code does not have. Whatever fix lands must
append an amending ruling that states the true enforcement boundary; do not edit 53.
**[DM] needed — this is a policy edge, not just a code fix:** when an admin approves a listing from
an unverified expert, should the approval be (a) REFUSED with a typed reason, (b) allowed but
landing `approved` + `status:'draft'`/`paused` so it is not publicly live until the expert verifies
(recommended — it preserves the admin's review work and lets go-live follow verification
automatically), or (c) allowed with an explicit admin override that is recorded? The Activate
toggle should call the same shared helper regardless of which is chosen.~~
**LANDED (ruling 56, amends 53) — option (B) implemented.** `resolvePublishVerification(userId)`
(`server/services/publish-verification.service.ts`) is the one predicate; admin approval always
records `approved` but only sets `status:"active"` when the listing owner passes it (else
`approved`+`draft`, held not live); the owner's Activate toggle and an idempotent
`activateVerificationHeldListings` sweep (wired from the identity + business verification webhook
paths) both resolve through the same function. `approved`+`paused` rows are never touched. Proven
by `server/__tests__/publish-verification-hold.http.test.ts` (9 proofs); original 11
f2-verification-gate proofs stay green.

~~**P1 — the D3 deliverable is LINK-delivery, not protected delivery (verified Aug 10, 2026;
Service Fundamentals dispatch v1.2 §4).** `GET /api/service-bookings/:id/deliverable` server-derives
every entitlement condition correctly, then returns **the raw `serviceFile` string verbatim**
(`res.json({ fileUrl, deliveryMethod })` — no proxy, no signing, no redirect, no expiry) and performs
**zero writes**. Because `serviceFile` is a provider-pasted external URL (no upload/object-storage
pipeline exists anywhere in the platform — every media field is a pasted URL), the entitlement gates
the **one-time reveal of a URL, not access to the file**: once any single buyer sees it, the link is
permanently shareable, unrevokable, and outside platform control. §14-style server-side gating is
satisfied in letter only. **Disposition (per the dispatch, needs [DM] ratification): promote the
file-upload pipeline from "infrastructure decision" to the COMPLETION of D3** — platform-managed
storage + signed, expiring URLs, with the serve path proxying rather than disclosing. Until it lands,
label the rail honestly as link-delivery in the provider UI and state that the platform cannot protect
a pasted link. Sequenced after the D6 attribution retrofit.
**STATUS AMENDED Aug 11, 2026 — infrastructure PROVISIONED, rail STILL OPEN.** Replit App Storage is
attached (bucket recorded in `.replit`; wrapper at `server/infrastructure/object-storage.ts` exposing
`uploadBuffer`). **It is consumed by exactly one caller — `vendor-management.service.ts`, for vendor
CONTRACT documents — and is wired into the deliverable rail nowhere.** Verified against the code:
`server/routes.ts` contains ZERO object-storage references and `GET /api/service-bookings/:id/deliverable`
still ends `res.json({ fileUrl, deliveryMethod })` with the raw pasted string; `ServiceForm.tsx:1873`
still renders "Deliverable File URL" as a text input, and that file's only object-storage mention is
the comment noting no upload rail exists. So a report that "the deliverable rail is done" describes
the BUCKET, not the RAIL. The provisioning is real progress — it removes the backend decision that was
blocking R4 — but P1 is unchanged: an entitled buyer is still handed a permanent, shareable,
unrevokable external URL. R4 remains to be built: upload on the ServiceForm delivery step, a proxying
serve path that never discloses a location, an inventory of existing pasted-URL rows, and R5's
download-log write on the same endpoint.~~
**FIXED (R4, Aug 11, 2026 — docs/DECISIONS.md ruling 58).** `provider_services.serviceFile` now
distinguishes a platform-managed upload (`objstore:<key>`) from a legacy pasted URL by the
`objstore:` prefix, same column, no migration. `POST /api/provider/services/:id/deliverable-file`
(owner-gated, `%PDF-` magic-byte validated, no new dependency) uploads via
`server/infrastructure/object-storage.ts`'s `uploadBuffer`; `GET /api/service-bookings/:id/deliverable`
now branches on the prefix — an `objstore:` value is downloaded server-side and STREAMED
(`Content-Type: application/pdf`, never a URL/key in the response), a legacy value keeps the pre-R4
JSON shape plus an honest `protected: false` marker. Existing pasted-URL rows are NOT migrated
(inventoried, not repaired — 0 found on this dev DB; prod count is an open `#PS17`-class follow-up).
R5's `deliverable_downloads` log (migration 194) gives a future D8 pass the download signal it
needs; D8 itself remains unruled. Proven by `deliverable-protected-rail.http.test.ts` (13 proofs);
all 9 original `service-deliverable.http.test.ts` proofs still green.

**R4 end-to-end verified live against the real bucket (Aug 11, 2026).** Four proofs run against the
provisioned bucket (`replit-objstore-b9da6238-639b-4b0e-8956-034ec0042760`) with REPLIT_OBJECT_STORAGE_BUCKET
live in the server process: (P1) provider uploads a PDF → 200, `protected:true`, `serviceFile`
stamped `objstore:<random-hex>.pdf` in the DB, key never returned to caller. (P2) traveler with a
`confirmed` booking downloads → HTTP 200, `Content-Type: application/pdf`,
`Content-Disposition: attachment; filename="…pdf"`, bytes byte-identical to the upload, no storage
key or URL in the response body. (P3) two fetches → two `deliverable_downloads` rows, `protected=true`
on both. (P4) unauthenticated GET of the raw GCS URL returned **HTTP 403 Forbidden** — bucket is
empirically PRIVATE; ruling 58 bucket-privacy question CLOSED. Fixtures cleaned up; no code
changes required.

~~**P2 — no completion event exists for artifact (pdf) bookings; the D8 auto-complete rule is
unbuildable as written (verified Aug 10, 2026; dispatch v1.2 §2).** Premise correction for the D8
ruling: D3 did **not** define completion "by accident" — it defines **nothing**. The deliverable read
writes no row, logs no download, and touches no status. A pdf booking therefore reaches `completed`
only via the same manual path as everything else (provider flips status → held earning →
`POST /api/bookings/:id/confirm-completion` releases it), and **no auto-release timer exists**
(grepped: no `autoRelease`/`escrowRelease` scheduler), so an inattentive traveler leaves a provider's
earning held indefinitely on a product that was fully delivered the moment it was downloaded.
Consequence for D8's proposed table: **"auto-complete after N days undownloaded" cannot be built
today — there is no download signal to measure.** It requires D3 to start logging deliverable
fetches (one write on the endpoint above), which should land with the P1 storage work rather than as
a separate pass.~~
**CLOSED by ruling 66 (commit `f3984da`).** `deliverable_downloads` (migration 194, R5) supplied the
download signal, so both arms of ruling 63's pdf rule are now built and proven: 7 days after the
first download, and 7 days undownloaded post-delivery (the latter measured from the new additive
`provider_services.deliverable_uploaded_at`, migration 196 — §13: a NULL clock skips that arm with a
stated reason instead of guessing). The timer is `server/jobs/bookingAutoCompletion.ts`, hourly,
driving the SHARED `completeBooking` (`server/services/booking-completion.service.ts`).
**One clause of the entry above was WRONG and is corrected by the same ruling:** the manual path it
describes does not exist either. `OWNER_SETTABLE_BOOKING_STATUSES` is `["confirmed","cancelled"]`
and the owner rail answers *"Completion is confirmed by the traveler"*, while
`POST /api/bookings/:id/confirm-completion` **requires the booking to already be `completed`** — a
closed loop. The only writer of `service_bookings.status='completed'` on `main` was
`admin.routes.ts`'s dispute-REJECT, so **no completion event existed for ANY delivery method**, not
just pdf. See the new open item below for the half of that finding ruling 63 explicitly left alone.

**CLOSED (decision-maker disposition, DECISIONS.md ruling 69 §1; built by ruling 70, `a1231ac`).** The
actor question is answered: the normal path is a **timer on the booked service date**, N days after
it has fully passed, with N reusing `holdWindowDays('service_booking')` so completion lands exactly
where the dispute window closes. The traveler's confirm-completion stays the EARLY release; a
dispute blocks through the existing from-state guard (verified, not added); a booking with NO
service date is skipped with its reason and is the ONE case that opens the owner rail's
provider-declared arm. Proofs D8-P7/P8/P9/P10, D8-N11/N12/N13/N15. Original filing retained:

~~**OPEN (filed by ruling 66) — `in_person` / `hybrid` bookings still cannot reach `completed`.**~~
Ruling 63's first table row is "confirm-completion flip as built (unchanged)", so the D8 lane
deliberately did not touch it — but "as built" is the closed loop described just above: nothing can
put an in-person booking into `completed`, and `confirm-completion` refuses anything that is not
already there. Every other method now has a writer (timer for pdf/property, owner rail for
call/video/async/bundle); in-person has none. Needs a decision-maker ruling on which actor opens
that door (traveler-declares-then-confirms in one step, an owner rail with the same evidence gate
the session-end rule uses, or a scheduled-date timer). **Not a regression** — it predates this lane
and is unchanged by it.

**OPEN (filed by ruling 66, per ruling 63's own instruction) — NO-SHOW POLICY.** Ruling 63 files
this as its own follow-up and ruling 66 invented none of it. Today a `session_end` completion fires
purely on the booked slot's end time: a call the traveler never joined completes exactly like one
they did. There is no attendance signal anywhere in the schema, no no-show state, and no no-show
refund or partial-payout path. Needs a ruling covering (a) who asserts a no-show and on what
evidence, (b) whether it blocks completion, splits the fee, or routes to the existing refund lane,
and (c) whether the traveler's existing 7-day dispute window is considered sufficient recourse
(it currently IS the only recourse).

**CLOSED (decision-maker disposition, DECISIONS.md ruling 69 §8; built by ruling 70, `a1231ac`).** Of the
two honest resolutions this entry named, the decision-maker took the first: `voice_notes` moves to
the `provider_declared` (async) row, AMENDING ruling 66's table. The `no_booked_slot` refusal proof
became a provider-declared success proof (D8-P11). Original filing retained:

~~**OPEN (filed by ruling 66) — `voice_notes` has no booked slot, so its completion rule cannot
fire.**~~ The build charter resolves ruling 63's "call/voice" row as call + video + voice_notes, and
`SESSION_END_METHODS` reflects that — but D2 (`shared/service-fundamentals.ts`) classifies
`voice_notes` as async/artifact delivery and therefore leaves it out of `SCHEDULED_METHODS`, so such
a booking normally carries no `slot_id` and the evidence gate refuses it with `no_booked_slot`
(§13 — never a guessed session end). Two honest resolutions, both needing a ruling: move
`voice_notes` to the `provider_declared` (async) row, or give it a scheduled shape. Deliberately not
chosen in-lane.

**OPEN (filed by ruling 66) — the D8 owner-complete endpoint has NO client surface.**
`POST /api/provider|expert/bookings/:id/complete` is live, owner-gated and proven, but no console
screen calls it: a provider cannot yet mark a session, an async engagement or a bundle component
complete from the UI. Server-side only by design (this lane was the machinery); the Workstation /
Bookings surface is the natural home.

**Filed (externally gated): Instagram publish round-trip unproven.** The D4 publish button self-gates
honestly, but the real Graph API round-trip (image reachability from Instagram's servers) has never
executed — no app credentials and no public URL in any build sandbox. Needs one verification run in
the Replit environment with a connected account. Not a blocker.

~~**P0 — LIVE REGRESSION (found Aug 10, 2026; introduced by `be78a9c` on
`claude/sync-local-repo-2j7ghv`): the F2 publish gate blocks EVERY EXPERT from publishing.**
The Phase-0.5 verification gate on POST/PATCH `/api/provider/services` (server/routes.ts, fires when
`input.status === "active"`) blocks any non-admin with no `service_provider_forms` row. **Experts
never have one** — expert verification lives in `local_expert_forms` — and both consoles share the
same `ServiceForm` component posting to the same route (CLAUDE.md "Service Creation Consolidation":
experts create services through the provider route by design). Reproduced live: an `expert`-role
account POSTing `status:"active"` gets `403 VERIFICATION_GATE {identityVerified:false,
businessVerified:false}`, and the message tells them to visit "your provider status page" — a page
experts do not have. Three aggravating facts: (a) `local_expert_forms` has **no
`business_verification_status` column at all**, so an expert can never satisfy a business-verification
check (correctly — an individual expert is not a business); (b) it hits EDITS too, since
`ServiceForm` sets `payload.status = "active"` on any Publish click, so an expert editing a live
listing is blocked (drafts still save); (c) local data: `expert` role = 12 users / 0 provider forms /
12 expert forms, vs `service_provider` = 12 users / 9 provider forms / 0 expert forms. Nothing
already-published is unpublished (the gate only fires on write); the block is on new publishes and
re-publishes, affecting all 12 experts plus the 3 providers with no form row.
**Fix (role-aware gate, not form-table-aware):** providers → `service_provider_forms`, identity AND
business verified (current behavior, correct); experts → `local_expert_forms`, identity verified only;
admin → bypass, but via the **DB role lookup** `requireAdmin` uses (CLAUDE.md §2), not the
`req.user.role` session snapshot the current code reads; error message routed to each role's own
status page. **Owner:** the KYB lane (the agent that built the gate) — it is mid-flight in this exact
block, so a parallel edit risks a divergence. Coordinate before touching.~~
**[DM] RESOLVED (Aug 10, 2026): "Yes, experts need to verify their identity."** Experts MUST be
identity-verified to publish — `local_expert_forms.identity_verification_status = 'verified'` is a
required condition on the expert branch of this gate. Business verification stays provider-only (the
column does not exist on the expert form, correctly — an individual expert is not a business). Role
resolution uses `isExpertRole`/`isProviderRole` (`shared/roles.ts`: EXPERT_ROLES =
expert|local_expert|travel_expert|event_planner; PROVIDER_ROLES = service_provider) and the admin
bypass uses the **DB role lookup** pattern `requireAdmin` uses (server/routes.ts ~:8861), never
`req.user.role`. Roles in neither family (e.g. `executive_assistant`, plain `user`) stay blocked —
default-deny. Error copy routes per role: providers → `/provider-status`, experts → `/expert-status`.
**FIXED (Aug 10, 2026):** landed as a single shared `checkPublishVerificationGate` helper (`server/routes.ts`)
used by both POST and PATCH `/api/provider/services`, exactly per the [DM] ruling above — proven by
`server/__tests__/f2-verification-gate.http.test.ts` (11/11: verified-expert publish, unverified-expert
block routed to `/expert-status`, provider both-statuses-required, admin bypass, draft-never-gated).

1. **Partner drawer: close the book-off-site loop.** The pill promises "book off-site, log it here",
   but after booking on the partner site there is no "Log completed booking → add to Day N" action —
   the expert must re-enter it by hand through Custom. Add a log-booking step to the drawer
   (pre-filled provider, drops a real itinerary item on the focused day). Contained UI fix.
2. **Wire the "Platform content" pill (§17 Add-panel registry read).** The Central Content system
   (`content_registry`: experiences, templates/Ready Made Trips, media, custom venues, vendors, …)
   is live on traveler surfaces via placement rules, but the Workstation has no registry read — the
   pill is an honest "Soon" placeholder. This is the ratified-but-unbuilt half of §17's
   "Add panel = the Central Content network".
3. **Wire the "My services" pill** (blocked on the same pattern; reads the earner's own approved
   `provider_services` — the Catalog module's data, scoped to the session user).
4. **Withdraw-from-store** (listing withdraw/delete on `ready_made_trips`) — prerequisite for
   deleting shipped builds (the #359 v1 409 points here).
5. **Expert "return to planning" routing edge has no UI control** (server grants
   `with_expert→in_planning`; RoutingActions is owner-gated client-side).
6. **DMO "Refine" is a dead-end write** — `expert_dmo_edits` rows are never read back into the
   library/picker or built trips (already filed in CLAUDE.md §12 D4 follow-ups; behaviorally
   confirmed in QA).
7. **"+ Day" is ephemeral client state** — vanishes on reload unless an item lands on the day (P3).
8. **Dashboard selected-trip chip resets to soonest trip on reload** (component state, P3).
9. §13 residue in optimizer surfaces: `rating || 4.5` fallback; metrics mapper missing
   accommodation/free-time buckets.

10. **Partner catalog in-workspace (DMO-style) — decision-maker requested Aug 1, three requirements.**
    Upgrade the Partner-inventory pill from a network *list* to a browsable partner *catalog* drawer
    (the Transport pill is the exact precedent: a §16-clean drawer over the existing `/api/catalog/*`
    Travelpayouts feeds — ~15 endpoints incl. tours/activities — informational add, affiliate URL never
    client-side). Requirement mapping:
    - **(3) Expert preview + add-to-plan before leaving the site** → the drawer itself: browse cards
      (name, image, price, description from the feed), "Add to Day N" creates a real itinerary item;
      booking still rides the Booking Brief flow afterwards.
    - **(2) Traveler agrees before the expert books** → reuse the EXISTING suggestion rail
      (`POST /api/trips/:id/suggestions`, Distribute→Client card): on assignment trips a partner item
      enters as a suggestion; the Booking Brief "Continue to <partner>" unlocks only once the traveler
      has approved that item. No new approval machinery.
    - **(1) Live availability / not-out-of-stock** → honest tiering, §13: tier (a) show feed data with
      a fetched-at timestamp and an explicit "availability confirmed at booking" label — a cached feed
      must never claim in-stock; tier (b) real-time per-partner availability APIs (Klook/Musement
      partner APIs; 12Go via Travelpayouts) — a per-network integration lane gated on API
      access/agreements [DM: which networks to pursue]; tier (c) the expert's booking-time check on
      the partner site remains the final guarantee (the current flow already forces it). Ship (a)+(c)
      first; (b) per network as access lands.
    Folding this feed into the central registry stays the separately-filed §16 architectural item —
    this lane READS the existing feeds, it does not build a third content home.

11. **Plan-level review step at delivery.** The expert's `draft → in_review → delivered` status is
    workflow state, not a content gate — the customer's Trip Card shows items live as the expert
    adds them, and delivery today triggers no customer action. Add the delivery handshake: on
    `delivered`, the customer's Trip Card offers "Approve plan / Request changes" (the §18
    delivered handshake's natural home). Ties to item 13's mode flip.
12. **Per-item comments for the customer** — today the only channels are the suggestion
    rejection-note and chat; there is no comment thread on the plan or its items.
13. **[DM] Approval flips the editing mode (the "planning object vs final product" lifecycle).**
    Decision-maker clarification (Aug 1): the planning object and the Trip Card are ONE object
    (§18 circulate-by-reference — do NOT split into two artifacts; two copies = drift + the
    paid-product-contradicts-plan class). The phase distinction the decision-maker wants is a
    LIFECYCLE STATE on that one object: during planning the expert edits directly and the card
    renders in "in planning" dress (draft banner, suggestion/approval controls prominent); once
    the customer APPROVES (item 11), the card renders as the polished final Trip Card AND the
    expert's direct-edit mode flips to suggest-mode — post-approval changes enter as suggestions
    requiring customer approval, instead of silently mutating an approved plan. This gives the
    "send the planning object around, then the Trip Card once final" behavior without a second
    object or snapshots (snapshots stay money-events-only per §18). **RATIFIED (decision-maker,
    Aug 1 "ok sounds good"): the mode-flip rule stands — approval flips expert direct-edit to
    suggest-mode. Pre-approval stays direct-edit (live collaboration is the planning phase's
    point; protection begins at sign-off).**
14. **Delivery / notification / communication findings (decision-maker questions, Aug 1).**
    Ground truth of what exists:
    - **Where the plan is delivered:** in-platform, by reference — the customer's dashboard Trip
      Card and their own `/trip/:id` view render the one TripPlan object (full channel);
      notifications deep-link to `/trip/:id?tab=itinerary`. External/offline: the read-only share
      link (`/itinerary-view/:token`) plus its KML/GPX exports and per-leg navigate links.
    - **Change notifications (in-app, already wired):** suggestion created → "New suggestion from
      your expert"; `in_review` → "ready for your review"; `delivered` → "delivered" — all
      best-effort inserts into the notifications bell, deep-linked to the customer's trip view.
      Direct expert edits pre-approval are deliberately un-notified (live planning); post-approval
      every change is a suggestion → notified by the existing suggestion notice.
    - **Communication:** the Trip Card's sticky action bar has "Message <expert>" → `/chat`
      (real thread); suggestion reject carries a rejection note; change-history renders on the
      card.
    **Gaps (build items):** (a) no EMAIL or push channel for the three trip events — a customer
    not logged in never learns their plan was delivered or changed (tie into the existing email
    cluster; [DM] which events warrant email vs bell-only); (b) the item-11 handshake needs the
    REVERSE notification — expert is notified when the customer approves or requests changes;
    (c) per-item comments = item 12 (the communication half of this).

15. **Traveler messaging center — the missing half of in-platform messaging.** The chat RAILS are
    real and shared (`/chat`, `/api/chats`, per-booking message buttons, the Trip Card's
    "Message <expert>" action), and the EARNER side has a proper center (expert Inbox "Messages"
    tab + earner-mode `/chat` lists real conversation threads). But the TRAVELER side of `/chat`
    explicitly returns no threads (`if (!isEarner) return []`) — a traveler's sidebar is a
    browse-experts DIRECTORY, not their conversations; a traveler with 2+ ongoing expert
    conversations has no list of them anywhere. Minimal fix: give traveler-mode `/chat` the same
    real-threads list the earner fix added (same `/api/chats` grouping, counterpart = the expert).
    [DM, bigger design call: whether the traveler gets a unified INBOX (chat threads + the item-14
    trip-event notifications in one place, mirroring the earner console's Inbox module) — or chat
    stays chat and the bell stays the bell.]

16. **Canvas lane (decision-maker raised Aug 1: "location, surface, and order"): plan map ON the
    build canvas.** Ground truth: the only map in the Workstation is inside the Platform-services
    browse drawer — the build canvas (the day list) renders no map of the plan's own items, so
    experts sequence days with zero spatial awareness even though items now carry real coords
    (W1/162). Build: a collapsible plan-map section on the canvas (mirrors the Trip Card's map
    peer) — pins for located items, colored/filtered by the day-focus control, click-pin →
    scroll-to-item; reuse the file's existing @vis.gl components + `MapSectionErrorBoundary`
    pattern (a Maps billing/key failure collapses to a one-line notice, never blanks the canvas);
    unlocated items listed honestly under the map ("no location yet"), never fabricated pins (§13).
17. **Canvas lane: location autocomplete.** No Places autocomplete exists anywhere in the client —
    Custom-form location and new-build destination are plain text with silent submit-time geocode.
    Wire Google Places autocomplete on both (the Maps JS provider is already mounted in the
    workspace; the key setup includes Places). On pick: store the text + lat/lng (exact precision).
    Fallback: Places unavailable → plain text + the existing submit-geocode, unchanged.
18. **Canvas lane: reorder UI (server already done) + a mode-flip gap it exposed.**
    `POST /api/trips/:tripId/itinerary/reorder` (+ `optimize-order`) exist, properly
    `authorizeTripLogistics`-gated, with `sort_order` on items — no Workstation UI calls them.
    Build: within-day reorder controls (up/down per item in the day list; drag optional later)
    calling the existing endpoint; surface `optimize-order` as a per-day "Suggest best order"
    action (applies only via the same reorder call — expert confirms, §18 D1a posture).
    **MUST also close the gap this audit found: the reorder + optimize-order endpoints are NOT
    covered by the W2-A mode-flip** — a post-approval expert could silently resequence an
    approved plan. Add the advisor-only `isPlanApprovedForExpert` 409 to both (same pattern as
    the item-write gates; owner/author unaffected).

19. **Canvas map interaction model — LAYERED (recommended, [DM] ratify; refines item 16).**
    Decision-maker question (Aug 1): pins-as-the-expert-adds vs all-content-shown-and-select —
    "each has downstream effects on the category filters." Recommendation: ONE map, TWO layers,
    which dissolves the filter problem instead of picking a side:
    - **Plan layer (always on):** pins of what's IN the plan, filtered by the day-focus control.
      No category filters needed — it shows the build.
    - **Discovery layer (contextual):** whenever an Add-panel source drawer is open, that drawer's
      RESULTS render as candidate pins (distinct style) on the same map; the drawer's own
      search/category filters ARE the map filters — one filter state driving both the list and
      the pins (never a separate all-sources filter bar, and never every piece of Kyoto content
      at once). Click candidate pin → preview card → "Add to Day N" (then it flips to a plan pin).
    This gives both behaviors: build-awareness always, select-from-map whenever any source is open.
20. **Content logistics envelope (decision-maker directive Aug 1: tag every piece of content with
    location, time available/start, duration, transport-provided incl. pickup + dropoff).**
    Ground truth — most homes EXIST on `provider_services`: coords/city (129/162), `meetingPoint`,
    `transportProvided` (yes|no|not_applicable), `pickupAvailable`, `availability` jsonb +
    `vendor_availability_slots` (real windows), duration. Gaps: no structured DROP-OFF point
    anywhere; external/partner-feed, registry, DMO and custom content carry none of the transport
    fields structurally. Build: ONE shared TS type (`shared/content-logistics.ts`):
    `{ coords, availabilityWindows, durationMinutes, transport: { provided, pickupPoint,
    dropoffPoint } }` — every Add-panel source maps its native fields into the envelope at read
    time (services map their columns; partner feed maps feed fields; DMO/custom/registry map what
    they honestly have — unknown = NULL, never fabricated, §13). Additive nullable columns ONLY
    where a source has no home for a field (e.g. `drop_off_point` on provider_services; envelope
    fields on itinerary_items so the plan retains what the source knew). The envelope is what the
    canvas map, the gap-checker (21), and the Trip Card's §18 mode-aware CTA all consume — one
    vocabulary, no per-surface re-derivation.
21. **Transport-gap checker (decision-maker directive Aug 1: "AI should catch transport gaps",
    external-source emphasis).** Rules-FIRST, deterministic (honest + free), LLM later if needed:
    for each consecutive pair of LOCATED items in a day, compute the needed travel window
    (existing `/api/itinerary/estimate-travel` rail) vs the actual gap (prev end/duration → next
    start) and flag: ① no confirmed transport leg AND the arriving item's envelope isn't
    transport-provided → **transport gap** (external-source content with UNKNOWN transport
    defaults to flagged — never assumed covered); ② arrival-after-start → **timing infeasible**;
    ③ pickup-provided but no pickup point recorded → **missing pickup detail**. Surfaced as
    per-day cards in the EXISTING AI Gaps tab, each with one-click "Propose leg" riding the
    ratified §18 L4 engine (engine proposes, expert confirms — machine transport never reaches
    the traveler unconfirmed). Depends on 20 (the envelope is the signal source).

## Open — decision-maker calls [DM]

- **Partner-drawer commission attribution.** "Open →" opens the partner's plain `websiteUrl`
  (admin-configured) — almost certainly not an affiliate-tracked link, so agent bookings made this
  way may earn no commission. Needs the business fact per network (tracked links vs account-level
  attribution) before any code.
- **Should the two "Soon" pills show at all** before their reads exist (vs. hiding until wired)?
- **`activity_bookings` dead schema declaration** — causes the drizzle publish prompt every deploy;
  recommended delete (the one Segway booking is unrecoverable from DB).
- **Should trip-routed non-catalog items be checkout-routable** (today: display-only in cart,
  honestly labeled)?
- **[RULED — ruling 69 §2, built by ruling 70 (`6b2f840`): REWORD NOW, FULL CLAIM LATER.]** The decision
  is a split: the NEUTRAL "Book direct through my link." caption SHIPPED (`promo-text.service.ts`
  and its byte-identical client fallback), and the FEE-WAIVER wording stays **HELD** until the D3
  traveler fee is actually billed on the direct path. **1C alone does NOT unlock it** — the entry
  below anticipated exactly this and was right: repointing the RATE does not start billing the
  FEE, so "skip the service fee" would still describe a charge no traveler is made. The AI caption
  prompt now explicitly forbids the model inventing it, and proof E5 makes the hold mechanical.
  Original filing retained:

- **~~[UNLOCKED, needs a go]~~ The waiver marketing caption.** Ruling 61 held "book through my link —
  skip the service fee" out of the caption engine *until the attribution pin is green*. **The pin is
  green as of the D6 build (`server/__tests__/rails-attribution.db.test.ts`, R1–R11, wired into
  `fee-resolution-authority-gate.yml`; build SHA to be stamped at merge).** The hold is therefore
  satisfied and the caption **may now be scheduled** — but this lane deliberately shipped **zero
  caption-engine diffs**, so writing it is a separate change and still needs a decision-maker go.
  **Read the copy against what the money actually does first:** the waiver waives the D3 traveler
  service fee, which `/api/checkout` **does not bill on the direct path today** — so "skip the
  service fee" is a claim about a fee a traveler is not currently charged either way. Either the 1C
  charge-path repoint lands first, or the caption is worded to the fee model as it actually runs.
- **[RULED — ruling 69 §6, built by ruling 70 (`d5c2aa7`): the direct path is REPOINTED.]** Owed no
  longer. `server/services/direct-charge-rate.service.ts` makes ONE call into `resolveProviderRate`
  and `pickOwnerShareRate` is the single precedence all four quote/charge surfaces read, so a rails
  booking and a direct booking on the same service now differ ONLY by ruling 48's min() and the
  waiver (proof A11). A refusal (expert lane, no category, breached band guard) leaves the incumbent
  legacy rate standing rather than failing a purchase, and says so on the booking row. **Still true
  and unchanged:** the D3 traveler fee is not billed on the direct path, and `fee_ledger` stays a
  rails-only slice. Original filing retained:

- **~~[DM]~~ The 1C consequence D6 makes visible.** A rails booking is the FIRST charge path to price
  through the D1 single resolver, while direct provider bookings still resolve the legacy
  `expert_standard` band. So a rails booking is cheaper for TWO reasons at once (the rails min() and
  the un-migrated direct path). The direction is always a smaller platform take and it is reachable
  only through a provider's own validated link — but the gap closes properly only when the charge
  paths are repointed onto `resolveProviderRate` (lane item 1C, ruling 45's transfer). Owed.
- **[RULED — ruling 69 §7, built by ruling 70 (`6b2f840`): the link's OWNER and admin, nobody else.]**
  Of the three products this entry named, an owner-facing control (with admin) was chosen and a
  default TTL on newly minted links was NOT. `PATCH /api/short-links/:id`, §19 allowlist of exactly
  `{expiresAt}`, NULL = never expires, future-only. Proofs E1–E4, including the end-to-end one this
  entry said did not exist. Original filing retained:

- **~~[DM]~~ Who may expire a share link?** `short_links.expires_at` (migration 198) is enforced in the
  rails money decision but has no writer — an owner-facing "retire this link" control, an admin one,
  or a default TTL on newly minted links are three different products. Until one is chosen the
  refusal exists and is proven, and nothing in the app can trigger it.

## Build map (Fable-minimized, per docs/EXECUTION_MAP.md §1/§4b — mapped Aug 1, 2026)

Execution rules for every lane below: Sonnet agent in a worktree on a `claude/*` branch, pushed
(never a PR from the agent); the lane spec IS this section — the dispatch is a one-liner naming
the lane. Fable reads diffstat only, EXCEPT the hunks each lane marks `FABLE-REVIEW` (ownership /
money / contract / migration surfaces), which get line-by-line review before the PR. Behavioral
proof against a local DB is part of every lane's definition of done; the expert-loop journey
(`scripts/journeys/expert-loop.mjs`) is extended where a lane adds a step to the canonical loop,
and reruns are Haiku one-liners.

**Wave 1 (parallel, no schema, no [DM] blockers):**
- **W1-A "Add-panel completion"** = items 1+2+3. New read-only endpoints: registry search for the
  Platform-content pill (approved/platform-origin only, destination-scoped; `sourced` stays
  excluded per the §12 invariant — reuse `content-query.service.ts` exclusion), session-scoped
  own-approved-services read for My-services pill; both drawers copy the DMO/Transport drawer
  pattern; partner drawer gains "Log completed booking" → existing item-create rail.
  FABLE-REVIEW: none (read-only endpoints + UI) — diffstat + proof table.
- **W1-B "Comms minimal"** = item 15 minimal: traveler-mode `/chat` real-threads list (mirror the
  earner grouping; counterpart = expert). Pure client. FABLE-REVIEW: none.
- **W1-C "Polish batch"** = items 5+7+8+9: expert Return-to-planning button (UI over the EXISTING
  server edge — RoutingActions gains the expert branch; FABLE-REVIEW: this one hunk, it touches
  the routing-contract surface); "+ Day" persistence hint or sessionStorage; dashboard selected
  trip persisted (localStorage keyed by user); kill `rating || 4.5` fallback (§13) + add the two
  missing metrics buckets.

**Wave 2 (after W1 merges; schema + gates → real Fable review):**
- **W2-A "Plan lifecycle"** = items 11+13(ratified)+14(b). Migration (next number): additive
  nullable `trip_expert_advisors.plan_approved_at` + `plan_approval_status`
  (`approved|changes_requested`, NO DB CHECK — pre-109 posture; declared in schema.ts per the
  deploy-push rule). Customer Trip Card: "Approve plan / Request changes(+note)" on
  `delivered`. Mode flip server-side: once approved, the expert's direct item-writes on THAT
  assignment 409 with "plan approved — send as suggestion" (suggestion rail unchanged); customer
  notified by existing suggestion notice; NEW reverse notification to the expert on
  approve/request-changes. FABLE-REVIEW: the migration, the 409 gate hunk, the approval
  endpoint's owner gate.
- **W2-B "Store withdraw"** = item 4: `POST /api/expert/ready-made/:id/withdraw` (author-gated,
  status → `withdrawn`; existing purchases unaffected — ready-made buys are snapshots); shipped
  builds with a WITHDRAWN listing become deletable (relax #359's refusal (c) to
  listing-exists-AND-not-withdrawn... simpler ratified shape: withdraw deletes nothing, delete
  still refuses while a non-withdrawn listing exists). FABLE-REVIEW: the status-machine +
  author-gate hunks.

**Wave 3 (after W2-A lands its semantics):**
- **W3-A "Partner catalog v1"** = item 10 tiers (a)+(c): catalog drawer over `/api/catalog/*`
  (tours/activities first), feed-timestamp + "availability confirmed at booking" labels (§13),
  Booking Brief "Continue to partner" gated on the item's suggestion being customer-approved
  (W2-A semantics). FABLE-REVIEW: the §16 surface (no affiliate URL client-side) + the gate hunk.
- **W3-B "Email events"** = item 14(a): wire delivered + changes-requested (+post-approval
  suggestion) into the existing email cluster. [DM default proposed: those three email;
  in-planning suggestions bell-only.] FABLE-REVIEW: none (template + send-site wiring).
- **W3-C "Per-item comments"** = item 12: new additive table `trip_item_comments` (id, trip_id FK
  CASCADE, item_id FK CASCADE, author_id, body, created_at; no CHECK; declared in schema.ts),
  owner-or-assigned-expert gated read/write (canonical predicates, never getTripRole);
  thread renders on the item in both Trip Card + Workstation. FABLE-REVIEW: migration + the
  access-gate hunks.

**Blocked on [DM] (no code until answered):** partner commission attribution + which partner
APIs to pursue (item 10 tier b); `activity_bookings` schema delete; non-catalog checkout
routing; unified traveler Inbox (decide at Wave 3); email-event list confirmation (W3-B ships
the proposed default unless overridden). The "Soon pills" [DM] is RESOLVED BY W1-A (both pills
get real reads — nothing left to hide).

## Answered questions (for the record)

- **"How does an expert delete Workspace drafts?"** → they couldn't; #359 built it (v1 scope).
- **"Why does partner content take experts away from the Workspace?"** → it doesn't navigate away:
  Open → shows the in-workspace Booking Brief (client details), then opens the partner site in a
  NEW TAB. By design: no booking-API integration exists for those networks, and §16's agent-booking
  model deliberately keeps off-site on the expert side so the traveler never leaves. The real gaps
  it exposed are items 1 (loop-back) and the commission [DM] above.
- **"Where is the other Central Content?"** → live on traveler surfaces (Discover feed,
  experience-template pages) through `content_registry` + placement rules; the Workstation read is
  item 2 above.

---

## Six-Sigma provider pass — Tier B (FILED, NOT BUILT) — Aug 11, 2026

Filed by the DMAIC pass on the provider console for **tourist-specific businesses** (Phase 2 of the
decision-maker directive; Phase 1 = the D7 build, commit `641327e` / ruling 64). Full report with
evidence, measurements and citations: **`docs/findings/SIX_SIGMA_PROVIDER_PASS.md`**.

**Read this section with its evidence labels.** Provider count ≈ 0 — there is NO usage data here.
Each item is tagged with its evidence source: **[measured]** = instrumented chromium walkthrough
against the real dev server; **[code]** = read from the repo; **[research]** = public sources on how
real Kyoto/Japan tourist businesses operate, cited in the report (never a persona, never a statistic).
Tier A (copy/label/link only) already landed in the same commit; everything below needs schema, money,
a ruling, or real-user validation and is therefore **not built**.

- **SS-1 — The R4 protected-deliverable rail has no UI control.** [measured] `POST /api/provider/
  services/:id/deliverable-file` (ruling 58) works — measured `200`, `protected:true`, `serviceFile`
  stamped `objstore:…`. But the wizard's delivery step renders **only a pasted-URL text box**
  (`deliverable controls — file upload input: false, pasted-URL input: true`). A provider cannot reach
  platform-protected delivery without leaving the product, so the green "platform-protected, revocable"
  copy ruling 58 added is **unreachable through the UI**. Needs: a file input + upload call on the
  ServiceForm delivery step. This is the punchlist's own recurring class — *proved correct, never
  proved reachable* (standing lesson (a)).

- **SS-2 — Lead time is two values and the UI writes the wrong one.** [code] The wizard writes only the
  free-text `lead_time` varchar (*"e.g., 48 hours, 1 week"*). The **machine-readable** `lead_time_hours`
  (default `24`) is never written by any client, yet **is consumed** —
  `server/services/expert-availability.service.ts:66` (`m.leadTimeHours ?? 24`) uses it as an ETA
  baseline. A provider who types "1 week" leaves the consumed value at 24, so the platform can offer
  their service on 24 hours' notice while their own listing says a week. **Ledger note (DECISIONS.md's
  own rule — a ledger-vs-code disagreement is a finding, never a silent divergence):** ruling 64 lists
  `leadTimeHours` under "AUDITED AND DELIBERATELY REUSED" for lead time; the wizard does not write it.
  **[DM] needed:** does the wizard write `lead_time_hours` (structured, like the D7 `changeCutoffHours`
  beside it), or does `expert-availability` stop defaulting? Do not fix by editing ruling 64.

- **SS-3 — Should editing a live listing be able to unpublish it?** [measured] "Save Draft" sends
  `status:"draft"` unconditionally; clicking it while editing an `active` listing moved the row to
  `draft` in the DB, and it sits beside "Next" on every step. Tier A made the button **say so**
  ("Unpublish & Save Draft" + tooltip). The behaviour is untouched and is a product call: (a) keep as
  is, now that it is labelled; (b) a live listing's draft-save preserves `active` and only stages
  edits; (c) confirm dialog. (b) implies staged edits — real design work, not a label.

- **SS-4 — CLOSED** (DECISIONS.md **ruling 69 disposition 9**, built by **ruling 70**, commit `6b2f840`;
  **migration 199** `provider_services.pickup_radius_km`, declared in `shared/schema.ts`, registered
  in `migration-files.ts`). They are two columns now: typing into one no longer moves the other
  (proof SS4-1). **NEVER-CLOBBER, as ratified:** `service_radius` keeps its stored value, there is
  NO backfill, and NULL renders as "not set" — never 0 and never a copy, because nobody can know
  which of the two meanings a pre-split number carried (SS4-2). The UPDATE path is checked as hard
  as the insert (SS4-3 — no DB CHECK exists by publish-trap posture, so the schema IS the
  enforcement). The Tier-A two-labels-one-column notice in the wizard is **RETIRED, not reworded**:
  it described a defect that no longer exists. Original finding retained:

- **SS-4 — Pickup radius and service radius are one column with two business meanings.** [measured]
  `#serviceRadius` ("Service Radius (km)") and `#coverageRadius` ("Pickup radius (km)") render
  **simultaneously** for a pickup operator and both write `provider_services.service_radius` — typing
  `17` into one makes the other read `17`. [research] For transfer/tour operators "how far I travel to
  work" and "how far I collect from" are genuinely different numbers. Tier A labelled them as one
  value; splitting them needs an additive column + a ruling (and touches the D7 surface just landed).

- **SS-5 — D9 attestation: protected professional titles. — ADDRESSED** (DECISIONS.md **ruling 67**,
  build commit `f0ac5a0`; migration 197, `shared/service-attestations.ts`,
  `server/routes/service-attestations.routes.ts`, 13/13 in
  `server/__tests__/service-attestations.http.test.ts`, reachability proven in the live wizard).
  Built as a **title-claim attestation, not a licensing gate**, exactly as the scope note below
  demands: the applicable set is SERVER-DERIVED from delivery method + category (guide/interpreting
  categories, EVERY method — a pdf itinerary can carry the claim too), undecidable rows are omitted
  WITH A REASON and are not affirmable, and inapplicable ones never appear. Two siblings shipped in
  the same catalog (`in_person_safety_basics`, `food_safety_disclosure`). **What ruling 67
  deliberately did NOT build is filed as SS-5a/b/c below — none of it is a defect in this item.**
  Original finding retained verbatim:

- **SS-5 — D9 attestation: protected professional titles.** [research] Japan deregulated paid guiding on
  4 Jan 2018 — no licence is required — but the title 通訳案内士 (*Tsūyaku Annai-shi*) remains legally
  protected, and unlicensed guides may not use titles implying official certification (e.g. "Government
  certified guide"). Sources cited in the report (JNTO; JGA; Hinomaru; Jasumo). [code] Listing title and
  description are free text with no attestation, so a Kyoto provider can claim government certification
  today with nothing asking. This is a concrete, market-specific trigger for **D9** (ruling 62 —
  attestations keyed to method + category risk, inapplicable ones omitted with a reason), which is
  ratified but unbuilt. **Scope note: an attestation about a TITLE CLAIM, not a licensing gate** — the
  licence is not required to trade.

- **SS-5a — RULED AND BUILT: option (b).** (DECISIONS.md **ruling 69 disposition 3**, built by
  **ruling 70**, commit `6b2f840`.) A new or edited listing may not TRANSITION to active with an
  applicable attestation unaffirmed; **existing active listings are GRANDFATHERED — nudged, never
  auto-unpublished**, and that grandfathering IS the transition condition, not an exemption table
  (proof D9-G7). The gate sits beside `checkPublishVerificationGate` at the same three choke
  points (create, PATCH, the Activate toggle — D9-G1/G5/G6), refuses with a structured 403
  `ATTESTATION_GATE` naming the unaffirmed keys plus their localized labels, and is draft-exempt
  (D9-G2). §13 holds at the gate: an omitted-with-a-reason key never blocks a publish (D9-G8).
  Original filing retained:

- **~~SS-5a — [DM]~~ Should an unaffirmed attestation BLOCK publishing?** [filed by ruling 67] The D9
  build records affirmations and gates nothing: a provider can publish a guide listing without
  ticking `title_claim_honesty`, by design, because ruling 62 ratified attestations *keyed to method
  and category* and said nothing about a publish gate — and this wizard already carries five publish
  gates (meeting point, price, category verification, identity/business, expert identity), so adding
  a sixth is a funnel decision with real supply cost, not a build detail. The machinery a gate would
  need already exists (`resolveApplicableAttestations` + the affirmation rows), so this is a small
  change once ruled. Options: (a) leave ungated as built; (b) block `status:'active'` when any
  applicable attestation is unaffirmed, draft-exempt like the sibling gates; (c) block for a named
  high-risk subset only (`title_claim_honesty`) and leave the rest advisory.

- **SS-5b — RULED: NO, and nothing was built** (DECISIONS.md **ruling 69 disposition 4**). A
  self-attestation must not render as platform endorsement; revisit only when real verification
  exists. Record-only — ruling 70 shipped **zero** traveler-facing attestation surface, and none may
  be added without a further ruling. Original filing retained:

- **~~SS-5b — [DM]~~ Should attestations be shown to TRAVELERS?** [filed by ruling 67] Nothing D9 records
  reaches `/services/:id` or any traveler surface today — deliberately, because displaying a
  self-attestation to a buyer converts it into a **trust signal the platform did not verify**, which
  is the §13 hazard in its sharpest form (a badge reading "insured" that nobody checked is worse than
  silence). If it is ever shown, the honest framing is the provider's own words attributed to them
  with the non-verification stated inline, never a checkmark badge. Needs its own ruling before any
  surface is built.

- **SS-5c — PARTIALLY BUILT: the cheap half only** (DECISIONS.md **ruling 69 disposition 5**, built
  by **ruling 70**, commit `6b2f840`). A submit-time **SOFT WARNING** now fires when a listing's
  title/description contains a protected-title string (通訳案内士 + English claims of STATE
  sanction, a small named list in `shared/service-attestations.ts`), nudging toward the
  `title_claim_honesty` statement. It **never blocks and never auto-edits** (proofs D9-W1/W2), and
  a legitimate compound like "PADI certified" does not fire it (D9-W3) — this entry's own
  false-positive warning taken literally. **STILL FILED, explicitly:** the full two-language
  text-scanning product, a real false-positive policy, and the enforcement/human-review path (which
  still does not exist). The warning's ABSENCE proves nothing. Original filing retained:

- **~~SS-5c~~ — Nothing scans listing TEXT for the phrases the attestation is about.** [filed by ruling
  67] A provider can affirm `title_claim_honesty` and still type "Government certified guide" into
  `service_name`/`description` — the attestation records a promise, it does not detect a breach. This
  is the arm that would actually catch a lie, and it is a different product: phrase detection in two
  languages, a false-positive policy ("certified" is legitimate in many compounds), and an
  enforcement path that does not exist (ruling 67 changed no admin review queue). Filed, not started.
  Cheapest honest first step if scheduled: flag for HUMAN review, never auto-reject.

- **SS-6 — CLOSED** (DECISIONS.md **ruling 69 disposition 9**, built by **ruling 70**, commit `6b2f840`;
  **migration 199** `provider_services.delivery_languages`, declared in `shared/schema.ts`). Typed
  to match the AUDITED `local_expert_forms.languages` (jsonb string array) rather than an invented
  shape. Captured in the wizard beside the delivery METHOD (the sibling question) and rendered
  plainly on `/services/:id` when present. **§13, the load-bearing half:** NULL means "never
  captured" and renders **NOTHING** — there is no presumed "English" and no "not specified" line
  (SS6-2/SS6-3) — while `[]` ("opened the field and cleared it") stays a distinguishable fact
  (SS6-1). Distinct from ruling 60's chrome (A) and content (B) translation, as this entry said.
  Original finding retained:

- **SS-6 — No delivery-language field on `provider_services`.** [code] `information_schema` sweep: the
  only language columns are `local_expert_forms.languages`, `service_gap_analysis.language_gaps`,
  `trip_emergency_contacts.languages`. Providers have none, and the traveler page shows no language.
  [research] In Kyoto, delivery language is a **purchasable attribute** — shared tea-ceremony sessions
  commonly run in Japanese with English requiring a private session, sometimes at an added interpreter
  fee; English-speaking hosts are advertised as a differentiator. **This is distinct from ruling 60**,
  which ratified (A) UI chrome translation and (B) provider *content* translation — neither is "what
  language is the experience delivered in". Needs an additive column + a ruling.

- **SS-7 — Booking lead time / cutoff is never shown to the traveler.** [measured/code] The service page
  renders no lead time at all, though `lead_time_hours` is stored and consumed elsewhere. [research]
  Booking cutoffs are a headline term in this trade (private transfers commonly to 24h before). Blocked
  on SS-2 — do not surface a number the wizard does not actually write.

- **SS-8 — Cancellation expressiveness vs how this market actually writes policies.** [research] Real
  Kyoto policies are tiered in DAYS and vary widely: free to 2 days (wargo); free to the day before with
  100% same-day (Yumeyakata); 10d full / 9–5d 50% / 4d–same-day 70–100% (Sakura); a flat ¥3,300 same-day
  fee (Okamoto); free to 18:00 three days before with a **stricter deadline for groups over 10**
  (Kyolan); photo tours add explicit **rain-reschedule** clauses. The platform's four fixed tiers
  (24h · 5d+2d · 7d · none) are a reasonable spine but cannot express a same-day flat fee, a weather
  clause, or a group-size-dependent deadline. Tier A fixed the *drift* (the seller now sees the enforced
  windows); expressiveness is a product+money decision. **Durability note:** the vocabulary lives in
  three files (`cancellation-policy.service.ts`, `shared/schema.ts`, `ServiceForm.tsx` /
  `service-detail.tsx`) — whatever lands should collapse it to one source, per the fee-resolver
  precedent (standing lesson (b)).

- **SS-9 — Pickup fallback: "if your hotel isn't listed, meet at X".** [research] Operators universally
  publish a named fallback (commonly Kyoto Station) for travelers whose hotel is not on the pickup list,
  plus an arrive-early instruction. [code] `service_route_points` is exactly the right shape for the
  list (ruling 22/62; **measured green** this pass), but nothing expresses the fallback. Small, but it
  is the case that actually fails on the day.

- **SS-10 — Party size and luggage: capture → enforcement.** [code] `partySizeMin/Max` and
  `changeCutoffHours` are captured by D7 and, per ruling 64's stated negative space, **no consumer is
  wired** — nothing is validated at booking. [research] Transfer operators require exact passenger /
  child-seat / **luggage** counts at booking and state a waiting/grace window (commonly 90 minutes free
  at airport arrivals, then hourly overtime); the platform has no luggage/capacity or grace concept at
  all. Wiring the consumers is a named later lane per ruling 64 — filed here with the trade evidence for
  when it is scheduled.

- ~~**SS-13 — [NEW, filed by ruling 70] A PROVIDER has no activate/pause TOGGLE door at all.**~~
  **RESOLVED as documentation (Aug 11, 2026 — decision-maker review of the finished console).** The
  finding's premise was too strong. The provider Catalog list-view toggle
  (`client/src/pages/provider/services.tsx:832`) calls **`PATCH /api/provider/services/:id` with a
  status-only body `{status}`** — the provider route, which accepts the partial body and carries
  BOTH the F2 verification gate and the SS-5a attestation gate. Verified live: the Catalog renders a
  working Paused/Active switch on every card (one seeded listing sits Paused, two Active), and
  toggling drives that route. So a provider **does** have a working activate/pause door from the list
  view — it is the provider PATCH route, not a dedicated `/status` sub-route. The expert-only
  `PATCH /api/expert/services/:id/status` returning a 403 for a `service_provider` account is
  **correct RBAC**, not a missing door. **Disposition: (b) documented** — providers activate/pause
  through `PATCH /api/provider/services/:id`; no provider-named `/status` alias is built (it would be
  an endpoint with no consumer, §18c posture). The "three choke points" phrasing stands corrected:
  the attestation/verification gates guard **two** provider paths (create + the status-carrying
  PATCH) and **three** expert paths (the extra one being the expert `/status` toggle) — the coverage
  is complete on both because every path to `active` on each role passes a gate.

- **SS-14 — [CLOSED Aug 11, 2026 by ruling 71 — 1C is now complete across ALL charge paths]** The two
  ordered steps ratified for this fix both landed: **Step 1** repointed `POST /api/expert-booking-requests`
  (`server/routes.ts`) AND the `GET /api/trips/:tripId/commission` earnings breakdown
  (`server/routes/booking-actions.ts`) onto the D1 resolver via the SAME `direct-charge-rate.service.ts`
  seam cart checkout uses (`resolveDirectProviderRate` → `pickOwnerShareRate`, §18 rule 1), so the D1
  band outranks the per-service snapshot on every charge path and the snapshot is no longer a first
  operand anywhere; **Step 2** retired the provider-lane derivation in `deriveServiceRevenueShareRate`
  (`server/storage.ts`) so a new provider service carries a NULL snapshot, with the §18 input strip
  left untouched (the client still can never SET the field). The column is NOT dropped and existing
  rows are NOT backfilled (they are made inert by Step 1). No new migration. Proven by
  `server/__tests__/expert-booking-request-rate.db.test.ts` **B1–B7 (7/7)** and the full §15-spine
  battery green; ledger ruling 71. SS-12 delta reported there (unchanged 4/6). Original filing retained
  verbatim below.
- **SS-14 — [NEW, filed by ruling 70; SHARPENED Aug 11, 2026] `revenueShareRate` is not merely dead
  weight — it is still a LIVE first operand on a second charge-economics path 1C did not repoint.**
  [code] `resolveServiceOwnerShareRate` (`server/services/commission.ts`, the §18/MI-1
  strip-and-derive) still computes the column from the **legacy** `resolveCommissionRates` and stamps
  it on every provider service. The 1C repoint (ruling 70) moved **cart checkout + `/api/cart`
  fee-preview** onto the D1 resolver, where `pickOwnerShareRate` outranks the snapshot — but the
  re-audit for this review found the snapshot is **still a first operand** at
  **`POST /api/expert-booking-requests` (`server/routes.ts:1563-1571`)**: when
  `service.revenueShareRate` is set it computes `platformFee = total·(1−rate)` and
  `providerEarnings = total·rate` DIRECTLY from it and persists both onto a real `service_bookings`
  row (`createServiceBooking`, status `pending`). It is also read as a display estimate in
  `booking-actions.ts` (the earnings breakdown). So the platform now has **two charge-economics
  rails on two different rates**: cart checkout on the D1 band, and expert-booking-requests on the
  legacy snapshot. This is precisely the audit C2/Q9 "first operand returning" (ruling 47's
  dethroning) — not hypothetical, live. **RECOMMENDATION (needs a decision-maker ruling — this is a
  money path):** finish 1C — repoint `POST /api/expert-booking-requests` (and the booking-actions
  breakdown read) onto `resolveProviderRate` via the same `direct-charge-rate.service.ts` seam, so
  the D1 band is the single authority on every charge path; THEN stop deriving the snapshot for
  provider-lane rows and leave it NULL (keeping the §18 input strip untouched — a field with no
  consumer is still stripped). Until that lands, treat `expert-booking-requests` economics as
  legacy-rate and do not describe 1C as "complete." Do NOT do the NULL step before the repoint — a
  NULL snapshot on the current code silently falls the expert-booking-requests path to the
  `commission` calc, which is a behavior change with no proofs.

- **SS-14 — [CLOSED Aug 11, 2026 by ruling 71 — Step 2 chose option (b)]** The decision-maker ratified
  option **(b)**: stop deriving the snapshot for provider-lane rows and leave it NULL, keeping the §18
  input strip (option (a)/(c) not taken). `deriveServiceRevenueShareRate` now returns NULL for a
  provider owner; expert-lane rows keep their derived stamp (no D1 provider band exists for them).
  Existing rows NOT backfilled; column NOT dropped (vestigial nullable). Proven by
  `expert-booking-request-rate.db.test.ts` B4 (new provider row NULL) + B5/B6 (§18 strip intact);
  ruling 71. Original filing retained verbatim below.
- **SS-14 — [NEW, filed by ruling 70] `revenueShareRate`'s derived snapshot is now dead weight on
  the provider lane.** [code] `resolveServiceOwnerShareRate` (`server/services/commission.ts`, the
  §18/MI-1 strip-and-derive) still computes the column from the **legacy** `resolveCommissionRates`
  and stamps it on every provider service — but after the 1C repoint (ruling 70) no provider charge
  path reads it: `pickOwnerShareRate` puts the D1 band ahead of it, so the stored number can differ
  from the charged rate and nothing consumes the difference. Harmless today **precisely because**
  it is unread, and deliberately left alone in-lane (removing a column's writer is a bigger change
  than a rate repoint, and §18 rule 3's "a field with no consumer is still stripped" argues for
  keeping the strip regardless). Needs a call on whether to (a) repoint the derivation onto
  `resolveProviderRate` too so the snapshot at least agrees with the charge, (b) stop deriving it
  for provider-lane rows and leave it NULL, or (c) leave as is and document it. Do NOT let it become
  a first operand again — that is audit C2/Q9 (ruling 47's dethroning) returning.

- **SS-11 — `/provider/new-service` is an orphan route whose name contradicts its destination.** [code]
  It renders `ServicesProviderPage` (provider **registration**), not the service wizard
  (`/provider/services/new`). `grep` finds **zero inbound links**, so no user reaches it today — it is a
  latent trap for a guessed URL, a bookmark, or a future CTA. Intent is genuinely ambiguous (the sibling
  routes are commented as "supply recruitment entry points"), so this needs a call: redirect to the
  wizard, or retire the alias.

- **SS-12 — `provider-money-hardening.db.test.ts` does not run green on this bench.** [measured]
  **4 pass / 2 fail**, verified **pre-existing** (identical with this pass's changes stashed). P1/P2 fail
  at *"the provider band must be readable from fee_bands"* — a fixture/category→band mapping gap on the
  local bench, not a code regression (`fee_bands` has 54 rows; the test's category linkage is what is
  missing). Ruling 42's P1–P6 are the proofs for the §14/§18 rate-stripping class, so a bench where two
  of them cannot run is the "a guard that does not run is MISSING" posture (rulings 26/27/43) one level
  down. Not part of ruling 64's stated keep-green list; filed so it is not rediscovered.
  **RE-MEASURED at ruling 70 (`6b2f840`): still 4/6, unchanged.** Stated because ruling 70's 1C repoint
  touches this suite's exact subject (the §14/§18 rate-stripping class) and could plausibly have
  moved it: it did not, in either direction. The two failures are the same fixture/category→band
  linkage gap on this bench, not a code regression. **STILL OPEN** — a bench where two of ruling
  42's P1–P6 cannot run is still a guard that does not run.
  **RE-MEASURED at ruling 71: still 4/6, count UNCHANGED (verified with this pass's changes stashed —
  the same P1/P2 fail, P3–P6 pass).** Ruling 71's Step 2 touches this suite's exact subject even more
  directly than ruling 70 did: it retires the provider-lane `revenueShareRate` stamp, so a provider row
  is now deliberately NULL. That **contradicts P1/P2's *"the row carries the fee_bands value"* clause** —
  but P1/P2 were ALREADY failing at baseline on the beta_flat fixture gap (`providerBandExpertShare()`
  reads the ruling-49-DEACTIVATED `beta_flat` band, which returns no row), so the count does not move.
  **SHARPENED:** P1/P2 now encode SUPERSEDED behavior (ruling 42's "derive-and-stamp the provider
  share" is retired by ruling 71 for the provider lane). When this lane is picked up, P1/P2 should be
  updated to assert (a) the client value is still stripped [unchanged, ruling 71 keeps this] and (b) a
  provider row is NULL / an EXPERT row carries the band value [the new ruling-71 truth] — and the
  beta_flat fixture gap fixed so the suite runs green. **STILL OPEN.**

## Ruling 60 Phase A — chrome i18n (FILED, NOT BUILT) — Aug 11, 2026

Filed by the chrome-i18n lane (DECISIONS.md **ruling 65**, executing **ruling 60 Phase A**). Everything
below is deliberately out of that phase's scope — recorded so it is not rediscovered as a defect.

- **I18N-1 — [DM] Native-speaker review of the JA locale files is OWED before market launch.** The
  Japanese strings in `client/src/locales/ja/*.json` (**269 keys**) are **machine-authored platform
  copy**. That is acceptable for chrome under ruling 60 (which reserves the labeled-machine-draft rule
  for *content*, system B), but Kyoto is the launch market and this copy is the first thing a Japanese
  provider reads. Review should cover register consistency (everything is polite です/ます調) and the
  glossary below, which is applied uniformly and should be ratified or corrected **as a set**:

  | EN | JA | note |
  |---|---|---|
  | listing / your services | 出品 / あなたの出品 | the seller-side noun; **not** リスティング |
  | storefront | ストアフロント | |
  | service | サービス | |
  | catalog | カタログ | |
  | provider (service provider) | サービス事業者 | **not** プロバイダー |
  | booking | 予約 | |
  | customer | 顧客 | |
  | payout | 出金 | payment = お支払い, kept distinct |
  | earnings / money module | 売上 | |
  | listing health | 健全性 | |
  | active / paused | 公開中 / 一時停止中 | |
  | sign in / sign up | ログイン / アカウント作成 | |
  | trip planner / local expert | トリッププランナー / ローカルエキスパート | |

  **Scope grew (ruling 67, D9 attestations):** the review now also owes the **attestation catalog's
  JA label/body/omission-reason copy** in `shared/service-attestations.ts` — machine-authored like
  the rest, but this is **legally-loaded copy in the launch market** (it names 通訳案内士 and states
  what the provider is promising), so it is the highest-priority item in this debt, not another
  chrome string. Review it as a set with the glossary above; `出品` and `サービス事業者` are already
  applied there.

  **Scope grew again (ruling 73, Phase B content translation):** the new traveler-facing chrome
  LABEL strings in `client/src/locales/ja/common.json` `contentTranslation.*` — the "原文（英語）"
  fallback tag, the AI-draft review notices and the approve/generate actions — are machine-authored
  platform chrome and follow the register/glossary above. (Note this is distinct from provider
  CONTENT translations, which are the provider's own words or a provider-approved AI draft and carry
  no platform native-review debt; any JA `service_translations` sample copy in the Phase B test
  fixtures is machine-authored fixture data only, never a real translation.)

  Note one JA-specific layout consequence already visible: Japanese nav labels are longer than their
  English counterparts and the traveler navbar wraps `マーケットプレイス` to two lines at desktop width.
  Cosmetic, not broken — but it is the kind of thing a native reviewer should be asked to judge.

- **I18N-2 — Surfaces still on hardcoded English (migrate incrementally; do NOT half-wrap).** Ruling 60
  Phase A translated: the provider sidebar + all console page titles, provider Settings chrome, the
  Catalog page chrome (incl. health labels, the D2 "n/a" note and delivery/pin chips), the traveler
  navbar + footer, and the auth surfaces. **Everything else keeps hardcoded English and falls back
  silently**, which is correct chrome behavior, not a bug. Known deferred surfaces, roughly by traffic:
  the expert and EA console sidebars/pages, the provider Dashboard/Calendar/Inbox/Workstation/Money/
  Customers/Performance/Playbook page BODIES (their titles and shell are translated), `StatusBadge`
  vocabulary and `ProviderStorefrontHeader` (both render inside the translated Catalog page and are
  visibly English in the JA screenshots — shared components, deliberately left whole), the service
  wizard/`ServiceForm`, the traveler landing/discover/cart/checkout pages, and every admin surface.
  **Convention when migrating one:** mark the file's top with `// i18n: pending migration` while it is
  in flight, move the WHOLE surface in one commit, and delete the marker — a surface must never be
  committed half-wrapped, because a page mixing Japanese and English chrome reads as broken in a way a
  fully-English page does not.

- **I18N-3 — `expert/settings.tsx` offers three locales that do not exist.** Its Language select lists
  `es`/`fr`/`de` beside `en`/`ja`. Only `en` and `ja` have locale files, so picking Spanish persists a
  value that resolves to nothing and the UI stays English — the same no-op it was before ruling 60, so
  this is **pre-existing, not a regression**. It is why `settingsPatchSchema.language` is an enum wider
  than `SUPPORTED_LOCALES` (narrowing it would 400 that page's whole settings save). Retire the three
  dead options — or ship those locales — as a small named follow-up; both halves are one edit.

- **I18N-4 — Ruling 60 Phase B (provider CONTENT translation) — LANDED (DECISIONS.md ruling 73,
  2026-08-11).** `service_translations` (migration 201) is built: per-service, per-locale translated
  free-text content (`service_name`/`short_description`/`description`/`meeting_point`), owner-gated
  `GET/PUT/POST-approve /api/provider/services/:id/translations/:locale` (+ `.../draft`), a labeled
  `source='ai_draft'` machine draft that NEVER auto-publishes, and the honest **"shown in English /
  原文（英語）"** fallback on the traveler read (`GET /api/services/:id?locale=`, §13). Locale vocabulary
  is the SHIPPED set (en, ja) only. Proven by `server/__tests__/service-content-translation.http.test.ts`
  (P1–P9, 14 green) + i18n 27/27 parity. **Still named-not-built by ruling 60 (each its own later
  phase):** localized share frames, PDF deliverables, and emails. **Currency display is out of scope by
  the ruling's own words** — the footer currency pill stays `USD ($)` under a JA locale, on purpose.
  **Follow-ups filed:** (a) an owner-console UI to author/review translations + trigger the AI draft
  (the API exists; a Catalog/ServiceForm surface does not yet — the endpoints are usable but unwired to
  a screen); (b) the AI-draft path needs a live `ANTHROPIC_API_KEY` to actually translate (its lifecycle
  is proven keyless, its translation QUALITY is not); (c) storefront bios and other provider-authored
  content beyond the four listing fields are not yet translatable (ruling 60 also names "storefront
  bios" — they live on `users`, not `provider_services`, so a separate home).

- **I18N-5 — The 27 browser proofs now live in the repo but are NOT in CI.** The lane originally ran
  its ruling-65 proofs from a session-scratch script (ephemeral — the bench container reclaims it), so
  the ledger's "27/27" would have been unreproducible by anyone else. The independent verification pass
  (Aug 11) found the gap, ported the harness to **`scripts/i18n-chrome-proofs.mjs`** (env-configurable
  `BASE_URL`/`OUT_DIR`/account; leaves the bench as found by resetting the account preference to EN),
  and re-proved **27/27 against a fresh server boot** before committing. Same `[advisory]` posture as
  rulings 58/64's committed-but-unwired suites: green requires a running server with the beta seed
  accounts, so wiring it into CI belongs with the same batch that wires those (the ruling 57 gate's
  pattern is the template).

## Open — Catalog / Distribute + Service-Provider console follow-ups (added Aug 12, 2026)

Filed from the Catalog/Distribute program (DECISIONS.md rulings 74–85; `docs/briefs/CATALOG_DISTRIBUTE_EXECUTION_MAP.md`).
Wave 1 + Wave 2 landed to main (PRs #460/#461); the provider office-location lane landed (#462, ruling 85).
These are the follow-ups those lanes deliberately deferred (negative space, ruling 43).

- **CD-1 — coordinate-level demand heat map** [future lane, blocked on data capture]: B2 (ruling 84)
  shipped an HONEST demand + coverage overlay — coverage-gap from real located supply vs
  `neighborhood_coverage_target`, plus string-bucketed real `search_analytics` intent thresholded to an
  honest "not enough signal yet". A true PER-COORDINATE heat map is NOT buildable today and was
  deliberately NOT faked: the only located booking coords are surcharge-billing artifacts (§13-forbidden
  as demand) and search intent is destination-STRING granularity only. It needs a PRIOR lane that durably
  persists traveler pickup/search COORDINATES for the general (non-surcharge) case. Do not interpolate in
  the interim.
- **CD-2 — the Catalog/Distribute Playwright specs are committed but NOT in CI (seed-script ESM
  breakage)** [build item]: the client specs (catalog-preview-toggle, service-display-options,
  catalog-map-located, distribute-shell, travel-surcharge-step, service-logistics-step, market-insights)
  need the seeded `kyoto-interpreter`/`ci-provider` storefront, but the seed script throws
  `require is not defined` (CJS/ESM mismatch) on a fresh bench, so the specs cannot run there. Same
  committed-but-unwired `[advisory]` posture rulings 58/64/66/67/79/82/83/84 record. Fix the seed
  script's module system, then wire the specs into a PR-blocking workflow — the ruling-57 gate is the
  template, and this belongs in the SAME CI batch as I18N-5.
- **CD-3 — JA native-speaker review of shipped translations** [externally gated / editorial]: ruling 60
  Phase A chrome + Phase B content translations shipped (I18N-1…I18N-5 above), but the Japanese copy —
  INCLUDING the attestation strings — has never had a native-speaker pass. Needs a human reviewer; never
  machine-"correct" it (§13). Ties to the I18N cluster.

(The Six-Sigma provider-pass **Tier B** ballot is already filed above — "Six-Sigma provider pass — Tier B
(FILED, NOT BUILT) — Aug 11" — not re-listed here.)

## Batch exercise findings (Aug 12, 2026)

Source: **`docs/testing/PROVIDER_BATCH_EXERCISE.md`** (branch `lane/provider-batch-exercise`,
as-of `127ffb5`) — one provider account created through the real funnel, approved through the real
admin queue, then used to author **twelve listings across every product shape** and followed to the
traveler-facing storefront and detail page. Every row below is that document's own finding id.

**Lane FP-1 (this lane, DECISIONS.md ruling 87) fixed SEVEN of them — the decision-maker's call was
"fix the UI first".** Everything else stays open; several are explicitly redesign-gated and must not
be picked up piecemeal.

### Fixed here (lane FP-1 — ruling 87)

- ~~**A1 (P0) — the custom-offering flow produced a listing that could never be published.**~~
  `service_offering_types.custom_other_offering.category_key = 'custom_other'` while the
  "Custom / Other" `service_categories` row carried `category_key = NULL`, so the wizard's derived
  Category lock rendered `—`, `categoryId` stayed empty and Publish never enabled. ROOT CAUSE was an
  ORDERING one: `runMigrations()` runs before `runDatabaseSeeding()`, so migration 189's identical
  backfill matched nothing on a fresh DB and `seedCategories()` then created the row without the key.
  Fixed in the SEEDER (fresh DBs are born correct — `server/seed-categories.ts` +
  the `/api/admin/seed-categories` twin) and repaired on existing DBs by **migration 208**; the wizard
  lock now renders an honest, actionable error instead of a silent `—` on a dead Publish button.
- ~~**B2 (P1) — property, room and bundle listings were all stored `delivery_method = 'pdf'`**~~
  (the column default; the Workstation builders never set one), so a machiya guest room's storefront
  card read "PDF guide". Writers now set honest canonical values at create — property/room →
  `in_person`, bundle → derived from its components (uniform method, else `hybrid`) — and migration 208
  backfills existing rows under exactly that predicate (`product_shape IN (property, property_room,
  bundle) AND delivery_method = 'pdf'`; an ordinary pdf service listing is never touched).
- ~~**B3 (P2) — the traveler location chip rendered the literal word "Unknown"**~~ on five listings.
  `provider_services.location` defaults to that string; the chip now renders only when there is a real
  location to state, and nothing otherwise (§13). "Remote" is deliberately NOT substituted.
- ~~**B4 (P1) — the Kyoto market page showed none of the eleven Kyoto listings.**~~ Both stacked
  causes closed: (a) `provider_services.city` is now SERVER-DERIVED at create/update from the
  neighborhood slug — and only when that slug resolves to exactly one `city_neighborhoods` city; free
  text is never parsed and a client-sent `city` is dropped (`server/utils/service-city.ts`);
  (b) the market read prefers the structured column with the old free-text substring as the
  grandfathering fallback, so a listing whose structured city is Osaka can no longer be dragged onto
  Kyoto's page by its prose, and a listing with no structured source stays honestly ABSENT rather than
  guessed into a market; (c) migration 208 backfills where a slug resolves unambiguously. The
  **"No stay found in Kyoto"** half is closed too: `productShape` now rides the city payload and the
  Stay spine routes `property`/`property_room` (it dropped every provider service before), and the
  4-service filler cap now applies only to the mixed "all" feed — a spine chip is a deliberate search
  and shows every match.
- ~~**B5 (P1) — picking Video/Phone Call deleted all 8 scheduling fields.**~~ Timing, capacity and
  booking-rules are now gated on the SHARED `needsScheduling` predicate (call/video included);
  transport, pickup coverage and the travel surcharge stay place-anchored-only. No new fields.
- ~~**B7 (P1) — the deliverable was unenforced and the upload rail had no client caller.**~~ A pdf
  listing can no longer PUBLISH with an empty deliverable (server gate beside the price gate, on the
  same draft-exempt rule; client `missingForFinal` mirrors it), and ruling 58's
  `POST /api/provider/services/:id/deliverable-file` has its FIRST caller — an upload control on the
  delivery step. Shape stated: the endpoint needs a row, so create-mode says "Save Draft first, then
  upload" rather than inventing a draft; the pasted-URL fallback keeps its honest `protected: false`
  labeling. **Note for API callers:** a row created with no `deliveryMethod` takes the DB default
  `'pdf'` and is therefore treated as a pdf listing by this gate — as it already was by the storefront
  chip, the D8 completion rule and the health rail's `delivery_asset` check.
- ~~**B10 (P2) — five of twelve listings silently fell back to the `expert_standard` default band.**~~
  VISIBILITY ONLY — zero change to any rate, amount or resolution order (§8/§18 — the fee lanes own
  that). The owner health rail carries an honest un-scored NOTICE ("no category → the platform default
  commission band applies"; un-scored deliberately, because the property and bundle builders ask for no
  category and D3 forbids failing a provider on something they cannot fix), and the admin listing view
  shows a "default commission band" marker per row.

### Fixed here (lane FP-3 — ledger row 88)

- ~~**Package A item "property/room rows filtered or re-routed"**~~
  (`docs/briefs/SERVICE_CREATION_EXECUTION_MAP.md` Wave 1) — **CLOSED.** The batch exercise's
  two-room machiya (`docs/testing/PROVIDER_BATCH_EXERCISE.md` §4 DB block: S4 `product_shape=property`,
  S4a/S4b `property_room` with `parent_service_id` set and `pricing_unit=per_night`) rendered on
  Catalog as **three ordinary standalone service cards**, each with the generic Edit into
  `/provider/services/:id/edit` — the ServiceForm delivery/checklist questionnaire, which a guest
  room answers none of. Ratified design (service-creation redesign mock): *"a property room's Edit
  opens its property's editor at the Rooms step — a room has no service checklist/delivery-method
  of its own, and sending it into the generic ServiceForm is a dishonest surface."* Now: room rows
  are **grouped under their parent property card** (name · nightly price · own approval/active
  state · its own health line), the property card carries a **Property** badge and no Duplicate,
  and Edit on both resolves through ONE module (`client/src/lib/property-editor-link.ts`) to the
  Workstation property editor — `?property=<id>` (its basics) / `?property=<id>&room=<id>` (the
  Rooms step). A room whose property card is not in the current filtered view still renders as a
  room row naming its parent, never as a generic card and never dropped (§13). The **back door is
  closed**: `/provider/services/:id/edit` opened with a property/property_room id renders an honest
  interstitial linking to the property editor instead of the questionnaire — guarded on
  `productShape` **server-derived from the owner-gated fetched row**, never from the URL. The
  Workstation gained the property **editor** the re-route needs (Basics + Rooms steps) over the
  two PATCH endpoints that already existed; **no new field** was invented, so B9 below stays
  redesign-gated exactly as filed.

### Fixed here (lane FP-4 — ledger row 89)

- **Provider-console content stretched to the full width of the shell on wide screens.**
  Reported by the decision-maker ("some console content stretches too much horizontally on wide
  screens"). This was NOT an exercise finding — no width item existed in this list before — so it is
  recorded here as its own lane. Measured on the bench BEFORE the fix: at a **1920** viewport the
  content region was **1700 px** wide on Catalog, Workstation and Money (and every other uncapped
  page: Dashboard, Distribute, Performance, Playbook, Business Profile) — a single-line text input
  on a form-heavy surface ran most of the screen. Root cause: the console had **no shared content
  container**. Every page rolled its own wrapper and they disagreed — most had no cap at all,
  Calendar capped at `max-w-6xl mx-auto`, Inbox/Customers at `max-w-4xl mx-auto`, and Settings at a
  bare `max-w-4xl` with **no `mx-auto`**, so the most form-heavy page in the console hugged the left
  edge and left a lopsided gutter.
  **CLOSED** — ONE centered container (`w-full max-w-6xl mx-auto`) mounted once on `ProviderLayout`
  (`client/src/components/provider/provider-layout.tsx`), and the four pages carrying their own
  conflicting cap were normalized onto it rather than stacking a second container. `max-w-6xl`
  (1152 px) is the console's own precedent — the Calendar page already capped at exactly that value.
  **Full-bleed exceptions**, both deliberate and both declared through the layout's new
  `width="full"` prop rather than by breaking out of the container: **(1)** the Catalog **map** view
  (its three-pane authoring canvas IS the shell width; the list view stays contained), and
  **(2)** `/chat` via `ConsoleAwareLayout` — a viewport-anchored two-pane frame rendered identically
  for travelers and experts, which capping for providers alone would fork. The two `overflow-x-auto`
  tables (Calendar's month grid, Business Profile's capacity table) were reviewed and left
  untouched: they scroll inside the cap and need no bleed.
  **Phone behaviour is untouched BY CONSTRUCTION, not by luck:** the container is fluid up to
  1152 px, and the content region is 390 / 548 / 1060 px at the 390 / 768 / 1280 viewports (viewport
  minus the 220 px desktop sidebar; the whole viewport below the sidebar's 768 px mobile
  breakpoint), so the cap cannot bite at any of them — it first bites past ~1372 px. Horizontal
  padding was deliberately **not** made responsive (`p-6` stays on the pages) for the same reason: a
  `px-4 sm:px-6` would have changed phone layout, which this lane must not do.
  **Evidence:** headless Chromium at 390 / 768 / 1280 / 1920 across Catalog (list AND map), a
  ServiceForm step, Workstation, Settings, Calendar and Money — 28 page/width cells before and
  after. No horizontal page overflow at any width (`scrollWidth == clientWidth` everywhere, both
  runs), and the 390 and 768 screenshots are **byte-identical** before/after (SHA-256), which is the
  mobile no-op assertion. **Not touched in this lane:** the sidebar, traveler-facing pages, admin
  pages, the expert console (`ExpertLayout` and the shared `BackofficeShell` are byte-identical —
  the container mounts on the PROVIDER layout, not the shared shell) and `ServiceForm` itself
  (shared with the expert console; its own `max-w-3xl` is left as-is and simply centers inside the
  new container).

### Fixed here (lane FP-5 — ledger row 90)

Source: `docs/testing/CONSOLE_TABS_EXERCISE.md` (branch `lane/provider-batch-exercise`, as-of
`f747d0a`) — the eight **P1** findings from the console-tabs assessment. That exercise drove one real
checkout which failed at the Stripe boundary (`sk_test_dummy`) and left exactly one row behind: a
`service_bookings` row at `status='payment_pending'` with `stripe_payment_intent_id IS NULL` — an
**unauthorized claim by construction** (§15b). The money machinery handled it perfectly. Six console
surfaces then described it **five different ways**, and that disagreement is most of what this lane
closes.

- ~~**M1 — Money gave four different answers about the same never-charged booking.**~~ **CLOSED.**
  `revenueBreakdown` (`earnings.tsx`) summed `totalAmount`/`platformFee`/`providerEarnings` over
  **every** row and `GET /api/me/earnings-by-source` grouped **every** row — neither carried a status
  filter at all — so the page simultaneously read *Total Earnings $0.00* and *"Your lifetime
  earnings" $83.60* and *Earnings by Source: Direct, 1 booking, $95.00*. The rate was always honest
  (`share/gross`, no literal — §8-clean); the **amount** was the lie. Every earnings/summary
  aggregation on the surface now derives from **one shared predicate**,
  `EARNING_BOOKING_STATUSES` in the new `shared/booking-visibility.ts` — server and client read the
  same arrays, never two hand-kept copies. Money's headline tiles, Recent Transactions, the monthly
  series and the Revenue Share Breakdown all pass through it. The claim is not erased, it is
  **disclosed**: a band on the page states "N bookings awaiting the traveler's payment — not counted
  in any figure on this page", the idiom **Customers** invented and the other tabs now adopt.
- ~~**M2 — the same missing predicate latent in link analytics.**~~ **CLOSED.**
  `GET /api/me/link-analytics` aggregated `bookings`/`revenue` per share link with no status filter
  either. It read `$0` on the bench only by luck (that claim was untagged, `acquisition_ref` NULL);
  a checkout failing the same way *after* a tracked click would have reported unpaid revenue against
  the link — the number a provider uses to decide where to spend. Same shared predicate, one fix.
- ~~**X1 — Today / Inbox / Customers disagreed about one booking (0 / "1 Pending" / "1 pending
  payment").**~~ **CLOSED — root fix, not three patches.** Each page had picked its own predicate for
  the same `service_bookings` row. `shared/booking-visibility.ts` is now the single source, with the
  per-surface semantics stated in one place: **ACTIONABLE** = `pending` only (Inbox queue + tile,
  Today's Pending-Bookings tile + Action Items, and the server's `pendingBookings` count);
  **PROVISIONAL** = `payment_pending`, disclosed on every surface and **actionable on none** —
  §18b/ruling 42 SD-1 means the owner rail may not move a booking out of a provisional state, so
  offering a provider the Accept button was the defect; **EARNING** = `confirmed | deposit_paid |
  in_progress | completed`, the only rows whose amounts may appear under a money label;
  **RECORD** = the same set, for Inbox History. `GET /api/provider/analytics/dashboard` gained an
  additive `summary.awaitingPaymentBookings` so Today can disclose the claim without banking it, and
  Customers' `pendingPaymentBookings` — the one honest counter the exercise found — now reads the
  shared predicate instead of a local string compare, so it cannot drift from the idiom it invented.
- ~~**I1 — Inbox showed "1 Pending" above "No bookings waiting", counting a row it could not
  display.**~~ **CLOSED.** The exclusion from the queue was the *correct* half; the tile was the lie.
  The count is now **structurally** the length of the displayed array (`actionable.length`, the same
  array the list maps over), so counter and list cannot disagree. The claim gets its **own** tile
  ("Awaiting payment") **and its own read-only section** with the honest line "Awaiting the
  traveler's payment — nothing for you to do" — no Accept/Decline, deliberately. Total still equals
  the sum of the tiles (the L10b property).
- ~~**N1 — the notification bell's red dot was hardcoded always-on.**~~ **CLOSED — WIRED, not
  removed.** `backoffice-shell.tsx` rendered the dot as an unconditional `<span>`: no count, no
  query, no condition, lit for every provider, expert **and** EA on every page forever, including a
  brand-new account with nothing at all. A **real source exists** and is the console's own —
  `GET /api/notifications/unread-count`, the same user-scoped endpoint the traveler bell and the
  traveler sidebar badge already read — so the honest fix was to connect it, not delete it. The
  decision is one exported predicate, `shouldShowUnreadDot`, which **fails closed twice**: zero
  unread ⇒ no dot, and an unanswered query (loading / 401 / network error) ⇒ no dot.
- ~~**S1 — twelve Settings controls persisted to a table no server code reads.**~~ **CLOSED —
  eleven controls REMOVED, one wired.** `provider_settings` was a closed loop: written and read only
  by the GET/PATCH that this one page calls. Two were disproved *empirically* during the exercise,
  not just by grep — `autoResponse: true` produced no auto-response to a real inquiry, and
  `notificationsJson.messages: true` produced no notification of any kind. Removed: **Instant
  Booking** (a real consumer exists but reads a *different* column,
  `service_provider_forms.instant_booking`, so the switch wrote the twin nobody looks at),
  **Auto-Response**, **Minimum Lead Time**, **Target Response Time**, the whole six-toggle
  **Notification Preferences** card (New bookings · Booking updates · Messages · Reviews · Payouts ·
  Marketing), and **Payout Frequency** (no consumer, and it also describes a scheduling mechanism
  that does not exist — payouts are admin-processed on request). **Kept and wired:** Minimum Payout
  Amount (see S2). **Kept, unaffected:** Vacation Mode (genuinely enforced server-side) and the
  Language preference card. **No schema change, no migration:** the columns and the storage are
  untouched and the PATCH allow-list still accepts all seven fields — this lane removes the *lie*,
  not the data. The redesign decides which of these features get built; a control comes back with
  its consumer, never before it. Same call this page already made when it deleted its
  Change-Password/2FA card.
- ~~**S2 — "Minimum Payout Amount" ignored; Money and server both enforced a hardcoded $10.**~~
  **CLOSED.** This was the one control in S1's set with a real consumer waiting, so it was wired
  rather than removed. New single resolver `effectivePayoutMinimumCents`
  (`server/config/payout.config.ts`): **effective threshold = max(platform floor, the earner's own
  configured minimum)** — the `MIN_PAYOUT_CENTS` floor is **never lowered** (it exists for Stripe's
  transfer economics), a **stricter** preference **is** honoured, and any absent/garbage/negative
  value degrades to the floor (the safe failure mode for a threshold). `POST /api/payouts/request`
  gates on it and `GET /api/provider/earnings/summary` returns it, so the Money page prints the
  figure actually in force — with "Your own minimum, set in Settings" and a link — instead of a
  client-side `stats.available < 10` literal. §14: the preference is **read server-side from the
  caller's own settings row**, never from a request body, and can only ever *raise* the bar on the
  owner's own withdrawal. One consequence handled deliberately: the settings GET's no-row default
  moved from a cosmetic `"100"` to the platform floor, because a form pre-filled with 100 would
  silently impose a $100 threshold on every provider who pressed Save without touching the field.
- ~~**I3 — "Contact Provider" passed `?provider=` which chat.tsx never reads.**~~ **CLOSED.**
  Investigated first: there is **no separate traveler↔provider conversation system** to point at —
  `/chat` **is** the rail, `provider_services` is role-agnostic so a listing's owner may be a
  provider or an expert, and the storefront's Message CTA already proved the rail works end to end
  (`POST /api/chats 201` → the provider's Inbox → Messages). The CTA was simply speaking a language
  the destination does not parse, dropping the traveler on a directory of four seeded experts with
  no composer. Fixed on **both** sides: the CTA now uses the canonical `useAskExpert` rail
  (`?expertId=` + the `?name=` fallback chat.tsx documents for provider-role targets, since
  `/api/experts/:id` resolves expert-family roles only), carrying the listing name as the subject so
  the thread arrives with context; and `chat.tsx` **accepts `?provider=` as an alias** for
  `?expertId=`, so every link already out in the world — a shared URL, a bookmark, a chat history —
  stops dead-ending. `GET /api/providers/:userId/public-verification` gained an additive
  `displayName` (derived exactly as the storefront derives `earner.name`; nothing private — the name
  is already on the storefront and every listing card). Until it resolves the button is **disabled**
  rather than repeating the old dead end.

**Proof.** `server/__tests__/fp5-console-agreement.db.test.ts` (9/9, HTTP against the real dev
server, negatives first: an unauthorized claim contributes zero to earnings-by-source and zero to a
*tracked link's* attributed revenue — the case the bench never reached — is not "pending" on Today,
is disclosed there, and Today's disclosure count **equals** Customers'; a genuinely authorized
booking appears in every one of those numbers; the payout threshold is read from the settings row and
never from the request body). Pure units:
`client/src/lib/__tests__/booking-visibility.test.ts` (11/11, including the mutual-exclusivity
invariant that makes a sixth answer unwritable), `server/__tests__/fp5-payout-threshold.test.ts`
(7/7) and `client/src/lib/__tests__/backoffice-unread-dot.test.ts` (4/4).

**Keep-green battery** serialized on a fresh `traveloure_fp5` bench (32 suites): **336 pass, 0 unexpected fail**;
client unit tests 79/79. The only failures are the two already-documented bench limitations, both re-verified as
unrelated to this lane — `provider-money-hardening` P1/P2 (the fresh-bench `active_provider_commission_policy='tiered'`
naming no `fee_bands` row; ruling 42's P3–P6 are green) and the six `city-feed-card-recommendation.test.tsx` failures
FP-4 verified identical on a clean tree. Five guards plus their self-tests exit 0; `tsc` **170** = baseline; lockfile
`replit.local` **0**; production build clean.

**Not touched in this lane:** the expert console's own Money page and analytics endpoints (the
findings are provider-console; the two SHARED server aggregations `/api/me/link-analytics` and
`/api/me/earnings-by-source` are fixed for both, and the bell is fixed for all three consoles because
it lives on the shared shell); no schema change, no migration, no `fee_bands` change, no new guard.

### Fixed here (lane FP-2 — ledger row 91)

Source: the **Service Creation Audit** (Aug 12, 2026) **Package A**, sequenced as **Wave 1** of
`docs/briefs/SERVICE_CREATION_EXECUTION_MAP.md`, with the redesign mock's "Fix pack" (A1–A6) as the
ratified design for each item. **Form fixes only — no structural redesign:** no step was reordered,
delivery method was not moved, and no map-authoring surface moved (those are Wave 2 lanes S1/S3).
No schema change, no migration, no endpoint change, no server file touched at all.

Every claim below was measured on a fresh `traveloure_fp2` bench at 1280 (headless Chromium),
before and after, over the same fixtures.

- ~~**A1 — the "Publish Service" button did not publish, and providers were told only after
  clicking.**~~ **CLOSED (client copy only).** Every create is clamped server-side to a
  non-approved born state (F2 / migration 111 — `provider_services.approval_status` DEFAULTs
  `'submitted'`), so the click submits for review; measured before, the provider's final button
  read **"Publish Service"**, and the only statement of what would really happen was on the success
  screen *after* the click. The button now reads **"Submit for review"** and an upfront notice
  ("New listings are reviewed before they go live…") renders on **every step for both roles**, which
  is the mock's A1 disposition — the expert branch already had a review card, but only on step 4.
  **The SLA number is deliberately absent**: the mock's copy says "usually within 2 business days"
  and the execution map's Gate **G5 #7** has *"review SLA — is '2 business days' real?"* open with
  the disposition *"measure first, then commit or drop the number"* — so stating one here would be
  exactly the §13 claim that gate exists to prevent. The expert card's own unmeasured **"within 48
  hours"** is removed for the same reason. Nothing in the write path, the status logic or the gates
  changed.
- ~~**A2 — a Published/Draft switch wired to nothing.**~~ **CLOSED — removed, and `active` is gone
  from the form state.** The switch bound `formData.active`, which was never put on the create or
  update payload and which no gate consulted: flipping it changed nothing, while reading as the
  control that puts a listing live. Replaced by a **read-only status pill over the real record**
  (mock A2: "Draft → In review → Live … no control that pretends to set it"), and the field is
  deleted from `FormData` so nothing can bind to it again.
- ~~**A3 — four Catalog card mutations rendered raw JSON error blobs.**~~ **CLOSED (client mapping
  only; no server response changed).** Measured before, flipping a listing to Active without a
  meeting point showed the provider, verbatim:
  `400: {"message":"In-person services need a meeting point before publishing. Save as draft to
  finish later.","code":"MEETING_POINT_REQUIRED"}` — the server's sentence was already honest, just
  buried inside `apiRequest`'s `"<status>: <body>"` string. New `client/src/lib/catalog-error-copy.ts`
  unwraps it, names the action that failed, and flags the refusals a provider fixes **in the listing
  editor** so the toast can carry the way out (the mock's "Add one →", shipped as a **Fix it**
  action). After: *"Couldn't make this listing active / In-person services need a meeting point
  before publishing. Save as draft to finish later. / Fix it"*. A `VERIFICATION_REQUIRED` refusal is
  deliberately **not** flagged editor-fixable — it is fixed on Provider Status — and an
  unrecognised code is never guessed at (§13).
- ~~**A4 — Catalog's Delete fired on one click, with no confirmation.**~~ **CLOSED.** Measured
  before: clicking Delete took the catalog from 13 listings to 12 with no dialog; the Workstation's
  property and bundle deletes, two clicks away, both confirm. Catalog now uses the same
  `AlertDialog` and **names the listing**. **Scope stated:** this is the plain confirm only — the
  "refuse + archive when travelers have already booked it" half is **gap #18**, a Wave 3 lane with a
  server side, so the dialog claims nothing about bookings it has not checked.
- ~~**Package A item 3 — four unread logistics fields.**~~ **CLOSED — all four removed from the
  form, every column untouched.** Each was re-verified by grep at this SHA rather than trusted from
  the audit. Dispositions:
  - **`durationMinutes`** ("Duration (minutes)") — **REMOVED.** Zero consumers on
    `provider_services` (every other `durationMinutes` hit in the repo is `itinerary_items`, a
    different row). It was also the duplicate half of the duration question — see item 8.
  - **`bufferMinutes`** ("Setup / buffer (minutes)") — **REMOVED.** Zero consumers repo-wide.
  - **`canAnchor`** ("Can this anchor a day?") — **REMOVED.** Zero consumers, and the label is
    planner jargon a seller cannot interpret.
  - **`pickupRadiusKm`** ("Pickup radius (km)") — **REMOVED.** Zero consumers, and it was the third
    radius input on one form: the ring travelers see (`service-detail.tsx`), the Catalog map ring
    and the flat-surcharge containment test all read **`service_radius`**. What replaces it is a
    pointer at that number, so a provider choosing "Radius" is not left with an input that decides
    nothing.
  - **KEPT, with the reason stated: `transportProvision`.** It is the audit's "one of which
    nevertheless decides what UI the provider sees" — it has no data consumer, but it gates both
    the pickup-coverage block **and** the travel-surcharge block, and the surcharge is charged for
    real at checkout. Removing it would have made live money config unauthorable. A field with no
    consumer is a defect; a field whose consumer is a live gate is not.
  - **Never-clobber:** all four stay in form state, loaded from the row and sent back unchanged, so
    an edit saves the stored value rather than nulling it. This removes the question, never the
    data — the same call FP-5 made on Settings. A control comes back with its consumer, never
    before it.
  - The card's **disclaimer was wrong in both directions** and is rewritten: it claimed "these
    details aren't shown to travelers yet" while the start window, timezone and party-size pair are
    what `booking-eligibility.service.ts` refuses a booking against and the surcharge inside it
    charges money.
- ~~**Package A item 4 — asterisks that never bound, and enforced blocks with no asterisk.**~~
  **CLOSED, in both directions.** The predicate moved out of the 4,000-line component into
  `client/src/lib/service-form-required.ts` (pure, unit-tested), because the rule it keeps —
  **the asterisk set equals the enforced set** — is one nothing could check while it was prose.
  **Newly bound:** **Price** (mirrors the server's `PRICE_REQUIRED` gate; provider-only, because
  only a provider's final action sends `status:'active'` — an expert's submit writes
  `status:'draft'`, which that gate exempts; a `package_tiers` listing is judged on its lowest
  positive tier, exactly as the server recomputes it), **required category fields**
  (`category_field_schema.required` draws the asterisk and nothing checked it), and **the
  attestation confirmations** (already enforced by a server 403 and a disabled button, but wearing
  no asterisk and named only in a `title` tooltip). **Newly un-asterisked:** **Description** and
  **Duration**, which carried an asterisk while no layer required them — both columns are nullable
  and no publish gate reads them — so binding them client-side would have invented a block the
  server does not have; they now read "(recommended)", which is what they are (both are scored by
  the owner health rail).
- ~~**Package A item 7 — bundle Edit links dropped the bundle id.**~~ **CLOSED.** `listingEditHref`
  resolved a bundle to a bare `/provider/workstation` — the right page with the identity dropped, so
  the provider landed on a list of every bundle they own and had to find the one they had just
  clicked. New `bundleEditorHref` → `/provider/workstation?bundle=<id>`, consumed by the Workstation
  on the same `?param=` convention the property editor already uses, and waiting for **both** the
  bundle and service reads before opening (the builder prefills its component list from
  `eligibleComponents`; opening earlier would silently drop every component). A bundle id this
  account does not own resolves to nothing and **says so** in the bundles section (§13). Measured:
  before, the deep link opened no dialog at all; after, it opens "Edit bundle" prefilled with
  "Kyoto Morning + Planning Call".
- ~~**Package A item 8 — transport, duration and capacity each asked twice.**~~ **CLOSED; the
  merge mapping, per pair:**
  - **Duration.** Survivor: the free-text question on Details, which writes **`deliveryTimeframe`**
    — the string the traveler detail page, Discover, the storefront and Catalog cards, the admin
    queue and `envelopeFromProviderService` (which parses minutes out of that very text) all read.
    The structured "Duration (minutes)" duplicate is removed (its column has no reader). Relabelled
    "How long does it take?" with "Asked once — travelers see this exactly as you write it."
  - **Capacity.** Survivor: the **party-size pair** in the Service-logistics card — the numbers the
    SERVER enforces (`booking-eligibility.service.ts` refuses a booking outside
    `party_size_min`/`party_size_max`). Removed: **"Max Concurrent Clients"** on step 4, a second
    capacity number three steps and one vocabulary away, whose only consumer is the Catalog card's
    "Up to N" chip — rendered beside a Users icon, so it reads as a group size too. Column
    untouched; the chip still renders for rows that already carry a number. Concurrency comes back
    as its own question, in its own words, with the Wave-2 Capacity step.
  - **Transport — DEVIATION FROM THE MOCK, recorded.** The mock's fix **A6** proposes ONE question
    with the `transportProvision` vocabulary and drops the yes/no disclosure. **Ruling 62** (see the
    `transportProvisionEnum` block in `shared/schema.ts`) states the two columns answer DIFFERENT
    questions and must not be collapsed — `transport_provision` is "how does the traveler get to the
    start", `transport_provided` (migration 119, which carries a real DB CHECK) is "once you've met,
    do you drive them" — and `transport_provided` is the one of the pair that is actually **read**
    (`service-detail.tsx` renders it; `envelopeFromProviderService` carries it). Deriving either
    from the other is the merge that ruling forbids, and §13 forbids inventing the half that is not
    entailed. So **both are kept and both are now asked in ONE block** ("Getting there"), in one
    order, with the distinction said out loud — the yes/no question MOVED out of the Meeting
    Location card, which is what made them look like one question answered twice. Proven
    structurally: after the fix, both controls are inside `logistics-section-transport` and **zero**
    transport controls render outside it. **The mock's A6 swatch should be amended to match**
    (mock-parity rule); it is a scratchpad artifact, not a committed file, so this note is the
    record. Filed: `transport_provision` still has no traveler renderer — that belongs to **T-REP
    (#13)**, the ratified "render or stop collecting" lane, not here.

**Proof.** Pure units: `client/src/lib/__tests__/service-form-required.test.ts` **11/11**
(negatives first — a complete listing is missing nothing; no un-enforced field can enter the list;
an expert does not inherit the provider-only publish gates; a remote listing is never asked for a
meeting point; a required BOOLEAN category field is never "missing" because `false` is an answer),
`client/src/lib/__tests__/catalog-error-copy.test.ts` **8/8** (negatives first — the server's
sentence survives word for word, a non-JSON body is never turned into an invented reason, an
unrecognised code gets no "Fix it"), `client/src/lib/__tests__/property-editor-link.test.ts`
**8/8** (extended with B1/B2 for the bundle link). Headless before/after at 1280 over the same
fixtures, every fact flipping in the intended direction: review notice 0→1 · final button
"Publish Service"→"Submit for review" · dead switch 1→0 with status pill 0→1 · `Description *` and
`Duration *` true→false · duration-minutes / buffer / can-anchor inputs 1/1/1→0/0/0 · pickup-radius
input 1→0 with the coverage-source note 0→1 · max-concurrent input 1→0 · Catalog toast raw JSON →
human title + the server's sentence + "Fix it" · Delete 13→12 listings with no dialog → dialog
shown and **16→16** (nothing deleted until confirmed) · bundle deep link no dialog → "Edit bundle"
prefilled.

**Not touched in this lane:** every server file (not one is in the diff), so no schema change, no
migration, no endpoint, no `fee_bands` change, no money surface — the Replit deploy-push trap and
`preflight-prod-constraints` are N/A. No step reordering, no method-first restructure, no
map-authoring move (Wave 2 lanes S1/S3). No new guard: a required-field set and an error-copy map
are shared modules, not invariants a grep can hold, and their unit suites are the enforcement.


### Open — the rest of the exercise's findings

| # | Sev | Finding (abridged) | Status |
|---|---|---|---|
| **B1** | P1 | Verification failure renders the raw Stripe transport error ("500: Invalid JSON received from the Stripe API") to a business owner, with no support route on the page. | **OPEN** — needs a typed failure taxonomy on the identity/Connect rail; not a UI-only fix. |
| **B6** | P1 | The async product has no SLA / response-window / scope field anywhere. | **OPEN — redesign-gated.** It is a NEW FIELD (the async rail is D3's documented third rail, unbuilt). FP-1 deliberately did not invent one. |
| **B8** | P1 | No weekly/recurring availability and no blackout affordance for services (rooms have a date-range publisher; services have one dated slot at a time). | **OPEN — redesign-gated** (the C2 repair removed both sections because nothing backed them). |
| **B9** | P1 | The property builder has five fields — no photo, cancellation policy, check-in/out, house rules, amenities, capacity, bed config, min-stay or cleaning fee. | **OPEN — redesign-gated** (a product spec, not a defect fix). |
| **C1** | P2 | The traveler calendar opens on the CURRENT month and says "No availability published yet" while September slots exist. Most likely single cause of a lost booking. | **OPEN** — strong candidate for the next defect pack (read-side only). |
| **C2** | P2 | A date calendar renders for products with no dates (pdf, async). | **OPEN** — same surface as C1; fix together. |
| **C3** | P2 | New approved listings land on page 3–4 of browse; default sort is not recency. The pager's next/prev expose no accessible name. | **OPEN** (ranking/curation call + an a11y nit). |
| **C4** | P2 | A second tracked link does not re-attribute (first-touch wins the stored ref, last link wins the URL). Recorded as behaviour needing a RULING, not asserted as a defect. | **OPEN — needs a decision-maker ruling** on the attribution rule, then a surface that states it. |
| **C5** | P2 | The application funnel BLOCKS on insurance + licence attestations it never transmits, and maps the licence tick to `infoConfirmation`. | **OPEN** — needs schema columns; touches the application payload contract. |
| **C6** | P2 | The admin review card shows 7 of ~15 collected application fields. | **OPEN** (admin surface). |
| **C7** | P2 | The neighbourhood picker lists every neighbourhood for all ~20 launch cities, unscoped and unsearchable. | **OPEN** — worth pairing with B4: the same `city_neighborhoods.city` scoping FP-1 now derives from would scope this picker. |
| **C8** | P2 | "Save Draft" writes `approval_status = 'submitted'` (the migration-111 born-submitted design), so a private draft sits in the review queue while its owner is told it is a draft. | **OPEN — copy or ruling**, not a code defect: the born state is ratified (F2/D1a). |
| **C9** | P2 | Publishing does not leave the form (stays on `/provider/services/new`). | **OPEN** (small, but a navigation/UX call). |
| **C10** | P2 | `gallery_images` is stored and never rendered — the detail page draws exactly one `<img>`. | **OPEN** (read-side; pairs with B9's photo work). |
| **C11** | P2 | The photography offering defaults to "Package tiers" with no base-price field until a dropdown is discovered. | **OPEN.** |
| **C12** | P2 | Bundle components render as plain unlinked text — no link, price, method or image. | **OPEN** (read-side; the data is already linked via `bundle_components`). |
| **D1–D5** | P3 | `window.prompt()` admin override; empty Meeting-pin card on the Catalog map view when no Maps key; `/provider-status` renders in the traveler shell; Distribute never displays the URL itself; free-text Duration stored in `delivery_timeframe` while `duration` stays NULL. | **OPEN — polish.** D5 is a documentation/consolidation item, not a bug. |

### Write-vs-read gap list (exercise §3) — status

FP-1 closed the two "renders WRONG" rows (`delivery_method` on property/rooms/bundles; `location`
"Unknown") and the `city`/Stay rows. **Still authored → rendered nowhere:** `party_size_min/max`,
`lead_time`, `change_cutoff_hours`, `service_timezone`, `earliest/latest_start_time`,
`buffer_minutes`, `neighborhood`, `transport_provision`, `gallery_images`, and the application's
Tax ID / capacity / price range / amenities / insurance attestation (C5). Those are D7 **capture-only**
by ruling 62 — the consumers are a later lane, not a defect to patch surface by surface. Note B5 makes
the scheduling half of that set AUTHORABLE on remote products for the first time; it does not make any
of it traveler-visible.

### Bench observation (not an exercise finding)

Also (FP-3, same class): `market-insights.db`, `booking-eligibility-gates.db` and
`provider-office-location.db` all fail 100% on a FRESH bench DB until
`npx tsx scripts/seed-ci-test-users.ts` is run — they log in as the `ci-provider@traveloure.test`
fixture, which the boot seeders do not create (only `seed-ci-test-users.ts` does). Nothing is wrong
with those suites; running that seeder is a bench precondition, worth stating in the battery recipe.

`server/__tests__/provider-money-hardening.db.test.ts` P1/P2 cannot run on a FRESH bench DB: its
precondition helper reads the band named by `platform_settings.active_provider_commission_policy`,
which the boot seeders set to **`tiered`** — a value that names no `fee_bands` row (the suite's own
comment expects `beta_flat`). Nothing in FP-1 touches rate resolution; filed for the fee lane to
settle (either seed a `tiered` band or point the setting at a real one). The other 4 tests in that
suite pass.

Also observed while running the FP-1 keep-green battery (three runs on the same bench):
`server/__tests__/deliverable-protected-rail.http.test.ts` **R4-c2 is INTERMITTENT** — 13/13 on two
runs, 12/13 on a third, always the same test, always `500` with
`[object-storage] Object not found` for the key `R4-c1` had just read successfully one line earlier.
It is NOT a regression from FP-1: `server/infrastructure/object-storage.ts` and the upload/download
endpoints are byte-identical across this lane's diff (which touches only the provider create/update
handlers). Suspected mechanism to check when someone picks it up: the upload endpoint's best-effort
`deleteObject(previous)` is fired UNAWAITED, and the suite uploads twice onto the same service
(the `before()` driver probe, then R4-a5), so a mis-timed or mis-keyed delete lands on the live
object. Worth an await or a keyed assertion; do not "fix" it by relaxing the test.
