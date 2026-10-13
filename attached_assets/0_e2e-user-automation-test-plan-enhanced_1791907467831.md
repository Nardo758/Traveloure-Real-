# END-TO-END USER AUTOMATION TEST PLAN (LOOPED, EXHAUSTIVE)

Paste everything below this line into Replit AI.

---

Apply the Master Brief and Loop Protocol. If anything below is
stricter, the stricter rule wins.

## HARD LIMITS

DEVELOPMENT ONLY. QA inboxes only. No real traveler emailed. No
production, payment-code, checkout, schema, flag or sender changes.
No merge. Do not start new Parts. Show the plan and file list BEFORE
building any test, then wait for my OK.

A defect whose only fix sits inside a restricted area becomes BLOCKED
with a blocker ID and a proposed fix for my decision. Never patch it
quietly. Dev-only toggles needed for a test (kill switch, node
enabled flag) are allowed, recorded before and after, and restored.

## 0. OPERATING RULES

0.1 Statuses. Every cell ends as exactly one of: PASS, FAIL, BLOCKED
(blocker ID), NOT BUILT, WAITING (real clock, due time), N/A
(pre-approved by me in the plan, with reason). Nothing else. Nothing
may be left unreported.

0.2 Evidence. Every PASS carries an evidence ID
E-{loop}-{journey}-{persona}-{check}-{n} pointing to: outbox row ID,
provider receipt ID, DB query before/after, timestamps, and a
redacted content capture. "Outbox row exists" or "provider accepted"
alone is never a delivery pass.

0.3 Absence proof (for every negative case). Nothing-was-sent is only
proven by all four: (a) outbox query shows no row for the key, or a
row cancelled with the expected reason code; (b) provider events for
the QA address show nothing in the window; (c) the QA inbox shows
nothing; (d) the sweep or dispatcher log line shows the decision.
Observation window: at least two sweep cycles (30 min) and one
dispatcher drain after the moment the email would otherwise be due.
For real-clock negatives the window cannot be shortened.

0.4 Randomization. New random data every loop: names (including none,
unicode, RTL, very long, and hostile markup such as quote and angle
bracket payloads), languages, time zones, amounts, currencies,
counts, timing offsets, event orderings. Log every seed so any
failing loop can be replayed exactly.

0.5 Repo hygiene (the repo is public). Commit only redacted excerpts.
Never commit raw .eml files, header dumps, inbox addresses, payment
identifiers, tokens, or agent working-memory folders. Never print the
QA inbox address or any secret in output.

0.6 Honesty. Never weaken an assertion to get green. Fix the test if
the test is wrong. Flag the code if the code is wrong. Never claim
"complete" or "all rails covered" unless every row is PASS.

0.7 Safety order of operations. Step 1 (environment guards) must
pass before any journey runs. If a guard fails, stop and report.

## 1. DEFINITIONS

- Real clock: wall-clock time passing for real. No system-clock
  changes, no backdated timestamps. Manually triggering the real job
  through its internal route at the real due time IS allowed (the
  clock and the job are real); record who or what triggered it.
- Accelerated test: logic test using controlled time. Allowed for
  logic coverage, labelled "NOT real-clock", never closes a
  real-clock item.
- Loop: one full randomized run of a journey, then break attempts
  (Step 6), then rerun of the journey and the golden suite.
- Closed: 2 consecutive clean loops. Any failure resets to 0. After 6
  loops without closing: STRUCTURAL RISK, stop, report the exact
  breaking step.
- Golden suite: the existing regression tests for already-certified
  automations (identified in Step 0.8). Rerun after every fix.

## 2. STEP 0. INVENTORY (report only, then wait for my OK)

0.1 Registry: real count. For each automation: id, file, trigger,
eligibility rules, type (must-have / security / marketing /
in-app / internal), outbox type, template, link or action in the
email, idempotency key, cancel rules, enabled flag, which commit it
lives on (main, or which open branch).

