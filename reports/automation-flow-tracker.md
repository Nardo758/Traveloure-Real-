# User automation — October 24 register: Step 1 inventory

**DEV-CLOSED WITH BLOCKERS. RELEASE HELD. REGISTER NOT YET BUILD-COMPLETE.**

Inventory snapshot: 2026-10-31. Documentation only. No test, build, provider call,
database query, migration, runtime edit, restart, flag change, push or merge
was performed for this inventory.

Fresh verification is recorded in the dated addendum below; the inventory's
historical statements are not claims about that later verification.

## Source, counting and classification

Source: `attached_assets/user_automation_1793284974335.pdf`, 66 pages,
“Traveloure User Automation: The Traveler Journey, End to End,” 24 October
2026, section 16. Count unique scenario IDs, not later cross-references:
**269 = A31 + B26 + C35 + D35 + E18 + F20 + G28 + H12 + J48 + X16**.
The older 45-family tracker and 25-journey summary are different units and
are not substituted for these 269 rows.

### Counts by Part and status

| Part | BUILT | EXISTS | WAITING | NOT BUILT | EXCLUDED | Total |
|---|---:|---:|---:|---:|---:|---:|
| A | 0 | 9 | 4 | 18 | 0 | 31 |
| B | 5 | 10 | 5 | 6 | 0 | 26 |
| C | 1 | 24 | 4 | 4 | 2 | 35 |
| D | 22 | 0 | 12 | 1 | 0 | 35 |
| E | 0 | 11 | 3 | 4 | 0 | 18 |
| F | 3 | 9 | 2 | 6 | 0 | 20 |
| G | 0 | 6 | 13 | 9 | 0 | 28 |
| H | 0 | 4 | 1 | 7 | 0 | 12 |
| J | 2 | 3 | 16 | 27 | 0 | 48 |
| X | 0 | 0 | 10 | 6 | 0 | 16 |
| **Total** | **33** | **76** | **70** | **88** | **2** | **269** |

Document consistency check: 269 rows, 269 unique IDs, zero missing source
IDs and zero extra IDs. This is a report-count check, not an automation
test or a provider-free loop.

The owner approved adding **NOT BUILT** for buildable gaps. Each row below
has exactly one status:

- **EXISTS**: corresponding behavior/code on the inspected main snapshot;
  not a claim that the complete scenario has freshly passed.
- **BUILT**: visible development implementation and retained provider-free
  loop evidence for the stated subset. Not merged/release-certified merely
  because this label is used. Limits in the row and evidence section apply.
- **NOT BUILT**: implementation or the scenario-specific harness is missing
  or not established by the inspected evidence. Partial existing helpers are
  identified; do not recreate them.
- **WAITING**: an explicit policy, legal or outside-proof dependency prevents
  closing the full row. A row may have substantial code already.
- **EXCLUDED**: only C31 and C32.

The requirement column is a short locator, not replacement wording for the
source register. All its conditions and must-not-happen requirements remain.
An absent exact harness is not proof that a helper does not exist.

### Inspected revisions — not interchangeable

| Reference | SHA | Use |
|---|---|---|
| Current development branch `work/b05-j10-atomic-reset-main-20261031` | `f961ed034fae0a801623b088b7c51814182ca39d` | Atomic reset and current itinerary corrections visible |
| Local `main` | `b454e6bc16a3fd944e86d8221225b1d7c5d63743` | Empty publish-stamp subject; not used as a substitute for development HEAD |
| Locally available `origin/main` | `c64d688eacc40ca273ea9d10f13076f702168562` | Main code mapping below |
| Held `work/automation-part10-final-gates` | `26b347386cf387466803ddb6d16cdee266aa113c` | Cart implementation and historical proofs |
| Held `work/commerce-part7-verified-carry-20261010` | `e41f874757c3147ef89f7766c15b73db945ad18c` | Additional retained commerce reference |

No fetch or checkout was performed. “Main” means the locally available
`origin/main` above, not a claim that GitHub has not advanced. Before a build
slice, refresh main under its approved branch-preservation procedure and
repeat only the affected existence checks. All branches were left intact.
Working tree was clean before writing this requested report.

## Code and evidence locators

Paths in this legend are reused by the individual rows.

| Locator | Existing code / tests or evidence |
|---|---|
| AUTH | `server/replit_integrations/auth/emailAuth.ts`; `server/__tests__/auth-three-defects.db.test.ts` |
| VERIFY | `server/services/email-verification.service.ts`; `server/__tests__/signup-verification-email-gate.db.test.ts`; `server/__tests__/verification-automation-webhook.db.test.ts` |
| WELCOME | `server/services/signup-welcome-outbox.service.ts`; `server/__tests__/signup-welcome-outbox.db.test.ts` |
| RESET | `server/services/password-reset-tokens.service.ts`; `server/__tests__/verified-email-password-reset.db.test.ts` |
| ATOMIC | Current development versions of RESET, AUTH, `server/services/email.service.ts`, `server/services/email-outbox.service.ts`, `server/__tests__/password-changed-notice.db.test.ts` |
| LOGIN | `server/__tests__/login-enumeration.http.test.ts`; `server/__tests__/login-enumeration.test.ts`; `playwright/tests/auth/login-enumeration.spec.ts`; `reports/task-a-login-enumeration.md` |
| RESET-UI | `client/src/pages/reset-password.tsx` |
| CHANGE | `server/services/email-verification.service.ts`; `server/services/email-changed-copy.ts`; `server/__tests__/email-changed-notices.db.test.ts`; `server/__tests__/verified-email-change-paths.test.ts` |
| OUTBOX | `server/services/email-outbox.service.ts`, `email-outbox-classes.ts`, `email-outbox-expiry.ts`, `email-outbox-readdress.ts`; `server/__tests__/email-outbox.test.ts`, `critical-email-outbox.test.ts`, `email-outbox-expiry.test.ts`, `email-outbox-readdress.db.test.ts` |
| EXIT | `server/automations/messaging/email-provider-transport.ts`, `email-outbox-enqueue.ts`, `email-outbox-drain.ts`; `server/__tests__/email-single-exit.test.ts` |
| ITIN | `server/services/itinerary-followup.service.ts`, `itinerary-followup-email.ts`; `server/services/__tests__/itinerary-followups.vitest.ts`, `itinerary-followup-email.test.ts` |
| ZONE-DEV | Current development ITIN code: `marketingPreferencesState`, `no_timezone` held branch; existing itinerary tests. Invalid preferences remain a separate rejection, not silently changed |
| PREF | `server/services/notification-preferences.service.ts`; `shared/notification-preferences.ts`; ITIN preferences/window/unsubscribe code |
| COPY | `server/services/email.service.ts`; `server/utils/email-escape.ts`; `server/services/password-changed-copy.ts`; itinerary and email-change copy helpers |
| BOOKINGS | `server/services/booking.service.ts`, `stripe-payment.service.ts`; `server/routes/bookings.ts`; `server/__tests__/booking-alert-outbox.db.test.ts`, `legacy-webhook-confirmation.db.test.ts`, `row98-webhook-replay.db.test.ts` |
| PLAN-MAIL | `server/automations/messaging/plan-delivered-email.ts`, `plan-suggestion-email.ts`, `plan-approved-email.ts` |
| NOTIFY | `server/automations/messaging/notification-create.ts`, `push-notification-sweep.ts`, `push-notification-dispatch.ts`; `server/services/web-push.service.ts`; `server/__tests__/web-push.db.test.ts` |
| OCCASION | `server/automations/bookings/occasion-drafts.ts`; `server/services/occasion-drafts.service.ts`, `occasion-drafts-scheduler.service.ts`; `server/__tests__/occasion-drafts.db.test.ts` |
| INVITE | `server/automations/messaging/guest-invite-send.ts`; `server/routes/guest-invites.ts` |
| SUSPEND | `server/automations/moderation/suspension-session-cleanup.ts`; AUTH and OUTBOX account guards |
| CART | **Held branch**, `server/services/cart-email-state.service.ts`; `server/__tests__/cart-email-state.test.ts`, `cart-email-state.db.test.ts` |
| SWEEP | **Held branch**, `server/services/commerce-email-sweep.service.ts`; `server/automations/messaging/commerce-email-sweep.ts`; `server/routes/__tests__/commerce-email-sweep.db.test.ts` |
| ITEM | **Held branch**, `server/services/cart-item-change.service.ts`, `cart-item-change-email.ts` |
| SEND | **Held branch**, `server/services/commerce-send-verification.service.ts`; shared read-only payment checker as described in `reports/automation-part4-verification.md` |
| CART-LOOPS | **Held branch**, `reports/automation-part4-verification.md`, `automation-part5-verification.md`, `automation-part6-verification.md` and their evidence directories |
| CART-RISKS | **Held branch**, `reports/automation-release-blockers.md`, `automation-part8-verification.md`; includes open/failed hostile cases, not all-green evidence |
| ATOMIC-LOOPS | `.local/verification-evidence/automation-2026-10-31/atomic-slice-final-summary.json`, initial and refined loop records; private retained local evidence, never an email receipt |
| POLICY | `docs/engineer/automation/automation-decision-register.md` plus current owner rulings; source proposals Z-01–Z-21 are not approvals by themselves |

