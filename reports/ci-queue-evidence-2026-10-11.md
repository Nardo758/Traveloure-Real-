# CI reliability and queued PR evidence

Prepared 2026-10-11. Report only; no rerun of the supplied journeys, code repair,
rebase, conflict resolution, merge, deployment, secret change or production access.

Report base: main `e5b53a2c858f3aae84405c48c1e7aeec1da8727c`.
Separate automation work remains on its existing branch, untouched.
**HOLD: no merge until the main owner assigns the required numbered ledger rows.**

## 1. Journey-suite — first failure, not a fresh diagnosis

Source: [run 38067859650](https://github.com/Nardo758/Traveloure-Real-/actions/runs/38067859650),
main `ccb2f5de1d28cf500a403f87687367571d3834a9`.

- First failing assertion: `playwright/tests/journeys/j-kyoto-trips-golden-path.spec.ts:329`.
- Test: “§1 B8 — with a Kyoto plan bound, Destinations → Kyoto →
  ‘Plan New Trip with AI’ makes a NEW plan and drafts into it”.
- Assertion: “the draft is not refused as ‘already has items’”; expected true,
  received false.
- Supplied run confirmed: 11 failed journeys, 44 passed, 12 skipped, 2 did not run.
  The other ten failures are not individually re-diagnosed here.

### Contract check and stopping rule

B8 opens the ONE PlanEntry, creates a second plan rather than reusing the bound
one, explicitly clicks the draft action, and checks that the original item remains
on the first plan. It is anchored to the September 30 new-plan-inherits-nothing
rule. The same B8 remains on current main.

**No evidence that this particular B8 pins pre-LD-33/45 behavior.** Do not delete
or relax it merely because it is red. SS-2 R424 explicitly retires stale premises
elsewhere; it does not establish that B8 is retired. If the decision-maker later
classifies B8 as retired, stop its repair and let SS-2 own retirement.

Important diagnostic limitation: the response waiter explicitly excludes HTTP
409. A non-2xx response reaching this assertion therefore does NOT establish
“already has items”. A 409 alone would instead cause its response wait to time
out. Other failures in this run explicitly report AI 503/high-demand responses;
the B8 assertion itself does not print its status/body. Its exact failure response
remains unproven here. Do not infer a wrong-trip writer defect from that label.

No test rerun, spec edit or runtime fix performed.

## 2. W1 — red/green comparison

| Run | Commit / branch | Result |
|---|---|---|
| [38070784004](https://github.com/Nardo758/Traveloure-Real-/actions/runs/38070784004) | `266e93a70e1d778c7a98adda21e58eb10e79ab7e`, PB1 | W1 red, 23.7 s |
| [38071711386](https://github.com/Nardo758/Traveloure-Real-/actions/runs/38071711386) | `8c8dbe558d335f28f4edb2d64fe576aab9b82513`, next PB1 commit | W1 green, 9.0 s |
| [38071697722](https://github.com/Nardo758/Traveloure-Real-/actions/runs/38071697722) | `dca3769c36f5f9f0f9f9a83b8830fb7ba925385c`, unrelated JT | supply-demand green |
| [38077993550](https://github.com/Nardo758/Traveloure-Real-/actions/runs/38077993550) | `a282526b8fa5d7d5672e8f8a320102af7e8b3648`, SS-1b | W1 red, 23.3 s |

PB1 red → next green changes **only `docs/DECISIONS.md`**. No Workstation,
fixture, spec, workflow or API implementation change explains that transition.
The compared PB1 and SS-1b runs use one worker, not concurrent Playwright workers.

### What the two red traces actually prove

Failing location: `e2e/supply-demand/w1-kyoto-authoring.spec.ts:81`, called for
the first map add at line 83.

- Locator: `[data-testid="workstation-days"] [data-item-mode]`.
- Expected one **DOM editing row**, received zero, timeout 20 seconds.
- PB1: initial GET itinerary-items total 0 at 17:20:43.554Z; POST 201 at
  17:20:44.144Z; refetch GET total 1 at 17:20:44.191Z.
- SS-1b: initial GET total 0 at 19:07:56.591Z; POST 201 at 19:07:57.089Z;
  refetch GET total 1 at 19:07:57.125Z.
- Both trace records include the first successful item in the returned day data.
- The PB1 `workstation-days.isVisible()` returns true; no subsequent Day-list
  toggle click is recorded. The terminal error snapshot shows Structure and
  Day list controls, with “1 place · Day 1” in Structure.
- Green artifact contains the successful final screenshot, not a retained
  successful W1 trace; exact green intermediate timing is not claimed.

**Conclusion:** “found none” is a DOM row assertion, not evidence that the item
was absent from the database. The race is in `showDayList` readiness/view
selection: a visible initial day-list fallback can satisfy its check before the
non-default format finishes rendering. It skips the toggle and then counts
editing rows in Structure. `ClientFormatView` defaults to Structure; the parent
changes rendering according to `buildFormat.grouping`.

The exact async response that changes the format is not established; stale-query
overwrite or fixture deletion is NOT claimed. The records support a view-hydration
race, not a missing-write fix.

### Proposed minimal W1-only repair — not implemented

After the POST, wait for the same trip's refreshed item and settled format view.
If the format toggle exists, explicitly select Day list and assert that selected
state. Then assert the editing row carries the returned item ID, not only a count.
Do not increase a sleep or alter the Workstation writer.

Proposed touch: `e2e/supply-demand/w1-kyoto-authoring.spec.ts`, plus a scoped
helper only if needed. Proof: force slow format/item hydration in both orders,
fresh run-tagged fixtures, two clean loops; preserve final trip/day/readiness
checks. Separate approval and numbering required before any edit.

## 3. PR #1347 — standard queue form

[PR #1347](https://github.com/Nardo758/Traveloure-Real-/pull/1347)
`fix/legacy-confirmation-atomic-claim`,
head `04910b83b91ba9178a5ef32cf74b362f42013abf`.

**Problem:** legacy webhooks SELECT status and then update unconditionally.
Concurrent callers can both win and enqueue traveler confirmation mail.

**Change:** atomic conditional UPDATE RETURNING the stored confirmation code;
only the winner uses the existing enqueue helper. Preserve full/deposit flags
and existing financial/earnings writers. No schema change.

**Tests:** branch report records 11 native isolated PostgreSQL regressions:
two/eight-caller full/deposit races, retries, both writer orders, page/webhook
race, duplicate/missing IDs, matching codes and financial values. Stripe/mail
were simulated. These are historical branch results, not newly rerun results.

**Checks:** branch report records 117 before/after diagnostics, zero new, and
preview verification. This does not certify compatibility with today's main.
Current PR is open. Queue-time CI and current-base checks remain required.

**Ledger row R?:** no numbered row in this PR's changed files. UNNUMBERED/HOLD;
main owner must assign and record the number before merge. Do not invent one.

**Remaining scope:** prevents concurrent double claim, but does not close the
best-effort enqueue crash window. #1360 is the next lane, not a reason to merge
this lane unnumbered.

## 4. PR #1360 — standard queue form

[PR #1360](https://github.com/Nardo758/Traveloure-Real-/pull/1360)
`task-1816-legacy-confirmation-persistence`,
head `aa6877ddb2a2bc5d106e2ae6e24f5c51c693b8d6`.

**Problem:** a booking can commit its confirmation before best-effort email
persistence. A crash or insert failure then loses the traveler notice; subsequent
confirmed-state retries skip it.

**Change:** compose winning confirmation and pending outbox persistence inside
the same transaction in both authoritative writers. Propagate persistence
failure so the authoritative delivery retries. Existing drain sends after commit.
Missing recipients become explicit dead/blocked rows.

### Required five-file accounting

| File | Proposed branch behavior |
|---|---|
| `server/services/stripe-payment.service.ts` | Conditional legacy full/deposit claim and persistence in one transaction; no new earnings writer; duplicate/missing claim does not enqueue |
| `server/services/booking.service.ts` | Page/fallback confirmation persists the same stored code in its transaction, preserving existing earnings/revenue behavior; persistence errors must not be swallowed |
| `server/services/email-outbox.service.ts` | Adds `persistLegacyBookingConfirmationEmail(tx, bookingId)`; reads the committed-to-be booking through `tx`; inserts pending or explicitly blocked dead row; wraps failures in a recognizable persistence error |
| `server/routes/bookings.ts` | Recognizes legacy alongside canonical persistence errors; returns retryable 503 and “do not pay again” warning instead of misleading success |
| `docs/DECISIONS.md` | Appends founder approval/recovery boundaries; current row is `[advisory]`, not an allocated numeric R row |

Other changed files include the typed persistence error, native regression/crash
worker, design/plan/report and memory files. They do not create a second outbox,
registry or scheduler.

**Tests:** posted branch verification records 24 native PostgreSQL tests with
simulated transports and real worker SIGKILL before/after commit. Both writers,
rollback/retry, concurrent winners, stable code, missing recipients, transport
outage and directly invoked response boundaries are covered. Not a live webhook,
authenticated HTTP/browser or real-provider delivery proof.

**Checks:** branch report records 117 baseline diagnostics, zero added, and
clean diff checks. Its historical native 24-test result does not identify the
two reds in the separately referenced **136/138** run.

**136/138 reds — OPEN, names not fabricated:** neither the PR body, its posted
verification report, accessible comments nor local result archives identifies
that run or its two failing entries. At inspection the current-head check-runs
endpoint has only an in-progress Copilot check; PR rollup provides no 138-entry
result. Need the existing run URL/log/JSON. Do NOT rerun 138 tests to replace the
missing historical evidence. This report does not mark that gate clean.

**Ledger row R?:** current advisory
`2026-10-08-legacy-confirmation-persistence` is not numbered. UNNUMBERED/HOLD.
Main owner assigns R at its queue turn. Review follows #1347.

**Conflicts:** no rebase, main merge, conflict resolution or force push here.
An existing comment describes somebody else's attempted local reconciliation
and protected-ref refusal; it is not our applied change or evidence of approval.
Reconcile only at queue turn.

### Unique event-key index — HELD migration proposal

#1360 currently inserts legacy metadata with booking ID, confirmation code and
source; it does **not** emit `eventKey` or supply this physical unique index.
Conditional booking claims are its current concurrency guard. Do not describe
the following proposal as already implemented.

Canonical future event key for both writers:
`legacy-booking-confirmation:{bookingId}`. It is a business-event key, not a
Stripe event ID unavailable to the success-page writer. No recipient in the key.
Keep it on dead/cancelled/sent rows too; no blind replacement notice.

```sql
-- HELD. Not registered or applied. Number allocated only at queue time.
-- Audit any existing keyed duplicates before application.
CREATE UNIQUE INDEX email_outbox_event_key_unique
    ON email_outbox ((metadata ->> 'eventKey'))
    WHERE metadata ? 'eventKey'
      AND metadata ->> 'eventKey' IS NOT NULL;
```

Read-only precondition, proposed only:

```sql
SELECT metadata ->> 'eventKey' AS event_key, count(*) AS rows
FROM email_outbox
WHERE metadata ? 'eventKey' AND metadata ->> 'eventKey' IS NOT NULL
GROUP BY metadata ->> 'eventKey'
HAVING count(*) > 1;
```

No historical backfill or duplicate deletion is authorized. Before implementation:
owner approves key contract/SQL; check current registry next free number; declare
the index in `shared/schema.ts` to prevent publish drift. Proposed touch list:
legacy persistence helper in `email-outbox.service.ts`, `shared/schema.ts`,
one numbered migration **held/unregistered**, corresponding native tests and
numbered decision/report. No second table/outbox.

Proof plan: both writers derive one identical key; concurrent insert/retry yields
one row; distinct bookings remain distinct; rollback preserves atomicity; absent
keys remain allowed; existing rows remain untouched; index catalog matches the
declared predicate; two clean isolated loops. Registration/application still
requires separate founder approval. No SQL executed for this report.

## 5. Partnerize 404 — UNKNOWN, not none

Verified source defects on current main:

- Campaign call uses `/publishers/{publisherId}/campaigns.json?status=approved`.
- Click/conversion calls use `/publishers/{publisherId}/reports/...`.
- Official Partnerize publisher documentation uses v1 resource families
  `/user/publisher/.../campaign/...` and
  `/reporting/report_publisher/publisher/...`.
- `listCampaigns` currently catches errors and returns `[]`, indistinguishable
  from a successful empty account. Report calls do the same.

This is a documented endpoint-contract mismatch and error-normalization defect.
The original authenticated 404 URL/response was not supplied, and no authenticated
call was made here. The precise historical request and account authorization
remain unverified; do not claim a live repaired lookup.

**Proposed repair, not implemented:**

1. Keep documented Basic application-key/user-API-key authentication; never
   put keys in a URL, report or log.
2. Verify publisher identity via the documented user API; do not guess its ID.
3. Use documented approved tracking endpoint
   `/user/publisher/{publisherId}/campaign/a/tracking.json`, validating the
   current API schema and pagination before mapping.
4. Use documented click/conversion resource paths rather than plural
   `/publishers/.../reports/...`; validate dates/timezone/page boundaries.
5. Parse documented envelopes/status `a` and tracking-link fields explicitly.
   Malformed payload, timeout, 401/403/404/5xx or missing config = UNKNOWN/error,
   not empty inventory. Preserve previously known campaign rows on failure.
6. Return a discriminated lookup result or propagate an error to the registered
   sync job; failed lookups must not yield a success heartbeat/count zero.
7. Report NONE only after a valid authenticated, fully paginated successful
   response actually contains no approved matching campaign.

Proposed touch: `server/services/partnerize/partnerize-client.ts`,
`partnerize-sync.service.ts`, registered campaign/report caller adapters,
existing/new provider contract tests and its numbered ledger/report. Separate
code PR and numbering required. No credential/configuration change here.

Proof: fake 404/auth/outage/malformed/valid-empty/approved/pagination responses;
no destructive sync on UNKNOWN; one separately authorized read-only authenticated
lookup, counts/names/statuses only. No affiliate link or account “none” claim
until that lookup works.

Official sources:
- https://api-docs.partnerize.com/partner
- https://docs.partnerize.com/Publisher_API_Guide_EN.pdf

## Final queue status

| Item | Status | Next requirement |
|---|---|---|
| Journey first red | Reported; B8 retirement not established | Keep current contract; no speculative writer repair |
| W1 comparison | View-selection race supported by both red traces | Separate W1-only test repair approval/number |
| #1347 | Open, historical 11-test evidence | Numbered ledger, queue-time checks |
| #1360 | Open, historical 24-test evidence | Name two reds from existing 136/138 evidence; numbered ledger; queue-turn reconciliation |
| Unique event-key migration | HELD proposal only | Key/SQL/number approval; no registration or application |
| Partnerize account status | UNKNOWN | Approved provider-contract repair and successful read-only validation |

Nothing merged, rebased, conflict-resolved, deployed or numbered by this report.
