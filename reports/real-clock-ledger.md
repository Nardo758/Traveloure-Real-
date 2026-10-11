# Commerce automation — real-clock ledger

**NEXT-DAY CHECK: OPEN.**

Reviewed against archived evidence on **2026-10-11T05:27:00Z (UTC)**.
No genuine real due time is recorded for the Part 9 reminder scenarios. Their
eligibility used a controlled test clock; real delivery observation time does
not turn that into elapsed-time proof. Never derive a due instant from a message
ID, submission time, synthetic prior-step history or assumed fixture birth.

There was no existing ledger at this path in the retained branch. This document
creates an explicit ledger from available evidence, without inventing a prior
real-clock schedule. Owned QA schemas were removed. No live scenario was
scheduled, no email sent, and no production read/change made for this update.

## Scenario ledger

Original proof and corrected-copy proof have distinct loop schemas. Repeated
outbox row numbers below therefore identify different rows.

| Scenario | Real due time (UTC) | Has real due time passed? | Outbox row | Delivered receipt ID | Provider delivery observed (UTC) | Real-clock disposition |
|---|---|---|---:|---|---|---|
| Original loop 1 — 1h reminder | Not established | Unknown; no genuine due instant recorded | 1 | `01a1276a-6e6b-76b2-97b2-b0e2075a2c3b` | 2026-10-10T20:04:18.623Z | OPEN; guarded controlled-clock delivery only |
| Original loop 1 — 1d reminder | Not established | Unknown; no genuine due instant recorded | 3 | `01a1276a-7229-74be-84d9-274cd2894df6` | 2026-10-10T20:04:13.395Z | OPEN; not next-day proof |
| Original loop 1 — 3d reminder | Not established | Unknown; no genuine due instant recorded | 6 | `01a1276a-75c5-7bb1-8f72-81d4849a2a20` | 2026-10-10T20:04:14.147Z | OPEN; not elapsed-three-day proof |
| Original loop 1 — item-change copy | N/A: manual QA copy, not scheduled automation | N/A | 7 | `01a1276a-79dd-784d-829c-3ddb65d0df06` | 2026-10-10T20:04:19.384Z | Copy delivery observed; actual automation proof OPEN |
| Original loop 2 — 1h reminder | Not established | Unknown; no genuine due instant recorded | 1 | `01a1276a-c1a5-7884-8708-de6ab122b985` | 2026-10-10T20:04:33.813Z | OPEN; guarded controlled-clock delivery only |
| Original loop 2 — 1d reminder | Not established | Unknown; no genuine due instant recorded | 3 | `01a1276a-c62e-7eca-9ae8-0e78cf04cbd7` | 2026-10-10T20:04:39.787Z | OPEN; not next-day proof |
| Original loop 2 — 3d reminder | Not established | Unknown; no genuine due instant recorded | 6 | `01a1276a-c9bb-7e5c-ab3b-a7cd0836a7bc` | 2026-10-10T20:04:40.508Z | OPEN; not elapsed-three-day proof |
| Original loop 2 — item-change copy | N/A: manual QA copy, not scheduled automation | N/A | 7 | `01a1276a-cd18-7ae2-bcef-e5f76f6ffdd3` | 2026-10-10T20:04:41.226Z | Copy delivery observed; actual automation proof OPEN |
| Corrected loop 1 — unknown-stock price copy | N/A: manual QA copy, not scheduled automation | N/A | 1 | `01a1278b-871e-7b42-b294-54dd88d0db2d` | 2026-10-10T20:40:22.429Z | Corrected copy delivery observed; actual automation proof OPEN |
| Corrected loop 2 — capacity-loss copy | N/A: manual QA copy, not scheduled automation | N/A | 1 | `01a1278b-c906-7184-a932-d52ad5736d6b` | 2026-10-10T20:40:40.122Z | Corrected copy delivery observed; actual automation proof OPEN |

