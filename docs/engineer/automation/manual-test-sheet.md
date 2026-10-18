# Traveloure manual automation test sheet — recreated

**NEW RECREATION, NOT THE MISSING ORIGINAL. NOT EXECUTED.**
**DEV-CLOSED WITH BLOCKERS. RELEASE HELD.**

Prepared 17 October 2026 under the owner's explicit instruction to recreate
the sheet rather than search again. The earlier version could not be found.
This has **13 sections** derived from
`attached_assets/0_e2e-user-automation-test-plan-enhanced_1791907467831.md`
(J1–J25, C1–C20, N1–N24, B1–B12, SYS1–SYS12 and Gates A–F).
It is not evidence that these checks have run, and is not a substitute for
the pending 7 October readiness document.

Provenance: authored on working branch `main`, based on inspected revision
`aef47cbd1c5ee742dfcea026ec5ef5bc19d8d887`. This file is new in this change;
it has no prior file commit. The completion checkpoint supplies its eventual
commit identity; none is invented here. No commit or merge was performed by
the reporting work. This sheet contains no addresses, secrets or payment IDs.

## 1. Safety, setup and evidence form

**Instructions only. This sheet authorizes no execution.** Obtain separate
approval for the journey, exact code revision, fixtures, runner and allowed
failure injections before starting. A blocked precondition means STOP.

- Development only; QA-owned accounts and team-owned QA inboxes only.
  Never enter real customer addresses. Configure inboxes through the secure
  form, not this document. Prove the active development recipient guard
  rejects a non-QA destination using an approved provider-free fixture first.
- Stripe **test mode only**, verified by the approved operator. A key being
  present or a UI label is not proof of mode. Unreadable rails stay BLOCKED.
- No production, sender/flag/settings/workflow changes, restart, payment-code
  edit, schema change, migration, merge or release is authorized by this sheet.
  Restricted fixes require a proposed diff and owner approval.
- Use `/login` for account access; `/verify-email` and `/reset-password` for
  received links; `/cart`, `/bookings`, `/plans/:tripId`, `/inbox`,
  `/invite/:token`, `/plus/occasions`, `/expert/*` and `/provider/*` only for
  the fixture's own resources. Tokens and IDs remain in private evidence.
- Record case ID, persona role/state, code revision, seed, local zone,
  start time, due/latest times, loop number, redacted before/after state,
  outbox/receipt reference and operator. Store only redacted excerpts publicly.
  No raw messages, headers, addresses, tokens or payment identifiers in Git.
- For each case choose exactly one:
  `[ ] PASS  [ ] FAIL  [ ] BLOCKED (ID: ___)  [ ] NOT BUILT`
  `[ ] WAITING (ledger: ___)  [ ] N/A (approved reason: ___)`.
  Initially all boxes are empty. SOURCE PENDING is not PASS or FAIL.
- Two consecutive clean randomized loops close an executed journey; any
  failure resets the clean counter. Six loops without closure means
  STRUCTURAL RISK: stop. Manual checkboxes alone do not certify a flow.
- **Latest arrival:** let `t0` be the real recorded trigger and `d` the stored
  due time. Cart reminder 1 has an explicit 60–75 minute window. Where the
  plan specifies only a due time, record it, then mark the maximum delivery
  latency **SLA PENDING** until approved. Do not invent an “immediate = five
  minutes” limit. Quiet hours shift marketing to next eligible 09:00 local;
  a cap shifts to the next eligible local day. Record both adjustments.
- **Absence proof:** observe the complete approved suppression window and
  record both queue state and provider/receipt observations. A missing
  message in one inbox snapshot or a zero database count alone is insufficient.

Safety result: `[ ] PASS [ ] BLOCKED` Evidence: ___ Operator/date: ___

## 2. Signup, verification, linking and abuse — J1/J11/J21

Steps: open `/login`, choose signup, use a fresh QA identity; submit twice;
request verification through the app; open the received `/verify-email`
link in a clean browser; repeat the link and two simultaneous clicks.
Repeat with marketing disabled. Use an existing QA account to compare
signup status/body/redirect and measured timing without exposing existence.

