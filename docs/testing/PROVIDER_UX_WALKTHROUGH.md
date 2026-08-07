# Provider-UX-Walkthrough — Findings (Pass 1 + Pass 2)

**Lane:** `Provider-UX-Walkthrough` · **Both passes complete.**
**walked@`ba168d0c5039f61cb518bb3ec9e6b51eb96a8ccb`** (main at Pass-1 start, Aug 6 2026 08:04 ET; Pass 2 walked the same
sha the same day). Main moved mid-Pass-1 to `d4f59bb7` (PR #435, reconciliation drift job — server-side money rail only;
no provider-console surface in its diff scope was walked after the move, so every finding is as-of `ba168d0c`.)
**Status:** Pass 1 complete (reviewed); **Pass 2 complete** — dispatched on the decision-maker's explicit unblock
("continue with phase two"), with the sigma Phase 2 Stripe-Connect fixture substituted by a sandbox-constructed
equivalent (see the Pass 2 section's environment note). Stripe-dependent legs are graded only as far as the ruling-38
declared-unavailable contract allows and are explicitly marked env-limited.

## Environment & method (hermetic sandbox)

- Dev-only, fully hermetic: local Postgres 16, fresh DB, all 180+ migrations applied at server boot; `npm run dev` at `ba168d0c`.
- Stripe key = `[REDACTED_STRIPE_TEST_KEY]_stub…` (the CI stub posture). Consequence: Stripe Identity / Stripe Connect calls cannot succeed
  here. Findings on those buttons grade only the **error presentation**, never the failure itself.
- Hermetic email: `RESEND_API_KEY` unset — every send is intercepted as a `[email] … skipping` server-log line. No real sends.
- Accounts created (all prefixed for cleanup, standard test password): `ux-walkthrough-1@traveloure.test` (walked provider,
  admin-approved via override), `ux-walkthrough-2@traveloure.test` (left approval-pending), `ux-walkthrough-admin@traveloure.test`
  (fixture-only: SQL-elevated to admin solely to exercise the approval; admin screens were **not** graded — out of lane scope).
- The startup seeds populate the Kyoto bench fixtures (`kyoto-*@traveloure.test`) even in this sandbox. **They were not touched.**
- Driven with Playwright/Chromium, desktop 1440×900 and phone 390×844. Every finding: screenshot in
  `ux-walkthrough-assets/` + class + severity + description; BROKEN findings carry numbered repro steps.
- Grading order per dispatch: (1) six-station shell decision → (2) commerce wireframes v4 → (3) logistics-integration Part III
  (aspirational; absences vs. it are **inventory**, cross-referenced to sigma §F, not graded).

---

## Findings

Severity test per dispatch: *would this cause a real Kyoto provider to stall or abandon?*

### BROKEN

| id | sev | surface | sha | screenshot | description |
|---|---|---|---|---|---|
| B1 | high | Provider console → sidebar **Logout** | ba168d0c | `p1-54-after-logout.png`, `p1-56-home-after-logout.png` | Logout does not log out. It navigates to `/api/logout`, which renders the SPA 404 ("Lost at Sea?") — and the session survives: navigating back to `/provider/dashboard` re-enters the console fully authenticated. A provider on a shared/borrowed device cannot end their session from the console. (Consistent with the known "dead endpoints return 200-HTML" routing reality — but here it eats a security-relevant control.) |
| B2 | high | Application status page `/provider-status` | ba168d0c | `p1-25-application-status-tracker.png`, `p1-20-after-login.png`, `p1-21-probe-become-provider.png` | The only door to the application-status tracker — which carries the **Verify Owner ID** and **Business Verification** actions the applicant must complete — is the one-time post-submit redirect. No sidebar, dashboard tile, or link anywhere reaches it again. A pending provider who closes the tab loses their KYC steps entirely: their dashboard is the plain traveler dashboard with zero trace of the application, and `/become-provider` shows a **blank wizard** (see B5). Dead end unless the provider guesses the URL. |
| B3 | high | `/become-provider` wizard banner promise | ba168d0c | `p1-12-wizard-step4-review.png` (filled review), `p1-13-wizard-after-reload.png` (after reload) | Banner promises "everything you enter is saved, so you won't lose your progress." False for a page reload: all four completed steps are wiped back to an empty step 1 (nothing in localStorage). The promise holds only for the in-page sign-in modal path. Anyone who refreshes, follows the email-verification link, or loses the tab re-types the entire registration. |
| B4 | med | Service form → Hourly Rate | ba168d0c | `p1-32-negative-rate.png`, `p1-35-save-negative-price.png`, `p1-36-catalog-with-draft.png` | A **negative price survives end to end**: `-50` typed into Hourly Rate → "Save Draft" → success toast → Catalog card renders **"$-50.00 / hr"** on a listing already in `Submitted` state. No client- or server-side rejection was observed at any point. (Whether anything later blocks it is sigma's layer; on-screen, the provider can submit a negative-priced listing for review.) |
| B5 | med | `/become-provider` with an application already filed | ba168d0c | `p1-22-wizard-logged-in-start.png`, `p1-23-after-real-submit.png` | The wizard doesn't know the user already applied. It presents the full empty 4-step wizard, lets them complete everything again, and only rejects at the final Submit — with a raw-JSON toast: `Submission failed {"message":"You already have an application submitted"}` — and still doesn't redirect to `/provider-status`. Combined with B2 this is the pending provider's most likely path: look for their application, find a blank wizard, refill it, get an error. |

**B1 repro:** 1. Sign in as an approved provider → you land on `/provider/dashboard`. 2. Click **Logout** at the bottom of the console sidebar. 3. Observe the 404 "Lost at Sea?" page at URL `/api/logout`, with the logged-in avatar still in the header. 4. Navigate to `/provider/dashboard` — the console opens; you are still signed in.

**B2 repro:** 1. Complete `/become-provider` while signed in and click Submit Registration → redirected to `/provider-status` (tracker with "Verify Owner ID"). 2. Navigate anywhere else (e.g. `/dashboard`). 3. Look for any link back: dashboard sidebar, profile, `/become-provider` — none exists. 4. Only typing `/provider-status` returns you there.

**B3 repro:** 1. Anonymous, open `/become-provider?offeringTypeKey=airport_driver…`. 2. Fill steps 1–3, reach step 4 Review with your data shown. 3. Reload the page. 4. Wizard is empty at step 1; all entries gone.

**B4 repro:** 1. As approved provider: Catalog → Add New Service → pick any offering. 2. Fill required fields; enter `-50` in Hourly Rate ($). 3. Click **Save Draft** → "Draft saved" toast. 4. Return to Catalog: card shows "$-50.00 / hr", badge `Submitted`.

**B5 repro:** 1. Sign in as a user with a pending provider application (e.g. `ux-walkthrough-2`). 2. Open `/become-provider`. 3. Observe the empty wizard (no pending-application notice). 4. Fill all 4 steps, agree to terms, Submit → raw-JSON "already have an application" toast; no redirect to status.

### DIVERGED

| id | sev | surface | sha | screenshot | reference contradicted | description |
|---|---|---|---|---|---|---|
| D1 | med | Console shell (sidebar IA) | ba168d0c | `p1-28-provider-login-landing.png` | Ref #1 (six-station decision) | The coded console is **nine** stations — WORK: Today, Calendar, Inbox, Workstation; BUSINESS: Catalog, Customers, Performance, Money; ACCOUNT: Settings — not the six of Today · Work · Catalog · Calendar · Money · Grow. Conformant where it matters most: login lands on **Today**, and there is no tile-launcher. Whether Workstation+Inbox ≙ "Work" and Customers+Performance ≙ "Grow" is a ruling call → **Q1**. |
| D2 | med | Money station | ba168d0c | `p1-48-station-money.png` vs `p1-03-earn-provider-track.png` | self-contradictory on-screen rate copy | The `/earn` provider pitch says **"keep up to 94%"** (Service Provider track). The provider's own Money station renders a Revenue Share Breakdown of **"Platform 70% | You 30%"**. Recorded verbatim per dispatch §9 discipline — which number is real is sigma's `fee_bands` check; on-screen, the platform promises 94 and shows 30, in that order. |
| D3 | low | Money station label | ba168d0c | `p1-48-station-money.png` | shell decision station naming | Sidebar station is "Money"; the page header renders "Earnings". One station, two names. |

### FRICTION

| id | sev | surface | sha | screenshot | description (what the user expected) |
|---|---|---|---|---|---|
| F1 | high | Wizard step 3 (Details) | ba168d0c | `p1-11-wizard-step3-filled.png`, `p1-11b-wizard-step3-checkboxes.png` | With every visible field filled, **Next stays dead** until BOTH "I have valid business liability insurance" and "I have all required business licenses and permits" are checked — and nothing marks them as required or explains the dead button. Expected: a message naming the blockers. Worse: for a provider who *doesn't* have insurance (a walking guide, a language buddy — the same wizard serves all 60 offerings), the only way forward is a false attestation. |
| F2 | high | Service create/edit form | ba168d0c | `p1-33-service-filled.png` (filled), `p1-34-nav-away.png` (after one click) | **No unsaved-work guard.** A fully filled service form + one click on any sidebar item = instant, silent, total loss (verified: form empty on return). The expert workspace earned a three-layer unsaved-work guard; its absence here is the precedent-cited FRICTION from the dispatch, and it compounds B3's pattern: this product loses provider work silently. |
| F3 | med | Wizard → signup → submit hand-off | ba168d0c | `p1-17-signup-filled.png`, `p1-18-after-create-account.png` | After "Create Account" the auth modal closes back onto the Review step — data intact (good) — but the terms box is unchecked again and nothing says "now click Submit Registration again." A user who assumes account-creation submitted the application walks away with an account and **no application** (exactly what happened to our first scripted run). The registration POST only fires on the second, unprompted Submit click. |
| F4 | med | Wizard step 1 email field | ba168d0c | `p1-06-wizard-step1-junk-email.png` | `not-an-email` in the Email field leaves Next enabled; no inline validation message at any point. Expected: immediate format feedback on a field this load-bearing. |
| F5 | med | Listing status vocabulary | ba168d0c | `p1-35-save-negative-price.png`, `p1-36-catalog-with-draft.png`, `p1-47-station-performance.png` | One brand-new listing is simultaneously: "Draft saved" (toast), **Submitted** (Catalog badge), **Paused** (Catalog toggle), and **draft** (Performance table). Four words for one state; a provider cannot tell what will happen next or whether they must act. |
| F6 | med | Catalog → Add New Service → offering picker | ba168d0c | `p1-30-service-form.png` | Clicking the **Transportation** category tile opens the form with `?category=Transportation %26 Logistics` — but the "What are you offering?" picker still lists **all 60 offerings** (walking guides, chefs, photographers…), unfiltered. Category vocabulary also drifts across surfaces: tile "Transportation" → form "Transportation & Logistics" → wizard "Transportation & Driving". |
| F7 | med | Service form → Neighborhoods | ba168d0c | `p1-31-service-form-fields.png` | The Neighborhoods selector is one flat list of every market on the platform — Bali, Bangkok, Barcelona … Tokyo (20+ cities) — with no filter and no awareness that this provider is in Kyoto. Expected: the provider's market first, the rest collapsed. |
| F8 | low | Wizard step 2 (Service Categories) | ba168d0c | `p1-08-wizard-step2.png` | The banner says "You're applying to offer: Airport Pickup & Drop-off Driver," yet step 2 opens with zero categories pre-selected — the user must find and re-declare "Transportation & Driving" by hand. |
| F9 | low | Wizard step 1 required-field marking | ba168d0c | `p1-05-wizard-step1-empty-next.png` | Only "Website (optional)" is marked; Registration Number and Tax ID *look* required but aren't (Next enables without them), while the actually-required fields carry no mark. The disabled Next never says what's missing. |
| F10 | low | Error toasts (wizard submit, Verify Owner ID) | ba168d0c | `p1-26-verify-owner-id.png`, `p1-23-after-real-submit.png` | Failures surface as raw transport artifacts: `{"message":"You already have an application submitted"}` and `Verification unavailable — 500: {"message":"Invalid JSON received from the Stripe API"}`. (The Stripe failure itself is our stub-key sandbox, not the app — the finding is that raw JSON/status codes reach the provider's eyes.) |
| F11 | low | `/provider-status` timeline | ba168d0c | `p1-25-application-status-tracker.png` | Step 2 "Service Categories — In Progress" sits between two "Done" steps even though the wizard's categories step was completed before submit; unclear what, if anything, the user must do about it. The page also renders inside the **traveler** sidebar shell (PLAN / MARKETPLACE / INBOX), a different world from the console the provider will graduate into. |
| F12 | low | Signup modal inside provider registration | ba168d0c | `p1-16-signup-form.png` | Mid-provider-registration, the account modal pitches "Join Traveloure to start planning your perfect trip." Traveler copy at the supply side's front door. |

### IMPROVE

| id | surface | sha | screenshot | one-line proposal |
|---|---|---|---|---|
| I1 | Service form → Photos | ba168d0c | `p1-31-service-form-fields.png` | Photos are URL-paste only (Cover Photo URL, Gallery Images) — a real provider has files, not hosted URLs; add upload. *(Also inventory → sigma §F.)* |
| I2 | Availability | ba168d0c | `p1-40-slot-added.png`, `p1-41-calendar-station.png` | Only one-off dated slots exist — no weekly recurring schedule, no blackout dates, no preferred slots, no peak/off-peak pricing; a provider lists every workday by hand. *(Inventory vs. spec, → sigma §F — not graded BROKEN per dispatch.)* |
| I3 | Today checklist → "Get approved to sell — in review" | ba168d0c | `p1-57-mobile-today.png` | The checklist row links to `/provider/services`; point it at real application/review status instead (pairs with B2's missing door). |
| I4 | Today checklist → "Share your storefront" | ba168d0c | `p1-57-mobile-today.png`, `p1-53-storefront-unapproved.png` | The share affordance is live while the storefront still 404s ("Storefront not found") pre-approval; disable or explain until the page exists. |

---

## What worked (so the picture is honest in both directions)

- **The console is real and lands right.** Login as an approved provider goes straight to `/provider/dashboard` = **Today**, with a genuinely useful launch checklist ("Open your business, 3 of 5" — it updates live as handle/offering/slot complete). No tile-launcher anywhere. (`p1-28`, `p1-57`)
- **Every station exists and no empty state is blank.** Inbox, Workstation, Customers, Performance, Money, Settings all explain themselves when empty, several with exemplary honesty — Customers: "Booked value is what your customers paid — it is not your earnings. See Money for your ledger." (`p1-44`–`p1-49`)
- **Availability edits reflect instantly** in both the Catalog panel and the Calendar station, and calendar events deep-link to their owning module as the header promises. (`p1-40`–`p1-42`)
- **Edit-while-pending works** (price fixed on a Submitted listing without fuss), and the background-check gate is honest: the publish button becomes "Verification Required" instead of failing later. (`p1-37`, `p1-38`)
- **Cancellation policy defaults are principled:** "Leave unset if you haven't decided — we never show a fabricated default." (`p1-31`)
- **Phone-width (390px) held up on all four screens checked** — no horizontal overflow, working hamburger nav, legible checklist. No catastrophic mobile breakage found. (`p1-57`–`p1-60`)
- **Storefront honesty:** unapproved storefront says so rather than faking a page; the Catalog banner reads "Not live yet — approval pending." (`p1-53`, `p1-59`)

## Narrative summary — would a Kyoto provider make it through?

**Through onboarding: probably, on a good day, in one sitting. Through the waiting period: no.** The funnel's front half is
genuinely inviting — the `/earn` page speaks provider language ("I do this →"), the wizard is short and lets you start
anonymous. But it walks a tightrope: refresh once and everything is gone despite an explicit promise otherwise (B3); reach
step 3 without liability insurance and the Next button just dies with no explanation (F1); and after creating the account,
one un-signposted second Submit click separates "applied" from "silently didn't" (F3). The provider who makes it through
gets one glimpse of a status tracker with their two KYC tasks — and if they close that tab, the platform forgets to their
eyes that they ever applied: traveler dashboard, blank re-fillable wizard, error in raw JSON if they refill it (B2+B5).
**That gap — submit, then days of invisible pending state — is where a real Kyoto provider quits**, and the walkthrough's
own first account did exactly the failure F3 predicts. Post-approval, the story inverts: the console is coherent, lands on
Today, explains its empty states, works on a phone, and gently sequences the launch checklist. The two things that would
next erode a survivor's trust are money copy that promises 94% upstream and shows a 70/30 split in their own ledger (D2),
and the discovery that Logout doesn't log them out (B1).

## Cross-reference block (provider-sigma pairing — one picture, no double-count)

| This lane | Sigma item | Nature of the pairing |
|---|---|---|
| B4 (negative price accepted to Submitted) | sigma money/validation lanes | This lane records the screen fact; sigma owns whether the DB/endpoint actually accepts and persists it and what downstream consumes it. |
| D2 (94% vs 70/30 on-screen) | sigma `fee_bands` verification | Display recorded verbatim here; truth of either number is sigma's. |
| I1, I2, F6 (photos upload absent; availability layers absent; category vocab drift) | **sigma §F inventory** | Absence-vs-spec is inventory, not BROKEN, per dispatch; sigma §F is the ledger. |
| Money station renders a **"Request Payout"** affordance (min $10) while Stripe is unconnected | **sigma §C9** (payout posture) | Recorded as inventory only — behavioral verification is Pass 2 §8 territory, blocked on the fixture. |
| §D11 (shell) | D1 / Q1 | Same object, two lenses. |
| §D12 (email) | Hermetic-email observations below | Event-for-event log for sigma to reconcile. |
| B2/F11 (status page orphaned, traveler shell) | sigma §D lanes (surface honesty) | The pending-state data may be honest at the DB; the human can't reach it. |

**Hermetic email observations (event → intercepted send):**
- Account registration → **welcome email** + **verification email** (both intercepted, per account, at register time).
- Provider application submit → **no email attempt observed**, despite the on-screen promise "We'll review your registration and follow up by email."
- Admin approval → **provider approval email** attempt fires (intercepted).

## Questions for ruling (§-numbered)

- **Q1 (shell conformance):** Is the coded nine-station IA (Today · Calendar · Inbox · Workstation | Catalog · Customers · Performance · Money | Settings) accepted as the six-station decision's realization (Work ≙ Workstation+Inbox, Grow ≙ Customers+Performance), or is D1 a remediation item for back-office Phase 1?
- **Q2 (rate display):** Which is the intended provider-facing number — `/earn`'s "keep up to 94%" or Money's "Platform 70% | You 30%"? (Ground truth → sigma `fee_bands`; this lane only needs to know which copy to grade against next Pass.)
- **Q3 (status-surface home):** Should `/provider-status` fold into the console (Settings already duplicates its Identity/Business/Background tiles in a different shell), with a pending-state door from the traveler dashboard until approval? B2/B5/F11/I3 all collapse into this one ruling.
- **Q4 (benchmark provenance):** Performance's "Category Average $280 / Top Performers $450" render against a zero-data account — live numbers or placeholders? (Screen can't tell; not investigated per no-code-reading rule.)
- **Q5 (attestation scope):** Are the step-3 insurance/licenses attestations intended to be universal across all 60 offering types (F1), or offering-conditional?

---

# Pass 2 — money-path experience (walked Aug 6, 2026, same sha)

## Environment note (what substituted for the sigma fixture)

The sigma Phase 2 fixture does not exist in this sandbox and no real Stripe test key was available. The fixture used
instead: `ux-walkthrough-1` (approved provider) + the `ux-walkthrough Airport Transfer KIX–Kyoto` service **approved and
activated through the real admin UI** (`/admin/service-approvals` — toast: "Service approved · It's now live and
bookable") + the existing Aug-20 slot (capacity 3). Traveler side: a fresh `ux-walkthrough-traveler-1@traveloure.test`
account per the dispatch's open-decision-3 recommendation. Money motion was produced by the **real checkout claim rail**
under the ruling-38 declared-unavailable contract (stub key → claim written, Stripe 503, nothing committed), plus two
pieces of explicit fixture surgery mirroring documented server behavior: one claim promoted to `confirmed` with a
stamped fake PI (§15c money-leg only — so **no app-layer emails/counters fired**; their timing is env-untestable), and
two `provider_earnings` rows seeded to a known state ($60 `releasable` + $45 `held`).
**Env-limited (explicitly NOT graded):** Stripe Connect onboarding, real payout execution, the PaymentElement leg, the
"New Booking Request" email's post-authorization timing (#433), and the marked-row quarantine path of the sweep.

## Pass 2 findings

### BROKEN

| id | sev | surface | sha | screenshot | description |
|---|---|---|---|---|---|
| P2-B1 | high | Money station (`/provider/money`) | ba168d0c | `p2-28-money-with-earnings.png` | Against a known ledger ($60 releasable + $45 held), the page tells **four contradictory stories at once**: top cards "Total Earnings **$0.00** · Pending **$60.00** · Available **$0.00**"; Earnings Ledger "Available to pay out **$60.00** · Held in escrow $45.00 · Total earned **$105.00**"; Revenue Share "Gross $160.00 · Your Share **$120.00**"; Payout panel "Available Balance **$0.00**" with Request Payout disabled — while the ledger on the same screen says $60 is payable. A provider cannot answer "how much money do I have?" — the dispatch's own bar ("money confusion is trust erosion") is not met. |
| P2-B2 | med-high | Provider Calendar | ba168d0c | `p2-19-calendar-after-sweep.png` (ghost after void), `p2-23-calendar-confirmed.png`/`p2-26-calendar-bookings-filter.png` (two "Booked" chips, one real booking) | **Expired (TTL-voided) checkout claims render as red "Booked" events.** The slot *count* corrects on void (3 open — good), but the event chip persists, so after one void + one real booking, Aug 20 shows two "Booked" chips for one paying traveler. The provider's timeline shows bookings that were never paid and will never arrive. |
| P2-B3 | med | Customers station + Revenue Share | ba168d0c | `p2-27-customers-with-booking.png`, `p2-28-money-with-earnings.png` | The same expired-claim pollution reaches the aggregates: Customers shows "**2 bookings · $160 booked value**" and a "**Repeat**" badge (Today: "Repeat Customers 1") off ONE real booking; Revenue Share grosses $160/"Your Share $120". The traveler was told "nothing was booked"; the provider's stats say otherwise. *(Data-honesty face → sigma.)* |
| P2-B4 | med | Booking record (Inbox → History) | ba168d0c | `p2-24-inbox-history.png` | There is **no booking detail view**. The fullest surface is an inert History card showing traveler name, service, money split, and "Requested 8/6/2026" — the *request* date. **The service date and time appear nowhere on the card**, nor party size or traveler context (the booking-brief pattern is absent); the only place the provider can learn *when to show up* is the calendar chip. Clicking the card does nothing. *(Positive within the same card: no trip-plan/routing state leaks — the NEVER row holds on-screen.)* |

**P2-B1 repro:** 1. Seed/have earnings in both `releasable` and `held` states. 2. Open `/provider/money`. 3. Compare the four panels' numbers (top cards vs Payout Information vs Revenue Share vs Earnings Ledger). 4. Note Request Payout is disabled while "Available to pay out" is non-zero.
**P2-B2 repro:** 1. As a traveler, book a slot and let checkout fail at the payment leg (claim written, unauthorized). 2. Let the TTL sweep void it (30 min TTL, 5-min tick). 3. Open the provider calendar: the slot count is restored, but a red "Booked · <service>" chip remains on the date.
**P2-B3 repro:** after step 2 above, open `/provider/customers` — the voided claim counts as a booking and adds its amount to "booked value".

### DIVERGED

| id | sev | surface | sha | screenshot | reference | description |
|---|---|---|---|---|---|---|
| P2-D1 | high | Entire booking flow, provider side | ba168d0c | `p2-16-inbox-during-claim.png`, `p2-22-inbox-confirmed.png` | dispatch §7 (pre-declared high) | **No accept, decline, or cancel affordance exists anywhere.** Bookings arrive instant-confirmed; the Inbox — whose subtitle is "Everything that needs your response" — showed an empty queue at every stage (claim, confirmed), and the History card is inert. The dispatch's own words: *a provider who cannot say no will say it off-platform.* → **Q6**. |
| P2-D2 | med | Money station zero-state | ba168d0c | `p1-48-station-money.png` (Pass 1, zero data) vs `p2-28-money-with-earnings.png` | Pass-1 D2, refined | The "Platform 70% \| You 30%" split Pass 1 recorded is the **zero-data default** — with real earnings the same widget renders "Platform Fee (25%) · Your Share (75%) · Platform 25% \| You 75%". So a brand-new provider's first look at Money shows a fabricated, far-worse-than-real split. The `/earn` "keep up to 94%" remains a third story. |

### FRICTION

| id | sev | surface | sha | screenshot | description |
|---|---|---|---|---|---|
| P2-F1 | med | Calendar/catalog during the claim window | ba168d0c | `p2-17-calendar-during-claim.png`, `p2-18-catalog-avail-during-claim.png` | An **unauthorized** claim renders identically to a paid booking: slot "3 open"→"2 open", panel "1 / 3 booked · available" — no distinct "held/claimed" state — while the traveler simultaneously sees "nothing was booked." Correctly, Inbox/Today surface nothing pre-authorization (the observable half of the #433 posture holds). The PROMOTE panel even mints a posting opportunity from the phantom count. *(UX face of sigma §C8.)* |
| P2-F2 | med | Traveler mid-booking signup | ba168d0c | `p2-11-after-traveler-signup.png` | Creating an account at the booking gate dumps the traveler to `/dashboard`, abandoning the offering page and selected slot entirely — the booking must be rebuilt from scratch. Same context-loss family as Pass-1 F3, now costing the *provider* a sale. |
| P2-F3 | low | Offering page + cart line | ba168d0c | `p2-08-offering-page.png`, `p2-12-checkout-attempt.png` | A literal "**Unknown**" renders under the service title and on the cart line (unset location default leaking to travelers). |
| P2-F4 | low | Cart optimizer teaser | ba168d0c | `p2-12-checkout-attempt.png` | "Preview: up to 21% savings (~$0.17 less)" + "Plan score 15/100" on a single-item $100 cart — incoherent math presented as a $5.99 upsell. *(Traveler-side, adjacent; recorded because it sits on the provider's sales path.)* |

### What worked (Pass 2)

- **The ruling-38 traveler contract is exemplary on-screen:** "Payment provider unavailable — nothing was charged and nothing was booked. Your cart is exactly as you left it." And the cart truly was intact. (`p2-14`) The provider console's raw-JSON toasts (Pass-1 F10) now look like a solvable copy gap, not a platform norm.
- **TTL void releases capacity correctly and immediately** — "3 open"/"0 / 3 booked" after the sweep; no capacity ghost (the ghost is the *event chip*, P2-B2). (`p2-19`, `p2-20`)
- **Approval → live is instant and legible provider-side:** checklist ticks to "4 of 5", storefront banner flips to "Live · 1 approved service" with Preview/Copy/WhatsApp/X share tooling and honest caption. (`p2-05`, `p2-06`)
- **The storefront and offering page are the platform's best surfaces:** correct attribution, trust panel ("Payment held until your booking completes… admin-reviewed… book and message in one place"), honest no-cancellation-policy fallback, and a deliberately numberless fee line — "A platform service fee is deducted from each booking; the provider receives the remainder." (`p2-07`, `p2-08`)
- **History card money line is clear in isolation:** "You earn $60.00 · Booking total $80.00 · platform fee $20.00." (`p2-24`)

## Fee-copy ledger (recorded verbatim, display only — verification is sigma's)

| Surface | Copy/numbers shown |
|---|---|
| `/earn` provider track | "keep up to 94%" (Service Provider) · "keep 75%+" (Trip Planner / Local Expert) |
| Traveler cart & payment | Subtotal $80.00 · **Platform fee $20.00** · Total $100.00 |
| Provider History card | "You earn $60.00 · Booking total $80.00 · platform fee $20.00" |
| Money, zero data (Pass 1) | "Platform 70% \| You 30%" |
| Money, with data (Pass 2) | "Platform Fee (25%) −$40.00 · Your Share (75%) · Platform 25% \| You 75%" |
| DB row (fixture observation) | total_amount 80.00 · platform_fee 20.00 · provider_earnings 60.00 |

Net effect as displayed: the traveler pays **$100**, the provider is told they earn **$60** — the platform's take reads
as **$40 of $100 (40%)** across the two sides' screens, while `/earn` promises "keep up to 94%". No two surfaces agree.
→ **Q2/Q7**.

## Pass 2 cross-references (sigma pairing)

| This lane | Sigma item | Pairing |
|---|---|---|
| P2-F1 + P2-B2 (claim indistinct; expired ghosts) | **§C8** slot visibility | This lane records the human-visible states (open/claimed/confirmed/voided); sigma asserts the DB facts underneath. |
| Money "Request Payout" disabled at its own $0; Connect "Not connected"; no transfer executed | **§C9** payout posture | The self-service affordance **renders** but was inert in every observed state; real-execution verification stays blocked on a genuine Stripe fixture. |
| Email ledger below | **§D12** | Event-for-event. |
| P2-B3 (phantom aggregates), fee-copy ledger | sigma data-honesty / `fee_bands` | Displays recorded verbatim; truth is sigma's lane. |

**Hermetic email ledger (Pass 2):** traveler registration → welcome + verification (intercepted). Claim creation →
**no email** (correct pre-authorization silence). Authorization/promotion → *untestable here* (fixture promotion
bypassed the app layer); the #433 post-authorization-only assertion for "New Booking Request" remains open for a
real-Stripe environment.

## Updated narrative — the full onboarding-through-payout answer

Pass 1's verdict stands: the provider survives onboarding, nearly quits during the invisible pending window, and finds a
genuinely good console on the other side. Pass 2 completes the arc: **selling works better than getting paid.** The
storefront and offering pages are the platform's most polished surfaces, approval-to-live is instant, and the checkout
rail's failure behavior toward travelers is textbook honest. But the moment money exists, the console stops being
trustworthy: the calendar shows bookings that never happened (P2-B2), Customers counts phantoms (P2-B3), and Money
gives four mutually contradictory balances with a dead payout button under them (P2-B1). A Kyoto provider's first paid
week ends with the question this console cannot answer: *"how much did I actually make, and when do I get it?"* — asked
about numbers that don't match on one screen, regarding a booking whose date they can only find on a calendar chip
(P2-B4), which they could not have declined (P2-D1). Pass 1's quit-point was the approval wait; Pass 2's is the first
reconciliation of Money against memory.

## Pass 2 questions for ruling (continuing the Pass-1 numbering)

- **Q6 (booking control):** Is instant-book with no provider accept/decline/cancel the intended beta model (P2-D1)? If yes, the Inbox's "everything that needs your response" framing needs to change; if no, the affordance is a pre-beta build item.
- **Q7 (Money source of truth):** Which of the four Money panels is authoritative — and should the others derive from it or disappear? (P2-B1; the Earnings Ledger's four-line model reads clearest as-built.)
- **Q8 (expired-claim hygiene):** Should `status='expired'` rows be excluded from every provider-facing surface — calendar events, Customers, booked value, Revenue Share? (Recommendation: yes, everywhere; P2-B2/B3.)