0.2 Outside the registry. Find every other user-facing sender:
direct provider calls, auth emails, application-decision emails,
plan and suggestion notices, payment and refund notices, vendor bulk
email, admin digest, nightly QA report, scripts, importers, admin
tools. File and line for each. Mark outbox-routed or direct. These
are tested observe-only (no sender changes), and gaps are reported,
not fixed.

0.3 In-app and push: every notification type, its dedupe key, its
push behavior, and whether it also emails.

0.4 Jobs: every scheduler and sweep that sends or enqueues (cadence,
internal route, heartbeat, whether it runs in dev, what actually
executes it at due time in dev).

0.5 Payment rails: list every rail (canonical cart checkout,
legacy bookings table, balance or deposit payments, ready-made
purchases, memberships, Connect) and mark each READABLE or
UNREADABLE by the send-time check. UNREADABLE rails become BLOCKED
with an ID.

0.6 NOT BUILT list, now: for example one_credit_left,
out_of_credits, ai_chat_abandoned, wishlist_price_drop,
saved_search_alert, and anything the registry lacks. Confirm none is
reachable (see J25).

0.7 Blocker ledger: create reports/blockers.md. Every BLOCKED cites
an ID. Known: must_have_payment_ordering_unknown. Propose IDs for
the rest (for example digest_scheduler_prod_only when a path cannot
run in dev).

0.8 Golden suite: list the files and the current pass counts as the
baseline.

0.9 Spec deviations to ask me about BEFORE testing (do not decide
them yourself):
- D1 Signup order. The older signup spec says verify first, then
  welcome. J1 as originally written lists welcome before
  verification, and the newer welcome send-time checks do not test
  for verification. Report which order is built. I choose which is
  intended. Test the chosen one; anything else is DEVIATION.
- D2 Retry ladder. The brief says retry at 1, 5, 30 minutes then
  alert. The outbox implements 5, 15, 45, 120, 360 minutes, six
  attempts, then dead. Test the implementation as built. I decide
  which is intended.
- D3 Kill switch scope. The outbox honors the platform kill switch.
  Several direct senders check only the provider key. Report each
  direct sender's behavior with the switch off.
- D4 After an email change, whether pending sequences are cancelled
  or re-targeted to the new address (expected: cancelled, because the
  recipient check fails).
- D5 Thresholds I have not fixed (for example dormant-user days).
  Unfixed means NOT BUILT or BLOCKED, never guessed.

0.10 Coverage map: every automation and every outside-registry
sender mapped to at least one journey, and every journey step mapped
to an automation. An automation with no journey, or a step with no
automation, is a plan defect to fix before I approve.

## 3. STEP 1. ENVIRONMENT AND SAFETY GUARDS (must pass first)

E1 Prove the dev database URL differs from production. Abort if
equal.
E2 Recipient allowlist: a fixture with a non-QA recipient must be
blocked or redirected by the dev drain. Prove it.
E3 Blast radius: seed 500 eligible fixtures. One sweep and one drain
must stay within the per-run cap and reach only QA inboxes.
E4 Kill switch baseline: off stops every outbox send. Record each
direct sender's behavior (D3).
E5 Fixture tagging and cleanup: every row created by tests carries a
run tag; cleanup removes only tagged rows; delivery audit rows stay.
E6 Clean browser profile for every link test (no existing session).
E7 Provider mode: record which provider account and mode dev uses,
and which sender domain and authentication results appear on
received copies (SPF, DKIM, DMARC pass as shown in the received
headers, redacted).
E8 Runner liveness: before any real-clock item, prove something is
actually executing the sweeps and drains at due time in dev (app
awake, jobs registered, heartbeat advancing). If dev sleeps, say so
and plan manual real-time triggers.

## 4. STEP 2. PERSONAS (QA-owned accounts only, new random data each loop)