| Case | Expected result | Latest arrival / observation end | Must not happen | Result |
|---|---|---|---|---|
| M2.1 Signup → verify → welcome | One verification; no welcome until verified; then one welcome, correct name/fallback and links | Verification at t0; welcome at verification; maximum latency SLA PENDING | Welcome before verification, duplicate welcome or marketing consent suppressing required notices | [ ] PASS [ ] FAIL [ ] BLOCKED ___ |
| M2.2 Resend / old / expired link | At most three resends/hour under plan; newest link only; safe expired/get-new-link page; no welcome from old link | Stored expiry; resend rolling-hour boundary; maximum send latency SLA PENDING | Process-local-only cap treated as durable proof; reuse activating an account | [ ] PASS [ ] FAIL [ ] NOT BUILT [ ] BLOCKED ___ |
| M2.3 Verification reminders | QA account unverified: reminders at 1h, 1d, 3d; verify before each due time in separate fixtures to prove cancellation | t0+1h/+1d/+3d; no fourth; maximum latency SLA PENDING | Any reminder after verification or to an ineligible account | [ ] PASS [ ] FAIL [ ] NOT BUILT [ ] WAITING ___ |
| M2.4 Social/linking | Use only enabled providers. Operator traces verified flag to server-validated token/profile. No flag/email requires Traveloure verification. Test verified existing password account, unverified existing account and new account | Provider callback/verification event; maximum latency SLA PENDING | Client-supplied verification, silent login/link to unverified victim account, second welcome | [ ] PASS [ ] FAIL [ ] BLOCKED ___ |
| M2.5 Neutral notice and flood | Approved bounded signup/reset/resend/contact attempts to QA-owned target; compare neutral responses and count actual messages; notice/resend counters independent | Approved address/IP window and timing tolerance: DECISION PENDING | Third-party flooding, existence leak, one counter starving the other | [ ] PASS [ ] FAIL [ ] BLOCKED ___ |
| M2.6 Hard bounce | Only approved isolated provider fixture: account flagged/admin alerted once, reason visible | Provider bounce event; SLA PENDING | Bounce retry loop or flagging an unrelated account | [ ] PASS [ ] FAIL [ ] NOT BUILT [ ] BLOCKED ___ |

## 3. Password reset — J2

Steps: request reset from `/login`; open received `/reset-password` link;
change password; try old password, new password and reused link. Request
two links sequentially and concurrently in fresh fixtures. Test an unknown
QA address and social-only QA account without revealing account existence.

| Case | Expected result | Latest arrival / observation end | Must not happen | Result |
|---|---|---|---|---|
| M3.1 Reset lifecycle | New password works, old fails, reset link single-use; password-changed notice once | Reset at t0, stored link expires at 60 minutes per plan; notice SLA PENDING | Old password works; missing change notice silently called PASS | [ ] PASS [ ] FAIL [ ] NOT BUILT [ ] BLOCKED ___ |
| M3.2 Sequential/concurrent requests | Second request invalidates first atomically; concurrent requests leave one active token | After both responses and through stored expiry | Two valid reset tokens or cross-account reset | [ ] PASS [ ] FAIL [ ] BLOCKED ___ |
| M3.3 Invalid/used/expired | Distinct safe expired and used pages; tampered link cannot act; unknown email same screen, no send | Stored expiry; approved suppression observation window | Generic page counted as distinct pages; unknown-email send or disclosure | [ ] PASS [ ] FAIL [ ] NOT BUILT [ ] BLOCKED ___ |

## 4. Security and account changes — J9/J12/J13

Steps: use isolated QA accounts in separate browser sessions. Attempt failures
1–5, including two concurrent failures around attempts 4/5. Exercise natural
unlock, known/new-device login, suspended login and email-change controls.
Do not suspend or change any real account.

