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
| 12 | **No completion event exists for pdf bookings.** See the P2 entry below. | **OPEN** | P2 below |

**Standing lessons worth carrying forward:** (a) a fix that closes a reported symptom may not close the class — #1 needed a second pass because the first proved the gate *correct* without proving it *reachable*; (b) duplicated branches at two call sites drifted twice, which is why the resolver is now a single shared function; (c) a guard that is not wired into CI is not a guard, and green means green-within-stated-bounds (ruling 57 states its negative space).


## Open — build items

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

**P2 — no completion event exists for artifact (pdf) bookings; the D8 auto-complete rule is
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
a separate pass.

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