The existing registry, outbox, retry ladder, claims, recipient locks, class
rules and single exit are reuse dependencies. No second copy is proposed.
Existing payment and other direct senders are observation-only. A code
locator is not authorization to edit a payment writer or convert a sender.

## Part A — signup, verification and welcome (31)

| ID | Requirement locator | Status | Code / exact gap or blocker |
|---|---|---|---|
| A01 | Verify before welcome | EXISTS | VERIFY, WELCOME, AUTH; distinguish verification obligation from welcome delivery |
| A02 | One welcome after verification | EXISTS | WELCOME once-only enqueue and send guard; visible main tests |
| A03 | Double verification / two tabs | EXISTS | VERIFY, WELCOME transactional dedupe; real concurrency not certified |
| A04 | Resend cap and newest token | NOT BUILT | VERIFY exists; exact durable 3/hour and replacement-token scenario not established |
| A05 | Fourth resend neutral, no send | NOT BUILT | AUTH/VERIFY response helpers exist; exact capped-attempt harness not established |
| A06 | Expired verification link | EXISTS | VERIFY token validity and verification UI paths; no welcome from an invalid token |
| A07 | Verification reminders 1h / 1d / 3d | NOT BUILT | No corresponding reminder implementation located in inspected main or held commerce server/scripts; PDF BUILT label is not recoverable code proof |
| A08 | Reminder sending window | NOT BUILT | Reuse ITIN/PREF window helpers; A07 producer absent |
| A09 | Unknown/invalid reminder zone holds | NOT BUILT | A07 absent; do not confuse itinerary ZONE-DEV with verification-reminder implementation |
| A10 | Verify/delete/suspend/email-change stops reminders | NOT BUILT | Reuse OUTBOX guards; exact A07 family cancellation missing |
| A11 | Day-1 verify cancels day-3 reminder | NOT BUILT | A07 family and scenario harness absent; no real-clock claim |
| A12 | Verify versus reminder send, both orders | NOT BUILT | WELCOME dedupe exists; A07 verifier/concurrency harness absent |
| A13 | Abandon signup without account/email | EXISTS | AUTH submits on registration; no abandoned-form producer identified |
| A14 | Mistyped address / bounded stranger mail | WAITING | W-ADDRESS: approve Z-11 reporting/copy policy before claiming full typo-address rule |
| A15 | Existing-account signup neutral + notice | NOT BUILT | Neutral AUTH behavior exists; capped notice branch is separate from inspected main and no complete 269-row proof was established here |
| A16 | Address normalization / no duplicate | NOT BUILT | AUTH normalization exists; case/space/plus policy and full exact scenario harness need reconciliation, not guessed plus folding |
| A17 | Durable notice/resend account + IP caps | NOT BUILT | Existing rate limits are reusable; combined durable counters for both families not established |
| A18 | Multi-IP victim-address flood | NOT BUILT | A17 per-address cross-IP proof gap |
| A19 | Concurrent signup / one newest token | NOT BUILT | AUTH/WELCOME constraints exist; whole registration/token race harness not established |
| A20 | Hostile or missing name | EXISTS | COPY escaping and WELCOME name fallback |
| A21 | Language fallback | NOT BUILT | English copy exists; complete set/unset/unsupported language contract and harness not established |
| A22 | Hard bounce / admin flag / no retry | NOT BUILT | OUTBOX transport retries are not accepted-then-bounced handling; provider webhook design needed |
| A23 | Disposable-address policy | WAITING | W-ADDRESS: Z-12 decision; no disposable-address automation may be invented |
| A24 | Verified social claim / one welcome | NOT BUILT | AUTH/VERIFY/WELCOME reusable; provider-claim validation and dedicated scenario not established |
| A25 | Unverified provider claim | NOT BUILT | Local VERIFY reusable; provider branch proof missing |
| A26 | Provider returns no email | NOT BUILT | Provider signup/no-email behavior and harness not established |
| A27 | Verified password-account provider collision | WAITING | W-PROVIDER: approved linking/identity proof and provider-link-notice design required |
| A28 | Unverified password-account provider collision | WAITING | W-PROVIDER: no silent merge; complete provider collision handling not proven |
| A29 | Opt-out does not block account mail | EXISTS | OUTBOX class separation and WELCOME/VERIFY security/account guards |
| A30 | Account mail bypasses window/cap | EXISTS | OUTBOX classes; reminder-specific portion depends on A07 |
| A31 | Gone/suspended account before welcome | EXISTS | WELCOME live account/recipient guard and tests |

## Part B — reset and sign-in (26)

| ID | Requirement locator | Status | Code / exact gap or blocker |
|---|---|---|---|
| B01 | Reset once / replace password | EXISTS | RESET token consumption and AUTH reset path |
| B02 | Second request invalidates first link | EXISTS | RESET replacement-token logic; verified-email reset tests |
| B03 | Concurrent reset requests | NOT BUILT | RESET exists; request/request newest-token race is not the same as ATOMIC consumer/consumer proof |
| B04 | Unknown-address reset neutral | EXISTS | AUTH forgot-password response |
| B05 | Atomic password reset + security notice | BUILT | ATOMIC, ATOMIC-LOOPS; forced enqueue failure rollback, one notice, no password/login link; delivery still held |
| B06 | Separate expired-reset result | NOT BUILT | RESET-UI currently combines invalid, expired and used outcomes |
| B07 | Separate already-used reset result | NOT BUILT | RESET-UI same combined result; narrowly reuse existing page |
| B08 | Provider-only reset policy | WAITING | W-PROVIDER: Z-13; no provider identity storage or silent policy choice |
| B09 | Notice goes to reset-time address | BUILT | ATOMIC PB10 and frozen recipient behavior; not blanket readdressing |
| B10 | Abandoned reset / 60-minute expiry | EXISTS | RESET expiry/no follow-up producer; real elapsed-time proof not claimed |
| B11 | Opening link does not consume token | EXISTS | RESET consumption is in successful reset; exact scanner proof remains J21 |
| B12 | Old password no longer works | BUILT | ATOMIC-LOOPS password hash/credential assertions |
| B13 | Old sessions ended | BUILT | Current ATOMIC tests cover session shapes and rollback; no browser/session-provider certification |
| B14 | Reset unverified account | WAITING | W-PROVIDER: Z-13 policy; current refusal must not silently be changed |
| B15 | Forwarded/cross-browser reset | NOT BUILT | RESET exists; complete cross-browser holder scenario harness not established |
| B16 | Altered token/user safe refusal | EXISTS | RESET validation; ATOMIC invalid/revoked token tests |
| B17 | Hostile reset greeting | EXISTS | COPY escaping |
| B18 | Reset flood bounded/neutral | NOT BUILT | AUTH limits exist; durable victim-address flood proof absent |
| B19 | Equal credential work / neutral login | EXISTS | LOGIN: main implementation and retained two HTTP/browser loops; no identical-timing claim |
| B20 | Good login after wrong attempts | EXISTS | LOGIN correct-password-after-failure tests |
| B21 | Suspended sign-in in-app only | EXISTS | AUTH suspension branch; no case details in email |
| B22 | Warning/lock/unlock durable counters | WAITING | W-SECURITY: lockout/counter policy and permitted storage must be approved; no schema expansion authorized |
| B23 | New-device alert | WAITING | W-SECURITY: device recognition/privacy design and policy absent |
| B24 | Unusual-sign-in alert | NOT BUILT | No complete anomaly producer/type/harness established; reuse LOGIN rather than inventing thresholds |
| B25 | Unverified sign-in policy | WAITING | W-PROVIDER: Z-13 sign-in/booking ruling required |
| B26 | Security bypasses marketing restrictions | BUILT | ATOMIC security classification and dispatch tests; no real provider handoff claim |