| Case | Expected result | Latest arrival / observation end | Must not happen | Result |
|---|---|---|---|---|
| M4.1 Lockout | No notice at failures 1/2; warning at 3; lock and notice at 5; lock lasts 30 minutes, survives approved restart check; one natural unlock notice | Attempt 3/5 and stored lock+30m; delivery SLA PENDING | Login during lock, duplicate concurrent lock notices, restart without separate approval | [ ] PASS [ ] FAIL [ ] NOT BUILT [ ] BLOCKED ___ |
| M4.2 Device/suspension | Unknown device alert with truthful device/place/time; known device no repeat; suspended login is private in-app denial | Login event; alert SLA PENDING | Invented location, moderation detail leak or security email suppressed by marketing controls | [ ] PASS [ ] FAIL [ ] NOT BUILT [ ] BLOCKED ___ |
| M4.3 Email change | Old address alert, new address verification; change inactive until verified; existing-email result neutral | Change/verification event; SLA PENDING | Silent retarget of pending sequences, any later delivery to old address, unsolicited sequence to new address | [ ] PASS [ ] FAIL [ ] NOT BUILT [ ] BLOCKED ___ |
| M4.4 Mid-sequence eligibility | Before dispatch change email/suspend/delete only approved fixtures; cancellation reason matches recipient_changed/account_gone/no_email | Before next due/attempt; suppression observation window recorded | Ineligible account receiving queued or retried notice | [ ] PASS [ ] FAIL [ ] BLOCKED ___ |

## 5. Itinerary outcomes and follow-ups — J3

Steps: create a QA trip through `/plans/new`; generate its plan through the
real app. Open that trip's `/plans/:tripId`. Use an approved failure/timeout
fixture, then a second generation; test both completion orderings. Book only
through approved Stripe-test/readable rails for cancellation checks.

| Case | Expected result | Latest arrival / observation end | Must not happen | Result |
|---|---|---|---|---|
| M5.1 Ready/failed | One outcome per attempt; concurrent distinct generations produce distinct notices; real five-minute timeout fails once | Completion or t0+5m timeout; send latency SLA PENDING | Ready after same attempt failed; duplicate outcome | [ ] PASS [ ] FAIL [ ] BLOCKED ___ |
| M5.2 Follow-up timing | 2h nudge, 24h follow-up, 5d re-engagement at stored ready-time offsets and eligible local window | ready+2h/+24h/+120h, adjusted cap/window; latest latency SLA PENDING | Accelerated eligibility called real-clock, marketing outside local window | [ ] PASS [ ] FAIL [ ] WAITING ___ [ ] BLOCKED ___ |
| M5.3 Cancellation/supersession | Booking through each readable writer, newer plan, deleted trip/account cancels applicable old follow-ups; expert/fallback path correct | Before pending due time; suppression end recorded | Old worker resurrects superseded sequence or paused/nonbookable service qualifies 5d | [ ] PASS [ ] FAIL [ ] BLOCKED ___ |

## 6. Cart and guest claim — J4/J8

Steps: add a real catalog fixture from `/services/:id` to `/cart`; inspect
only approved redacted snapshot/activity evidence. Leave idle at real time.
Use two carts and a returning-user sequence. Repeat signed out, then sign
in as the intended QA owner and claim. Do not collect unauthenticated email.

| Case | Expected result | Latest arrival / observation end | Must not happen | Result |
|---|---|---|---|---|
| M6.1 Snapshot/stamp | Server price/currency/availability/time captured; only real activity updates neutral stamp; forged client values ignored | At successful add/update response | Invented original price, guest email capture, arbitrary client timestamp | [ ] PASS [ ] FAIL [ ] BLOCKED ___ |
| M6.2 Reminder sequence | One reminder at 1h, 1d, 3d; independent carts; returning and idling begins valid new sequence | First at stored activity+60m to +75m; later due +24h/+72h, maximum latency SLA PENDING; window/cap shifts recorded | Fourth reminder, paid/empty/ineligible cart send, skipped day suppresses later valid step | [ ] PASS [ ] FAIL [ ] WAITING ___ [ ] BLOCKED ___ |
| M6.3 Guest claim | Unclaimed guest sends nothing; claim preserves snapshot and starts timing only after authenticated ownership | claim+60m to +75m for first reminder | Wrong-account claim, pre-claim send, guest never claiming receives mail | [ ] PASS [ ] FAIL [ ] WAITING ___ [ ] BLOCKED ___ |

## 7. Price and availability change — J5

**Always BLOCKED for actual item-change dispatch until
`must_have_payment_ordering_unknown` is resolved and separately authorized.**
Steps, only if approved provider-free: change a fixture price up, down, then
availability; compare snapshot and queue-decision/template evidence.