Travelers
P1 new signup (email and password). P2 returning user.
P3 guest who later claims a cart. P4 unsubscribed from marketing.
P5 suspended; P5b pending deletion; P5c deleted or anonymized.
P6 time zones: Asia/Calcutta, Europe/London, America/New_York, a zone
with a daylight-saving change, one with NO stored time zone, one with
an invalid zone string.
P7 user with two carts. P8 user whose email changes mid-sequence.
P9 user who pays on each readable rail.
P10 user who completes the trip, and one who abandons it.
P11 social-login user (Replit OIDC, Facebook), including a provider
account that returns no email.
P12 name edge cases: no name, unicode, RTL, very long, hostile
markup; non-English language; language unset.
P13 plan types: Plus member, Trip Pass holder, pay-per-use user.
P14 user whose daily marketing cap is already used.
P15 address that bounces or complains (use the provider's test
addresses if the allowlist permits).
P20 organizer and invited guest.

Other roles
P16 provider (approved, unapproved, rejected). P17 expert (approved,
pending). P18 admin, plus a non-admin control.
P19 attacker flooding a third party's address (abuse persona).

Applicability: for each journey, list required personas (R),
optional (O) and not applicable (N/A with reason) in the plan. I
approve that table. No cell is skipped silently.

## 5. STEP 3. JOURNEYS (each run through the real app path)

Format: steps, expected result, personas, negatives. Real-clock items
are marked RC.

J1 SIGNUP, VERIFY, WELCOME. P1 P4 P5 P6 P11 P12.
Real form, verification email, click link, account verified, welcome
(order per D1). Expect one verification and one welcome, correct
name or "there", working links, no duplicate on double-click or two
simultaneous clicks, welcome and verification both still sent to
marketing-unsubscribed users (must-have). Negatives: welcome to
deleted, suspended or changed-email accounts; second welcome after
an email change.

J2 PASSWORD RESET. P1 P2 P4 P5 P11.
Request, email, link opens, set password, reuse fails. Expired link
(60 min) fails with its own page. Used link has a distinct page. A
second request invalidates the first. Unknown email: identical
screen, nothing sent. Password-changed notice once. Social-only
account behavior documented. Two simultaneous requests: one active
token.

J3 TRIP PLANNING. RC. P2 P6 P10 P12 P13.
Itinerary ready (once per itinerary; two concurrent generations give
two distinct emails). Itinerary failed (forced failure, and a real
five-minute timeout; a late completion must never send a ready email
after a failure). 2h nudge, 24h follow-up, 5d re-engagement. Booking
cancels the remaining follow-ups through every booking writer. A
newer itinerary supersedes the older sequence even if the older
worker finishes late. Expert branch and top-rated-activity fallback.
5d only when the plan has bookable items; paused service suppresses
it. Deleting the itinerary or account cancels pending rows.

J4 CART. RC. P2 P3 P6 P7 P14.
Add item: server records price, currency, availability, capture time
(client-supplied price is ignored) and the activity stamp. Idle:
reminder 1 at 60 minutes (delivered in the 60 to 75 minute window),
reminder 2 at 1 day, reminder 3 at 3 days, no fourth. Paid on any
rail, empty cart, unsubscribed, or item changed today cancels or
skips the right step only (a skipped day must not block later
steps). Returning to the cart and idling again starts a new
sequence. Two carts run independent sequences. Daily cap applies.

J5 ITEM CHANGE. P2 P4 P7. Dispatch is BLOCKED by
must_have_payment_ordering_unknown. Test only the template and the
queue decision. Price up, price down, sold out, no snapshot (skip
with no_snapshot, never invent an original), A to B to A between
sweeps (documented limit), one notice per observed change,
notified values recorded with the enqueue decision. Mark BLOCKED,
never PASS. The accepted marketing-reminder residual window does
not apply to this must-have email.

J6 PAYMENT. P9 P2 P7. Every READABLE rail from 0.5, Stripe test
mode. Pay, then exactly one booking confirmation per rail (canonical
and legacy each once). Pending reminders and follow-ups cancelled.
Signed webhook replayed 3 times. Webhook and success page at the
same moment. Payment landing between enqueue and send, both
orderings. Payment-failed notice once per failure. UNREADABLE rail:
BLOCKED.

