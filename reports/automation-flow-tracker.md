# User automation status — read-only update

**Status: DEV-CLOSED WITH BLOCKERS. RELEASE HELD.**

Updated 2026-10-24 from the current workspace and the checked-in evidence
reports. This is a report-only update: no application code, secrets, inbox
settings, production data, merges, jobs, or schedules were changed or queried.
The existing canonical tracker is
`docs/engineer/automation/automation-flow-tracker.md`; the 45-family source
audit is `docs/engineer/plan-vs-actual-audit.md` (audit dated 2026-10-15).
The source audit's family inventory is retained here, with later verified
Task A evidence added separately. This does not claim a fresh full automation
inventory or certification.

## Task A — login enumeration

**Built and merged:** commit
`6d9d50a46f9df1b31a9a5a59a9c6c14b1f15b01f` on `main`
(`#1613`, “Give every valid login attempt the same credential work and the
same failure.”).

`reports/task-a-login-enumeration.md` records two clean HTTP test loops and
two clean Playwright test loops. Unknown email, wrong password, and
provider-only accounts receive the same visible 401 and no session after one
scrypt and one fixed-length comparison. The guarantee is equal credential
work, not identical wall-clock timing. Provider OAuth round trips were not
proved.

## Vendor bulk-email conversion

**Design artifact not found in the current checkout.** The four recommended
vendor-bulk policies were accepted for design, not implementation. The direct
sender inventory is historical and identifies vendor bulk as first in order,
but it is not the requested design/touch-list. The remaining work is to write
and review that design against the current vendor-management service and trips
route, including idempotency, retries, cancellation, development QA recipient
guard, kill switch, and recipient-visible behavior. No sender was changed.

## The 45 intended automations

Status definitions for this table:

- **EXISTING**: matching implementation is identified on main, but it is not
  thereby certified or release-ready.
- **BUILT**: newly completed and integrated as part of the current update.
- **HELD**: implementation is on the held commerce revision, not established
  on the current main target.
- **BLOCKED**: matching code exists, but a known defect prevents the intended
  behavior.
- **NOT BUILT**: the source audit found no matching implementation for the
  specified automation contract. This is not proof of executable
  unreachability.

The last source audit identified 8/45 with main code/registry coverage, four
additional held cart families, and 33 without a matching implementation.
Two of the eight main-coded families have known defects, so they are labeled
BLOCKED below. No row is L3+ certified in that audit. Task A is an auth
security fix, not one of these 45 automation contracts, so it does not inflate
these counts.

| ID | Automation | Status |
|---|---|---|
| A01 | verify_email | EXISTING |
| A02 | welcome_email | BLOCKED |
| A03 | verify_reminder_1h | NOT BUILT |
| A04 | verify_reminder_1d | NOT BUILT |
| A05 | verify_reminder_3d | NOT BUILT |
| A06 | already_have_account | NOT BUILT |
| A07 | google_login_added | NOT BUILT |
| A08 | password_reset_request | BLOCKED |
| A09 | password_changed | NOT BUILT |
| A10 | new_device_login | NOT BUILT |
| A11 | account_locked | NOT BUILT |
| A12 | deletion_confirm | NOT BUILT |
| A13 | deletion_complete | NOT BUILT |
| A14 | profile_nudge | NOT BUILT |
| A15 | planner_nudge | NOT BUILT |
| A16 | verify_email_bounced | NOT BUILT |
| A17 | disposable_email_check | NOT BUILT |
| A18 | reset_link_expired | NOT BUILT |
| A19 | reset_link_already_used | NOT BUILT |
| A20 | login_pre_lockout_warning | NOT BUILT |
| A21 | account_unlocked | NOT BUILT |
| A22 | suspended_login_attempt notice | NOT BUILT |
| A23 | email_already_deleted_reuse | NOT BUILT |
| A24 | facebook_login_added | NOT BUILT |
| A25 | no_email_from_provider | NOT BUILT |
| A26 | email_changed_old | NOT BUILT |
| A27 | email_changed_new | NOT BUILT |
| A28 | unusual_signin_velocity | NOT BUILT |
| A29 | dormant_from_verification | NOT BUILT |
| A30 | deletion_grace_period_reminder | NOT BUILT |
| A31 | deletion_cancelled_reactivation | NOT BUILT |
| B01 | itinerary_ready | EXISTING |
| B02 | itinerary_failed | EXISTING |
| B03 | one_credit_left | NOT BUILT (owner-dropped) |
| B04 | out_of_credits | NOT BUILT (owner-dropped) |
| B05 | itinerary_nudge_2h | EXISTING |
| B06 | itinerary_followup_24h | EXISTING |
| B07 | itinerary_reengagement_5d | EXISTING |
| B08 | saved_search_alert | NOT BUILT |
| B09 | wishlist_price_drop | NOT BUILT (deferred) |
| B10 | cart_reminder_1h | HELD |
| B11 | cart_reminder_1d | HELD |
| B12 | cart_reminder_3d | HELD |
| B13 | cart_item_changed | HELD |
| B14 | ai_chat_abandoned | NOT BUILT |

| Status | Count |
|---|---:|
| BUILT | 0 |
| HELD | 4 |
| BLOCKED | 2 |
| NOT BUILT | 33 |
| EXISTING | 6 |
| **Total** | **45** |

**Change since the prior evidence report:** Task A is now merged on main at
`6d9d50a46f9df1b31a9a5a59a9c6c14b1f15b01f`; its report records the two
clean HTTP and browser loops. It does not alter the 45-family count or close
the known welcome/reset defects. No current evidence was found that changes
the cart, runner, scheduler, secret-triage, or delivery status.