| Case | Expected result | Latest arrival / observation end | Must not happen | Result |
|---|---|---|---|---|
| M7.1 Change decision | One intent per observed change, notified values atomically recorded; must-have rules preserved | Next approved sweep decision; actual arrival BLOCKED, no deadline claimed | QA copy counted as actual dispatcher send; marketing residual accepted for must-have | [ ] BLOCKED must_have_payment_ordering_unknown |
| M7.2 Missing snapshot / A→B→A | no_snapshot skip, no invented original; between-sweep observation limit explicitly recorded | Approved decision pass, no send | Fabricated old value or unobserved intermediate change asserted detected | [ ] BLOCKED must_have_payment_ordering_unknown |

## 8. Payments and booking lifecycle — J6/J16

Steps: use only approved readable Stripe-test rails and QA services, then
view `/bookings`. Canonical and legacy booking cases are separate fixtures.
Replay signed **test** webhook three times only after approval; exercise
success-page/webhook concurrency and both payment/enqueue orderings. Other
rails remain BLOCKED until readable provenance and authorization exist.

| Case | Expected result | Latest arrival / observation end | Must not happen | Result |
|---|---|---|---|---|
| M8.1 Confirmation/cancellation | One confirmation per canonical/legacy booking, correct recipient/amount/currency/local date; payment cancels pending marketing across lanes | Authoritative payment/booking event; latency SLA PENDING | Live charge, duplicate confirmation, any financial state changed by email handling | [ ] PASS [ ] FAIL [ ] BLOCKED ___ |
| M8.2 Lifecycle notices | Failure, expired claim, late-success refund, cancellation/refund, decline each once per authoritative event | Event-specific due times; transport SLA PENDING; payment retry policy D9 OPEN | Transport retry treated as payment retry permission or false “refunded” status | [ ] PASS [ ] FAIL [ ] BLOCKED ___ |
| M8.3 No-response/provider alert | 48h no-response in-app; email only per preference; provider booking alert respects opt-out | Stored booking+48h; actual scan bound/SLA PENDING | Earner email despite opt-out or duplicate notification on replay | [ ] PASS [ ] FAIL [ ] WAITING ___ [ ] BLOCKED ___ |

## 9. Consent, quiet hours and collisions — J7/J22

Steps: open received unsubscribe URL with GET first, then explicitly confirm.
Set up only approved fixture boundaries at 08:59:59, 09:00, 19:59:59, 20:00
local; unknown zone and half-hour/DST cases. Use same-day cart/itinerary
eligibility, then booking, unsubscribe and kill-switch scenarios without
changing any current flags under this sheet.

| Case | Expected result | Latest arrival / observation end | Must not happen | Result |
|---|---|---|---|---|
| M9.1 Consent | GET does not mutate; confirmation stops marketing/cancels with reason; security/must-have continue | Before next due/attempt; explicit observation end | Prefetch unsubscribes user or required notices silently suppressed | [ ] PASS [ ] FAIL [ ] BLOCKED ___ |
| M9.2 Window/cap/unknown zone | Marketing only 09:00 inclusive to before 20:00 local, at most one/day; no stored zone skips with reason | Next eligible local 09:00/day; delivery SLA PENDING | Guessed zone, second daily send, UTC day mistaken for local day | [ ] PASS [ ] FAIL [ ] BLOCKED ___ |
| M9.3 Priority/cross-lane | One eligible marketing send, others deferred and rechecked; booking stops both lanes | Approved next eligible scan/day | Lost deferred obligation; test expectation treated as final D11 priority approval | [ ] BLOCKED D11 [ ] PASS after approval [ ] FAIL |
| M9.4 Headers/control | Marketing unsubscribe and one-click headers; required notices not misleadingly opted out; kill-switch bypasses listed | Received copy/current dispatch observation; scope approval required | Outbox-only suppression reported as all direct sends suppressed | [ ] PASS [ ] FAIL [ ] BLOCKED ___ |

## 10. Deletion and engagement — J14/J15

Steps: use only disposable QA accounts. Locate account-deletion control in
the app (self-service backend `DELETE /api/auth/account`,
`server/replit_integrations/auth/routes.ts:203`); **do not submit** while
D2/D3/state-change approvals are absent.
For approved future fixtures compare retained/legal data and test reactivation
at day 1, 4, 6 and one hour before cutoff. Separately use incomplete profile,
no-itinerary and dormant-state fixtures for nudges.