J7 UNSUBSCRIBE. P4 P2. Opening the link with GET changes nothing; the
explicit confirm step changes consent. Marketing stops (reminders,
nudges, follow-ups). Must-have and security emails continue
(verification, reset, confirmations, failure notices, security
alerts). Mid-sequence unsubscribe cancels pending marketing rows
with reason unsubscribed. Check List-Unsubscribe and one-click
headers on marketing mail; absence is a recorded GAP with severity.

J8 GUEST TO CLAIM. P3. Guest cart sends nothing. No unauthenticated
email capture exists. Sign-in claims the cart, and reminders start
only from then (1h is real clock). A cart claimed by a different
account than expected is handled safely. A guest who never claims
gets nothing, ever. Snapshot survives the claim.

J9 ACCOUNT CHANGE MID-SEQUENCE. P5 P5b P5c P8. Email changed,
account suspended, pending deletion, deleted: every pending row is
cancelled with the right reason (recipient_changed, account_gone,
no_email). Nothing goes to the old address after a change (D4).
Nothing unsolicited goes to the new one.

J10 FAILURE HANDLING. All personas. Provider down. Provider accepts
and then the database write fails (check whether the provider call
carries an idempotency key; if not, measure and document the
duplicate window). Retry ladder exactly as built (D2); first retry
is real clock, later steps accelerated and labelled. Dead row after
the last attempt. Admin reset of a dead row. Dead row visible in the
admin digest: test through the manual digest route; the scheduled
digest runs only in production, so that path is BLOCKED (suggested
ID digest_scheduler_prod_only). Restart mid-send. Two drains at
once. Expired processing lease is reclaimed once. Cancelled row
retried sends nothing.

J11 VERIFICATION REMINDERS AND LINKING. RC. P1 P11 P15.
Resend limited to 3 per hour counted in the database (not
process-local), only the newest link works. Reminders at 1h, 1d, 3d,
stopped by verification, 3d is last. Expired link and old link after
resend fail safely with a get-new-link page and no welcome.
Already-have-account email plus an identical-looking signup screen.
Hard bounce flags the account and creates an admin alert without a
retry loop (NOT BUILT if absent). Provider-link notices for Facebook;
a disabled Google node never fires (prove the engine respects the
flag).

J12 SECURITY. P1 P2 P5 P19. Lockout (5 consecutive failures, 30
minute lock, if built per spec; otherwise NOT BUILT): nothing at
1 and 2, warning at 3, lock plus email at 5, lock survives restart,
unlock by natural expiry sends once, success resets the counter,
correct password during lock still blocked with a neutral message.
Two simultaneous failures at attempt 4 and 5 give one lock and one
email. New-device alert: unknown device alerts with device, place,
time; known device repeats do not; note VPN false positives.
Suspended login: in-app message only, reveals nothing about the
moderation case. Security emails ignore marketing opt-out, quiet
hours and the daily cap.

J13 EMAIL CHANGE. P8 P2. Old address gets an alert, new address gets
a confirm, an unconfirmed change stays inactive, a change to an
already-registered email gives a neutral result, pending sequences
re-checked per J9.

J14 DELETION. P5b P5c. Request: confirmation wording says removed
with legal and accounting exceptions and never "fully deleted".
Account untouched during grace (DB before and after). Reminder two
days before cutoff. Anonymization only at day 7. Reactivation at day
1, 4, 6 and one hour before cutoff cancels the reminder and the
completion and leaves the account fully usable. Request versus login
at the same instant ends in one consistent state. All pending
marketing cancelled. If the build anonymizes immediately, record
DEVIATION, not PASS. Grace-period timing beyond what real time
allows is accelerated and labelled.

J15 NUDGES. P1 P2 P10. Profile nudge (2 days after welcome, skipped
when complete). Planner nudge (3 days after welcome, skipped when an
itinerary exists). Dormant-user email only if the threshold is fixed
(D5), else NOT BUILT. Unusual-sign-in velocity NOT BUILT if the data
cannot support it. All obey cap, quiet hours, unsubscribe.

