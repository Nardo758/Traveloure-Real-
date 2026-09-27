# Gap register: Supply → Demand, Pass 3 batch 1 — expert lifecycle

**Base SHA:** `280931ddd88b75f01969608a6f73b83f4d176e40` (same merge-base as Pass 2).
**Build SHA:** `3304c1dc03df95b575b1291c84920d19194dfea3` (`dist/build-info.json`, built 2026-09-25T17:36:44Z). No product commit has landed on this branch since, so `reset-db.sh`'s staleness guard passed without a rebuild.
**Final run id:** `p3f2130`. One `npx playwright test -c playwright.supply-demand.config.ts` from a fresh database: **18 passed, 0 failed, 4 skipped** (the same four `HELD` skips as Pass 2: S3 Connect, D2, D4, D6). Supply 7 + demand 5 unchanged from Pass 2; the new `lifecycle` project adds 6 (L1, T1–T5), all green.
**Teardown:** `scripts/e2e/teardown.sh` → "PASS: row counts match baseline exactly" (whole-database, 310 tables; `test-results/teardown-rowcount-diff.txt` empty of differences).
**Environment:** as Pass 2 (local disposable PostgreSQL, Stripe key a CI stub that returns 401, no Unsplash key). Rules R-1…R-4 of the Pass 2 brief apply unchanged.

**Specs added:** `e2e/supply-demand/p3-expert-lifecycle.spec.ts` (L1) and `e2e/supply-demand/p3-expert-tier1.spec.ts` (T1–T5), with `e2e/supply-demand/lib/p3.ts` for evidence. They run as a third Playwright project, `lifecycle`, which depends on `supply` only (it reads Expert E and his offering from the shared state file). It deliberately does not depend on `demand`, because a failed dependency skips every dependent test.

**Evidence.** Everything is under `$P2/../pass3/`: `shots/`, `net/<journey>-p3f2130.jsonl`, `db/<journey>-<nn>.txt` (before/after SELECT per step) and `findings.jsonl`. It is mirrored to `test-results/supply-demand/pass3/` for CI. Selected frames are copied to `docs/audits/pass3/img/`. Finding ids are slugged (`P3-<journey>-<SLUG>`) and never counter-numbered, so the Pass 2 id collision cannot recur.

Severity and class definitions are the Pass 2 register's (`docs/audits/pass2/GAP_REGISTER_PASS2.md`). **Behavioural** means observed in run `p3f2130`, with a screenshot, net log and DB diff. **Static** means a code reading only.

---

## A. The lifecycle as driven (L1) and what each side saw

Traveler `e2e-p3f2130-tlife` (fresh signup) created a Kyoto plan through the one planning modal ("Build it myself"). Expert E comes from S2.

| # | step (UI control) | DB state asserted | traveler sees | expert sees |
|---|---|---|---|---|
| 1 | hire: `slip-action-hire-expert` → `hire-expert-option-<E>` → `button-hire-expert-submit` | `trip_expert_advisors` row born, `status='pending'`; `POST /api/trips/:tripId/advisors` 2xx | the Expert card on the slip rail | `booking_request` notification "New trip request"; an invite card with **Accept only** (`L1-03`) |
| 2 | accept: `button-accept-assignment-<tripId>` (queue) | `pending → accepted`, `workspace_status` draft | — | the trip opens in the Workstation |
| 3 | 2 × suggest (Distribute → Suggest to client) | 2 `trip_suggestions` rows, `pending` | 2 `itinerary_update` notifications; the Expert Suggestions panel | "Suggestion sent!" |
| 4 | traveler declines one (`button-reject-suggestion-<id>` → note → `button-confirm-reject`), approves the other (`button-approve-suggestion-<id>`) | `rejected` + `rejection_note`; `approved` + one `itinerary_items` row with `origin='expert'`; the rejected one never becomes an item | the item with a **FROM YOUR EXPERT** chip (`badge-origin-<id>`) — PASS | **no notification**; the decisions are visible only in the suggestion log inside the Suggest panel (`P3-L1-NO-SUGGESTION-VERDICT-NOTICE`) |
| 5 | deliver: `button-send-edits` ×2 | `workspace_status` draft → in_review → delivered | "ready for review", then "delivered" notifications; the review banner (`L1-10`) | Draft › Client review › **Delivered** chips |
| 6 | "Request changes" + note (`button-request-changes-<tripId>` → `button-submit-request-changes-<tripId>`) | `workspace_status → draft`, `plan_approval_status='changes_requested'`, `plan_review_note` = the note | the banner disappears | "Changes requested" notification; `text-plan-changes-requested-note` shows the note (`L1-12`) |
| 7 | re-deliver: `button-send-edits` ×2 | `workspace_status` → delivered again; **`plan_approval_status` still `changes_requested`** | **no banner and no Approve control** (`L1-14`) | still shows the OLD "Client requested changes" note beside **Delivered** |
| 8 | approve | **not driveable** — see `P3-L1-REDELIVERY-UNAPPROVABLE` (the harness sends no API shortcut) | — | — |
| 9 | finalize: `slip-action-finalize-plan` | `trips.finalized_at` set; `trip_finals` v1 | `trip_card_ready` notification; the Trip Card | **nothing changes**: the Workstation says Delivered with the stale note; the Assigned Trips card reads "Active · 2 sent"; no notification (`L1-18`, `L1-19`) |