## Tests and diagnostics

- **Guard batch:** the latest recorded aggregate is 78/78, but this is
  historical evidence; this update did not rerun the guard batch. Task A's
  report says its local decision guards and guard-batch scripts were run but
  gives no separate numeric total.
- **Typecheck:** a no-edit `tsc --noEmit` on this checkout returned 113
  diagnostics. Compared by file and TypeScript diagnostic code with the saved
  117-diagnostic baseline in
  `reports/automation-part9-evidence/typecheck-corrected.log`, it has 0 new
  diagnostic sites and 2 resolved sites. This is a count/site comparison,
  not proof that every diagnostic message is unchanged. Task A's own report
  records 115 at its earlier verification, so that historical figure is not
  substituted for this fresh check.
- No test suite or live email test was run for this report.

## Real-clock proof and scheduler

- The earlier development-only runner/non-sending check had owner approval,
  but no evidence establishes a reliably executing runner at the real due
  time. No production scheduler activation was authorized.
- The Oct 11 cart scenario is **MISSED**, not waiting: its 1-hour attempt
  skipped for missing timezone/preferences; the next-day step had no owned
  outbox row or delivered receipt, and the recorded heartbeat was stale.
  It was not retried or backfilled. No successful real elapsed-time
  reminder scenario is proved.
- Historical QA delivery records exist, including reminder deliveries and
  item-change copies, but none is a delivered receipt at the missed real due
  time. They do not close next-day proof.
- **Scheduled Deployment trigger: not verified.** The source documentation
  describes a desired Replit Scheduled Deployment plus GitHub cron topology;
  it does not prove that a Scheduled Deployment exists or has fired.

## Secret triage and password rotation

No category counts for the 949 candidate secret lines are recorded in the
checked-in automation reports. Triage progress is therefore **unknown**, not
zero. Secret values and test inbox addresses were not inspected or printed.
No checked-in evidence confirms the owner rotated both test-account passwords;
rotation status is **unconfirmed**.

## Open owner decisions and recommended defaults

| Decision needed | Recommendation | What it unblocks |
|---|---|---|
| D2 data retained after account deletion and notice wording | Define legal/accounting exceptions and approve exact wording before any deletion lifecycle work. | Deletion notices and retention proof |
| D3 upcoming bookings during deletion and regional marketing consent | Preserve bookings; require region-specific consent rules before implementing marketing behavior. | Deletion races and consent coverage |
| Conditional D5 loyalty program existence | Defer unless an actual loyalty/allowance product is confirmed. | Correct denominator and any credit/loyalty automation |
| D7 actual Scheduled Deployment provisioning and firing | Keep dev QA runner separate; require explicit operator evidence before production activation. | Scheduler proof |
| D8 Resend/bounce configuration | Confirm provider settings and bounce path through a redacted configuration report; do not infer from source code. | Bounce and provider-delivery proof |
| D9 payment-failure retry policy | Keep payment retries out of email transport logic; require a separate payment-owner policy. | Payment lifecycle notices |
| D10 external health/failed-job monitor | Require an external monitor with a tested alert path. | Operational alert proof |
| D11 cross-automation marketing priority | Approve cart-first for same-day collisions, matching the source-plan rule. | Shared cap and collision tests |
| D12 release operator and window | Keep release held; name the human operator and authorize separately after all gates. | Any production verification |
| F3 signup/resend/notice limits and timing tolerance | Approve bounded, durable per-address and per-IP limits with separate resend counters; choose exact windows and response-timing tolerance before implementation. | Neutral existing-account/signup notices |
| Dormant-user threshold | Do not invent one; set a threshold only if the owner wants that family in scope. | Dormancy automation |
| Item-change must-have eligibility instant and payment ownership ordering | Keep actual item-change sends blocked until the trusted instant and authoritative payment/ownership sources are decided. | Part 5/6 release proof |
| Count of real job proof cycles | Require two consecutive clean real cycles after separate runner approval. | Scheduler reliability evidence |
| Non-email ladder and draft metric scores | Keep them separate from strict email L0–L5 scoring; approve before publishing combined percentages. | Honest all-scope progress metric |
| QA guard/current target integration and fresh scenario | Keep live sending disabled until the current-main QA recipient guard and owned runner are verified, then authorize a new scenario (never reuse the MISSED one). | Safe development delivery and real-clock proof |

Already accepted and not reopened: Task A design; the four vendor-bulk design
policy defaults; D1 activity-stamp policy; D6 secure inbox-entry process.
These approvals do not authorize a new send, runner activation, migration,
merge, or release.

## Unknown, failed, skipped, and outside scope

- The all-source denominator remains incomplete; the table covers only the
  recovered 31 A + 14 B families. The original manual/readiness source gaps
  and executable unreachability proofs remain.
- The 45-family automation status source audit is dated 2026-10-15 and is not
  a fresh producer-by-producer audit at this checkout. The labels above are
  explicitly limited to that evidence plus the later Task A commit.
- The original clock scenario failed/missed; no retry was performed.
- Provider OAuth round trips, identical response timing, unverified provider
  identity behavior, full payment-rail coverage, next-day receipt, current
  Scheduled Deployment provisioning, secret-triage category counts, and
  password-rotation confirmation are unproved.
- Vendor bulk sender conversion, other direct-sender conversions, live
  scheduler operation, production delivery checks, merge/release activation,
  payment or checkout behavior, and changes to secrets/settings are outside
  this read-only update.