| Case | Expected result | Latest arrival / observation end | Must not happen | Result |
|---|---|---|---|---|
| M10.1 Deletion grace | “Removed, with legal and accounting exceptions”; account intact through grace; completion/anonymization at day 7; marketing cancelled | Request notice t0; reminder day 5; complete day 7; transport SLA PENDING | Immediate anonymization called grace compliance; “fully deleted” claim; real-data deletion | [ ] BLOCKED D2/D3 |
| M10.2 Reactivation race | Login cancels reminder/completion, account usable; request/login concurrency consistent | Before approved cutoff; accelerated cases explicitly NOT real-clock | Deleted-but-reactivated partial state or future completion after cancellation | [ ] BLOCKED D2/D3 |
| M10.3 Profile/planner/dormancy | Profile at welcome+2d only if incomplete; planner at +3d only without itinerary; dormant threshold owner-approved first | +48h/+72h; dormant deadline DECISION PENDING; SLA PENDING | Marketing rules bypassed; guessed dormant threshold or unsupported velocity inference | [ ] PASS [ ] FAIL [ ] NOT BUILT [ ] BLOCKED ___ |

## 11. Plan, provider, expert and admin — J17/J18

Steps: use QA traveler/earner/admin roles and their own `/plans/:tripId`,
`/expert/messages`, `/provider/messages`, `/expert/bookings` and
`/provider/bookings`. Apply approved state transitions and re-save the same
state. Admin manually invokes only the approved dev digest path
`POST /api/admin/digest/send-now` or `/api/admin/trigger-digest`.
These routes are instructions, not permission to invoke them now.

| Case | Expected result | Latest arrival / observation end | Must not happen | Result |
|---|---|---|---|---|
| M11.1 Plan decisions | Delivered/approved/changes-requested/new-suggestion correct; suggestion email only after approval, earlier in-app | Approved transition; SLA PENDING | Pre-approval suggestion email or alias counted twice as itinerary-ready | [ ] PASS [ ] FAIL [ ] BLOCKED ___ |
| M11.2 Earner transitions/activity | Provider/expert approval/rejection and verification decision once per transition; message/quote/review/advisor notices correct recipient | Transition; new-message throttle one per sender/recipient/hour; send SLA PENDING | Re-save duplicate, wrong role/destination, opted-out earner email | [ ] PASS [ ] FAIL [ ] BLOCKED ___ |
| M11.3 In-app reminders | Connect onboarding cooldown 72h; handover nudge 48h before trip | Stored cooldown/due time; next-scan maximum SLA PENDING | Ineligible/complete onboarding nudged or fabricated location/time | [ ] PASS [ ] FAIL [ ] WAITING ___ [ ] BLOCKED ___ |
| M11.4 Admin digest/nightly QA | Manual digest shows failures/dead rows; nightly report has isolated CLI provenance; unauthorized caller denied | Manual trigger; nightly scheduled deadline/configuration UNKNOWN | Manual result called scheduled-production proof; QA findings stopping app; non-admin sends | [ ] PASS [ ] FAIL [ ] BLOCKED digest_scheduler_prod_only |

## 12. Invites, occasions, notification/push and bulk — J19/J20/J23/J24/J25

Steps: organizer uses the app guest-invite action and QA guest opens
`/invite/:token`; Plus QA user configures `/plus/occasions`; opt-in QA device
and `/inbox` receive approved events. For vendor bulk use approved QA trip
and its contracts only; route/service are observe-only until separately
authorized. Inspect a calendar attachment without exposing its identifiers.

