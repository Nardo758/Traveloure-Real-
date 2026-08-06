# Provider Console Audit — Use-and-Trace

**Lane:** `lane/provider-console-audit` (single dispatch; supersedes the provider-sigma / UX-walkthrough split).
**audited@`9382d50`** (main at run start, Aug 6 2026; PR #436). Main did not move during the run.
**Method:** drove the provider console as a first-time Kyoto provider in a hermetic sandbox, and chased every on-screen
problem to root cause — file:line in code plus row-level truth in the dev DB — in the same finding.
**Status:** complete. **HARD STOP** — findings only, no fixes, no pins built, no follow-on phases self-dispatched.

## Environment

Local Postgres 16, fresh `traveloure_audit` DB, all migrations applied at boot (253 tables), dev server at `9382d50`,
stub `sk_test` Stripe key, `RESEND_API_KEY` unset (all sends intercepted and logged). Accounts:
`console-audit-1@traveloure.test` (walked provider), `console-audit-logout@traveloure.test` (logout probe).
Bench fixtures (`kyoto-*`, `{market}-{specialty}`) were never touched. Two pieces of documented fixture surgery on my
**own** sandbox account: role elevated to `service_provider` (the KYC/Stripe-Identity path is not executable hermetically),
and two probe services created to test price validation. No cross-provider writes were performed at any point.

**Env-limited (explicitly not graded):** Stripe Connect onboarding, real payout execution, the PaymentElement leg,
Stripe Identity / Persona KYB.

---

## Findings

Severity by the dispatch test: would this cause a real Kyoto provider to **lose money, lose work, or quit?**

### P0

| id | type | MONEY | surface | evidence | description |
|---|---|---|---|---|---|
| **C1** | LOGIC | **MONEY** | Checkout / cart / booking row | code: `server/routes/payments.routes.ts:307` (traveler side), `:878-889` (provider side), `:961-964` (row write), `server/routes.ts:5481` (cart quote) · DB: observed row `total_amount=80.00, platform_fee=20.00, provider_earnings=60.00`; cart rendered "Subtotal $80.00 / Platform fee $20.00 / **Total $100.00**" · screenshot `p2-12-checkout-attempt.png` (Pass-2 asset) | **The platform fee is applied twice from one computed number, and the booking row under-records platform revenue by 2×.** The same `price × (1 − expertShareRate)` = $20 is **added to the traveler's total** (`:307` `total = subtotal + platformFee + conciergeFee` → $100 charged) **and deducted from the provider's base** (`:879` `basePlatformFeeAmt = price − baseExpertEarningsAmt` → provider credited $60 of $80). Net on one $80 service: **traveler pays $100, provider receives $60, platform retains $40 (40% of collected funds) — but `service_bookings.platform_fee` stores $20.** No column anywhere holds the traveler-facing $100; `total_amount` is the provider's gross. Every ledger, report, payout reconciliation and admin revenue view that reads `platform_fee` under-reports platform take by exactly half. Confirmed systematic, not a one-off: the claim re-drive at `:559-561` recomputes the same $100 from the stored parts. |
| **C2** | LOGIC | **MONEY** | Commission band resolution | code: `server/services/commission.ts:539-550` (provider dispatch), `:215-221` (`decideBandKey`), `:398-414` (`isEarlyAdopterProvider`), `shared/roles.ts:26` · DB: `fee_bands` holds **`beta_flat` percent `0.1000` active=true** and `expert_standard` percent `0.2500` active=true; observed provider booking charged **0.25** | **A provider service was charged the EXPERT band, not the configured provider band.** `fee_bands.beta_flat` (0.10 → provider keeps **90%**) exists and is active — it is the band the provider dispatch path selects (`commission.ts:543`, `bandKey = earlyAdopter ? "beta_flat" : "expert_standard"`). The observed booking, whose service owner had role `service_provider`, was nonetheless split at `expert_standard` 0.25 (provider kept **75%**). On an $80 booking that is **$12 of provider earnings** resolved against the wrong band. **Open determination (see Q9):** whether the provider branch was not entered at all (role-matching / `isProviderService` gate at `payments.routes.ts:859-869`) or was entered and `isEarlyAdopterProvider` returned false — I did not isolate which, and am not asserting one. Either way the outcome is proven divergent: configured provider band 0.10, charged 0.25. |
| **C3** | LOGIC | — | Service create/update (price) | code: `shared/schema.ts:611` (column, nullable, no CHECK), `shared/schema.ts:1539` (`insertProviderServiceSchema` — `approvalStatus` not omitted, **no price constraint**), `server/routes.ts:2078` (the only parse gate), `client/src/components/ServiceForm.tsx:687,708` (submit, no check) · DB: `console-audit negative price probe → price = -50.00`, `console-audit zero price probe → price = 0.00`, both **HTTP 201**, both `status='active'` | **A negative or zero price persists through every layer.** Re-verified at head via the API on my own account: `POST /api/provider/services` with `price:"-50"` returned **201** and stored `-50.00`. `min="0"` on the client input is a browser hint only and permits `0`. Pass-1's screen-level claim is confirmed and root-caused: there is no positivity validation at the column, the zod schema, the route, or the form. |

### P1

| id | type | MONEY | surface | evidence | description |
|---|---|---|---|---|---|
| **C4** | LOGIC | — | Session / logout | code: `server/replit_integrations/auth/replitAuth.ts:130-133` (early return), `:202-209` (`GET /api/logout`, registered **after** it), `client/src/hooks/use-auth.ts:20-21` (client navigates to `GET /api/logout`), `server/replit_integrations/auth/emailAuth.ts:531` (working `POST /api/auth/logout`) · live: server log `[Auth] REPL_ID not set — skipping Replit OIDC strategy`; `GET /api/auth/user` → **200 after clicking Logout**; browser left at `/api/logout` · screenshot `ca-03-after-logout.png` | **Logout is a no-op in every non-Replit environment — root cause found.** `setupAuth` early-returns when `REPL_ID` is unset (`:130-133`); `GET /api/logout` is registered **below** that return (`:202`), so off-Replit it is never registered at all. The client's only logout affordance navigates to exactly that unregistered route, so the session survives — proven by `/api/auth/user` returning 200 immediately after. A working `POST /api/auth/logout` exists (`emailAuth.ts:531`) and is registered unconditionally, but **nothing calls it**. This is the same bug class as documented fix #133 (passport serializers were moved *above* the early return for this exact reason); the logout route was left below it. **Severity note, stated honestly:** Replit production sets `REPL_ID`, so prod logout likely works — the breakage is dev, CI, and any non-Replit deploy. Graded P1 rather than P0 for that reason; it becomes P0 the moment the platform runs anywhere else. |
| **C5** | WORKFLOW | — | Application → status | code: `server/routes.ts:1834-1853` (POST handler; **no email call**), `client/src/pages/services-provider.tsx:231` (toast promises "We'll review your registration and follow up by email"), `:236` (post-submit redirect), `client/src/pages/provider/settings.tsx:203` (the one inbound link) · live: server log shows **no application email attempt**; a pending applicant holds role `user`, and `/provider/*` returns "Access Denied" | **The applied-state surface is unreachable by the only people who need it, and the email it promises is never sent.** Two links to `/provider-status` exist — the post-submit redirect and a link on `/provider/settings`. But `/provider/settings` lives *inside the provider console*, which a pending applicant cannot open (role is still `user` until approval → "Access Denied"). So for the entire review window the applicant has exactly one, one-time door. **Partial refutation of Pass-1 B2:** a second link does exist; it is simply behind the wall. The submit-email promise at `services-provider.tsx:231` is backed by no send — the handler and `storage.createServiceProviderForm` (`storage.ts:1127-1139`) are a pure insert. |
| **C6** | WORKFLOW | — | Duplicate application | code: `server/routes.ts:1840` (400 `"You already have an application submitted"`) · live (Pass 2, unchanged at head): the wizard renders empty and fully re-fillable for an already-applied user, rejecting only at final submit with the raw JSON body | A user who already applied gets no "you've applied" state — they can refill all four steps before a raw-JSON 400. Compounds C5: this is the most likely path a waiting provider takes when looking for their application. |
| **C7** | LOGIC | — | Provider API surface | code: `server/routes.ts:597-606` (prefix-match backstop), `:581-596` (the allowlists), vs admin's mount guard `app.use("/api/admin", adminApiGuard)` at `:507` | **Provider protection is a prefix allowlist, not a mount guard — so a newly added `/api/provider/*` route is unguarded by default.** Only `/verification-status`, `/request-verification-review`, `/dashboard`, `/analytics`, `/earnings` (isProvider) and `/services` (isEarner) are listed. `/api/provider/bookings`, `/api/provider/availability*`, `/api/provider/settings`, `/bundles*`, `/properties*`, `/rooms*` rely on `isAuthenticated` + their own internal checks. **No live hole was found** — every `:id` handler I traced verifies ownership (inventory in §A below) — but the default is open rather than closed, which is the structural inverse of the admin fix that CLAUDE.md §2 says must not be reintroduced. |
| **C8** | LOGIC | — | Approval integrity (DB layer) | code: clamp at `server/storage.ts:1186` (create) and `:1230-1233` (update strips `approvalStatus`/`reviewedBy`/`userId`) · DB: **no `provider_services_approval_status_check` constraint exists** (migrations `000`, `011`, `111` add none; compare `110_expert_template_...:76-77` and `121_affiliate_partner_approval.sql:37-38`, which do) · live probe: smuggled `approvalStatus:'approved'` at create → stored `submitted` ✅ | **Born-approved prevention is single-layer (ORM only).** The clamp works — my smuggle probe was correctly downgraded to `submitted`, and `insertProviderServiceSchema` does *not* omit `approvalStatus` (`shared/schema.ts:1539`), so the storage clamp is the only thing standing between a crafted body and an approved listing. There is no DB CHECK and no trigger; any future code path that inserts without going through `createProviderService` has no backstop. This is the ruling-35 / task **#1042** shape — recorded, not fixed. |
| **C9** | WORKFLOW | — | Booking control | code/live: no accept/decline/cancel affordance on any provider surface; Inbox subtitle "Everything that needs your response" over a permanently empty queue (`ca-06-inbox.png`) | **A provider cannot decline a booking.** Confirmed again at head. Per the dispatch's own standard this is P1 on its own: a provider who cannot say no will say it off-platform. → **Q6**. |
| **C10** | LOGIC | — | Provider emails | code: `server/services/email.service.ts` — `sendBookingAlertEmail:258`; call sites `server/routes/payments.routes.ts:470` (post-auth ✅), `server/services/booking.service.ts:812` (post-confirm ✅), **`server/services/booking.service.ts:518` (fires on booking-request submission, pre-payment)**, `server/routes.ts:1480` | **The #433 "email only after authorization" posture holds on the checkout paths but not universally.** The request-submission path at `booking.service.ts:518` emails the provider a booking alert before any payment authorization. Whether that is intended for the request/quote flow is a ruling question (**Q10**), but the invariant as written is not uniformly true. |

### P2

| id | type | surface | evidence | description |
|---|---|---|---|---|
| **C11** | LOGIC | Money station | `client/src/pages/provider/earnings.tsx:165,173` (`effectiveRate` fallback `0.30`), `:322,:329,:373-379` (render) · live `ca-05-money.png`: zero-data station shows "**You 30%**" | The zero-data Money station fabricates a **70/30** split. It is not merely wrong-by-default, it is *stale*: `0.30` mirrors the retired `experience_cart_checkout` display literal, while the rate actually applied is 0.25 (and the configured provider band is 0.10, per C2). A provider's first look at Money shows the worst of three numbers, none of them theirs. |
| **C12** | WORKFLOW | Money station | live `p2-28-money-with-earnings.png` (Pass-2 asset, ledger $60 releasable + $45 held) | Four panels, four balances, one ledger: top cards ($0.00 / $60.00 / $0.00), Payout ("Available Balance $0.00" with **Request Payout disabled**), Revenue Share ($120.00 "Your Share"), Earnings Ledger ("Available to pay out $60.00 / Total earned $105.00"). Compounded by C1: none of them can show the traveler-side $20, because the station computes against `total_amount` (provider gross), so the rate it displays is structurally incapable of revealing the real 40% take. → **Q7**. |
| **C13** | WORKFLOW | Calendar / Customers | live (Pass 2) `p2-19-calendar-after-sweep.png`, `p2-27-customers-with-booking.png` | TTL-voided (`status='expired'`) checkout claims release slot *capacity* correctly but leave their calendar event chips behind and still count in Customers ("2 bookings · $160 booked value", a "Repeat" badge) and Revenue Share gross — off one real booking. → **Q8**. |
| **C14** | WORKFLOW | Service form | live (Pass 1/2, unchanged at head) | No unsaved-work guard: a filled service form plus one sidebar click loses everything silently, against the expert workspace's three-layer precedent. |
| **C15** | WORKFLOW | Wizard persistence | code: `client/src/lib/application-draft.ts:22-49` (**sessionStorage**), call sites `client/src/pages/services-provider.tsx:244` (401 during submit) and `:258` (`promptSignInToSubmit`) only; copy at `:355` · live at head: reload → business-name field empty, only `guestTrips` in localStorage (`ca-02-wizard-after-reload.png`) | **Pass-1 B3 refined, not simply confirmed.** A draft write *does* exist — but it fires only when the user routes through the sign-in flow, is sessionStorage (dies with the tab), and there is no on-step-change or on-field-change write. So "everything you enter is saved" (`:355`) is true across the sign-in redirect and false for refresh, tab close, or navigate-away. |

### FEATURE (capability gaps found through use — scope inputs, not bugs)

| id | surface | evidence | one-line proposal |
|---|---|---|---|
| **C16** | Market constraint | expert analog at `server/routes/expert-workspace.routes.ts:405-407` (`isLaunchMarket` + migration-149 DB CHECK); grep for `isLaunchMarket`/`LAUNCH_MARKETS` in `server/routes.ts` → **no matches**; no market gate in `server/routes/provider.routes.ts` | Provider service creation has **no Kyoto/launch-market gate** — neither application guard nor DB CHECK, where the expert store lane has both; decide whether the wedge constraint should apply to supply. |
| **C17** | Dual-rate model | `server/routes/payments.routes.ts:575-596` (ref resolved), `:967-968` (stamped) with the explicit comment at `:575-578`: *"Analytics dimension only: never read into any fee/amount/payout decision"*; `ResolveOptions` (`commission.ts:168-181`) has no acquisition field | The attributed-short-link **rails rate does not exist in code** — a link-sourced booking is charged byte-identically to a direct one. Spec-ahead-of-code; recorded, not built. |
| **C18** | Availability | live: only one-off dated slots | No weekly recurring schedule, blackout dates, preferred slots, or peak/off-peak pricing — a provider lists every working day by hand. |
| **C19** | Photos | `client/src/components/ServiceForm.tsx` (Cover Photo URL / Gallery Images as URL text inputs) | Photos are URL-paste only; real providers have files, not hosted URLs. |
| **C20** | Booking detail | live `p2-24-inbox-history.png` | No booking detail view: the fullest surface is an inert History card that shows the **request** date but never the service date/time or party size. |
| **C21** | Ownership helper | `server/middleware/ownershipGuard.ts:17` exists; **zero provider call-sites** — ~24 bespoke inline `!== userId` comparisons instead (inventory in §A) | A canonical `requireOwnership` exists but no provider route uses it; consolidation is a hardening opportunity, inventory only per dispatch. |

---

## §A — Access & isolation (trace-only, no writes attempted)

**Gates.** `isProvider` `server/middleware/role-rbac.ts:79-97` (DB role lookup, never trusts session claims); `isEarner` `:53-71`; a local `requireProviderRole` `server/routes/provider.routes.ts:41-56`. Backstop is the prefix matcher at `server/routes.ts:597-606` — see **C7**.

**Booking-scoped visibility: CORRECT.** `GET /api/provider/bookings` (`server/routes.ts:4383-4387`) → `storage.getServiceBookings({providerId: userId})` → `WHERE service_bookings.provider_id = <session user>` (`server/storage.ts:1572`). Traveler PII is sanitized (`routes.ts:4390-4402`). Note `getServiceBookings` with an empty filter returns all rows (`storage.ts:1576-1578`) — safe only because every provider call passes `providerId`.

**Cross-provider IDOR: no missing ownership check found.** Every `:id` provider read/act path verifies ownership before returning or acting — services (`routes.ts:2039, 2219, 2333, 4283`), bookings (`:4631, 4693, 4507`), availability (`:6648, 6675, 6692`), bundles/properties/rooms (`provider.routes.ts:302, 392, 616, 654, 676, 737, 784`). Earnings endpoints take no `:id` and filter by session user (`storage.ts:3690`). **Watch-point (not a provider route, not tested):** `POST /api/vendor-availability/:id/book` (`server/routes.ts:6701-6710`) is `isAuthenticated`-only and calls `storage.bookSlot(req.params.id)` with no ownership or relation check — flagged for a follow-up lane, deliberately **not** probed with a write.

**NEVER row: HOLDS both directions.** No provider-facing response carries `routing_status`/`routingStatus` or trip-plan state (provider bookings enrich only with service + sanitized traveler), and no provider endpoint writes a routing transition — the only writer is `server/routes/routing.routes.ts`, trip-owner/assigned-expert gated at `routes.ts:903-913`.

**Email injection: clean.** The only provider-authored field reaching an email body is `serviceName`, escaped via `escHtml` (`email.service.ts:279`, subject `stripCrLf` `:324`). `businessName`/`description` are never interpolated. No injection surface found at head.

## §B — Confirmed-good behaviors (so the picture is honest both ways)

Admin-only approval holds (`server/routes/admin.routes.ts:2459-2465`, `role !== "admin"` → 403; the only writer of `approvalStatus:'approved'` is `storage.approveProviderServiceListing:2992`). The create-time smuggle clamp works (probe → `submitted`). The update path strips the whole review lineage (`storage.ts:1230-1233`). Resubmission after rejection exists (`server/routes.ts:3195-3210`). Duplicated listings are forced back to `submitted` (`storage.ts:1530`). The ruling-38 traveler-facing failure copy is exemplary ("nothing was charged and nothing was booked… your cart is exactly as you left it") and the cart genuinely survived. TTL void releases slot capacity correctly. Login lands on **Today**, no tile-launcher.

---

## Prioritized fix list (findings only — owners and lanes assigned at review)

**P0** — C1 (double-sided fee + 2× under-recorded `platform_fee`) · C2 (provider band 0.10 configured, 0.25 charged) · C3 (negative/zero price persists).
**P1** — C4 (logout no-op off-Replit) · C5 (applied-state unreachable + promised email never sent) · C6 (blind re-apply) · C7 (provider prefix allowlist vs mount guard) · C8 (single-layer approval integrity, #1042) · C9 (no decline) · C10 (booking alert pre-auth on the request path).
**P2** — C11 (fabricated 70/30 zero-state) · C12 (four balances) · C13 (expired-claim pollution) · C14 (no unsaved-work guard) · C15 (persistence promise partly unbacked).
**P3 / FEATURE** — C16–C21.

## Regression-pin proposals (one assertion each; pins built by the lanes that close them)

- **C1** — for a single $80 provider-service checkout, assert `stripe charge total == totalAmount + platformFee` AND that platform retention is recorded once: `collected − providerEarnings == recordedPlatformTake`.
- **C2** — resolve rates for a `service_provider`-owned service and assert the chosen `bandKey` matches the configured provider band (`beta_flat`), not `expert_standard`.
- **C3** — `POST /api/provider/services` with `price <= 0` → 4xx and no row.
- **C4** — authenticated session → the client's actual logout affordance → `GET /api/auth/user` returns 401.
- **C5** — a user with a pending application can reach their application state from an authenticated surface, and re-POST returns a typed 409.
- **C7** — a new `/api/provider/*` route added without an allowlist entry is denied to a non-provider (fixture route in the gate test).
- **C8** — direct DB insert of `approval_status='approved'` is rejected (this pin only becomes possible once the DB layer exists — it *is* #1042's acceptance test).
- **C9/C10/C13** — per the rulings that resolve them.

## Questions for ruling (§-numbered; Q1–Q5 carried from the walkthrough, updated by tracing)

- **Q1 (shell):** nine coded stations (Today · Calendar · Inbox · Workstation | Catalog · Customers · Performance · Money | Settings) vs the six-station decision. Today-landing and no-tile-launcher both hold. Ratify the nine, or remediate? *(Recorded, not graded, per dispatch.)*
- **Q2 (rate copy) — now answerable, and worse than it looked:** `/earn`'s "keep up to 94%" is **computed live** from a band (`client/src/pages/earn.tsx:76-80`), not a literal — so the surface is honest about *a* band while the provider is charged another. With C1+C2 the true provider economics on an $80 sale are: traveler pays $100, provider keeps $60 (60% of collected), against a configured provider band that says 90%. Which number is the promise?
- **Q3 (status-surface home):** fold `/provider-status` into the console and give pending applicants a door (C5/C6)?
- **Q4 (benchmark provenance):** Performance's "Category Average $280 / Top Performers $450" against zero data — real or placeholder?
- **Q5 (attestation scope):** are the wizard's insurance/licence attestations meant to apply to all 60 offering types?
- **Q6 (booking control):** is instant-book with no decline the intended beta model (C9)? If yes, the Inbox's "everything that needs your response" framing must change.
- **Q7 (Money source of truth):** which of the four panels is authoritative (C12) — and given C1, should the station show collected-funds economics rather than provider-gross economics?
- **Q8 (expired-claim hygiene):** exclude `status='expired'` from every provider-facing surface (C13)?
- **Q9 (C2 root cause — needs one determination):** was the provider dispatch branch not entered (role/`isProviderService` gate at `payments.routes.ts:859-869`), or entered with `isEarlyAdopterProvider` false? I proved the divergence but did not isolate the branch, and did not want to assert a mechanism I hadn't verified.
- **Q10 (pre-auth booking email):** is `booking.service.ts:518` emailing the provider on request submission (pre-payment) intended for the request/quote flow, or a #433 violation?

## Narrative — signup to first payout

A Kyoto provider can get in, and the front door is better than it looks: the `/earn` catalogue speaks their language, the wizard is short, approval-to-live is instant, and the storefront and offering pages are the most polished surfaces on the platform. Then the seams open, in a specific order. During the review window the platform effectively forgets them — the one status page is behind a wall they cannot pass, the email it promises is never sent, and the wizard invites them to apply again and refuses in raw JSON (C5, C6). Post-approval the console is genuinely good to *work* in, until money appears. **And the money is where this audit stops being a UX report.** On an $80 booking the traveler is charged $100, the provider is credited $60, and the row records a $20 platform fee — so the platform's own ledger under-states its take by half (C1), while the provider's Money station, computing honestly against the wrong base, reports a 25% fee on a transaction that actually retained 40% (C12). Worse, the provider band configured in `fee_bands` says this provider should keep 90%, not 75% (C2). A provider cannot decline a booking (C9), cannot see when the booking they cannot decline actually happens (C20), and — off Replit — cannot even log out (C4). **They lose patience in the approval window, and they lose money at the first split.** The reconciliation that ends the relationship isn't a UX complaint; it's arithmetic that doesn't close.

---

*Audited read-only against code and the dev DB; every screen claim carries a screenshot, every code claim a file:line, every money or state claim a DB read. No product code was changed in this lane.*