## Part C — plans and follow-ups (35)

| ID | Requirement locator | Status | Code / exact gap or blocker |
|---|---|---|---|
| C01 | One ready email per itinerary | EXISTS | ITIN and existing generation delivery registry; per-generation once-only key |
| C02 | Failure/timeout excludes late ready | EXISTS | ITIN failure/generation-state guards; existing failed-email automation |
| C03 | 2h / 24h / 5d follow-ups | EXISTS | ITIN fixed follow-up definitions |
| C04 | Booking stops follow-ups on every path | WAITING | W-RAILS: readable cancellation exists; every payment/booking path not certified |
| C05 | Newer itinerary supersedes older | EXISTS | ITIN supersession and live-generation checks |
| C06 | Day-5 bookability | EXISTS | ITIN bookable-item send guard |
| C07 | Plan/account deleted | EXISTS | ITIN live ownership/existence cancellation |
| C08 | Window, cap, unsubscribe | EXISTS | ITIN recipient lock, PREF window and cap |
| C09 | Ready and follow-up owner links | EXISTS | ITIN/COPY current plan links; browser proof deferred |
| C10 | View alone does not stop follow-ups | EXISTS | ITIN eligibility is not a page-view event |
| C11 | Edited plan current copy | EXISTS | ITIN live-data copy generation; full content permutations not freshly run |
| C12 | Return day 2 and book | WAITING | W-RAILS: booking cancellation subset exists; complete rail/elapsed-time closure held |
| C13 | Second plan supersedes first | EXISTS | ITIN supersession |
| C14 | Different destinations/newest sequence | EXISTS | ITIN newest-generation ownership; no fresh multi-day run |
| C15 | No bookable items excludes day 5 | EXISTS | ITIN day-5 eligibility |
| C16 | Paused/sold-out item before day 5 | EXISTS | ITIN live bookability check |
| C17 | Partial booking | WAITING | W-ITIN-POLICY: Z-14 partial-item continuation differs from blanket stop; owner ruling needed |
| C18 | Deleted plan / old link denial | EXISTS | ITIN deletion guard and authenticated plan routes; no new browser run |
| C19 | Unsubscribe after first follow-up | EXISTS | ITIN unsubscribe and pending cancellation |
| C20 | Email changes mid-sequence | EXISTS | OUTBOX readdress/cancellation and ITIN recipient guard |
| C21 | Suspend then unsuspend | EXISTS | ITIN account guard and terminal cancellation; suspended rows must not restart |
| C22 | Late-night first step / later due times | EXISTS | ITIN original generation timestamps and next-window deferral |
| C23 | Cart wins over itinerary; loser deferred | BUILT | Held SWEEP/SEND + CART-LOOPS readable subset; not integrated into main; future-day slot priority is W-PRIORITY |
| C24 | Cap used / deferred not lost | EXISTS | ITIN reservation and next-window recheck |
| C25 | Missing time zone holds | NOT BUILT | 2026-11-01: targeted cases 10/10, enclosing isolated suite 28/30; 0/2 clean full loops. Stopped after first failed loop; 2 retained fixture gaps, no runtime edits. See fresh evidence below. |
| C26 | Same behavior across plan tiers | NOT BUILT | ITIN exists; exact tier matrix/no-credit scenario harness not established |
| C27 | New generation fails / old plan | WAITING | W-ITIN-POLICY: Z-14 policy and sequence semantics need confirmation |
| C28 | Failed attempt then successful plan | EXISTS | ITIN failed/ready generation separation |
| C29 | Close tab while generating | NOT BUILT | Server generation exists; exact disconnect/late-completion harness not established |
| C30 | Ready email provider failure | EXISTS | OUTBOX retry ladder and once-only rows; actual provider once-only remains W-PROVIDER-PROOF |
| C31 | Abandoned planning chat, no itinerary | EXCLUDED | Owner scope exclusion; do not add an email producer |
| C32 | Credit-count emails | EXCLUDED | Owner scope exclusion; no credit wording |
| C33 | Signed-out/wrong-user plan link | NOT BUILT | Authenticated owner routes exist; complete forwarded/altered-link scenario harness not established |
| C34 | Hostile destination/name | EXISTS | COPY/ITIN escaping |
| C35 | Expert fallback in 24h copy | EXISTS | ITIN/COPY current fallback; no claim on real supply or production recommendations |

## Part D — cart and checkout (35)

BUILT here means held readable-record-subset code plus retained loop evidence,
not completion of the current-main reconciliation. All four cart email types
remain sending-disabled. No payment code is proposed for modification.