| Case | Expected result | Latest arrival / observation end | Must not happen | Result |
|---|---|---|---|---|
| M12.1 Invite | Atomic claim/debounce, failed enqueue releases claim; hidden event refused; recipient accepts safely | Organizer event; delivery SLA PENDING | “Accepted” logged as “delivered”, duplicate, cross-event access | [ ] PASS [ ] FAIL [ ] BLOCKED ___ |
| M12.2 Occasion | Plus only, 14-day lead, once per cycle and notification; no home city/deleted/suspended account | Stored occasion minus14d; next scheduled-pass deadline UNKNOWN | Non-Plus eligibility or duplicate draft/notice | [ ] PASS [ ] FAIL [ ] WAITING ___ [ ] BLOCKED ___ |
| M12.3 In-app/push | One notification per event/dedupe key; push once/subscription; invalid subscription removed; sweep covers bypass writer | Immediate producer / next five-minute sweep; latest device delivery SLA PENDING | Provider acceptance called device receipt or shared helper mistaken for every dynamic event covered | [ ] PASS [ ] FAIL [ ] BLOCKED ___ |
| M12.4 Vendor bulk | Authorized own-trip contracts; sent1/failed0 only after actual success; calendar attached; disabled/failure yields failure/no sent log | Approved manual event; SLA PENDING | Test causes real vendor email, failed send logged sent, out-of-trip contract IDOR | [ ] PASS [ ] FAIL [ ] BLOCKED observe_only |
| M12.5 Not-built guard | Provider-free source/reachability check plus approved absence proof for named missing families | Defined observation window, pending approval | Sending to “test” absence; absence of filename alone called unreachability proof | [ ] PASS [ ] FAIL [ ] BLOCKED not_built_automation_reachability_guard |

## 13. Failure, system gates, human email review and sign-off — J10/SYS1–12

Steps: under separate approval use isolated fault seams for provider-down,
query failure, accept-then-persist failure, expired lease, concurrent drains,
cancelled retry and admin reset. Admin queue is
`GET /api/admin/email-outbox`; retry is
`POST /api/admin/email-outbox/:id/retry`. Never retry a real row under this
sheet. No process restart, load run or live job invocation is authorized now.

| Case | Expected result | Latest arrival / observation end | Must not happen | Result |
|---|---|---|---|---|
| M13.1 Retry/dead/recovery | Transport backoff as built 5/15/45/120/360m, six attempts; first retry genuine time, later accelerated labeled; dead visible/admin-only reset; expired lease once | Stored retry_after; delivery SLA PENDING | Cancelled row delivered, duplicate accepted-and-retried effect hidden, guessed provider idempotency | [ ] PASS [ ] FAIL [ ] WAITING ___ [ ] BLOCKED ___ |
| M13.2 SYS1–7/11–12 | Approved switch/rollback, two sweeps, restart/lease safety, QA-only drain, bounded 10k synthetic performance/connection evidence, failed scans fail, registry and honest heartbeat | Per approved run/recorded due time; performance bounds require plan/approval | Empty-success heartbeat after query error, new production load, static roster pass claimed actual firing | [ ] PASS [ ] FAIL [ ] BLOCKED ___ |
| M13.3 SYS8–10/Gates A–F | Typecheck at existing baseline, no new-module diagnostics, guards/auth checks and golden retained counts; complete bindings/persona applicability/evidence/negatives/blockers/clock ledger | Before execution closure/release review | Raised baseline, missing evidence cell called PASS, source-pending row included in percent | [ ] PASS [ ] FAIL [ ] BLOCKED ___ |
| M13.4 Human clients | Gmail/Outlook phone+desktop, Apple Mail if used: placement, HTML/plain text, dark/images-off, correct sender, real phone links; screen reader on email/unsubscribe/reset; SPF/DKIM/DMARC redacted pass evidence | After each actual delivered QA copy; human review before release | Inbox placement inferred from delivered webhook; raw headers/addresses committed | [ ] PASS [ ] FAIL [ ] BLOCKED human_review_pending |
| M13.5 Clock/release | Every real-clock case has stored start/due/latest/runner and result; original missed cart scenario stays failed/missed, no backfill; D1–D12 distinct from E2E decisions; named human release approval | Real due time; authorized scheduler N cycles not yet chosen | Backdated/accelerated result called real-clock; report treated as production/release permission | [ ] PASS [ ] FAIL [ ] BLOCKED D12 |

**Final record (blank until separately authorized execution):**
Loop seeds ___ / ___; clean loops ___; defects ___; blocker IDs ___;
redacted evidence references ___; human reviewer ___; approval scope/date ___.
Do not mark the sheet passed merely because it has been authored.

**DEV-CLOSED WITH BLOCKERS. RELEASE HELD.**