The copy harness records genuine server check times, not scheduled due times:
original loop 1 `2026-10-10T20:04:11.824Z`, original loop 2
`2026-10-10T20:04:33.143Z`, corrected loop 1
`2026-10-10T20:40:17.827Z`, corrected loop 2
`2026-10-10T20:40:34.761Z`. Those qualify the copy's recorded facts only and do
not prove actual dispatcher handoff timing or must-have inventory ordering.

Sources:
- `automation-part9-evidence/proof-0241649c-02ec-4d37-893c-0c8ada57999a.json`
- `automation-part9-evidence/proof-16a453a0-059a-4160-ae0e-59489ac20d68.json`
- `automation-part9-verification.md`: controlled eligibility clock and held
  actual item-change dispatch.

## Status rules for a future separately authorized real-clock proof

- **OPEN:** genuine activity/due anchor or required delivered receipt absent.
  This is the current next-day status. Time passing alone cannot close it.
- **WAITING:** an authorized genuine scenario has a recorded due instant that
  has not yet passed, or its observed delivery is still awaited. No such
  retained active scenario is established here.
- **PROVEN:** recorded genuine activity and due instant, actual non-simulated
  scheduler/send timing, and matching provider-observed delivered receipt.
  Evaluate account/cart/payment/timezone/consent at the real instant too.

No NEXT-DAY CHECK is marked PROVEN. Future proof or release execution requires
separate founder authorization; this ledger does not authorize either.

## Part 10 follow-up: pre-approval start-path finding (historical)

**Historical start status: BLOCKED / NOT STARTED.** Superseded by the genuine
WAITING scenario recorded below after QA-mode approval. NEXT-DAY CHECK remains OPEN.

Both approved development inbox setting names are present; values are not
printed. The existing approved controller only runs immediately eligible,
controlled-clock disposable proofs. Its owner kills a test at three minutes
and always removes the schema. Starting that path cannot retain a genuine
next-day scenario. No fake start is substituted.

| Requested scenario | Scenario ID | Real start | Exact due | What must be checked | Status |
|---|---|---|---|---|---|
| Fresh genuine next-day cart reminder | Not created | Not established | Not established; calculate from actual stored start only | Prior real 1h step; live cart/sequence/account/email/consent/zone; unpaid readable rails and UNKNOWN holds; local cap/window; actual scheduler time and delivered receipt | OPEN, blocked on approved QA start/retain mode |

The exact QA-only adaptation and touch list are in
`automation-part10-remediation-proposals.md`. After its approval and successful
actual fixture creation, record scenario ID, real database start, exact due
instant and checks, then mark WAITING. Do not initialize provider transport,
send an email or claim NEXT-DAY PROVEN during start-only setup.

## Genuine scenario d5dcaccc-abdb-401a-b3ab-1a72d24ec98a

Status: **WAITING**. NEXT-DAY PROVEN: **NO**.

### Actual 1h observation — October 11 (read-only)

- Observation completed by `2026-10-11T10:51:03Z`.
- Real 1h threshold was `2026-10-11T06:53:16.241Z`.
- Owned namespace: one cart, one canonical itinerary correlation, zero outbox
  rows, zero `commerce-email-sweep` heartbeat rows.
- No sweep/send for this scenario was authorized or performed by this agent.
  No provider receipt is recorded; the inbox/provider was not queried.
- Actual outcome: **1h execution missed; no enqueue or delivery proof.**
  Startup mode intentionally installed no scheduler/provider channel.
- An overdue future send cannot prove the original 60–75-minute cadence.
- Stored `preferences.itineraryMarketing.timeZone`: `Asia/Kolkata`, unchanged.
- Exact 1d threshold: October 12, **11:23:16.241 IST**
  (`2026-10-12T05:53:16.241Z`), inside 09:00–20:00.
- Proposed following sweep slot: 06:00 UTC / 11:30 IST, **not scheduled**.
  The 1h prerequisite, daily cap and UNKNOWN checks still apply.
- 1d and 3d are future checks, not backdated observations.
- **WAITING. NEXT-DAY PROVEN: NO. RELEASE HELD.**

Execution prerequisites/proposals: `automation-clock-safety-proposals.md`.
No timer, restart, application flag, real email or owned/public DDL was changed.