| ID | Requirement locator | Status | Code / exact gap or blocker |
|---|---|---|---|
| D01 | Server add-time snapshot | BUILT | CART: server price/currency/availability/captured_at, hostile-client and immutable-display tests |
| D02 | 1h / 1d / 3d, no fourth step | BUILT | SWEEP/CART-LOOPS thresholds and fixed three-family set; no real-clock delivery claim |
| D03 | Readable paid / empty / opt-out skips | BUILT | SEND/CART-LOOPS; readable subset only, UNKNOWN fails closed |
| D04 | Resume creates new sequence | BUILT | CART server activity sequence and retained loops |
| D05 | Independent carts/payment ownership | WAITING | W-RAILS: cart/payment correlation incomplete; cannot claim every cart is independently attributable |
| D06 | Cart versus itinerary collision | BUILT | Held recipient locking/priority tests, CART-LOOPS; not a future-day reservation proof |
| D07 | Unreadable rail suppresses reminder | BUILT | SEND fail-closed UNKNOWN tests; underlying coverage still W-RAILS |
| D08 | Price up/down/sellout once | WAITING | ITEM enqueue/marker loops exist; W-ITEM blocks full send guarantee |
| D09 | No snapshot skips, no guessing | BUILT | CART/ITEM no_snapshot path and retained tests |
| D10 | A → B → A between sweeps | BUILT | ITEM observed-state limit documented/tested; no invented change |
| D11 | Signed-out cart no email | BUILT | CART/SWEEP authenticated-owner guard |
| D12 | Claim starts sequence / keeps snapshot | BUILT | CART guest-claim implementation and retained proof; main reconciliation not completed |
| D13 | Never claimed, never emailed | BUILT | SWEEP authenticated-owner guard |
| D14 | Three reminder steps then silence | BUILT | SWEEP fixed steps and CART-LOOPS; real elapsed time unproven |
| D15 | Empty before day 1 | BUILT | SEND cart_empty cancellation; terminal rows |
| D16 | Activity at hour 30 supersedes | BUILT | CART new sequence and SEND superseded guard |
| D17 | Quantity or date edit restarts | NOT BUILT | CART quantity stamping exists; date-only activity guarantee is not established and must not be silently added |
| D18 | Sellout before due / later steps continue | WAITING | SEND reminder guard exists; W-ITEM blocks full sellout/notice ordering guarantee |
| D19 | Cent/percent/rounding boundaries | WAITING | ITEM comparison loops exist; W-ITEM full notice delivery still held; USD two-decimal normalizer only |
| D20 | Sign out/in same cart | BUILT | CART ownership/sequence retention; no new browser proof |
| D21 | Pay on another device | WAITING | W-RAILS: readable records guard exists; full lifecycle and ownership coverage incomplete |
| D22 | Window edge seconds | BUILT | SEND/CART-LOOPS known-local-zone boundary tests |
| D23 | Opt-out blocks reminder, not change | BUILT | SEND class tests with must-have delivery safely held, not actually sent |
| D24 | System-empty cart | BUILT | SEND live contents guard; no payment cleanup changes |
| D25 | Email changes while pending | BUILT | SEND live recipient mismatch cancellation |
| D26 | Account deletion while pending | BUILT | SEND account_gone guard; no deletion workflow implementation claimed |
| D27 | Checkout started, not paid | BUILT | SWEEP readable idle-cart selection; neutral copy, no “payment started” wording |
| D28 | Bank authentication in progress | WAITING | W-PAYMENT-POLICY: Z-05 session pause plus W-RAILS external activity visibility |
| D29 | Decline then idle | WAITING | W-PAYMENT-POLICY: Z-05 resume policy; payment-failed sender already exists, observe only |
| D30 | Failed payment then paid retry | WAITING | BOOKINGS notices exist; W-RAILS reminder lifecycle safety incomplete |
| D31 | Stock hold expires | WAITING | BOOKINGS claim-expiry notice exists; W-RAILS exact cart-reminder interaction not closed |
| D32 | Webhook plus success page | WAITING | BOOKINGS dedupe exists; held hostile actual-handler coverage remains recorded open in CART-RISKS |
| D33 | Pay between queue and send | WAITING | W-RAILS/W-SEND-WINDOW: synthetic residual measured, not all-rail/provider bound |
| D34 | Deposit/balance reminder | WAITING | W-PAYMENT-POLICY: Z-06 release scope decision; never treat deposit as wholly unpaid |
| D35 | Unknown rail marked blocked | BUILT | SEND fail-closed payment_rail_unknown; no all-rail certification |

## Part E — payment and booking notices (18)

| ID | Requirement locator | Status | Code / exact gap or blocker |
|---|---|---|---|
| E01 | Each rail confirmation/reminder stop | WAITING | BOOKINGS exists; W-RAILS for complete reminder side |
| E02 | Signed webhook replay three times | EXISTS | BOOKINGS event-key/replay tests; no real Stripe event run in this step |
| E03 | Webhook/success duplicate prevention | EXISTS | BOOKINGS existing authoritative confirmation paths and replay tests |
| E04 | Payment failed once | EXISTS | Existing BOOKINGS/payment-failed sender; observe only, no conversion |
| E05 | Unknown rail | WAITING | W-RAILS; payment provenance not guessed |
| E06 | Canonical and legacy confirmations | EXISTS | BOOKINGS canonical/legacy handlers and tests |
| E07 | Complete confirmation values/owner link | NOT BUILT | BOOKINGS/COPY existing; exact all-fields/local-zone/link-owner scenario harness not established |
| E08 | Cancellation/refund cutoff | EXISTS | BOOKINGS policy enforcement and existing sender; wording cross-check is J23 |
| E09 | Late success auto-refund notice | EXISTS | BOOKINGS existing late-success handling; no payment edits |
| E10 | Provider decline notice | EXISTS | Existing declined sender; observation only |
| E11 | Provider silent 48h | EXISTS | Existing notification/preference paths; no fresh elapsed-time proof |
| E12 | Two separate partial refunds | NOT BUILT | Existing refund path reusable; exact separate-ID/amount scenario harness not established |
| E13 | Repeated refund event | EXISTS | BOOKINGS/refund idempotency paths; not provider delivery certification |
| E14 | Email changes before confirmation | WAITING | W-RECIPIENT: OUTBOX readdress helper exists, but source Z-18 policy must be reconciled with frozen security recipients and direct senders |
| E15 | Kill switch / every direct sender | NOT BUILT | OUTBOX/EXIT exist; complete per-direct-sender observation harness missing, no toggle authorized |
| E16 | Direct-sender outage loss | NOT BUILT | Existing direct senders are observation-only; full loss evidence harness missing |
| E17 | Expert delivers plan | EXISTS | PLAN-MAIL existing sender; do not convert in this slice |
| E18 | Approved expert suggestion | EXISTS | PLAN-MAIL approval gate; observation only |

## Part F — consent, window, cap and channels (20)

| ID | Requirement locator | Status | Code / exact gap or blocker |
|---|---|---|---|
| F01 | Unsubscribe GET alone changes nothing | EXISTS | ITIN unsubscribe confirm flow; itinerary scope only |
| F02 | Confirm stops marketing, not security | EXISTS | ITIN/PREF/OUTBOX classes; not proof of an account-wide switch |
| F03 | Mid-sequence unsubscribe | EXISTS | ITIN pending-row cancellation |
| F04 | One account-wide marketing setting | NOT BUILT | PREF exists; full cross-family account-wide integration not established |
| F05 | One-click unsubscribe headers | NOT BUILT | EXIT existing transport; no List-Unsubscribe implementation located in inspected service/automation paths |
| F06 | Mail-scanner GET no mutation | EXISTS | ITIN confirmation step rather than unsubscribe-on-open |
| F07 | Other user's/tampered unsubscribe | NOT BUILT | ITIN token handling exists; exact cross-user/tamper harness not established |
| F08 | Resubscribe | WAITING | W-CONSENT: Z-15 approved re-entry behavior needed |
| F09 | Opt-out security/must-have still arrive | EXISTS | OUTBOX class gates; no real receipt claim |
| F10 | Each type correctly classified | NOT BUILT | OUTBOX classes/registry exist; complete 269-register class audit harness not established |
| F11 | Marketing window edge seconds | BUILT | Held SEND loops; ITIN existing helpers; no live send |
| F12 | Zones, invalid zone and hold | NOT BUILT | Held SEND + ZONE-DEV partially cover; itinerary invalid zone still invalid_preferences, not no_timezone hold |
| F13 | Zone changes between queue/send | WAITING | W-ZONE: Z-16 send-time-zone policy and complete cross-family proof |
| F14 | Cart beats itinerary / daily cap | BUILT | Held SWEEP/SEND and CART-LOOPS; no nudge priority implementation |
| F15 | Three marketing rows deferred/rechecked | NOT BUILT | Recipient locks/cap reusable; complete three-family deferred-row scenario absent |
| F16 | Cap persists after restart | EXISTS | ITIN/OUTBOX stored reservations; real process-restart scenario not freshly executed |
| F17 | Cap per traveler, not shared inbox | EXISTS | ITIN recipient locking keyed by user; exact plus-address normalization remains A16 |
| F18 | Security ignores already-used cap | BUILT | ATOMIC security-class tests and held class proof |
| F19 | In-app dedupe | EXISTS | NOTIFY notification-create and durability tests |
| F20 | Push dedupe / prune / catch-up | EXISTS | NOTIFY push sweep/dispatch and tests |

## Part G — account events (28)

