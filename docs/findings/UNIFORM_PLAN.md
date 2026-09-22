# One plan — the draft board and the punchlist, merged

`docs/ROADMAP.md` §A already ruled this: *"Two registers guarantee one gets answered and the other
quietly does not."* The 564-task board was a second register. This merges it into the governed one
and assigns every open item an owner. **`docs/PUNCHLIST.md` §1 stays the decision register** — the
board drains into it, never beside it.

## The merge found duplicates across registers

| Board | Punchlist | One lane |
|---|---|---|
| **#1679 #1677 #1678** — "require authorization proof on every mutation route" | **V-36** — forty expert/provider rails excluded from the wrong-role audit as "a real fixture is required", and the coverage generator hand-copies the exclusion list | **Mutation-auth coverage.** One program over 588 endpoints. The board counted it as three tasks, the punchlist as one defect. Its artifact was stale until PR #1034 regenerated it (now 291/589). |
| **#1431 #1432** — booking IDOR on PUT/DELETE | same family | `requireOwnership` has ZERO live call sites (`ownershipGuard.ts:18`; the only mention is a comment at `trips.routes.ts:371` saying it cannot be used). Verify through the mutation-auth probes; the unused middleware is an §18c delete-or-adopt. |
| **#1348 #1347 #1344** — counter accuracy | — | Ruled 2026-09-22: display-only denorms, ban them rather than make them transactional. |

Counting these once instead of five times is the whole point of one register.

## Owner split — the criterion is capability, not task type

**Replit** owns the board's task state, the workspace, the deployment and production.
**The checkout** owns repo code, CI and evidence. **The decision-maker** owns rulings.

| # | Batch | Owner | Size |
|---|---|---|---|
| A | Close (59) | Replit | 59 |
| B | Verify then close | Replit | 34 |
| C | Re-file coverage tasks / flag governed | Replit | 112 + 114 |
| D | Operator steps against production | Replit | 4 |
| E | WIP cap | Replit | — |
| F | Tier-A code fixes | Checkout | 68 |
| G | Punchlist open rows | Checkout + decision-maker | 8 |
| H | Decisions | Decision-maker | 8 → **6** |

Batches A–E are `docs/findings/BOARD_TRIAGE_DISPATCH.md` (v2). F–H are below.

## G — Punchlist rows still open, folded in

| Row | What it is | Owner |
|---|---|---|
| **V-25 (a)** | `PATCH /api/coordination-states/:id/status` has no from-state guard on either arm and its writer read-modify-writes the audit history. **Check first:** §18b records `storage.updateCoordinationStatus` as having been given a named from-state list, so this row may be partly closed already — confirm before scheduling. | Checkout |
| **V-36** | The wrong-role audit's 40-rail exclusion list, hand-copied into the coverage generator. Merges with board #1677/#1678/#1679. | Checkout |
| **V-22, V-30, V-31** | Named open in `PUNCHLIST.md` §0; their rows are struck-with-pointer in §2/§3, so re-read §0 before scheduling. | Checkout |
| **R-7** | `provider_services.service_type` carries a second, category-shaped vocabulary beside the declared six. **Needs the production database** — so it is Replit's, not the checkout's. | **Replit** |
| **§6** | The Concierge Booking custody design's companion audit is not committed. | Decision-maker |
| **§7** | `provider_services.form_status` is a dead column (ledger `2026-09-20-quote-listing-goes-live`). §18c delete-or-annotate. | Checkout |

## H — Decisions: 8 filed, 2 now ruled, 6 left

**Ruled 2026-09-22 under delegation** (ledger `2026-09-22-early-adopter-gate-exit`,
`2026-09-22-denorm-counters-are-display-only`):

- **#861** — the fallback direction STAYS. Returning the cheaper band on an unknown is the safe
  failure for a fee (Locked Decision 8's posture); charging standard on a failed config read moves
  money against an earner. The real hole is that **beta can be exited by deleting the setting**,
  which is indistinguishable from never-configured. Exiting beta = setting the cutoff to a past
  date. The three error paths log instead of resolving silently.
- **#1348** — DECLINED as written, and **#1347 reframed**. Both counters are display/ordering
  values; `benchmark-facts-denorm.db.test.ts` BF-1/BF-2 already ban them from the money-facing
  read. Widening a transaction that carries the slot release, the notification and the mint, to
  protect a cosmetic counter, risks the effects that matter. One admin widget
  (`admin-query.service.ts:1448-1455`) still reads them; that is the whole remaining fix.

**Still yours: #215 #411 #495 #1666 #1679 #1686.** #1679 is a sizing decision now that coverage
reads 291/589 rather than 0/589.

## F — Code lanes, risk order

| Lane | Task | State |
|---|---|---|
| 1 | **#1563** unguarded `registerContent` aborts a created trip | **DONE** (`b95ae69`) |
| 2 | **#1347** move `admin-query.service.ts:1448-1455` onto the realized SUM/COUNT | SPECIFIED by the ruling above, not built |
| 3 | **#350 → #857** optimizer PaymentIntent failures unhandled (`handlePaymentFailed` keys on `bookingIds`, which an optimizer PI does not carry) | Needs a lane brief — money rail |
| 4 | **#1255** §13 zero-fill: commission fetcher returns 0 on error and on a missing field | Needs a lane brief — money rail |
| 5 | **#1429** Accept renders beside a status badge already reading accepted | Ready |
| 6 | **#1725** no uniqueness on expert applications | Schema — publish-trap rules apply |
| 7 | **#1184 #302** two consolidations (three sanitizers; ad-hoc ZodError handling) | Ready, §18 rule 1 |
| — | remaining ~58 tier-A rows | Scheduled after the above |

**Already fixed, on no register:** the NUL-byte guard blind spot (`demand-rollup.compute.ts:161`,
`vendor-contract-board.ts:138`) — one raw NUL per file made grep skip them entirely, blinding every
shell guard including the fee-literal gate (`90f9635`).

## Sequencing

**Nothing here blocks the dispatch.** Batches A–E are independent of F–H: no closure in A depends
on a ruling in H or a lane in F. Send it now and run the two tracks in parallel — that is what the
"Not yours" section in the dispatch exists to keep straight.