```json
{
  "runId": "d5dcaccc-abdb-401a-b3ab-1a72d24ec98a",
  "scenarioId": "d88d08e8-baca-4cd8-acfb-6442692f2b5f",
  "cartId": "e244f935-2c04-4cd9-b3b7-fadc7bb68a50",
  "sequenceId": "9708d8a8-5691-408c-9b5e-bb26cead60b7",
  "startTime": "2026-10-11T05:53:16.241Z",
  "due1h": "2026-10-11T06:53:16.241Z",
  "due1d": "2026-10-12T05:53:16.241Z",
  "due3d": "2026-10-14T05:53:16.241Z",
  "timezone": "Asia/Kolkata",
  "priorStepSent": false,
  "outboxRows": 0,
  "providerCallsBlocked": true,
  "schema": "automation_msg_748a6c8ec0a411fe",
  "status": "WAITING",
  "realTransport": false,
  "inboxSetting": "SIGNUP_QA_TEST_INBOX",
  "productionBlocked": true,
  "releaseCertified": false
}
```

Retained owned development fixture; no provider initialized, email sent, or job scheduled.
Check live cart/sequence/account/recipient/consent/timezone, readable payment rails and UNKNOWN holds, quiet hours, daily cap, actual preceding 1h delivery history and a matching delivered receipt after the real 1d due time. The preceding step is NOT fabricated; future delivery needs separate authorization.

### Approved overdue non-sending sweep

Actual invocation only; no future scheduling, backdating, delivery or next-day certification.

```json
{
  "runId": "d5dcaccc-abdb-401a-b3ab-1a72d24ec98a",
  "invokedAt": "2026-10-11T13:02:33.726Z",
  "observedAt": "2026-10-11T13:02:35.509Z",
  "counts": {
    "candidates": 1,
    "enqueued": 0,
    "duplicates": 0,
    "skipped": 1,
    "skipReasons": {
      "unknown_timezone_or_preferences": 1
    },
    "itemChanges": {
      "enqueued": 0,
      "duplicates": 0,
      "skipped": 1,
      "skipReasons": {
        "payment_rail_unknown": 1
      }
    }
  },
  "heartbeat": {
    "last_success_at": "2026-10-11 13:02:35.315",
    "last_result": {
      "ok": false,
      "skipped": false
    }
  },
  "outbox": [],
  "uncertainAttempts": {
    "total": 0,
    "rows": []
  },
  "providerCallsBlocked": true,
  "receiptId": null,
  "status": "WAITING"
}
```

**WAITING. NEXT-DAY PROVEN: NO. RELEASE HELD.**

### Correction and actual eligibility findings after the overdue invocation

- Exactly one sweep executed, at `2026-10-11T13:02:33.726Z`.
- Its initial owner call omitted `ok: true` from `recordJobSuccess`, so the
  completion stamp existed but its summary incorrectly contained `ok: false`.
  This was a runner bug, not a candidate-query failure.
- Corrected only the owned heartbeat summary to `{"ok":true,"skipped":false}`,
  using the verified development fingerprint, exact run ownership and exact
  existing completion stamp `2026-10-11T13:02:35.315Z`.
  No sweep rerun, timestamp movement or public-table mutation occurred.
- Fixed runner passes `ok: true`; two fresh loops now assert first-failure/null
  success stamp, successful summary and subsequent failed summary.
- Live stored marketing preference names: `timeZone=Asia/Kolkata`, `enabled=true`;
  **quietStart absent; quietEnd absent**. The shared preference parser requires
  both. That explains `unknown_timezone_or_preferences` despite a valid timezone.
  No preference, consent, timezone, activity stamp or prior-step history changed.
- Item-change remains blocked by `payment_rail_unknown`.
- Public development pending/failed/processing rows: zero. Owned outbox rows: zero.
- Owned heartbeat `last_success_at` is nullable now; public remains NOT NULL.
- Future due slots remain unscheduled. The missing preference fields, missing
  actual prior-step delivery and UNKNOWN rails remain blockers.
- Receipt: none. **WAITING. NEXT-DAY PROVEN: NO. RELEASE HELD.**