| ID | Requirement locator | Status | Code / exact gap or blocker |
|---|---|---|---|
| G01 | Fresh proof before email-change request | NOT BUILT | CHANGE exists; complete verified-current-address/fresh-sign-in transaction guarantee not established |
| G02 | Verify new email before changing stored address | NOT BUILT | CHANGE notices/verification exist, but existing PD tests do not prove this full deferred-mutation workflow |
| G03 | Unconfirmed change stays inactive | NOT BUILT | Full pending-change workflow needs narrow reconciliation, not wholesale old Family 5 recreation |
| G04 | Taken address neutral | EXISTS | CHANGE PD4 response/unique-violation handling |
| G05 | Confirm ends other sessions, provider cannot undo | NOT BUILT | CHANGE partially exists; full session/provider-overwrite guarantee not established |
| G06 | Provider-only change refusal | EXISTS | CHANGE/verified-email path guards; no new provider identity storage |
| G07 | Unconfirmed email-change link expires | NOT BUILT | VERIFY expiry exists; full deferred address-change workflow G02/G03 missing proof |
| G08 | Second change invalidates first | NOT BUILT | VERIFY newest token reusable; exact email-change request race/harness not established |
| G09 | Change then change back | NOT BUILT | CHANGE notices exist; exact two-transition workflow/harness not established |
| G10 | Pending old-address marketing stops | EXISTS | OUTBOX readdress and ITIN recipient guard; held SEND adds cart subset |
| G11 | Old-address reset neutral after change | EXISTS | AUTH reset lookup + CHANGE current email; no new test run |
| G12 | Email-change flood caps | NOT BUILT | Existing route rate limits not full durable per-victim proof |
| G13 | Stale/stolen session cannot change email | NOT BUILT | G01 fresh-proof requirement not established; no security guarantee inferred |
| G14 | Suspension terminal; no restart on restore | EXISTS | SUSPEND, ITIN and held SEND account guards |
| G15 | Suspended login in-app only | EXISTS | AUTH account-state branch |
| G16 | Delete request and honest confirmation | WAITING | W-DELETION: retention/legal wording and workflow approval |
| G17 | Leave deletion screen / no action | WAITING | W-DELETION: approved workflow absent |
| G18 | 168-hour grace / cancel-only access | WAITING | W-DELETION: grace/access policy and implementation |
| G19 | Reminder at hour 120 | WAITING | W-DELETION: approved deletion lifecycle absent |
| G20 | Cancel deletion with fresh proof | WAITING | W-DELETION: cancellation/access policy |
| G21 | Concurrent deletion request/sign-in | WAITING | W-DELETION: state machine and proof scope |
| G22 | Closure at day 7, not full erasure | WAITING | W-DELETION: legal retention/closure wording |
| G23 | Unverified deletion notices held | WAITING | W-DELETION: identity and notice policy |
| G24 | Delete request cancels all marketing | WAITING | W-DELETION: request lifecycle not equivalent to account_gone guard |
| G25 | Never returns / 120h and 168h | WAITING | W-DELETION plus separately authorized real-clock proof |
| G26 | What records remain | WAITING | W-DELETION: owner/legal retention ruling, no invented duration |
| G27 | Re-signup after closure | WAITING | W-DELETION: Z-17 legal/account-reuse ruling |
| G28 | Deletion versus email change | WAITING | W-DELETION: Z-17 precedence policy |

## Part H — nudges and engagement (12)

| ID | Requirement locator | Status | Code / exact gap or blocker |
|---|---|---|---|
| H01 | Incomplete-profile day-2 nudge | NOT BUILT | No complete registered profile-nudge producer/type/harness located |
| H02 | No-plan day-3 nudge | NOT BUILT | No complete registered planner-nudge producer/type/harness located |
| H03 | Dormant-user email | WAITING | W-DORMANT: Z-07 threshold and reset/once-per-cycle policy |
| H04 | Nudges obey consent/window/cap | NOT BUILT | Reuse PREF/ITIN/OUTBOX; H01/H02 integration absent |
| H05 | Profile then planner, no same-day pair | NOT BUILT | H01/H02 sequence and harness missing |
| H06 | Plan created suppresses planner nudge | NOT BUILT | H02 absent; use live plan check, not another watcher |
| H07 | Itinerary beats nudge | NOT BUILT | Owner cart → itinerary → nudges order recorded; nudge contender absent, no new decision needed for tie order |
| H08 | Plus occasion draft at 14 days | EXISTS | OCCASION once-per-cycle producer |
| H09 | Non-Plus/gone/suspended/lapsed | EXISTS | OCCASION live eligibility; no fresh lapse/time run |
| H10 | Guest invite, claim/debounce/release | EXISTS | INVITE queue/claim paths; accepted is not delivered |
| H11 | 48h in-app handover nudge | EXISTS | Existing upcoming/handover notification paths; no new elapsed-time proof |
| H12 | Not-built automations cannot send | NOT BUILT | EXIT approved-type gate exists; exhaustive absent-type/trigger/template negative harness not established |

## Part J — hardening scenarios (48)

For test-only rows, a generic helper does not establish that the exact
cross-family fault/load/security harness has been built.