J16 BOOKING LIFECYCLE NOTICES. P9 P2. Canonical confirmation once.
Legacy confirmation once. Payment failed. Expired-claim notice once.
Late-success refund notice once per refund. Cancellation and refund
notice. Booking declined. 48-hour no-response notice (in-app always;
email only if the preference allows). Provider-side booking alert
(opt-out honored). Each: one email, right recipient, correct
amounts, currency and local dates.

J17 PLAN AND SUGGESTION. P2 P17. Plan delivered, approved, changes
requested, new suggestion (emailed only after approval; before
approval it is in-app only).

J18 PROVIDER, EXPERT, ADMIN. P16 P17 P18. Application approved or
rejected (only on entry into the state; re-saving repeats nothing).
Verification decision. New booking alert. Quote-request notice once.
Review received. New-message email (throttle: one per sender and
recipient per hour, earners only). Advisor invite. Connect onboarding
reminder (in-app, 72 hour cooldown). Trip-card handover nudge
(in-app, 48 hours before). Admin daily digest (manual route in dev).
Nightly QA report. Non-admin cannot trigger admin sends.

J19 GUEST INVITES. P20. Organizer sends; atomic claim and debounce;
failed enqueue releases the claim; hidden events refused; "accepted"
is never logged as "delivered".

J20 OCCASION DRAFTS. P13. Plus members only, 14-day lead, one per
cycle, notified exactly once, none for non-Plus, no home city,
deleted or suspended users.

J21 ABUSE. P19. Flood a third party's address: signup, reset,
resend, contact form. Caps hold, responses stay neutral, outbox
volume stays bounded, and no tell exists in response body, status,
timing (compare within tolerance) or email content.

J22 CROSS-LANE COLLISIONS. P14 P2 P10. Itinerary and cart due the
same day: cart wins. Three or more marketing emails due: exactly
one sends, the others are deferred (not lost) and re-checked. A
booking stops both lanes in the same instant. Deletion cancels
everything. Unsubscribe and kill switch mid-sequence.

J23 IN-APP AND PUSH. P2. Each notification type creates exactly one
notification; dedupe keys hold; push is attempted once per
subscription; invalid subscriptions are removed; the sweep catches
writers that bypass the immediate push.

J24 VENDOR BULK EMAIL. P2. Observe-only. Route returns sent 1,
failed 0; the calendar file is attached; a failed send is not
counted or logged as sent; email disabled gives failure and no log
row.

J25 NOT-BUILT GUARD. Prove none of the NOT BUILT automations can send:
no outbox type, no trigger, no reachable template.

## 6. STEP 4. CHECKS AT EVERY STEP OF EVERY JOURNEY

C1 Trigger: fires on the right event only.
C2 Eligibility: every rule (consent, quiet hours 09:00 inclusive to
20:00 exclusive local, daily marketing cap, paid check, snapshot,
plan type, language).
C3 Queue: exactly one outbox row, correct key, correct recipient,
correct type.
C4 Send-time check: re-verifies live data and cancels on any
mismatch with the right reason code (one fixture per reason code).
C5 Delivery: delivered receipt ID and outbox row ID.
C6 Content: correct name or fallback, destination, price, currency,
local time, links, unsubscribe link on marketing only, language, no
placeholder text, hostile names escaped (no markup executes), HTML
and plain-text parts agree.
C7 Link or action: works in a clean browser, only for the right
person, single use where required, fails safely when expired or
tampered, never opens another user's resource, no open redirect.
C8 After state: no duplicate, history recorded, heartbeat healthy.
C9 NEGATIVE: the cases in Step 5, proven by absence proof (0.3).
C10 Observability: skipped and cancelled rows carry a reason, and a
person can see failures.
C11 Idempotency: the same event three times gives one effect.
C12 Concurrency: both orderings of every race tested.
C13 Privacy: nothing about other users, moderation reasons, or
internals appears in any email.
C14 Data integrity: before and after row diff on payment, booking
and checkout tables is zero for anything an email flow caused.
C15 Timing: actual delivery latency recorded against the stated
window.
C16 Rendering evidence: HTML and plain text captured; dark mode and
images-off noted for human review.
C17 Authentication results on the received copy: SPF, DKIM, DMARC
pass (redacted).
C18 Consent footer: marketing carries unsubscribe; must-have does
not offer a marketing opt-out as if it stopped them.
C19 Performance: sweeps and drains stay within bounds (see SYS).
C20 Loop log: seed, inputs, result, evidence IDs recorded.

