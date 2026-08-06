# Provider-UX-Walkthrough — Pass 1 Findings (pre-money surfaces)

**Lane:** `Provider-UX-Walkthrough` · **Pass 1 of 2** (Pass 2 remains BLOCKED on the provider-sigma Phase 2 Stripe-Connect fixture)
**walked@`ba168d0c5039f61cb518bb3ec9e6b51eb96a8ccb`** (main at Pass start, Aug 6 2026 08:04 ET).
Main moved mid-Pass to `d4f59bb7` (PR #435, reconciliation drift job — server-side money rail only; no provider-console
surface in its diff scope was walked after the move, so every finding below is as-of `ba168d0c`.)
**Status:** Pass 1 complete. **HARD STOP** — awaiting Leon's review before Pass 2.

## Environment & method (hermetic sandbox)

- Dev-only, fully hermetic: local Postgres 16, fresh DB, all 180+ migrations applied at server boot; `npm run dev` at `ba168d0c`.
- Stripe key = `sk_test_ci_stub…` (the CI stub posture). Consequence: Stripe Identity / Stripe Connect calls cannot succeed
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

## Pass 2 preconditions (unchanged from dispatch)

Blocked on BOTH: (a) this Pass-1 review, and (b) the provider-sigma Phase 2 booking-ready Stripe-Connect fixture registered
in the bench. Pass 2 will additionally need a real `sk_test` key in the sandbox for the Stripe-adjacent surfaces this Pass
could only observe erroring (Verify Owner ID, Connect onboarding, Request Payout).