---

## B. Open gaps (behavioural unless marked static)

| id | class | sev | KNOWN | title | expected | actual | where | evidence |
|---|---|---|---|---|---|---|---|---|
| `P3-L1-REDELIVERY-UNAPPROVABLE` | DEAD_TRIGGER | **P1** | — | After "Request changes", a re-delivered plan can never be approved from the UI | `booking-actions.ts:1503`: request_changes "send[s] the expert back to work; re-delivery re-runs this handshake". The traveler should be offered Approve / Request changes again. | After re-delivery the row reads `workspace_status=delivered`, `plan_approval_status=changes_requested`. `PlanApprovalBanner.tsx:146` returns null whenever `planApproval.status != null`. The workspace-status advance (`booking-actions.ts:1347-1450` → `storage.updateExpertAssignmentWorkspaceStatus`) never clears `plan_approval_status`. Result: no banner, no Approve, and "Approve & book N items" (LD 52 A) is unreachable for that plan for good. The expert's Workstation keeps showing the old change note beside "Delivered". Static reading: the server rail would accept an approve, because `POST /api/trips/:id/plan-review` keys on `workspace_status='delivered'` only (`:1487-1491`), so the block is entirely the client gate. Graded P1 because the approval record is never created. | `client/src/components/plancard/PlanApprovalBanner.tsx:146`; `server/routes/booking-actions.ts:1347-1450`; `server/services/trip-plan.service.ts:433-452` | `img/L1-10-…` (first delivery: banner present) vs `img/L1-14-…` (re-delivery: absent); `db/L1-13.txt` |
| `P3-T2-QUOTE-INVISIBLE-WITHOUT-BOOKINGS` | INVISIBLE_RESULT | **P1** | — | A traveler with no bookings cannot see or accept an issued quote | LD 49: the traveler's Quotes tab on `/my-bookings` shows the quoted price with its Accept control. `TravelerQuotesPanel` is its only mount. | The `service_quotes` row is `quoted` (42000 cents), and the traveler's own `GET /api/me/quotes` returns `lifecycle=quoted`. But `/my-bookings` renders "No bookings yet": `my-bookings.tsx:424` replaces the whole Tabs block (Quotes tab included) with the empty state when bookings and ready-made purchases are both empty. A first-time buyer whose first purchase would be this quote never sees it. Once the same traveler has any booking (after T3), the Quotes tab appears (`img/T3-03b`). Graded P1 because the quote-born booking can never be created by that traveler through the UI. | `client/src/pages/my-bookings.tsx:424` vs `:463-466`, `:507` | `img/T2-04t-traveler-my-bookings-while-quoted.jpg`; `net/T2-p3f2130.jsonl` |
| `P3-L1-NO-DECLINE` | DEAD_TRIGGER | P2 | — | (a) An expert cannot decline a hire | `server/utils/trip-advisor-status.ts:43`: "`rejected` is reachable only by the expert's decline". A pending invitation should offer a decline. | Both mounts of the pending assignment (the Queue invite card and the Assigned Trips card) render exactly one button, `[Accept]`. No route under `server/` writes `trip_expert_advisors.status='rejected'`; only `POST /api/expert/assignments/:id/accept` exists (`booking-actions.ts:1329`). An unwanted hire stays `pending` indefinitely, and the traveler's slip keeps showing the expert as advising. | `client/src/pages/expert/inbox.tsx` (AssignmentInvitesSection ~345-400, AssignmentsSection ~1374-1470) | `img/L1-03-expert-inbox-invite.jpg` |
| `P3-L1-NO-SUGGESTION-VERDICT-NOTICE` | INVISIBLE_RESULT | P2 | — | (b) The expert is not notified when the traveler approves or declines a suggestion | Symmetry with the rest of the loop: a suggestion create notifies the traveler (`booking-actions.ts:1113-1123`), and a plan-review decision notifies the expert (`:1544-1557`). | 0 `notifications` rows for the expert across both decisions (before/after read). `PATCH /api/trips/:id/suggestions/:suggestionId` (`:1171-1270`) writes none on either branch. The only trace is the suggestion log inside the Workstation's Suggest panel, which shows the decline note correctly. | `server/routes/booking-actions.ts:1171-1270` | `db/L1-06.txt`; `img/L1-07-…` |
| `P3-L1-EXPERT-BLIND-TO-FINALIZE` | INVISIBLE_RESULT | P2 | — | (d) The expert UI never shows that the traveler finalized | The advising expert learns that the plan is final (Trip Card v1). | `trips.finalized_at` is set and `trip_finals` has v1. The expert's notifications for the whole journey are only "New trip request" and "Changes requested". The Assigned Trips card reads "Kyoto trip · Active · 2 sent …". The Workstation reads "Delivered", with no final or Trip Card wording. `POST /api/trips/:tripId/finalize` notifies only `trips.user_id` (`routing.routes.ts:343-370`), and no expert surface reads `finalized_at`. | `server/routes/routing.routes.ts:301-392` | `img/L1-18-…`, `img/L1-19-…`; `db/L1-16.txt` |
| `P3-T3-DECLARED-VANISHES-FROM-SELLER` | INVISIBLE_RESULT | P2 | — | Once declared complete, the booking disappears from the expert's Inbox | `SellerCompletionPanel` (mounted in `HistorySection`) draws "You marked this done on … The traveler's review window closes …" for a `completion_declared` row (LD 47 surfaces). | After the declare and a reload: History reads "No booking history yet" while the Total tile says 1. `HistorySection` filters by `isHistoryBooking` = RECORD ∪ CLOSED (`shared/booking-visibility.ts:63-68, 117-120`), and neither list contains `completion_declared` (nor `awaiting_acceptance` or `partially_completed`). The panel's declared/window read-out is therefore unreachable on the expert inbox. The toast at the moment of the click is the only confirmation. Static: the provider inbox uses the same predicate. | `shared/booking-visibility.ts:63-68,117-120`; `client/src/pages/expert/inbox.tsx:1153,1260` | `img/T3-02-…` (toast), `img/T3-02b-expert-history-after-reload.jpg` |
| `P3-T3-TRAVELER-COMPLETED-TAB` | SPEC_DIVERGENCE | P2 | — | My Bookings files a `completion_declared` booking under "Completed" | LD 47: "'Completed' is never rendered before the window closes." | Tabs read "All (1) · Pending (0) · Active (0) · **Completed (1)**". The card inside correctly reads "Completion Declared … Your review window closes Oct 2". `my-bookings.tsx:405-407` puts every status outside `['pending','payment_pending']` and `['confirmed','in_progress']` into Completed. | `client/src/pages/my-bookings.tsx:168-170, 399-407` | `img/T3-03b-traveler-completed-tab.jpg` |
| `P3-T1-HANDLE-HIDES-PROFILE` | INVISIBLE_RESULT | P2 | — | Claiming a handle before any listing is approved takes an approved expert's public profile offline | The card promises "One public link that lists your approved offerings" and offers Open/Copy. Claiming it should not leave the expert less visible, or the card should say that the link stays dark until an offering is approved (§13). | New approved expert, 0 approved listings. `GET /api/storefront/by-id/<id>` returns 200 before the claim and 404 after it. `GET /api/storefront/<handle>` returns 404, and `/s/<handle>` renders "Storefront not found … no bookable offerings yet". Cause: `loadStorefrontById` waives the inventory gate only while `users.handle IS NULL` (`storefront.routes.ts:970`), so the claim itself removes the waiver. | `server/routes/storefront.routes.ts:600-620, 964-971`; `client/src/components/backoffice/handle-claim-card.tsx:85-160` | `img/T1-02-…`, `img/T1-03-public-storefront.jpg`; `net/T1-p3f2130.jsonl` |
| `P3-L1-ONE-NOTIFICATION-TYPE` | SPEC_DIVERGENCE | P3 | — | (c) Lifecycle notifications share one type | Distinct events carry distinct types, so preference keys and push routing (LD 53, one type→key table) can tell them apart. | 7 of the journey's 9 notifications are `itinerary_update`, covering four distinct events: new suggestion, sent for review, delivered, changes requested. The others are `booking_request` (the hire) and `trip_card_ready` (finalize). "Plan approved" would also be `itinerary_update` (static, `:1544`). | `server/routes/booking-actions.ts:1113, 1392, 1544` | `findings.jsonl` (full list) |
| `P3-L1-EXPERT-REQUEST-COMPLETE-NO-CALLER` | DEAD_TRIGGER | P3 | — | (e) `PATCH /api/expert-requests/:id/complete` has no client caller — **static** | A mounted mutation route has a UI trigger or is deleted (§18c). | A grep over `client/src` finds no caller. The server's own comment says so (`booking-actions.ts:1427`, "had zero callers"), and paid requests are completed from the delivered transition instead (`:1419-1437`). The route stays mounted and reachable by a crafted request. | `server/routes/booking-actions.ts:429-434` | static (behavioural: false) |

