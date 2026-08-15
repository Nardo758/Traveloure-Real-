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

### Fixed here (lane QA-1 — ledger row 95)

Two verified QA findings, both display-only — money/backend derivation is unchanged in both.

- ~~**Cancelled/refunded/declined bookings vanish from the provider Inbox History tab.**~~
  **CLOSED.** A provider's Decline puts a `service_bookings` row at `cancelled` (unpaid) or
  `refunded` (a paid row made whole via `refundServiceBooking`), and History read
  `RECORD_BOOKING_STATUSES` alone (ledger 90's `confirmed | deposit_paid | in_progress |
  completed`), so a declined booking had **no home anywhere on the console** — correctly not
  counted as money, but also not shown, so the earner had no visible record it ever happened.
  `shared/booking-visibility.ts` gains a new **CLOSED** set (`cancelled`, `refunded` — exactly what
  a Decline can produce) and a **HISTORY** set (`RECORD ∪ CLOSED`); both provider and expert Inbox
  History now filter on `isHistoryBooking`. The expert console had its **own** hand-written
  predicate (`status === "confirmed" || status === "completed"`, never the shared ledger-90
  module at all) — same gap, same fix, one shared predicate rather than a second hand-kept copy.
  **The FP-5 idiom held throughout:** each card's `StatusBadge` already renders `cancelled`/
  `refunded` honestly (no new badge work needed), and the green "You earn $X" payout box — which
  would otherwise show a stale dollar figure on a row that is no longer money — is now gated on
  `isEarningBooking(status)` on both consoles; a closed row shows a neutral "No payout — this
  booking was cancelled/refunded" line instead. History gained **Cancelled**/**Refunded** filter
  buttons alongside the existing Confirmed/Completed ones. `failed` (a §15b claim whose Stripe
  attempt never succeeded — it never became a real booking) and `disputed` (still open/contested,
  not a closed outcome) are **deliberately excluded** from CLOSED, stated in the module rather than
  silently omitted. No schema change, no migration, no server file touched — `GET
  /api/provider/bookings` and `GET /api/expert/bookings` already return every status with no
  filter; this was purely a client-side visibility gap.
- ~~**The booking-row sanitizer's strip list missed the real payment-identity column.**~~
  **CLOSED.** `server/utils/data-sanitizer.ts`'s `sanitizeBookingForExpert` stripped
  `paymentIntentId` and `stripeSessionId` — neither is a real `service_bookings` column (the
  nearest match, `reconciliationExceptions.paymentIntentId`, belongs to an unrelated admin table;
  `stripeSessionId` appears nowhere in `shared/schema.ts`). The real columns are
  `stripePaymentIntentId` / `stripeDepositIntentId` / `stripeBalanceIntentId` (§19a — written ONLY
  by the shared promotion/balance-authorization paths, never client-settable, and by that same
  posture never meant to round-trip to a non-full-access role). No live leak was observed —
  enrichment nulls the real field before this sanitizer runs — but the strip list itself was wrong
  as written, so a future caller that skips enrichment (or enriches from a raw row) would leak a
  live PaymentIntent id to a provider/expert. **Strip-list sweep result:** the other three entries
  in the same list (`paymentDetails`, `cardInfo`, `billingAddress`) are also not real
  `service_bookings` columns — `billingAddress` exists only on the unrelated
  `ea_client_relationships` table — so none of the five original entries matched a real column on
  this table; all are kept (harmless belt-and-braces) alongside the three added real columns. The
  file's separate `SENSITIVE_FIELDS` constant (`booking: ['paymentDetails', 'cardInfo',
  'billingAddress']`) is exported but **consumed nowhere in the repo** — dead code with the same
  wrong names, flagged here rather than touched (zero live behavior, out of this fix's scope).
  New pinning suite `server/utils/__tests__/data-sanitizer.test.ts` (6/6): a raw row with every
  column populated, including the three real Stripe columns, emits none of them for
  `provider`/`expert` roles, while an `admin`/`executive_assistant` (canSeeFull) role is
  untouched — proving the fix without changing the canSeeFull short-circuit.

**Proof.** `client/src/lib/__tests__/booking-visibility.test.ts` **17/17** (11 original + 6 new:
negatives first — a closed row is never earnings/actionable/provisional; a §15b claim and the bare
`pending` state never reach CLOSED or HISTORY; `failed`/`disputed` stay out, stated not silent;
positives — `cancelled`/`refunded` are exactly CLOSED and both reach HISTORY; HISTORY is exactly
RECORD ∪ CLOSED; the four-way mutual-exclusivity invariant extended to include CLOSED so a decline
still can't get a sixth answer). `server/utils/__tests__/data-sanitizer.test.ts` **6/6** (new).
`server/__tests__/fp5-console-agreement.db.test.ts` **9/9** (unchanged — the earnings/actionable
predicates this lane was told not to touch are still green). **KEEP-GREEN BATTERY** on a fresh
`traveloure_qa1` bench (port 5009, `OBJECT_STORAGE_DRIVER=memory RATE_LIMIT_LOOPBACK_SKIP=1
SESSION_SECRET=bench STRIPE_SECRET_KEY=sk_test_dummy`, `scripts/seed-ci-test-users.ts` run first):
sweep **9/9** · promotion **11/11** · detection **15/15** · provenance **7/7** ·
`provider-money-hardening` **4/6** (the two failures are the already-documented P1/P2 fresh-bench
`active_provider_commission_policy='tiered'` limitation noted above in this file — re-verified
unrelated, nothing in this diff touches rate resolution). Five guards + self-tests exit 0
(`check-money-endpoints`, `phase2-fee-gate`, `check-unmounted-routers`, `check-decision-guards`,
`check-omit-schema-ratchet`). `tsc --noEmit` **170** = baseline (unchanged; zero errors in any
touched file). Lockfile `replit.local` **0**.

**Not touched in this lane:** no schema change, no migration, no `fee_bands`/rate change, no money
derivation (server-side amount/authorization logic untouched on both fixes), no earnings/actionable
semantics (`EARNING_BOOKING_STATUSES` / `ACTIONABLE_BOOKING_STATUSES` / ledger-90's tests are
byte-identical), no new guard (a status predicate and a strip list are shared modules with their own
unit suites, not invariants a grep can hold).


### Fixed here (lane A1 — ledger row 93; execution-map Wave 2 S1+S3)

The creation flow is **method-first and branches**; map authoring is its step 4, **"Logistics"**;
Catalog's map is a **traveler preview**. Client-only — not one server file is in the diff, so no
schema change, no migration, no endpoint, no `fee_bands` change, and **no new write rail** (the pin
still goes out with the form save through `extractServiceLocation`; the stops still use the ruling-22a
replace-list PUT).

| # | Sev | Finding | What landed |
|---|---|---|---|
| **D2** | P3 | "Empty Meeting-pin card on the Catalog map view when no Maps key" — the card mounted the Google-keyed `LocationPointPicker`, which renders nothing without a key, leaving a titled card with no content and no explanation. | **CLOSED, structurally.** Catalog no longer authors pins at all: the card is now a read-only statement of the listing's real pin state ("Exact pin confirmed" / "Approximate area" / "No location yet") plus a link into the flow's Logistics step. There is no keyed widget on that surface to come up empty. |
| — | — | *(New, from the restructure — recorded so the next lane does not re-file it.)* Two ratified steps have **no columns yet**: hybrid's **Online half** (where the call happens, its length, the provider's own join link) and the **async** branch's reply window / scope statement / engagement window. | **HONEST PANEL, not a stub control.** Both steps exist in the shape the mock ratified and say plainly that those fields are ratified-but-not-built (Wave 3 / lane **S9**, Gate G3), rather than showing controls that write nowhere (§13). This is the same disposition as B6 below, now visible in the flow instead of absent from it. |

**Not touched in this lane:** the derived checklist + honest submit (**S2**), the pricing drawer
(**S4**) and the one-door launcher (**S5**, running in parallel) — those are their own lanes; the
call/video **Session details** step carries the existing fields **as-is** (the ratified additions are
Wave 3 / **S9**). No field was deleted and none became unreachable: every control the form had before
is still authored, on exactly one step per branch — which is what `service-form-steps.test.ts`'s N1
asserts for all seven methods.

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
| **C9** | P2 | Publishing does not leave the form (stays on `/provider/services/new`). | **CLOSED by lane S2 (ledger row 97).** A provider save — draft or submit, create or edit — now navigates to the listing home (`/provider/services/:id/edit`, hero + derived checklist), never back onto the create form. |
| **C10** | P2 | `gallery_images` is stored and never rendered — the detail page draws exactly one `<img>`. | **OPEN** (read-side; pairs with B9's photo work). |
| **C11** | P2 | The photography offering defaults to "Package tiers" with no base-price field until a dropdown is discovered. | **OPEN.** |
| **C12** | P2 | Bundle components render as plain unlinked text — no link, price, method or image. | **OPEN** (read-side; the data is already linked via `bundle_components`). |
| **D1, D3–D5** | P3 | `window.prompt()` admin override; `/provider-status` renders in the traveler shell; Distribute never displays the URL itself; free-text Duration stored in `delivery_timeframe` while `duration` stays NULL. | **OPEN — polish.** D5 is a documentation/consolidation item, not a bug. **D2 (empty Meeting-pin card on the Catalog map view) is CLOSED by lane A1** — see "Fixed here (lane A1 — ledger row 93)" above. |

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

### Fixed here (lane S5 — ledger row 94)

Source: the **Service Creation Audit** (Aug 12–13, 2026, `<scratchpad>/service-creation-audit.html`)
finding *"five separate create links all bypass the Workstation and land directly on the form"*
(ruling 74 said "Add New Service → Workstation"; no lane had built it) — carried forward as
**gap #19** in `docs/briefs/SERVICE_CREATION_EXECUTION_MAP.md` lane S5.

**CLOSED.** Every raw deep link into `/provider/services/new` found by grepping `client/src` now
routes through the Workstation launcher first, with exactly one deliberate exception:

- Catalog header "Add New Service" → now `/provider/workstation` (was `/provider/services/new`).
- Catalog empty-state category tiles (the 30-tile grid) → REMOVED from Catalog; the same tiles now
  live on the Workstation itself, under a new "Or start from what you do" section.
- Catalog empty-state "Start from scratch" button → collapsed into the same "Add New Service"
  button as the header, both pointing at `/provider/workstation`. The empty state is now a plain
  title + one sentence + one button — no fake category picker duplicated in two places.
- **Permitted exception:** the Workstation's own "Single service" tile still links straight to
  `/provider/services/new` — that link IS the launcher's door, not a bypass of it.

The audit's second half of the same finding — *"a first-time provider who did land on the
Workstation would see two empty lists and a lock icon"* — is also addressed as a side effect: the
screen now opens on an explicit "What are you building?" headline over the three-tile ladder
(single service / bundle / property, from lane PB) before the two empty "Your bundles" / "Your
properties" lists, so the door itself is the first thing a new provider sees, not the empty state
underneath it.

**Deliberately NOT touched:** the expert console. Experts have no bundle/property ladder (§17
Product Builder is provider-only), so `client/src/pages/expert/catalog.tsx`'s direct "New Service"
link stays a direct link — a one-tile "launcher" in front of it would be exactly the kind of fake
gate the lane's scope forbade. `client/src/pages/expert/services.tsx` is confirmed dead (no
`<Route>` in `App.tsx` renders it) and untouched.

Full record: DECISIONS.md ruling 94.

### Fixed here (lane QA-2 — ledger row 96)

Three findings: notification durability, the missing proof, and a slot-leak investigation.

**Finding A (durability) — CLOSED.** The owner rail's accept/decline transition
(`PATCH /api/provider|expert/bookings/:id/status` → `storage.updateServiceBookingStatus`) committed
the status flip and wrote the traveler's in-app notification as two separate statements: a crash (or
just an ordering hiccup) between them left a status change with no notification, and the atomic
transition guard turned a client retry into a bare 409 that could never repair it. Investigated the
actual write first (an in-app `notifications` row insert — no email/push in this path), so per the
brief the smallest durable shape applied: the notification insert now lives INSIDE the same
transaction as the status flip in the canonical writer (the ruling-80 "flip-and-mint in one
transaction" precedent, generalized), plus an idempotent dedupe — `notifications.dedupe_key`
(nullable varchar, migration 209), a PARTIAL UNIQUE index (`WHERE dedupe_key IS NOT NULL`, the
migration-155/203 precedent — legacy NULL rows never collide), `ON CONFLICT DO NOTHING`, key shaped
`booking:<id>:<event>`. Same treatment for the accept path (which previously wrote NO traveler
notification at all — a bigger gap than the one filed) and the decline/unpaid-cancel path (which
had one, just not durably). No outbox worker: a full outbox is the wrong-sized fix for a same-process
DB insert that only needed to move inside an existing transaction.

**Finding B (the missing proof) — CLOSED.** `server/__tests__/qa2-notification-slot-durability.db.test.ts`
(5/5, negatives first): P1 pending→confirmed produces EXACTLY ONE notification; N1 a concurrent
second accept (the §18b atomic-conditional race loser) writes ZERO additional notifications and
leaks no error (`Promise.allSettled` over 5 concurrent callers — 0 rejections, 1 winner); N2 a
crash-simulating retry (re-running the exact same transition with no restrictive
`expectedFromStatuses` — the real shape both `POST /api/bookings/:id/cancel`'s non-refund branch and
a lost-response client retry take) is a no-op: one notification, one slot release, no throw.

**Finding C (slot leak) — INVESTIGATED, mostly already covered, one real gap fixed.** Traced
`voidClaim` (the §15b TTL sweep) — it already releases the claimed slot atomically with the void
(`checkout-claim.service.ts`). Traced `refundServiceBooking` — it already releases the slot after a
successful Stripe refund (`stripe-payment.service.ts:1012-1019`). So the stale comment in
`payments.routes.ts` ("release on abandoned/refunded bookings is a filed follow-up") was CLOSED with
a pointer to both, not re-filed. The actual gap: the NO-REFUND cancel/decline branches — the owner
rail's unpaid decline and the traveler's non-refundable self-cancel — call
`storage.updateServiceBookingStatus` directly and never touched the slot, so a paid, slot-bound
booking cancelled with no refund due (a non-refundable policy, or a decline whose Stripe lookup could
not confirm payment) permanently stranded its claimed capacity. Fixed IN the canonical writer, not a
second reclaim rail (§18c): on the booking's FIRST transition into cancelled/refunded, if the row
carries a `slotId`, the same floor-at-0 / re-open-if-under-capacity release `voidClaim` and
`refundServiceBooking` already use runs atomically in the SAME transaction as the status flip.
Proven DB-level (same suite, P2/N3): claim → cancel-no-refund → `booked_count` returns; a retried
cancel (unconditional guard) releases once, never twice; a capacity-3 slot returns exactly one seat,
leaving the other booking's seat held.

**Migration:** `server/migrations/209_notification_dedupe_key.sql` — additive nullable
`notifications.dedupe_key` + partial UNIQUE index, no CHECK. Declared in `shared/schema.ts`
(publish-trap rule). Proven idempotent in a rolled-back transaction (run twice, both hit
`IF NOT EXISTS`/`already exists, skipping`).

**Negative space (ruling 43):** no second reclaim rail beside the claim machine (§18c) — the slot
release is one more atomic step inside the EXISTING canonical writer, never a new scheduler/worker;
no external-send-inside-a-transaction (this path has no email/push today — §15b's "irreversible
effects follow authorization" posture is noted for if/when one is added); no outbox worker (not
needed — the durable guarantee is the in-app row, written same-transaction); the paid-refund cancel
branches (owner-rail refund, traveler-refund) are untouched — they already release the slot via
`refundServiceBooking` and already fire their own notification after that external call completes,
which is the correct best-effort-after-commit shape for an external-call-adjacent write, not this
lane's target.

Full record: DECISIONS.md ledger row 96.

### Fixed here (lane S6 — ledger row 98)

**Distribute in the sidebar + Catalog slim — records the ruling-74-disposition-6 clarification.**
`/provider/distribute` existed (D1-D4/C6, ledger 76/77) but had no sidebar entry, and ruling
74(6)/(7)'s original "storefront/share tools STAY on Catalog, Distribute deep-links to them" had
been built by D1 as a literal SECOND MOUNT of `ProviderStorefrontHeader` — genuinely double-mounted
across both pages — while C6 pointed the Promote block's *actions* at Distribute without moving the
block itself. This lane resolves the ambiguity: **Distribute is the ONE home for every
outward-facing distribution surface; Catalog is read/manage/triage only.**

**(1) Sidebar.** `Distribute` added to the Business group, right after Catalog
(`client/src/components/provider/provider-sidebar.tsx`), with an `nav.distribute` i18n key
(EN "Distribute" / JA "配信") on the ruling-60-Phase-A convention. Proven headless: the entry
renders, sits immediately after Catalog in DOM order, and navigates to `/provider/distribute`.

**(2) Three blocks moved off Catalog, none duplicated:**
- **Storefront header** — `ProviderStorefrontHeader` is no longer mounted on Catalog (it stays
  `export`ed from `services.tsx` since Distribute imports the one authored copy); Distribute's
  Storefront section is now its ONLY mount.
- **Share-kit dialog launcher** — Catalog's per-card "Share" button + `OfferingShareDetail` Dialog
  is gone. Distribute's Social-kit channel now mounts the SAME `<OfferingShareDetail/>` inline
  (reuse, not reimplementation) — the Instagram-publish affordance that only lived in Catalog's
  dialog is preserved rather than dropped, and a hand-rolled feed/story/route preview that had
  been duplicated on Distribute is deleted in favor of the one real component.
- **Promote block** — the `PostingOpportunitiesCard` (posting-opportunity nudges) no longer
  renders on Catalog at all (the on-ramp *section* — header text, "Open Distribute" button — is
  gone, not just re-pointed). It now renders as Distribute's own Promote section, called WITHOUT
  `promoteHref` so the real inline share actions (Copy/WhatsApp/X/Instagram) render directly
  instead of a second "Promote in Distribute" deep-link — that on-ramp mode (`promoteHref`,
  `PromoteInDistributeLink`) is retired from `share-tools.tsx` since S6 removed its only caller.

**(3) Catalog's one remaining outward pointer.** Every listing card carries a "Distribute this →"
button (`button-distribute-<id>`) linking to `/provider/distribute?listing=<id>` — the id only
PICKS a row out of the account's own listing read (the Workstation `?property=`/`?bundle=`
deep-link convention); Distribute's selector falls back to the first listing on a missing/foreign
id, never a dead end. Catalog's final outward-facing surface list: nothing — cards, list↔map
(traveler preview), the availability section and per-card health remain, no distribution chrome.

**(4) Measurement untouched.** No analytics were added to the moved Social-kit or Promote
sections — `ChannelStateStrip`'s "View link performance" deep-link to Performance→Analytics is
unchanged (§22d posture).

**PROOF.** Playwright specs updated in place (bench-only, not CI-wired, same posture as the rest
of the Catalog+Distribute suite): `distribute-channels.spec.ts` now asserts (a) the Social-kit
channel renders the shared component's real testids + an Instagram-publish affordance + NO
"Open share studio in Catalog" deep-link; (b) Distribute's own Promote section renders with NO
self-referential "Promote in Distribute" link; (c) Catalog carries NONE of the storefront header /
share dialog / Promote section testids, and its per-card pointer lands on Distribute with that
listing preselected. `distribute-shell.spec.ts` needed no logic change (`ProviderStorefrontHeader`
still renders the same way, just from one call site instead of two).

**KEEP-GREEN**, serialized on a fresh `traveloure_w2d` bench (port 5012, `OBJECT_STORAGE_DRIVER=memory
RATE_LIMIT_LOOPBACK_SKIP=1 SESSION_SECRET=bench` stub Stripe keys, `scripts/seed-ci-test-users.ts`
run first): client unit battery 14/14 files, 0 failures; `fp1-console-defects` 12/12;
`fp3-property-room-edit` 8/8; `short-links-frame` 12/12; `posting-opportunities-frame` 2/2; the two
Distribute/Catalog Playwright specs pass at 1280 viewport. Five guards exit 0 (check-money-endpoints,
phase2-fee-gate, check-unmounted-routers, check-decision-guards, check-omit-schema-ratchet); `tsc
--noEmit` **170** = baseline (unchanged, zero new errors in any touched file); `replit.local` **0**;
production build (client + server) clean.

**Pre-existing, not this lane's regression:** `distribute-shell.spec.ts`'s blocked-listing assertion
(`badge-marketplace-blocked` for "Business Document Translation") fails on a *fresh* bench because
that seeded service is born approved+active there, not approved+draft as the spec's fixture comment
assumes — a bench-state mismatch in code this lane never touched (`MarketplaceChannel`, the
publish-readiness endpoint, the phase-d-kyoto-vendors seed). Also found in verification (not fixed,
out of scope): the `phase-d-kyoto-vendors` seed creates provider rows with no password, no storefront
handle and no terms-acceptance timestamp, so the pre-existing kyoto-interpreter-based specs cannot
log in on a genuinely fresh bench without a manual DB stamp — worth a small follow-up in the seed
itself (`server/seeds/phase-d-kyoto-vendors.seed.ts`) if this bench is meant to be reproducible
from scratch for the whole Catalog+Distribute suite, not fixed here as out of this lane's scope.

**NEGATIVE SPACE (ruling 43):** no schema change, no migration, no endpoint change, no money
surface touched; S5's empty-state launcher and `ServiceForm` untouched (different lanes' scope);
the expert Catalog (`client/src/pages/expert/catalog.tsx`) is untouched — it has no Distribute hub
and keeps its own inline `PostingOpportunitiesCard` (no `promoteHref`, unaffected by the prop's
removal since it never passed it).

Full record: DECISIONS.md ledger row 98.

### Fixed here (lane S4 — ledger row 99; execution-map Wave 2, LAST lane of the wave)

**Money out of creation — the post-creation "Pricing & fees" surface.** Builds on the listing home
S2 made the default view of `/provider/services/:id/edit`. Client-only — not one server file is in
the diff, so no schema change, no migration, no endpoint, no `fee_bands` change, and no new write
rail (every field already went out through `PATCH /api/provider/services/:id` and the existing
owner-gated `PUT /api/provider/services/:id/surcharge-tiers`; this lane only moved which SURFACE
calls them).

**(1) What moved.** Travel-surcharge mode + amounts — all four modes (none/flat/zones/per_km),
including the zones ring editor (B1/ruling 81) — the deposit/partial-payment opt-in (Lane 7,
ruling 72), and the cancellation policy (type + free-text details, X1) all moved off
`ServiceForm.tsx`'s wizard steps ("Getting there" and "Booking Terms") into a new
"Pricing & fees" drawer (`client/src/components/provider/pricing-fees-drawer.tsx`), mounted on
S2's listing home beside — never inside — the derived checklist. **What stayed:** base price
(creation step 1) and `serviceRadius`, the map's own coverage/location geometry (still authored on
the "Getting there" → Pickup block, still what `ServiceMapAuthoring` draws its ring from) — neither
is a surcharge amount, so neither was in scope to move. Lead Time also stayed on the wizard's
Booking Terms card (not fee-adjacent). Each vacated wizard card now carries a short note pointing
at the drawer rather than silently going quiet (§13).

**(2) The drawer.** Reads/writes ONLY through the existing rails (§19 allowlist posture verified
against `shared/schema.ts`'s `insertProviderServiceSchema.extend()` block — every moved field is
already accepted there, none is `.omit()`'d, `revenueShareRate` stays omitted and is never touched
by this drawer): `PATCH /api/provider/services/:id` for the scalar fields, plus the pre-existing
owner-gated child-row replace-list `PUT .../surcharge-tiers` when the mode is `zones`. Shows base
price **read-only** (edited on the listing itself, never here) and a plain-language summary of what
is configured. **No rate-bearing figure appears or is settable** (§18) — the drawer states, verbatim
from the ratified mock, "Platform commission is not shown or set here — it is resolved from your
category, not typed into a form"; there is no "You earn $X" resolver call in this drawer at all
(the mock's own drawer design omits one, and inventing a NEW client-side commission preview for a
lane whose whole point is keeping rate logic server-side would be the wrong direction — the
existing per-booking "You earn" figures elsewhere are untouched). The pure hydrate/patch-building
logic is split into `client/src/lib/pricing-fees.ts` (mirrors `service-form-required.ts`'s own
split) so it is unit-testable without a DOM.

**(3) Checklist integration.** Verified BEFORE moving anything: none of the three moved fields is
in `service-form-required.ts`'s `buildRequiredItems` — they were never required-for-final on any
method, so per the standing instruction ("if any moved field is required-for-final for its method,
its checklist row now navigates to the drawer") there was nothing to redirect. **The required set
and `ChecklistNavTarget` are byte-identical to what S2 landed** — no new `{kind:...}` variant, no
new checklist row. "Pricing & fees" is a separate always-present card ("Manage →" button opens the
drawer), matching the ratified mock's own "Listing settings" placement (a sidebar entry beside, not
inside, the required checklist) and its own "not required to go live" copy.

**PROOF.** Client unit battery **178/178** across **15 files** (14 pre-existing + **1 NEW**,
`pricing-fees.test.ts`, 43 tests): pure round-trip tests for `pricingFeesFromService` /
`buildPricingFeesPatch` / `buildSurchargeTiersPayload` / `pricingFeesSummary`, plus static-source
proofs reading `ServiceForm.tsx` and `pricing-fees-drawer.tsx` directly — every moved control's
`data-testid` is asserted ABSENT from the wizard and PRESENT in the drawer, Lead Time and Service
Radius are asserted still present in the wizard, and `service-form-required.ts` is asserted to gain
no `surcharge`/`deposit`/`cancellation` required-item id. `tsc --noEmit` **170** = baseline
(unchanged, zero new errors in either new file or `ServiceForm.tsx`).

**Server keep-green**, serialized on a fresh `traveloure_w2e` bench (port 5013,
`OBJECT_STORAGE_DRIVER=memory RATE_LIMIT_LOOPBACK_SKIP=1 SESSION_SECRET=bench` stub Stripe keys,
`NODE_ENV=development`, `scripts/seed-ci-test-users.ts` run first): `travel-surcharge` **13/13**,
`deposit-checkout` **10/10**, `fp1-console-defects` **12/12**, `fp3-property-room-edit` **8/8**
(fp2 has no dedicated DB suite — it was a client-only lane, covered by the client unit battery +
`tsc`), `service-deliverable` **9/9**, `publish-verification-hold` **9/9**,
`fee-resolution-authority` **13/13** — 74/74, zero regressions on any shared money-path consumer.
Five guards exit 0 (`check-money-endpoints` — scans only `server/routes` + `server/services` +
`server/routes.ts`, so this lane's client-only diff was outside its scope by construction, no
`money-derive-ok` annotation was needed; `phase2-fee-gate`, `check-unmounted-routers`,
`check-decision-guards`, `check-omit-schema-ratchet` — unchanged at 190). `replit.local` **0**;
production build (client + server) clean.

**API-level proof of the exact drawer round trip** (create a place-anchored listing with a pickup
provision → `PATCH` surcharge mode=flat/amount/deposit/cancellation → `GET` confirms persistence →
`PATCH` mode=zones → `PUT .../surcharge-tiers` → `GET .../surcharge-tiers` confirms the two saved
rings) — run directly against the bench with the provider CI account, byte-identical to the request
shape `buildPricingFeesPatch`/`buildSurchargeTiersPayload` produce.

**Browser-driven headless UI proof — COMPLETED as a follow-up (same session).** The playwright-CDN
download block reported below is real for `npx playwright install`, but a pre-installed Chromium at
`/opt/pw-browsers/chromium` was available (`PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`, launched
with an explicit `executablePath`) — so the full click-through DID run, on a fresh `traveloure_w2e`
bench (port 5013, same recipe, `setsid`, `scripts/seed-ci-test-users.ts`), logged in as
`ci-provider@traveloure.test` through the real `/login` page. **23/23 assertions passed:** listing
home renders with the Pricing & fees card beside the checklist; drawer opens, surcharge section
shows (place-anchored + pickup-provisioned); editing surcharge mode → flat, amount → `33.00`, and
cancellation policy → Strict + free-text details all hold in the form; Save fires the real
`PATCH /api/provider/services/:id` (200, response body carries `surchargeMode:"flat"`,
`surchargeFlatAmount:"33.00"`, `cancellationPolicyType:"strict"`); the drawer closes and the
listing-home summary line updates in the RENDERED page; a **hard reload** (a real re-fetch from the
server, not optimistic client state) still shows the persisted values; reopening the drawer shows
the persisted values back in the actual form fields (not just the summary text); the Logistics step
shows the "surcharge moved" pointer note, no longer renders the old surcharge-mode control, and
still renders Service Radius (geometry, correctly not moved); the Review step shows the
"cancellation/deposit moved" pointer note, no longer renders the old cancellation-policy select or
deposit checkbox, and still renders Lead Time (not moved). Screenshots captured at 1280×900: drawer
open (`s4-drawer-open.png`) and after-save with the "Pricing & fees saved" toast and the updated
summary line (`s4-after-save.png`).

**A real bug WAS found and fixed by this walkthrough** (not a code-review catch — the click-through
is what caught it): the drawer's `Select` dropdowns (deposit type, cancellation policy) render
through a Radix portal at the shared `select.tsx` component's `z-50`, which sits BELOW the Sheet
component's own overlay at `z-[100]` — so a `Select` nested inside a `Sheet` had its dropdown
options unclickable (Playwright's own error named it precisely: the Sheet's overlay div
"intercepts pointer events"). No existing code in this repo nests a `Select` inside a `Sheet` (the
two only-other files that import both never actually mount a `Select` inside a mounted `Sheet`), so
this was a genuinely new interaction, not a latent bug this lane merely exposed. **Fixed narrowly**
— `className="!z-[110]"` (Tailwind's important-modifier) on the two `SelectContent`s inside
`pricing-fees-drawer.tsx` only; the shared `select.tsx` component is untouched (its `z-50` is
correct everywhere else it's used, outside a `Sheet`). Re-verified after the fix: full 23/23
re-run green, five guards exit 0, `tsc` **170** = baseline (unchanged), `replit.local` **0**,
production build clean, `travel-surcharge` **13/13** and `deposit-checkout` **10/10** re-run green
on the same bench.

**NEGATIVE SPACE (ruling 43) — what this lane deliberately did NOT do:** no schema change and none
needed (STOP-and-report was the standing instruction and never fired); no migration; no new
endpoint; the server publish gates, `fee_bands`, resolvers, checkout, `ServiceForm`'s A1 branching,
S5's launcher and S6's Distribute are all untouched; no rate/commission/split field appears or is
settable anywhere in the new surface (§18); the required-for-final set is byte-identical to S2's
(§13 — this lane routes existing config to a new home, it invents no new gate and removes none).
**This closes Wave 2** (S1–S6, execution-map Gate G ratification) — Wave 3 was already unblocked by
row 92's ratification and is unaffected by this lane's completion.

Full record: DECISIONS.md ledger row 99.

## Folded in Aug 13, 2026 — post-Wave 2 open queue (decision-maker dispatch after PR #468)

Wave 2 is complete, merged, and verified in the Replit workspace (dev synced to `14f74c7b`,
migrations stamped through 209, six spot-checks green). Wave 3 lanes (S7–S11, T-REP) are tracked in
`docs/briefs/SERVICE_CREATION_EXECUTION_MAP.md`, not duplicated here. Everything else open is below.

### New [DM] decisions

- **Expert-console create CTAs bypass the one-door launcher (found by the Replit Wave-2 spot-check;
  verified in code).** S5 (ledger 94) rerouted the PROVIDER console's create entry points through
  the Workstation "What are you building?" screen, and its launcher test guards only the provider
  Catalog. The expert console still deep-links straight to `/expert/services/new` from
  `client/src/pages/expert/catalog.tsx:521` and `client/src/pages/expert/services.tsx` (:292, :325,
  :471). Scope gap, not a regression. **Q:** route expert creates through the same one-door
  launcher, give the expert console its own door, or leave deliberately (expert creation is
  method-first already via the shared ServiceForm)?
- **Clerk auth migration, parked (workspace-sync rescue, Aug 13).** Commit `e4091766` "Migrate from
  Replit Auth to Clerk" exists ONLY on the Replit workspace branches `clerk-work-recovered` /
  `replit-backup-aug13` — never merged to GitHub. Auth is load-bearing (Passport serializers #133,
  §2 admin default-deny, §14 session-derived identity), so: if wanted, it reconciles as its OWN lane
  (rebase onto current `main`, resolve against SignInModal/Signup/identity.routes/storage, re-verify
  auth invariants, land via PR, amend CLAUDE.md's auth decision in the same change); if abandoned,
  the branch stays as archive. It must never enter `main` as a side effect of a workspace sync.

### G5 batch (execution-map Gate G — ratified REC in parentheses, each still needs its lane or its measurement)

- **#5** deliverable rail remainder — versioning + re-send rule (keep "no re-send", document it).
- **#7** review SLA — is "2 business days" real? (measure first, then commit or drop the number;
  A1 deliberately ships with NO SLA number until this is answered).
- **#10** custom-offering redesign (keep flow, land in a real pending-category state).
- **#11** category↔method rules incl. the Lodging/Property collision (explicit allow-matrix).
- **#15** hybrid-with-artifact branch (defer unless a real provider asks).
- **#16** photos/media — upload vs pasted URLs (extend the ruling-58 objstore rail to images).
- **#17** edit-path for a live listing (back through review only for identity fields — define the
  field list).
- **#18** delete-with-bookings (refuse + archive, mirroring the shipped withdraw precedent).

### Standing engineering queue (no [DM] needed; sequenced after/alongside Wave 3)

- **Claims-only lookups sweep** — extend the claims-only posture across remaining lookup surfaces.
- **tsc burn-down** — ratcheted baseline is 170 (down-only gate, ruling 54); burn toward 0 in
  dedicated passes, re-locking the baseline each time.
- **Itinerary-optimizer diagnosis** — investigate the reported optimizer quality issues before
  changing code; diagnosis is the deliverable.
- **Maps surface cleanup** — consolidate the remaining map-surface inconsistencies (post-S3: the
  authoring home is the create flow's Logistics step; Catalog map is read-only preview).
- **377-task backlog triage** — the imported historical task list needs a keep/fold/kill pass.

## Folded in Aug 14, 2026 — service-creation hands-on pass (docs/testing/SERVICE_CREATION_FINDINGS_AUG14.md)

Decision-maker-commissioned hands-on pass: four services end-to-end (transport / remote / tour /
in-home chef) as `ci-provider@traveloure.test` on the dev preview. Full narrative + repro detail in
the findings doc (as-of main @ `7e16e85`); section numbers below (§) are that doc's. Post-Q1 build
(the searchable neighborhood single-select was present), so nothing here is pre-ruling-112 noise.
What the pass confirmed WORKING and must not regress while fixing: method branching (5→3 steps for
video call), category blocks on step 5, autosave round-tripping, the derived checklist (§7).

### SC-A — defects (fix first; none need a ruling)

| # | Finding | Disposition / lead |
|---|---------|--------------------|
| **SC-1** | §3.1 Required fields never block navigation — empty `Meeting Point *` advances all 5 steps and only surfaces in the end checklist. Reproduced 3×. | **OPEN.** Deliberate-looking (the checklist is the aggregator) but 3× reproduced as a trap; minimum fix = inline "still needed" marker on the step header at Next, not a hard block (autosave + checklist design argue against hard-blocking). |
| **SC-2** | §1.2/§6.5 Pin confirm discards the geocoded address while `Meeting Point *` stays empty+required; stale "No pin placed" status line with a pin visibly dropped. | **OPEN.** Write the geocoder's display string into Meeting Point as an **editable prefill** on confirm (keeps L27-P3: coordinates still only from the confirmed pin; the TEXT is what prefills). Fix the status line binding alongside. |
| **SC-3** | §2.4 Service Radius → "Pickup coverage" panel binding: input set to 60 (then 45), panel still says "No radius is set yet." | **OPEN — lead confirmed in code:** `ServiceForm.tsx:4005-4008` renders from `savedRadiusKm` = `existingService.serviceRadius` (the SAVED row), while the input edits live `formData.serviceRadius`. Point the panel at the live value (fall back to saved). |
| **SC-4** | §3.2 Min party 6 / max party 2 accepted; step-5 seats adds a third unreconciled capacity number. | **OPEN.** Cross-field zod refine (min ≤ max) client+server; seats-vs-party reconciliation needs a small rule (likely max party ≤ seats for transport). |
| **SC-5** | §5 Osaka neighborhood list is a raw chōme-level table (thousands of rows, visible duplicates) where every other city has a curated 5–10. | **OPEN — data defect.** Consequence of the ruling-20b OSM seeding (`place=suburb|neighbourhood|quarter`) ingesting Osaka's full node set. Needs a curation pass + dedupe; pairs with C7 (picker scoping) above. |
| **SC-6** | §2.3 "And once you've met — do you transport them?" ships pre-selected **"Not applicable"** — a guessed default on a traveler-visible field, on a flow that twice promises "blank means not stated". | **OPEN — §13 tension.** `formData.transportProvided` defaults `"not_applicable"` and is sent for in-person; give it an untouched `""`/"Not specified" state like the chip group beside it. |

### SC-B — logic & duplication (fix next; small [DM]s inline)

| # | Finding | Disposition / lead |
|---|---------|--------------------|
| **SC-7** | §2.1/§2.2 Three transport controls state one fact (toggle / arrival chips / during-service dropdown) and accept contradictory combinations (pickup ON + "No transport") silently. | **OPEN.** Collapse or cross-validate; at minimum a soft warning when toggle and chips disagree. |
| **SC-8** | §1.1 Up to six location asks on one step (meeting point, address search, pin, neighborhood, pickup, drop-off) — "Kansai International Airport" typed 4× for one listing. | **OPEN.** Largely falls out of SC-2 (prefill) + copy that scopes pickup/drop-off as optional extras. |
| **SC-9** | §3.4 No way to say "at the traveler's address" — in-home chef forced to invent a meeting point. Affects in-home/mobile categories broadly. | **OPEN — [DM]:** needs a location-model extension (e.g. `location_mode = 'traveler_address'` suppressing pin/meeting-point requirements). Schema change ⇒ decision-maker per CLAUDE.md. |
| **SC-10** | §3.5 Logistics branches by method but not by category — a walking guide gets the full vehicle/pickup logistics of an airport driver. | **OPEN.** The category machinery exists (step-5 blocks branch correctly); reuse it to gate the transport cards. |
| **SC-11** | §3.3 Pin (Kansai/Osaka) + neighborhood (Kyoto Station Area) accepted silently — listing files onto Kyoto's market with its only coordinate 50 km away. | **OPEN.** Soft distance check pin↔neighborhood centroid ("your pin is outside Kyoto — is that right?"), never a hard block (§13: don't guess which is wrong). |
| **SC-12** | §4.2 Change cutoff (numeric, step 2) vs Lead time (free text, step 5) — two booking gates, one enforceable, one decorative. | **OPEN.** Make lead time numeric hours and co-locate; migration needed if `delivery_timeframe` free-text is retired (pairs with D5). |

### SC-C — structure & polish (fix when convenient)

- **SC-13** (§4.1) "Review & submit" contains no review — new required fields instead. Rename or add a summary block. **OPEN.**
- **SC-14** (§4.3) Capacity is a whole step in-person but a card in video-call; double "Capacity" heading. Fold, as video-call already does. **OPEN.**
- **SC-15** (§4.4) Step count asserted before an offering/method exists; **Delivery Method defaults to In-Person** even for obviously-remote offerings — silent wrong data. Default from the offering's delivery formats where known, else unset. **OPEN.**
- **SC-16** (§4.5) Availability required to sell but lives outside the wizard. **Placement is ratified** (C9 / ruling 112 Q7: availability lives on Catalog) — so this is a COPY/handoff fix: the wizard's finish screen should hand off to the availability surface explicitly, not imply completeness. **OPEN — copy.** |
- **SC-17** (§4.6) Google Maps pin editor + Leaflet preview on one screen. Consolidate to one library (ODbL attribution required wherever OSM renders). **OPEN.**
- **SC-18** (§6.1/6.2) Digital-deliverable fields (Revisions, Expert Notes) and unfiltered affinity tags leak into non-digital/remote flows. **OPEN** — same gating machinery as SC-10.
- **SC-19** (§6.3) Photos are URL text fields, not uploads. **Already filed as G5 #16** (extend the ruling-58 objstore rail to images) — cross-ref only, no new item.
- **SC-20** (§6.4/6.6) Focus bugs: offering search swallows first keystrokes after load; time inputs land on the AM/PM segment mid-click. **OPEN — polish.**
- **SC-21** (§6.7) Listing-home "Submit for review" disabled with no stated reason (wizard's equivalent explains itself). Carry the same reason chip. **OPEN.**
- **SC-22** (§6.8) Offering vs Subcategory near-duplicate taxonomy on step 1 ("Airport Pickup & Drop-off Driver" then "Airport Transfer Specialist"). **OPEN — [DM]-adjacent:** touches the two-catalog structure (Locked Decision 4); propose hiding Subcategory when an offering is picked rather than merging vocabularies.

**Annotation to the G5 batch above:** **#17 (edit-path for a live listing) is CLOSED** — landed as
the edit-split rail (ruling 112 Q8, CLAUDE.md Locked Decision 23, migration 215, PR #474).

### Folded in Aug 15, 2026 — workspace-reconciliation follow-ups (lanes E/F, ledger row 118)

- **Router-guard comment-strip fragility (latent, §18d candidate).** `check-unmounted-routers.cjs`
  strips block comments with a naive regex BEFORE line comments, so a `/*` glob inside a `//`
  comment (e.g. "All /api/admin/* routes…") opens a bogus block that can swallow the mount
  section when later REAL `/* … */` comments change the pairing — lane F hit exactly this (guard
  reported 15 mounted routers dead; fixed by using `//` comments instead). The guard predicate
  needs a line-comments-first strip + committed `--self-test` fixtures per §18d. Until then:
  avoid inline `/* … */` in server/routes.ts.
- **Payout-parity R8–R10 rewrites (deferred from lane F).** R8 must adopt the suite's own
  dual-leg Stripe contract (assert per-owner stamps on the provisional rows in the 503 leg —
  the stamp happens before Stripe); R10's raw `INSERT INTO service_categories` must match
  canonical schema; helper signatures (makeService owner arg, recipeExpectation source option)
  need porting from the workspace file. Tests only — no product risk while deferred.
- **TWO parallel sanitizers to reconcile.** Replit's exercise-branch push (`d69b089a`) adds
  `server/utils/sanitize.ts` + tests, authored before #477 landed `server/utils/text-sanitizer.ts`
  (22 tests, wired into provider/expert/traveler write paths). When that branch PRs, fold to ONE
  sanitizer (keep text-sanitizer as canonical; port any case their tests cover that ours miss).

## Folded in Aug 15, 2026 — Distribute-vs-mock audit (Claude-in-Chrome, artifact d1c16852; 11 findings, 0 P1)

Audit compared /provider/distribute against the ratified mockup
(docs/design/provider-console-mockup/mockup.html). Verdict "DIVERGES": 6 P2 + 5 P3. Triage: 7 fixed
in the conformance lane (this PR), 3 accepted-as-built (mock to be amended), 1 filed as enhancement.
Audit coverage caveats stand: the CI reviewer account had 0 live listings and no handle, and mobile
was unverified — re-audit those two surfaces opportunistically.

### Fixed here (lane D — Distribute mock conformance)

- **D-1 (P2, FIXED).** Arriving from Catalog's "Promote this →" (`?listing=<id>`) gave no arrival
  context. Now: `banner-promote-arrival` — Catalog › Distribute › «name» crumbs, "Promoting «name»",
  ← Back to Catalog. Stale/foreign ids still silently ignored (unchanged selection posture).
- **D-2 (P2, FIXED).** Storefront card led with the generic "Your storefront" while the mock leads
  with WHOSE page it is. Now: avatar (profileImageUrl or shared `initialsFromUser`) + business name
  (businessName → firstName+lastName fallback — same chain as Profile/sidebar), "Your storefront"
  demoted to eyebrow.
- **D-4 (P2, FIXED).** Direct link required a separate "Get link" step before Copy/QR existed.
  Now: Copy link / WhatsApp / Show QR render immediately; the first action mints the tracked /r/
  link inline (`ensureUrl()`), then acts. §13 held: the URL text renders only once the code exists.
- **D-5 (P3, FIXED).** Card title "Social kit" → "Share kit" (mock verbatim). Internal
  names/testids keep the original channel vocabulary.
- **D-7 (P3, FIXED).** Frame sublabels led with pixel dimensions. Now purpose-first: "Feed post ·
  portrait card · 1080×1350", "Story · full-screen · 1080×1920", "Route map · portrait card ·
  1080×1350".
- **D-8 (P2, FIXED).** Route frame carried no on-surface honesty statement. Now a guardrail line
  under the Route label: "Shows your stops in order — not a travel route, and no distances or
  times" (ruling 22(c) stated where the provider sees it).
- **D-11 (P3, FIXED).** Storefront badge "Live · N approved service(s)" spoke approval vocabulary.
  Now "Live · showing X of Y listings" (X = approved+active, Y = all owner listings — same
  predicate, clearer claim about what the public page shows).

### Accepted as built — mock amendments (no code change)

- **D-3 (P2, ACCEPT + AMEND MOCK).** Mock shows storefront URL as `traveloure.com/@handle`; built
  namespace is `/p/:handle` and is load-bearing (OG injection, `/r/` short-link expansion, reserved
  handles, ruling 116 language overlay all key on `/p/`). KEEP `/p/`; amend the mock.
- **D-6 (P2, ACCEPT + AMEND MOCK).** Mock's feed frame is square 1080×1080; built is 1080×1350
  4:5 portrait — the higher-performing IG feed shape and what the satori template renders. KEEP
  1080×1350; amend the mock.
- **D-9 (P3, ACCEPT AS BUILT).** Section titles differ slightly from mock ("Marketplace" card copy
  etc.) — built titles are more accurate to what each channel does; mock titles were placeholders.

### Filed (enhancement, needs its own lane)

- **D-10 (P3, FILED).** Mock sketches per-channel "last shared" recency hints on the channel strip.
  Needs a data source (short-link mint timestamps exist; share-action events don't) — and any
  metric rendering on Distribute must stay within ruling 74 disp. 8 / 22(d) (measurement lives on
  Performance). Design first, then a lane.

## Folded in Aug 15, 2026 — Logistics/map audit (Claude-in-Chrome round 2; 17 findings, 2 P1)

Audit compared Catalog → Map (traveler preview) and Workstation → step 4 "Logistics" against the
ratified mock. Verdict "DIVERGES": 2 P1 + 10 P2 + 5 P3. Decision-maker ratified the two flagged
calls Aug 15 ("go with your recommendations"): **D-9 collapse ratified** (one transport toggle;
removed questions follow the mock's gap-#13 "stop asking for it" rule; schema untouched) and
**D-12 autosave ratified** (manual Save Draft + "Route saved" buttons go; stops ride the same
debounced autosave over the unchanged 22(a) replace-list PUT). Coverage caveats stand: audit
account had no live listing and no saved stops (D-13 unverified with data), mobile unverified.

### Lane M — Catalog map preview (D-1..D-8, all FIX — this PR)

- **D-1 (P1, FIXED).** "+ Add a pin" only selected a listing — did nothing. Now the mock's
  "Fix it in step 4 →", a real link to that listing's `/edit?step=logistics`.
- **D-2 (P2, FIXED).** Read-only posture now stated: notice leads with "Traveler preview —
  read-only", canvas closes with "Nothing here can be dragged, armed or placed…".
- **D-3 (P2, FIXED).** Located summary counts PLACE-ANCHORED listings only (shared
  `isPlaceAnchored`); remote/artifact are "they happen nowhere, and that is a real answer".
  Unclassifiable rows stay in the place-anchored bucket (never silently excused).
- **D-4 (P2, FIXED).** "Not located" list names each row's true reason: "no confirmed pin —
  not drawn" (+fix link) vs "«method» — it happens nowhere" (no fix chip — nothing to fix).
- **D-5 (P2, FIXED).** One canvas, whole footprint: all located listings render as labeled
  sibling pins (`ServiceLocationMap` `siblingPins`/`labelPins` — still the ONE renderer, 22(c));
  clicking a sibling selects it.
- **D-6 (P2, FIXED).** "open it →" deep-links to the SELECTED listing's step 4 (notice moved
  inside CatalogMapView to gain listing context), not bare /provider/workstation.
- **D-7 (P3, FIXED).** Blank names render "Untitled service" in the rail, lists and labels.
- **D-8 (P3, FIXED).** Market-insight category keys humanized (tour_guide → "Tour guide") in
  list + popup; "0/1 · +1" badge → "0 of 1 · needs 1 more". Presentation only.

### Lane L — step-4 Logistics authoring (D-9..D-17, all FIX — next PR)

- **D-9 (P1, RATIFIED-FIX).** Six transport questions collapse to ONE toggle ("I collect
  travelers and drop them back") + conditional spatial detail; transfer duration stays in
  Scheduling. No schema change; stored answers preserved/derivable.
- **D-10 (P2).** Layers card: Service radius (gated on confirmed pin), Route stops,
  Travel-surcharge zones (display-only + Pricing & fees → link).
- **D-11 (P2).** "Place the meeting pin" arm mode on the canvas — the armed click feeds the SAME
  confirm-gated picker (22(b): one pin-write path; the canvas is just another way to open it).
- **D-12 (P2, RATIFIED-FIX).** Autosave replaces Save Draft + "Route saved"; stops fold into the
  debounced draft autosave over the unchanged replace-list PUT. "Draft · autosaved" chip +
  footer line per mock.
- **D-13 (P2).** Route-stops rail: "X of Y located" pill, per-stop Move/Remove, "Place on map"
  for unlocated stops (nullable lat/lng is already the 22(a) shape). Bench-verify WITH stops.
- **D-14 (P2).** Osaka neighborhood picker dumps thousands of raw chōme rows; 20(b) says seeds
  come from OSM place=suburb|neighbourhood|quarter only. Purge non-conforming rows + filter at
  read.
- **D-15 (P3).** Full-width canvas, rail as aside ("one canvas with one rail").
- **D-16 (P3).** Step header "Logistics — where it happens" + "Step 4 of 5".
- **D-17 (P3).** Radius ring contrast raised to visibly legible at default zoom.

### Post-ship catch (Aug 15, decision-maker report) — property rows' fix door was a dead end

- **Map-preview fix links vs property rows (FIXED — lane map-property-door).** Lane M's
  "Fix it in step 4 →" sent EVERY unlocated place-anchored row to `/edit?step=logistics` — but a
  property/room row's `/edit` renders only the FP-3 "Properties are edited in the Workstation"
  guard, a dead end. All three doors on the map preview (fix links, "open it →" notice, pin-card
  "Add a location") are now shape-aware via the EXISTING shared `propertyEditorHref` resolver
  (property → `/provider/workstation?property=<id>`, room → `…&room=<id>`, label "Fix it in the
  Workstation →"); service rows keep the step-4 door unchanged. Bench-proven: property click
  lands on the Workstation with the Edit-property dialog auto-opened; service links unchanged.
  Lesson folded forward: any new "fix this listing" affordance must route through
  `propertyEditorHref` first — the guard page existing is proof the ServiceForm door is wrong
  for these shapes.

## Lane M2 — Catalog map preview, mock conformance round 2 (Aug 15, 2026)

**Why a second round.** Decision-maker report: *"the Provider Console Catalog Map still does not
look like the mock-up."* Lane M (D-1..D-8) fixed the surface's **honesty** — what it counts, what
it names, where its links go — and every one of those fixes holds. It did not touch the surface's
**shape**, and three whole blocks of the ratified mock
(`docs/design/provider-console-mockup/mockup.html`, `#cat-map-mode`) had never been built at all.
That is what this lane closes. Audit method: the mock's map-mode markup read block by block against
the shipped `CatalogMapView`; 13 divergences, no contradiction of a locked decision.

### Structure — the difference you see first

- **M-1 (P1, FIXED).** **Layout.** The mock is ONE full-width canvas in ONE card. The ship was a
  `240px | canvas | 320px` grid: a tall listing rail on the left and a Meeting-pin / Route-stops
  rail on the right, squeezing the map into the middle third. The rails are gone. The listing
  selector is now a compact wrapping chip row under the canvas (same `map-view-select-*` doors);
  the pin card's *content* moved into the ⑪ strip and its *door* into the ⑬ block, so nothing the
  rails carried was dropped — only the columns.
- **M-4 (P2, FIXED).** The coverage caption was **above** the map as its own bordered card, with
  the "nothing can be dragged" sentence stranded in a third place below. The mock has all three
  sentences as one `.capline` **under** the canvas. It does now.
- **M-5 (P2, FIXED).** The "Not located" list was a separate card above the map built from bare
  `<li>`s. It is now inside the same card as the canvas, as the mock's `.stop` rows (position
  chip · name · warn flag · action).
- **M-6 (P3, FIXED).** When nothing was unlocated the whole block **disappeared**. The mock prints
  "Every place-anchored listing has a confirmed pin." — an answer worth reading, not an absence
  worth hiding.

### Copy and treatment

- **M-2 (P2, FIXED).** The notice dropped the mock's second sentence — the one recording that this
  placement **amends** ruling 22(b)'s "Catalog is the map's authoring home" rather than silently
  contradicting it. Restored verbatim.
- **M-3 (P2, FIXED).** The notice rendered in the console's neutral grey (`#FAFAF8`/`#E8E8E2`);
  the mock uses its amber `.notice` family (`#FBF6EC`/`#D9C79A`/`#6B551F`). The read-only posture
  did not read as a callout. The mock's tokens are now literals at the top of the component.

### Blocks that were never built

- **M-7 (P1, FIXED).** **"What the traveler sees" (⑪)** — absent. The mock's three-card strip
  teaching the three rendering rules: confirmed pin + radius; route partly located ("X of Y stops
  located"); no coordinates → no map ("Location shared after booking"). Built. **Departure from
  the mock, deliberately:** the mock draws three illustrations; these render the *selected
  listing's real state*, so the rule is demonstrated on the provider's own data and cannot drift
  from it. Where the listing is not in a given state the card says so (§13) instead of drawing a
  specimen — the third card keeps the mock's static panel because it is a rule, not a datum, and
  names how many of the owner's listings render that way today.
- **M-8 (P2, FIXED).** **The ⑫ market-insight placement note** — absent, while the
  Map preview ⇄ Market insights toggle it is *about* shipped at the top of the surface (ruling 84).
  The mock flags that placement as analytics-not-authoring, proposes moving it to Performance, and
  says in as many words that the move **is not part of this approval** — "flagged here so it is not
  decided by accident". An undecided question nobody can see is exactly how it gets decided by
  accident, so the note is now on the page, beside the toggle. **Nothing was moved.**
- **M-9 (P2, FIXED).** **"Render it, or stop collecting it" (⑬)** — absent. Built against the
  selected listing's REAL stored answers (party size, lead time, cancellation policy, start +
  duration, languages, getting there/back, travel fee), plus the mock's "The rule this
  demonstrates" and "Deliberately provider-only" pills. The mock's `propchip`
  ("Proposed — gap #13 · ratify or amend") is preserved: this renders a proposal, it does not
  ratify one. Two §13 rules hold inside it: an unanswered question is **omitted and counted**,
  never defaulted into a claim the host did not make; and the two mock rows with **no column
  behind them at all** — *Bring* and *Access* — are named as gap #13's open half rather than
  faked. Reads only; nothing on this surface writes.

### Chrome

- **M-10 (P3, FIXED).** No breadcrumb. The mock switches its crumb bar to
  `Catalog › Map · Traveler preview` on entering map mode. Added as a text crumb line on the
  Distribute arrival-crumb precedent (the console has no global crumb bar).
- **M-11 (P3, FIXED).** Canvas height 480 → 300, the mock's `.travelmap`.
- **M-13 (P2, FIXED).** The toolbar's **search box and status chips vanished in map mode**
  (`viewMode === "list" &&`), so half the mock's toolbar was missing from the screen it is drawn
  on. They render in both modes now and **filter the map's listing set too** — with the coverage
  caption naming the active filter ("showing draft only"), because a filtered count read as the
  whole catalog would be the same §13 error this surface exists to avoid. Selection falls back to
  a still-visible listing when a filter removes the selected one.

### Deliberately NOT carried over

- **M-12.** The mock's "Map preview — illustrative" corner label. The mock's canvas is a hand-drawn
  SVG and needs the disclaimer; the ship renders real Leaflet/OSM tiles at real coordinates, so
  copying that label would be the *dishonest* move. ODbL attribution rides the shared
  `ServiceLocationMap` wherever it renders (§20/§22c) — unchanged.

### The two judgment calls — AUDITED, then RATIFIED (decision-maker, Aug 15: "lets go with your
### recommendation"; ledger row 120)

Both were flagged as calls, audited against the code before either was decided, and ratified on
that evidence. No code changed at ratification — M2 already shipped both this way.

**(a) The right rail stays removed (M-1).** The audit's finding: it was **never a preview
affordance**. `git show 9a412b9` (lane A1) deletes the `LocationPointPicker`, the per-stop
`Remove` and the `Save route` button *out of those two cards* — what M2 removed was the
**authoring** rail ruling 22(b) had put on Catalog, with its verbs stripped and the husk left
standing. Three further facts, all from the code:
- Ruling 93 §5 enumerates what the Aug 12 amendment preserves — the located partition, the
  off-canvas list, "X of Y stops located", the located-only canvas, ODbL attribution. **The rail
  is not on that list.** All five survive M2.
- The sibling lane already shipped this layout: **D-15, "full-width canvas, rail as aside"**, is
  what `service-map-authoring.tsx` (step 4) does today. The two map surfaces now agree.
- Nothing is orphaned. Pin state also lives on the Catalog list row's Listing Health `exact_pin`
  check and the listing-home checklist; the pin card itself survives inside the ⑬ block
  (`map-view-pin-card` / `text-pin-state` / `button-edit-location`), and `meetingPoint` moved to
  the ⑪ pin card's footer.

**KNOWN AND ACCEPTED — the one real loss.** The ordered **named** list of every route stop
(`map-view-route-card`) is gone. A **located** stop's name is now a click-to-open Leaflet popup
(`service-location-map.tsx`), not always-visible text. That is what the mock specifies — its route
card names only the *unlocated* stops under "3 of 5 stops located" — and the full ordered list
keeps its home in step 4's rail (`route-stop-row-*`). Restoring it on Catalog would duplicate a
readout the authoring step already owns.

**(b) The map obeys the toolbar filter (M-13).** The audit's finding: **the mock cannot settle
this** — its search input and status chips carry no listeners anywhere in `mockup.html` (only
`cat-mode-seg` is wired), so they are decoration there. The repo settles it instead:
`previewServices` is derived from `filteredServices`, so search + status chips have **always**
governed Catalog **Preview** — a second, non-list rendering of the same set. Map ignoring them
would have made it the only view that does not. And `searchQuery`/`statusFilter` are page-level
state untouched by `viewMode`, so pre-M2 the combination was a *live filter with hidden controls*;
the incoherent option was the one that was shipping.

**THE CONSEQUENCE, NAMED.** `catalogStatusBucket` buckets on `approvalStatus`/`status`, so
selecting **Live** hides the draft rows most likely to be missing a pin — which is the map's main
job — and the "Previewing" chip row follows the filter too, so a filtered-out listing cannot be
inspected. Default is `"all"`, and the coverage caption names the active filter ("showing live
only") so a narrowed count is never read as the whole catalog (§13). Watch for this if a provider
reports "my unpinned listing isn't in the Not-located list".

**Bench evidence.** `docs/design/catalog-rebuild/after-map-m2.png` — the rebuilt surface rendered
from fixture rows (no DB in the session container, so a throwaway Vite harness mounted the
component directly; the harness was deleted, it is not in the tree). Tiles render grey because the
sandbox blocks the OSM tile host — the layout, copy and every block are the real component.

**Proof.** `playwright/tests/catalog-map-located.spec.ts` — rewritten. It had been left behind by
Lane M and was asserting removed copy ("X of Y services located on the map") and removed testids
(`catalog-map-unpinned-rail`, `button-add-pin-*`), i.e. it could not have passed. It now covers the
crumb, the notice + amends sentence, the place-anchored caption, the "happens nowhere" row with no
fix chip, the §13 no-pin negative, and the presence of the ⑫ and ⑬ blocks.

## Folded in Aug 15, 2026 — the spec-rot audit (regression-spec lane, ledger row 121)

Acting on the test strategy's #1 P0 ("commit the regression specs") surfaced a bigger problem than
the one being fixed: **only ~14 of the repo's ~53 Playwright specs are referenced by any
workflow.** The other ~39 are committed, were correct the day they were written, and have not run
since. Four of them assert against provider-console surfaces that PRs #484–#487 renamed — and all
four PRs merged with 54/54 green, because nothing ran them.

### Fixed here

- **Four rotted specs repaired.** `catalog-map-located` (unpinned rail → not-located list, count
  copy, add-a-pin chip → real fix link), `service-logistics-step` (segmented transport provision →
  the D-9 one-toggle), `distribute-channels` (the D-4 "Get link" button auto-mint removed),
  `distribute-shell` (D-11 badge copy). Each now also asserts the NEW ruling, so the repair is
  coverage rather than an assertion downgrade.
- **They were DEAD ON ARRIVAL, not merely stale — two independent reasons.** (1) All four log in
  as `kyoto-interpreter@traveloure.test`, which `phase-d-kyoto-vendors.seed.ts` creates with **no
  password** and no other seeder touches — every run 401'd at the door, in every environment.
  (2) Two of them asserted a seeded fact that never existed: they claim
  `Business Document Translation` is approved+**draft**, but that seed inserts every vendor
  service `approvalStatus:'approved', status:'active'` in one shared insert. Fixed at the source:
  `e2e-test-accounts.seed.ts` grew an idempotent FIXTURE_LOGIN_BACKFILL (fills a NULL password and
  a NULL storefront handle only, never overwrites, never steals a claimed handle), and
  `distribute-shell` now CREATES its not-live listing instead of assuming one.
- **A one-way door found while fixing it:** an un-verified provider can PATCH a listing to
  `draft` but cannot PATCH it back to `active` (403 VERIFICATION_GATE), so "pause a seeded row and
  restore it" silently corrodes the shared fixture on every run. Specs needing a not-live listing
  must create a throwaway (born `submitted` per migration 111) and DELETE it. Recorded because the
  next spec author will reach for the pause.
- **New coverage** for the biggest untested change of the week: step-4 map authoring — D-16 step
  header, D-10 Layers card (incl. the Pricing & fees href the dynamic-links gate caught), D-13
  located pill, and D-12's autosave proven by ROUND-TRIP (reorder in the UI → read the row back →
  new order persisted **with both stops' coordinates intact**, which a lossy replace-list would
  fail while looking identical on screen).
- **i18n key parity** (`playwright/tests/i18n-key-parity.spec.ts`): diffs en ⇄ ja key sets across
  all 6 namespaces, both directions, plus namespace-file parity and a SUPPORTED_LOCALES cross-check.
  **286 keys, zero gaps today.** Mutation-proved it can actually go red (delete a key → red; add an
  orphan → red; stale allowlist entry → red). The allowlist ships empty by design.
- **`.github/workflows/provider-console-gate.yml`** — the structural fix. Runs the four repaired
  specs + i18n parity on every PR, with the repo's spec-file-existence guard (a renamed spec must
  fail loudly, never reduce the gate to zero assertions) and `--workers=1` because these specs
  mutate and restore one shared fixture.

### Still open

- **`catalog-preview-toggle.spec.ts` is NOT gated** — it shares the false "one listing is draft"
  premise and needs the same create-a-throwaway treatment; deferred rather than half-fixed. Its
  count assertion fails on a live bench today.
- **~34 other ungated specs.** This lane gated the console surfaces that the redesign rulings churn
  most; the rest are unaudited and may be rotted or dead in the same two ways. Worth one sweep:
  for each, does it run, and does it pass? (Cheap to answer, and the answer is load-bearing —
  every one of them currently reads as coverage while providing none.)

---

## Folded in Aug 15, 2026 — the spec-coverage sweep (answers the "~34 ungated specs" item above)

The sweep the previous section asked for: for every spec in no workflow, **does it run, and does
it pass?** Method matters here more than the tally, because the first two passes produced numbers
that were wrong in *my* favour and in the specs' — both are recorded below so the next person does
not repeat them.

### The coverage number, computed rather than eyeballed

**53 specs on disk; 20 reachable from a workflow; 33 run nowhere.** The 20 is not a count of
literal filenames: most gates invoke `npx playwright test <substring>`, so coverage has to be
resolved by matching each workflow's positional patterns against real filenames. Counting
`playwright/tests/*.spec.ts` mentions alone gives a different (wrong) answer.

The 33 split by age into two very different groups, and the second is the alarming one:
**25 were last touched in a single Aug-5 sweep**, but **8 are from this week's lanes**
(Aug 11–15: `offering-card`, `seam-cross-console`, `security-regression`, `travel-surcharge-step`,
`service-display-options`, `booking-payment-isolation`, `ea-console-pages`,
`expert-application-mobile`, `expert-booking-decline-dialog`). Specs are still being written
ungated *today* — the rot mechanism the last lane fixed is still running.

### Three harness facts a runner MUST satisfy — each one faked a failure before it was found

These are the reason a naive `npx playwright test <file>` sweep produces a damning and false
report. All three were discovered by disbelieving a red result:

1. **`DATABASE_URL`** — 7 specs shell out to `psql`; without it their helper throws on the first
   call. `booking-payment-isolation` "failed" this way and passes cleanly once set.
2. **`PW_AUTH_SETUP=1`** — `playwright.config.ts` gates `globalSetup` on it, so without it the
   saved auth states are never written and the specs that load them die on `ENOENT`
   (`ea-console-pages`, `expert-application-mobile`, `rbac-security`, `auth-form-validation`).
   Only 4 of the repo's workflows set it.
3. **A timeout that fits the bench, not the default.** This sandbox's Vite dev server takes
   **~25 s** to serve a heavy authenticated route's module graph — measured, and identical warm
   and cold — while the APIs those pages call answer in **under 60 ms**. It is the dev module
   waterfall, not the product and not the database. Playwright's 30 s default therefore indicts
   slow pages instead of broken ones: every `page.goto` timeout in a default-timeout sweep is
   **unproven, not condemned**. Re-run at `--timeout=120000` before believing any of them.

4. **`/api/ready` must return HTTP 200 — and it does not merely because the server works.** With
   `PW_AUTH_SETUP=1`, `global-setup` probes readiness and, in CI mode, **throws** on anything less,
   which fails *every spec in the run* before a single test executes — a total-wipeout signature
   (24/24 `NO-SUMMARY`) that looks nothing like spec rot and must not be read as it. The body said
   `"ready":true` the whole time; the **HTTP status** was 503 because two health checks are graded
   `fail` when their env is absent: `XAI_API_KEY` and `STRIPE_WEBHOOK_SECRET`. Stub values for both
   (plus `E2E_AI_STUB=1`) turn the probe green. Note the asymmetry that makes this easy to
   misdiagnose: a missing `ANTHROPIC_API_KEY` or `RESEND_API_KEY` is only a `warn` and costs
   nothing.

Also: `ci-provider@traveloure.test` (used by `travel-surcharge-step`) exists only after
`scripts/seed-ci-test-users.ts` runs. Absent that, the spec is unrunnable for a reason that has
nothing to do with the spec.

**The meta-lesson, since it cost four passes:** every one of these produced a confident red result
that was entirely my harness. A spec that has never run in CI has *no* established baseline, so
the first red is worth nothing until the runner itself is proven — and the cheapest proof is a
spec you already know passes. Budget for the harness, not just the sweep.

### Confirmed defects in the specs themselves

- **`concierge-phase-a` — deterministic, has never worked.** Its `sql()` helper runs
  `INSERT … RETURNING id` through `psql -t -A`, which prints the returned uuid *and* the command
  tag, so the helper hands back `"<uuid>\nINSERT 0 1"` and the very next
  `expect(tempId).toMatch(/^[0-9a-f-]{36}$/i)` fails. Nothing environmental about it — it would
  fail identically in CI on the day it was written. 5 of its 6 tests pass; this one never could.
  Fix is one line in the helper (take the first line / strip the command tag), and the same
  helper shape is copied into several other specs — worth fixing at the pattern, not the instance.

### Verdicts

Being finalised by the re-run at realistic timeouts (`audit-pass3`); the table lands in the next
commit rather than being guessed at here. What is already settled: **5 specs are fully green**
(`auth-form-validation` 23/23, `booking-payment-isolation`, `executive-card-expand`,
`experts-flow` 10/10, `navbar-responsive` 16/16) — these are real, unclaimed coverage that should
simply be gated.