| ID | Requirement locator | Status | Code / exact gap or blocker |
|---|---|---|---|
| J01 | Ten concurrent duplicate events | NOT BUILT | WELCOME/ATOMIC/BOOKINGS have specific dedupe tests; complete four-event ten-way harness not established |
| J02 | Two workers claim one row | EXISTS | OUTBOX atomic lease/claim; held SEND concurrency loops add readable cart subset |
| J03 | Two workers, different marketing rows | BUILT | Held recipient locking and local-day reservation loops; no all-family integration claim |
| J04 | Accepted then DB failure/restart | WAITING | W-PROVIDER-PROOF: held durable-intent repair not certified on current main/provider |
| J05 | Provider timeout after delivery | WAITING | W-PROVIDER-PROOF: actual provider once-only ambiguity not solved by a retry counter |
| J06 | Accepted then hard bounce | NOT BUILT | Provider receipt/bounce consumer not established; A22 design dependency |
| J07 | Exhausted retries/operator alert | EXISTS | OUTBOX dead state/admin visibility; external delivered-alert proof not claimed |
| J08 | 5,000 rows at 09:00 | NOT BUILT | Existing claims/window reusable; exact load/throttle/recheck harness not established |
| J09 | Deferred row stale | WAITING | W-EXPIRY: Z-03 existing family expiry must be reconciled with cross-family policy |
| J10 | Forced notice failure rolls reset back | BUILT | ATOMIC/ATOMIC-LOOPS; no notice row/password/session/token partial commit |
| J11 | Audit failure rolls email change back | NOT BUILT | CHANGE tests include non-fatal notice failure; this does not prove required audit+address atomicity |
| J12 | Delete-confirmation queue failure | WAITING | W-DELETION: lifecycle and atomicity design |
| J13 | Suspension plus cancellation atomic | NOT BUILT | SUSPEND and guards exist; exact forced-cancellation-failure transaction proof not established |
| J14 | Payment versus reminder cancellation failure | WAITING | W-RAILS: read-only safety only; payment writer changes forbidden |
| J15 | Audit every security writer | NOT BUILT | Existing individual audit paths reusable; complete script/bootstrap/provider/deletion inventory and fault harness not established |
| J16 | All tokens hashed/scoped/expiring/unlogged | NOT BUILT | RESET/VERIFY hashing exists; exhaustive all-link-family storage/log audit not established |
| J17 | Cross-purpose verify/reset tokens | NOT BUILT | RESET/VERIFY separate paths exist; exact crossover harness not established |
| J18 | Off-site return address refused | NOT BUILT | Existing auth return handling reusable; whole-email-link redirect harness not established |
| J19 | Forbidden content scan per email | NOT BUILT | COPY and individual templates exist; complete allowlisted-field/all-template scan not established |
| J20 | Forwarded booking/plan links owner-only | NOT BUILT | Authenticated routes exist; combined cross-browser two-owner scenario harness not established |
| J21 | Scanner does not consume reset token | EXISTS | RESET consumption on submit, not page open |
| J22 | Hostile text/layout/header injection | NOT BUILT | COPY escaping exists; complete subject/header/RTL/long-text matrix not established |
| J23 | Refund wording matches code/Terms/dialog | WAITING | W-LEGAL-COPY: current legal/copy reconciliation required; historical mismatch is not asserted still present without re-audit |
| J24 | Marketing footer identity/legal fields | WAITING | W-LEGAL-COPY: legal served-region/footer approval and completed configuration |
| J25 | Tracking matches Privacy wording | WAITING | W-LEGAL-COPY: disclosure review against actual transport tracking; no pixel/analytics assumptions |
| J26 | No credits/payment-started/unbuilt wording | NOT BUILT | COPY has reusable templates; complete all-template forbidden-feature scan not established |
| J27 | Domain/SPF/DKIM/DMARC real receipt | WAITING | W-DELIVERY: domain proof and authorized real message; prohibited in this step |
| J28 | Marketing-only one-click headers | NOT BUILT | F05 transport/header gap; security/must-have exclusion harness needed |
| J29 | Marketing/security separate streams | WAITING | W-COMPLAINT: Z-21 provider streams and complaint policy/ownership |
| J30 | Spam complaint suppresses marketing only | NOT BUILT | No complete provider complaint consumer + account suppression integration established |
| J31 | Soft bounce ladder then stop | NOT BUILT | OUTBOX request-error retries exist; accepted-then-soft-bounce receipt classification not established |
| J32 | Every decision structured log | NOT BUILT | Existing logs/lastError reusable; all-family row/class/decision/reason coverage audit missing |
| J33 | Backlog/retry/cancel/provider/webhook alerts | WAITING | W-MONITOR: thresholds, operator and alert-channel approval |
| J34 | Two-day kill switch / stale rows / audit | WAITING | W-EXPIRY: Z-19 family expiry/audited recovery policy; no toggle permitted |
| J35 | Direct-sender failure documented | NOT BUILT | Existing sender inventory reusable; complete per-family failure observation harness not established |
| J36 | Support history/manual action audit | WAITING | W-SUPPORT: permitted support actions/visibility and owner policy required |
| J37 | DST gap/fold, elapsed-day semantics | WAITING | W-ZONE: Z-08 explicit elapsed-hour/step policy; Intl helper is not the whole proof |
| J38 | Half-/quarter-hour/+14 zones | NOT BUILT | ITIN local clock reusable; exact full-zone edge matrix not established |
| J39 | Skewed worker clocks | NOT BUILT | Server/DB clock helpers exist; exact skew/no-early-send harness not established |
| J40 | Leap/month/year boundaries | NOT BUILT | Existing timestamp arithmetic reusable; exact full boundary matrix not established |
| J41 | Combined cross-flow address flood cap | NOT BUILT | Individual AUTH/VERIFY limits do not prove one combined durable address budget |
| J42 | Neutral response across four flows | NOT BUILT | LOGIN proven subset exists; complete signup/reset/login/change text/size/redirect matrix missing |
| J43 | Unsubscribe other user/masked screen | NOT BUILT | ITIN unsubscribe exists; exact cross-user + masked-recipient UI harness not established |
| J44 | Bodies/log retention and deletion | WAITING | W-RETENTION: Z-20 legal retention/anonymization decision |
| J45 | Public evidence contains no secrets/PII | NOT BUILT | Existing guards reusable; complete current evidence-tree scan and triage not performed here |
| J46 | Gmail/Outlook/Apple Mail variants | WAITING | W-CLIENTS: authorized manual real-client review; no real delivery setup permitted now |
| J47 | Plain text/screen reader/contrast/targets | NOT BUILT | COPY plaintext exists for some families; complete accessibility/template matrix not established |
| J48 | RTL greeting / language fallback | NOT BUILT | COPY escaping exists; full RTL/language/layout harness not established |

## Part X — combined journeys (16)

No complete combined journey is declared BUILT merely because its individual
helpers exist. Missing test-only journey harnesses are NOT BUILT. Actual
elapsed-time and real-delivery proof remain separate and unauthorized.

| ID | Requirement locator | Status | Code / exact gap or blocker |
|---|---|---|---|
| X01 | Signup → plan → book, nothing else | NOT BUILT | AUTH/VERIFY/WELCOME/ITIN/BOOKINGS exist; exact combined negative-proof harness not established |
| X02 | Day-1 verify then six-day follow-ups | NOT BUILT | A07 reminders absent; combined harness/real-clock run absent |
| X03 | Cart/itinerary collision, swapped order | WAITING | W-PRIORITY/W-EXPIRY: held same-time test exists, future-day reservation and expiry policy unresolved |
| X04 | Guest cart → verified account → claim | NOT BUILT | Held CART claim subset exists; combined signup/verify/claim harness not established |
| X05 | Book then policy-window cancellation | WAITING | W-LEGAL-COPY/W-RAILS: existing pieces, combined wording/payment safety not closed |
| X06 | Abandoned bank step → decline → success | WAITING | W-PAYMENT-POLICY/W-RAILS: Z-05 and lifecycle visibility |
| X07 | Plan pending during email change | NOT BUILT | CHANGE/ITIN partial pieces; complete deferred-change workflow and combined harness not established |
| X08 | Plan/cart pending, suspend/restore | NOT BUILT | Held SEND and main guards exist; exact combined admin/sequence harness not established |
| X09 | Unsubscribe across cart/nudge then reset/book | NOT BUILT | F04/H01/H02 integration and complete combined harness absent |
| X10 | Delete/cancel and full seven-day closure | WAITING | W-DELETION: legal and lifecycle design required |
| X11 | Provider link, reset, email change | WAITING | W-PROVIDER: linking notice/workflow missing; existing reset does not close combined journey |
| X12 | Two destinations/carts, one paid | WAITING | W-RAILS/W-PRIORITY: cart/payment ownership and cross-day priority |
| X13 | Occasion + itinerary + cart collision | WAITING | W-PRIORITY: existing occasion and held cart, no approved day-slot reservation across all contenders |
| X14 | No zone and changed zone | WAITING | W-ZONE: current missing-zone code partial, send-time-zone policy/full combined harness not closed |
| X15 | Provider outage plus switch recovery | WAITING | W-PROVIDER-PROOF/W-EXPIRY: actual once-only and stale-row recovery; existing direct senders observe only |
| X16 | Signup → profile/planner/dormant | WAITING | W-DORMANT: threshold missing; H01/H02 also NOT BUILT, not hidden by this status |

## Grouped WAITING blockers

These are blockers to complete rows, not permission to implement an exception.
Rows can appear in more than one group; do not sum these lists as status counts.
Owner confirmation is still needed before treating WAITING rows as accepted
carried-forward blockers for the final build-complete gate.