### Passes recorded (the rows this batch drives, no defect found)

| id | what | evidence |
|---|---|---|
| `P3-L1-ORIGIN-CHIP` | An approved suggestion's item is `origin='expert'` and wears the "from your expert" chip (LD 42 D23). | `img/L1-07-…`, `db/L1-06i.txt` |
| `P3-T1-CLAIM-HANDLE` | HandleClaimCard (`input-handle` + `button-save-handle`) → `PATCH /api/me/handle` 2xx, `users.handle` written, and the card shows `/s/<handle>`. | `img/T1-02-…`, `db/T1-02.txt` |
| `P3-T2-WITHDRAW-QUOTE` | Request (traveler, `button-request-to-book` on a custom-quote listing) → issue 420 (expert) → withdraw: `service_quotes` requested → quoted → **withdrawn**, `withdrawn_at` set. The seller badge reads "Withdrawn" and the control is gone. The traveler's own read reports `withdrawn`. | `img/T2-04-…`, `img/T2-05-…`, `db/T2-05.txt` |
| `P3-T3-DECLARE-COMPLETE` | `button-declare-complete-<id>` → `confirmed → completion_declared`, `completion_declared_at` set, `completionDeclaration.fallback = owner_declared_no_service_date`, `disputeBy` +7 days. No `expert_earnings` row is minted (LD 47). | `img/T3-02-…`, `db/T3-01.txt` |
| `P3-T4-CONFIRM-DECLINE` | Decline dialog with a reason → `pending → cancelled`, `cancellation_reason` and `cancelled_at` set. The row leaves the Queue. The traveler sees the reason on My Bookings and gets a `booking_cancelled` notification. | `img/T4-02-…`, `img/T4-04-…`, `db/T4-01.txt` |
| `P3-T5-CLAIM-POOLED` | The traveler's 12Go agent request on `/transportation` is born unclaimed (`expert_id NULL`, LD 44). `button-claim-<id>` stamps `expert_id` to the session expert and the badge reads "Claimed by you". A second expert (`ci-expert`) no longer sees the row. | `img/T5-02-…`, `img/T5-03-…`, `db/T5-02.txt` |

