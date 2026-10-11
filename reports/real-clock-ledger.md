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

## Part 10 follow-up: requested genuine start

**Start status: BLOCKED / NOT STARTED. NEXT-DAY CHECK remains OPEN.**

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