| Blocker | WAITING rows | Needed / recommendation |
|---|---|---|
| W-ADDRESS | A14, A23 | Confirm typo/disposable policy Z-11/Z-12; recommend neutral first-message reporting copy and no invented filtering |
| W-PROVIDER | A27, A28, B08, B14, B25, X11 | Approve provider-account/reset/linking contract; explicit owner control, no silent merge; design only first |
| W-SECURITY | B22, B23 | Approve lockout and device/privacy policy; no new storage/schema without separate approval |
| W-RAILS | C04, C12, D05, D21, D28, D30, D31, D32, D33, E01, E05, J14, X05, X06, X12 | Resolve lifecycle/ownership UNKNOWNs through existing readable joins where safe; keep sending blocked, no payment-writer changes |
| W-ITIN-POLICY | C17, C27 | Confirm partial-booking and failed-new-generation treatment; do not infer approval from source proposals |
| W-ITEM | D08, D18, D19 | Payment ordering and inventory final-read/handoff guarantee; recommend retain safe hold, reuse held ITEM code |
| W-PAYMENT-POLICY | D28, D29, D34, X06 | Confirm Z-05 session pause/decline rules and Z-06 balance-reminder exclusion; no payment edits |
| W-SEND-WINDOW | D33 | Accept only measured marketing residual, not a provider-bound latency guarantee and not must-have inventory safety |
| W-RECIPIENT | E14 | Reconcile Z-18 with existing readdress rules and frozen security recipients; no blanket retargeting |
| W-CONSENT | F08 | Approve account-wide resubscribe policy; keep itinerary-only behavior until separately built |
| W-ZONE | F13, J37, X14 | Confirm Z-16 live zone and Z-08 elapsed-hour semantics; invalid preferences/invalid zone remain explicitly separate gaps |
| W-DELETION | G16–G28, J12, X10 | Legal retention, grace/access/cancel/re-signup/precedence decisions; deletion design only before any code |
| W-DORMANT | H03, X16 | Approve an actual threshold and reactivation rule; no guessed days |
| W-PROVIDER-PROOF | J04, J05, X15 | Provider-supported once-only and accepted/DB-failure/timeout proof; no real provider setup or send now |
| W-EXPIRY | J09, J34, X03, X15 | Confirm deferred usefulness and kill-switch recovery policy Z-03/Z-19 using existing expiry helper |
| W-LEGAL-COPY | J23, J24, J25, X05 | Owner/legal review: refund/Terms match, footer and actual tracking disclosure; historical report not proof of current mismatch |
| W-DELIVERY | J27 | Domain/header and real receipt proof only after explicit testing/release authorization |
| W-COMPLAINT | J29 | Approve provider streams, complaint scope and operational owner |
| W-MONITOR | J33 | Select thresholds, operator and alert channel; reuse registry/heartbeat/admin surfaces |
| W-SUPPORT | J36 | Approve support visibility and audited resend/cancel authority |
| W-RETENTION | J44 | Decide legal retention/anonymization of bodies and logs |
| W-CLIENTS | J46 | Authorized manual client/device evidence, not provider-free unit tests |
| W-PRIORITY | X03, X12, X13 | Cart → itinerary → nudges tie order already approved; **future-day slot reservation** is a different decision; occasion contender also needs mapping |

## Historical proof limits and reconciliation gaps

1. **Atomic reset exists; do not rebuild.** ATOMIC-LOOPS records two initial
   and two REFINE loops: password 16/16, golden 194/194, helpers 54/54,
   guards 79/79; typecheck 110, ceiling 111, zero new diagnostics. These are
   historical records, not tests executed for this inventory. The current
   branch has additional proof assertions; their presence is not a fresh
   execution result. The retained absence evidence was 3/4 classes:
   inbox inspection was not done. No real delivery or elapsed-time claim.
2. **Missing-zone code exists; do not rebuild.** ZONE-DEV holds a missing
   zone, but only after the existing consent/quiet-hour preferences are
   otherwise valid. Invalid zone still maps to invalid_preferences.
   At inventory time no standalone two-clean-loop evidence was located.
   Fresh 2026-11-01 verification passed 10/10 targeted cases but failed
   2 surrounding cases (28/30 overall); 0 clean full loops. C25 remains
   NOT BUILT under the owner's loop-based definition, not “no code.”
   Do not rebuild the hold or promote the row from targeted passes alone.
   No production counts of invalid-preference cancellations were queried.
3. **Cart readable subset exists on the visible held branch; do not
   rebuild.** CART-LOOPS reports two clean native loops for Parts 4–6;
   main integration, complete lifecycle provenance and item-change
   provider handoff remain held. D17 date edits are not silently added
   to the approved add/remove/quantity activity definition.
4. **Part 8 is not uniformly green.** The retained matrix has six-loop
   failures/blocked rows and explicit risks. Its overall evidence must
   not be summarized as every scenario passing. The risk table also
   records actual webhook/replay limitations; later handler claims must
   be reconciled against this table before promoting D32.
5. **Residual measurements are synthetic.** Part 6 records ordinary
   verifier-return → invocation samples 0.281–0.349 ms, delayed cases
   18.762/19.851 ms. These are not network delivery bounds, all-rail
   safety or inventory guarantees. No new timing experiment was run.
6. **Family 5 history is not a code substitute.** Main CHANGE PD tests
   prove old-address notice/new-address verification behavior, including
   a deliberately non-fatal notice failure. They do not establish the
   complete pending-change/fresh-auth/audit-rollback workflow described
   in the PDF. Preserve and reuse main; reconcile gaps narrowly.
7. **Verification reminders are not located.** Searches for named
   verification-reminder implementations in main and the held commerce
   server/scripts did not identify A07. The PDF's BUILT label alone
   cannot justify marking A07–A12 built or inventing a lost branch.
8. **No scheduling/delivery certification.** This inventory did not
   inspect or activate a Scheduled Deployment, drain, live QA runner,
   inbox or provider webhook. Earlier real-clock approvals/missed runs
   are not current scheduler proof.

## Approval stop

Step 1 inventory only. Next proposed action is approve/correct this map and
confirm which WAITING blockers may be carried forward. Then identify only
remaining gaps in the required slice order, with an existing-files-only
touch list before each change. Atomic reset and held cart code must be
reused, not recreated. No runtime slice, test execution, real email setup,
provider call or release activation is authorized by this report.

## Historical build-only slice — signup time-zone capture

Owner approved the inventory, deferred C25 proof, approved this slice's
ten-file touch list for **build only**, and explicitly approved carrying
this report from the preserved branch because it is absent on latest main.
This section records implementation, not test success or release readiness.

| Item | State / boundary |
|---|---|
| Slice branch | `work/signup-timezone-capture-20261031` |
| Freshly fetched base | `09c6cb252a55b9adedce6a452425e9220aa44e58` |
| Preserved original inventory/atomic branch | `work/b05-j10-atomic-reset-main-20261031` at `dbe7c301a1c398af8795cc06242a5d1ba00e0571`; not deleted or reset |
| Approved report carryover | Documentation-only addition on this base; no wholesale application-code copy |
| Page and modal | Optional blank zone; browser suggestion remains separate until explicitly chosen; login/reset payloads unchanged |
| Server | Optional bounded IANA/Intl-valid zone; malformed supplied values rejected, blank omitted; new accounts only |
| Stored location | Existing `users.preferences.itineraryMarketing.timeZone`; no schema change |
| Atomicity | Existing preferences writer accepts the existing account/welcome transaction; no nested transaction for this caller |
| Existing preferences-writer callers | Without the optional transaction, retain the existing own-transaction path and afterWrite behavior |
| Duplicate account | Existing neutral flow does not execute the new-account preference write |
| Consent and quiet hours | Not inferred, enabled, or defaulted; a zone alone does not make marketing eligible |
| Sending | No email type, registry entry, direct sender, scheduler, allowlist or flag added/changed |
| Test additions authored | 5 registration cases, 3 preferences-writer cases, 3 UI/source-contract cases; **0 executed** |
| Builds / typecheck / static guards / registry / mutation-auth runs | **0 executed**; current diagnostic count and ceiling compliance not measured |
| Loop count / clean-loop count | **0 / 0**; no DEV-CLOSED claim |
| Provider / QA inbox / real-clock checks | **0**; none authorized or inferred |
| C25 evidence | Still deferred; no hold/expiry/invalid-preferences eligibility code changed |
| Counts | Unchanged: BUILT 33, EXISTS 76, WAITING 70, NOT BUILT 88, EXCLUDED 2 |

The counts above retain the approved inventory snapshot. This slice is
implementation-written with execution held, so it does not promote any
scenario to BUILT. The complete 269-row main mapping has not been
re-audited against the newer fetched base.

### Exact changed-file scope

1. `client/src/pages/Signup.tsx`: explicit optional zone and localized validation.
2. `client/src/components/SignInModal.tsx`: signup-only equivalent.
3. `client/src/locales/en/auth.json`: zone field/help/suggestion/error text.
4. `client/src/locales/ja/auth.json`: corresponding localized text.
5. `server/replit_integrations/auth/emailAuth.ts`: validate and save new-account zone.
6. `server/services/user-preferences-writer.ts`: optional caller transaction; reuse row lock and merge.
7. `server/__tests__/auth-three-defects.db.test.ts`: authored TZ1–TZ5.
8. `server/__tests__/user-preferences-writer.db.test.ts`: authored W4–W6.
9. `client/src/lib/__tests__/signup-provider-fields.test.tsx`: authored TZ-UI1–TZ-UI3.
10. `reports/automation-flow-tracker.md`: approved inventory carryover and this build-only record.