---

## C. Seeded steps (R-1)

| step | write | why seeded | reason |
|---|---|---|---|
| `P3-T3-SEEDED-CONFIRMED-BOOKING` | `INSERT service_bookings (status='confirmed', stripe_payment_intent_id=NULL, no slot, no scheduledDate)` on Expert E's in-person offering. `platform_fee`/`provider_earnings` come from the `fee_bands` `moderate` row read at test time (R-2). | No UI births a confirmed booking without a PaymentIntent. | `HELD:stripe`. Per §19b, the drift job would flag the row `payment_provenance_unverified` (the honest state). |
| `P3-T4-SEEDED-PENDING-BOOKING` | `INSERT service_bookings (status='pending', stripe_payment_intent_id=NULL)` — the exact shape `POST /api/expert-booking-requests` births when given a `serviceId`. | No client caller sends a `serviceId` to that rail (`itinerary.tsx:222`, `itinerary-comparison.tsx:830` and PlanningContext all omit it), so no UI can birth a pending booking request. Static finding (behavioural: false). | no UI path |
| meeting pin for T2's custom-quote listing | `seedMeetingPin` (lat/lng/meeting point) | Same class S1/S2 already filed once per run (map click-to-place is not headless-reliable). Reused, not re-filed. | harness reliability |