## 7. STEP 5. NEGATIVE CATALOGUE (each needs absence proof, 0.3)

N1 Welcome to an unverified account (if D1 says verify first).
N2 A second welcome ever.
N3 Any reminder after payment on any rail.
N4 Any marketing after unsubscribe.
N5 A fourth cart reminder.
N6 Itinerary follow-ups after a booking.
N7 Follow-ups for a superseded itinerary.
N8 Marketing outside 09:00 to 20:00 local, including 08:59:59 and
20:00:00.
N9 A second marketing email to one person in one day.
N10 Anything to a suspended, deleted or anonymized account.
N11 Anything to the old address after an email change.
N12 Any cart email to a guest with no claimed ownership.
N13 A duplicate cart_item_changed for one observed change.
N14 A ready email after a failure for the same attempt.
N15 Any email from a NOT BUILT automation.
N16 Any email from dev to a non-QA address.
N17 Any marketing to a user with no stored time zone (skipped with a
recorded reason, not guessed).
N18 A signup or reset response that reveals whether an email exists.
N19 A security email suppressed by marketing opt-out, quiet hours or
the cap (this one must SEND; absence is the failure).
N20 A cancelled row sent on retry.
N21 A disabled node firing.
N22 A reminder for an empty cart.
N23 Re-send of an already-sent notice after a restart or lease expiry.
N24 Any email caused by a job that failed its candidate query (a
failed scan must not look like a clean empty scan).

## 8. STEP 6. LOOP PROTOCOL

Per journey and persona set:
1. Run with a NEW randomized scenario; record seeds and evidence.
2. Break attempts (all that apply):
B1 same event three times. B2 two events at once, both orderings.
B3 missing data: null name, null time zone, null email, null
snapshot, null language. B4 boundary times: one second either side
of every window edge, DST edges, half-hour offsets. B5 failure
injection: provider down, database failure before and after the
provider accepts, webhook retry, job crash mid-run, process restart.
B6 stale, expired, reused and tampered links. B7 deleted resource and
deleted account mid-flight. B8 concurrent sweeps and concurrent
drains. B9 email change, unsubscribe, payment, supersession, kill
switch, each mid-flight. B10 candidate-query error inside a sweep:
the heartbeat must report a real failure. B11 skip a cart in the
sweep on purpose: the send-time check must still cancel a wrong
email. B12 hostile input in every personalized field.
3. Fix only real defects, show the fix before applying it, apply it.
4. Rerun the journey AND the golden suite.
5. Counter: 2 clean loops in a row closes; any failure resets to 0;
6 loops without closing is STRUCTURAL RISK.

## 9. STEP 7. REAL-CLOCK TRACKER

Keep reports/real-clock-ledger.md with: scenario ID, persona and
time zone, start (from the stored timestamp), exact due time,
expected delivery window (from the node header, or 60 to 75 minutes
for the commerce reminder, shifted by quiet hours and the daily
cap), what will be checked, runner (what executes the job at due
time), status WAITING / DUE / PROVEN / FAILED.

Rules:
- Compute due times from stored timestamps, never from chat
  arithmetic.
- No backdated or simulated clock closes a real-clock item.
- At due time: query the outbox row, receipt ID and content; compare
  with the expectation; update the ledger. A missing row is a FAIL to
  investigate, not something to trigger by hand, unless runner
  liveness (E8) is the proven cause.
- Quiet hours push delivery to the next 09:00 local; the cap pushes
  it to the next eligible day. Record both.

First entry: the scenario started 12 Oct 11:23 IST. Illustration
only (agent must recompute from stored values, assumes
Asia/Calcutta, inside the quiet-hours window): cart 1h due about
12:23 IST on 12 Oct; itinerary 2h about 13:23; cart 1d and itinerary
24h about 11:23 on 13 Oct; cart 3d about 11:23 on 15 Oct;
itinerary 5d about 11:23 on 17 Oct.