### Proof limitations

The authored UI cases combine server rendering and source-contract checks;
they do not prove real browser clicks, browser-zone failure handling or
modal interaction. The registration/database cases inherit their existing
disposable-database and signup-mode requirements; none were executed, and
no flag or shared database was changed to make them runnable.

The unexecuted cases do not prove rollback, concurrency, the client ceiling,
all four absence observations, or delivery. No existing test was weakened.
No promise of identical response timing is added. No live map, provider,
payment or production route was exercised.

**STOP: build-only work is not DEV-CLOSED. Testing, real email and release
remain held. No next slice starts without its own approved gap list.**

## Verification authorization — 2026-11-01

The owner clarified that build verification is authorized: typecheck,
static guards, registry, mutation-auth checks and provider-free loops.
Two consecutive clean provider-free loops are required for BUILT.
Real delivery, QA-inbox observation, real elapsed time, real-provider
concurrency and end-to-end journeys remain held. Sending settings stay off.

The earlier build-only 0-run record above is historical, not a continued
hold on provider-free verification. No scenario count is raised merely
because a test has been authored or because a browser-zone suggestion exists.

### Default and skipped-zone behavior

Both signup inputs default to an empty string. Browser zone detection only
offers a separate suggestion button; it does not select or submit the zone.
No IP, city, language or server-zone inference is made. A skipped/blank zone
is omitted from the request and no timeZone preference is written.
Signup does not create marketing consent or quiet-hour preferences.
Without valid marketing eligibility no marketing sends. On the held C25
implementation a missing-zone row holds only when the other consent and
quiet-hour preferences are already valid; invalid preferences retain their
existing cancellation behavior. That code is not silently copied into main.

### Browser pre-fill proposal — NOT IMPLEMENTED

Offer the browser-reported IANA zone pre-filled for review, with an explicit,
initially unconfirmed confirmation control. Submit the zone only after
confirmation or an explicit manual choice. If skipped, unavailable or
unconfirmed, omit it exactly as today. No IP fallback and no marketing
consent implication. Recommend this opt-in confirmation design; it requires
a separately approved touch list and provider-free browser-field proofs.

### Fresh verification evidence

Private evidence directory:
`.local/verification-evidence/signup-timezone-20261101/`.

The first signup typecheck reported 114 diagnostics, including 4 new
response-type errors in the two forms. Narrowing the existing response body
before accessing validation errors fixed those 4 without changing other
authentication paths. The fresh source baseline is 110, ceiling 111.

Two isolated-fixture setup gaps were also identified, without changing
shared data or runtime code: the empty fixture lacks the CI-required open
signup setting, and PostgreSQL LIKE INCLUDING ALL changes the copied email
unique-constraint name to users_email_key. Development's source constraint
was read-only verified as users_email_unique / UNIQUE (email).
Only each owned, disposable namespace receives the signup-mode fixture and
the original constraint name. Uniqueness is preserved, not weakened.
The missing-configuration attempt failed 11/22 tests; the next fixture
attempt passed 20/22 and exposed the copied-name mismatch. These failures
reset clean-loop counts and are not counted as successful loops.

The source review found no new sender, consent default, quiet-hour default,
table, schema migration or scheduler. The explicitly chosen zone adds the
existing locked preferences read/update inside signup's existing transaction;
omitting the zone adds neither query. No benchmark or real-provider proof
is claimed. Existing standalone preferences-writer calls retain their own
transaction and afterWrite behavior.

### Signup result — DEV-CLOSED, provider-free scope only

| Gate | Loop 3 | Loop 4 |
|---|---:|---:|
| Registration / preferences database cases | 22/22 | 22/22 |
| UI render / source-contract cases | 15/15 | 15/15 |
| Combined tests | 37/37 | 37/37 |
| Static guard batch | 79/79 | 79/79 |
| Mutation manifest / coverage checks | 2/2 | 2/2 |
| Registry / roster | 2/2 | 2/2 |
| Diagnostics / ceiling | 110/111 | 110/111 |
| New diagnostics vs fresh source baseline | 0 | 0 |
| Cancelled / skipped tests | 0/0 | 0/0 |
| Owned test schemas removed | 1 | 1 |

Two consecutive clean loops: 2. Runtime fix: response type narrowing in
2 existing form files. No globally clean typecheck claim: compiler exits
nonzero with the same 110 baseline diagnostics. Diagnostic identity was
compared against a separate checkout of the exact source base, not merely
against a count. Mutation rail set unchanged (739 registrations); stale
line-number notices are non-failing and no generated manifest was edited.

Absence assertions in the provider-free cases cover rejected/rolled-back
account/outbox state and unchanged duplicate preferences. Transport keys
are stripped by the retained harness and the real send gate remains off.
These are not QA-inbox observation, provider delivery or four-part live
absence proof. Browser interaction journeys were not run.

Evidence: `signup-final-summary.json`, `typecheck-comparison.json`,
`loop3-*`, `loop4-*`. Guard artifacts were moved from the runner's default
generated output into `guard-artifacts/` in the private evidence directory.
The original build-only record is superseded for signup build verification,
not for release authorization.

### C25 result — STOPPED / BLOCKED, not DEV-CLOSED

Verified the existing implementation from the preserved
`work/stage2-part4-atomic-reset-timezone` branch in a separate checkout.
No C25 code was copied into the signup slice and no C25 runtime or test
source was changed.

| Metric | Count |
|---|---:|
| Full isolated itinerary suite passed / total | 28/30 |
| Failed tests | 2 |
| Targeted missing-zone cases passed / total | 10/10 |
| Attempted full loops | 1 |
| Clean full loops | 0/2 |
| Second full loop executed | 0 |
| C25 runtime / fixture-source changes | 0/0 |
| Owned schema removed | 1 |

Failed retained tests:

1. `itinerary_followup_24h SQL loop 1: registry fires, persisted send, stable retry identity`
   — expected expert copy absent; the retained expert fixture lacks the
   verified-identity and complete-Connect fields required for eligibility.
2. `actual outbox claim routes a due follow-up and will not claim a future one`
   — expected 1 stub send, observed 0; the retained fixture lacks the
   explicit bookable/expert/age options used by the separately preserved
   fixture correction.

These match the two existing fixture-only corrections preserved in
`8a6a71630a0efa789dd57a031c5e9edd9cd02749`; they were identified, not applied.
The latest instruction says stop on a C25 loop failure. No retry, guarantee
change or runtime fix was attempted. This is not STRUCTURAL RISK after six
loops: only one full C25 loop was attempted.

The retained approved isolation tool reported migration-416 fixture column
already present (`added=0`) and removed its namespace. No migration was
applied to shared development. Evidence: `c25-loop1.log`,
`c25-loop1-summary.json`, `c25-final-summary.json`.

### Current register counts and held proof

| BUILT | EXISTS | WAITING | NOT BUILT | EXCLUDED | Total |
|---:|---:|---:|---:|---:|---:|
| 33 | 76 | 70 | 88 | 2 | 269 |

Changed scenario classifications: 0. Signup capture is a verified supporting
capability, not a new 270th scenario or completion of the absent verification
reminder family. C25 stays NOT BUILT because its full clean-loop gate failed.
A09 and F12 are not promoted. Real deliveries, QA-inbox observations, real
elapsed-time proofs, real-provider concurrency and journeys: 0 each.
Shared send-setting changes, production changes, migrations, pushes,
merges and deployment actions: 0 each. RELEASE HELD.