Everything else in this batch went through the product UI: both new accounts (a traveler signup; expert H's signup, application and admin approval), the custom-quote listing (wizard → submit → `/admin/service-approvals`), the quote request, the pooled booking-agent request, and every expert and traveler action.

---

## D. Withdrawn after verification (harness, not product)

| candidate | why withdrawn |
|---|---|
| Origin chip reads "FROM YOUR EXPERT", not "from your expert" | CSS `text-transform: uppercase`; `innerText` returns the rendered case. The comparison is now case-insensitive and the result is a PASS. |
| `seedBooking` failing with "inconsistent types deduced for parameter $4" | Harness SQL (an untyped parameter used twice); fixed with `$4::text`. |
| "Storefront 404 after claim ⇒ the handle claim is broken" | The claim works (`users.handle` written, card updated). The 404 is the storefront inventory gate. A before/after `by-id` probe isolates the real, narrower defect, `P3-T1-HANDLE-HIDES-PROFILE`. |
| "Completed (1) ⇒ the declared booking reads completed" (first draft counted the tab label) | The first draft could be satisfied by any other booking the traveler held. It was re-measured by reading the Completed tab's own panel, which lists the `completion_declared` card. The finding stands (`P3-T3-TRAVELER-COMPLETED-TAB`) on that stricter read. |
| Decline notification reads "Your booking  was declined" (missing reference) | `routes.ts:7491` interpolates `trackingNumber`, which every real booking creator sets (`storage.generateTrackingNumber`). Only the harness-seeded row lacks it. |

**Observed, not filed (known):** the per-item "Send to expert" control is still on the slip's item row (`L1-14`), although LD 42 D2 removes it. Ledger `2026-09-24-approve-and-book` already records that it stays until D2's Finalize-side replacement is built.

---

## E. NOT PROVEN

| item | reason |
|---|---|
| Traveler **Approve** on a re-delivered plan (the lifecycle's step 8) and everything downstream of an approved plan ("Approve & book", the expert's "Approved by client" notice) | Blocked by `P3-L1-REDELIVERY-UNAPPROVABLE`. The harness sends no API shortcut. Finalize ran on the unapproved plan. Approve on a **first** delivery was not exercised either (L1 requests changes on the first delivery by design). |
| `expert-inbox:button-accept-booking` | Accepting a `pending` booking with no PaymentIntent is refused by design (`ownerTransitionRefusal … "unpaid"`, `routes.ts`), so a real accept needs a Stripe-paid request: `HELD:stripe`. |
| `expert-readymade:button-withdraw-listing`, `expert-catalog:toggle-service-status` | Not in this batch's five. Still uncovered (see COVERAGE.md). |
| Provider twins of the five rows (`provider-quotes:*`, `provider-completion:*`, `provider-handle:*`, `provider-inbox:*`) | Same shared components (and, for the inbox, the same `isHistoryBooking` predicate), but not driven from the provider console this batch. The T3 vanish finding is static-only for the provider. |
| Connect / payouts / Identity rows (5 expert and provider Tier-1 rows) | `HELD:stripe` (unchanged from Pass 2). |