Optional real-clock watch: Europe/London clocks go back Sunday 25 Oct
2026 and America/New_York on Sunday 1 Nov 2026. If I ask, schedule a
quiet-hours check across each real transition.

## 10. STEP 8. SYSTEM CHECKS (once per loop)

SYS1 Kill switch off stops all outbox sends (direct senders recorded
per D3). SYS2 One tested rollback: disable a node, cancel pending
rows by reason, re-enable, confirm no duplicates. SYS3 Two sweeps at
once: no duplicate rows. SYS4 Restart safety: no unintended drain, no
duplicate send, stuck processing rows reclaimed once after the lease.
SYS5 Dev drain reaches only QA inboxes (E2). SYS6 Sweep performance
on at least 10,000 synthetic rows: bounded batch, indexed predicates
(EXPLAIN evidence), runtime recorded, one database connection per run
(production pool max is 20 and connection timeouts were seen).
SYS7 Connection or query errors surface as failures, never as empty
success. SYS8 Typecheck at the existing baseline with no new
diagnostics in new modules. SYS9 Guards and mutation-auth checks
pass. SYS10 Golden suite pass counts equal or exceed the baseline.
SYS11 Registry validation passes (unique ids, cancel targets exist,
triggers wired, no orphans). SYS12 Heartbeat stamps only on completed
passes.

## 11. STEP 9. COVERAGE GATES (all must pass before the report)

Gate A: every automation and outside-registry sender appears in at
least one journey with the full check set.
Gate B: every journey x persona x check cell has a status (0.1).
Gate C: every PASS has an evidence ID.
Gate D: every negative in Step 5 has an absence proof.
Gate E: every BLOCKED cites a blocker ID in reports/blockers.md.
Gate F: every WAITING item is in the real-clock ledger.

## 12. STEP 10. FINAL REPORT (the "what is left" list)

Files: reports/e2e/PLAN.md, reports/e2e/matrix (one row per cell),
reports/e2e/evidence/{loop}/ (redacted), reports/real-clock-ledger.md,
reports/blockers.md, reports/e2e/FINAL.md. New tests go in a new
folder; no existing test is edited.

Matrix of journey x persona x check with status, evidence IDs and
loop counts. Then:
1. Passed and closed (2 clean loops).
2. Failed, with fix status.
3. BLOCKED, with blocker IDs.
4. NOT BUILT automations.
5. Waiting on real time (with due times).
6. Spec deviations (D1 to D5) and gaps (headers, kill-switch scope).
7. Needs a human (below).
8. Coverage gate results A to F.

End with the per-automation readiness verdict:
NOT READY FOR ALL USERS (exact open items) or READY FOR STAGE <n>
REVIEW. Never claim "complete" unless every row is PASS.

## 13. HUMAN CHECKS REPLIT CANNOT DO

For each real delivered email record where it landed and how it
looked. Fill the result column.

- Gmail and Outlook, phone and desktop (and Apple Mail if used):
  inbox, promotions or spam placement, rendering, dark mode, images
  off, link opens on a real phone.
- Sender name and domain look right; authentication passes in the
  received headers.
- Unsubscribe link and one-click unsubscribe work from the real
  client.
- Screen-reader pass on one email and on the unsubscribe and reset
  pages.
- Legal and consent decisions (wording, footer, retention, deletion
  scope).
- Release authorization, scheduler provisioning and any production
  check.
- Deciding D1 to D5.

## 14. BEFORE YOU BUILD ANYTHING, SHOW ME

1. The real automation count and the coverage map (0.10).
2. The applicability table (journeys x personas, R / O / N/A with
   reasons).
3. The golden suite definition and baseline.
4. The file list for tests, fixtures and reports.
5. The fixture and seed design, and proof of E1 to E3.
6. D1 to D5 findings, for my decisions.
7. Candidate BLOCKED items and proposed blocker IDs.
8. The real-clock schedule and the runner for each item.

Then wait for my OK.
