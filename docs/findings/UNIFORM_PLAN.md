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
| G | Punchlist open rows | Checkout + decision-maker | 8 → **3** |
| H | Decisions | Decision-maker | 8 → **6** |

Batches A–E are `docs/findings/BOARD_TRIAGE_DISPATCH.md` (v2). F–H are below.

## G — Punchlist rows, folded in — **five of eight close on verification**

| Row | What it is | Owner |
|---|---|---|
| ~~**V-25 (a)**~~ | **CLOSED — verified 2026-09-22, no lane.** Both halves are done. The writer (`storage.ts:4917`) takes `expectedFromStatuses`, appends history as a SQL expression (no read-modify-write) and stamps `COALESCE(completed_at, NOW())` per §18b(a). The route (`routes.ts:10398`) passes `[fromStatus]` from BOTH arms through the one call site, treats its own pre-check as the error message only, and answers **409** on a lost race rather than `success: true`. |
| **V-36** | The wrong-role audit's 40-rail exclusion list, hand-copied into the coverage generator. Merges with board #1677/#1678/#1679. | Checkout |
| ~~**V-22, V-29, V-30, V-31**~~ | **ALL CLOSED — verified 2026-09-22, no lane.** §0's summary sentence is the stale part, not the rows: V-22 closed 2026-09-16 (`2026-09-15-d28-d31-service-quotes`, D-30's second half — the quote handler now answers `PRICELESS_LISTING_REFUSAL` before the birth), and V-29/V-30/V-31 all closed 2026-09-15 (`-v29-one-trip-write-resolver`, `-test-guard-prose-echo`, `-v31-loginas-verifies`). This is why the row said "re-read §0 first" — the answer is that §0 itself needs the correction. |
| **R-7** | `provider_services.service_type` carries a second, category-shaped vocabulary beside the declared six. **Needs the production database** — so it is Replit's, not the checkout's. | **Replit** |
| **§6** | The Concierge Booking custody design's companion audit is not committed. | Decision-maker |
| **§7** | **SUPERSEDED — and the correction is the finding.** `form_status` is NOT dead: it has **three live filters** (`recommendation.service.ts:716, :1066, :1402`) gating `= 'approved'` on a column with **zero writers** outside `server/seeds/`, so they match seeded rows and exclude every real listing — including on the live unauthenticated `GET /api/recommendations/user`. The canonical column is `approval_status`, and the SAME FILE already uses it at `:803`. Brief: `docs/briefs/FORM_STATUS_FILTERS_EXCLUDE_EVERY_REAL_LISTING.md`; one decision inside (whether the gate also carries `status = 'active'`). | Checkout + decision-maker |

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

**Still yours: #215 #411 #495 #1666 #1679 #1686 — plus ONE filed 2026-09-22.**

**"credit" names three unrelated things** (`docs/briefs/CREDIT_VOCABULARY_QUESTION.md`). The
RETIRED platform-credit balance (410 Gone, tables dormant), the LIVE `coordination_fee_credits`
obligation (money already paid for an optimize run, applied once against a later coordination
fee) and Trip Pass allowances (which the CODE never calls credits — only the board does, in
#857's title). Filed because the collision produced a wrong conclusion about money in
conversation: that connecting payment methods removes the need for "the credits system" is
TRUE of the first and FALSE of the other two, and acting on it would have deleted the record
that stops a traveler being charged twice. Recommendation inside; it is a rename either way
and changes nothing about what is charged or owed.

**#1679 is now sized, and it is two decisions, not one.** The refreshed artifact
(`generated/security/mutation-auth-coverage.md`, fresh evidence, five suites passing) reads
**291/589 tested, 298 remaining**, and the remainder is not one pile:

| Category | Tested | Remaining |
|---|---|---|
| admin | 143/148 | **5** |
| payments | 14/31 | **17** |
| user-data | 134/200 | **66** |
| other | 0/210 | **210** |

The first three are **88 endpoints in the risk-bearing categories** — bounded, and the kind of gap
§14/§19 exist for. The fourth is **210 routes with no authorization assertion at all**, and the
honest reading is that many are public or system routes where *no authorization* is the correct
answer, not a gap. So the decision is: **(a)** close the 88, and **(b)** rule whether `other` needs
assertions at all, or whether the report should say out loud that the category is
deliberately-unasserted rather than carrying a `0/210` that reads as failure. Pricing (a) alone is a
much smaller commitment than the board's "every mutation route" phrasing implies.

## F — Code lanes, risk order

| Lane | Task | State |
|---|---|---|
| 1 | **#1563** unguarded `registerContent` aborts a created trip | **DONE** (`b95ae69`) |
| 2 | **#1347** move the three revenue readers onto the realized SUM/COUNT | **DONE** (PR #1035). All three `admin-query.service.ts` readers now aggregate over `service_bookings` against the shared `BENCHMARK_REVENUE_STATUSES`; `total_revenue` has no reader left outside the `storage.ts` that writes it. |
| 3 | **#350 → #857** optimizer PaymentIntent failures unhandled (`handlePaymentFailed` keys on `bookingIds`, which an optimizer PI does not carry) | **BRIEFED** — `docs/briefs/PAYMENT_FAILED_NON_CART_INTENTS.md`. Blocked on ONE decision-maker ruling (what a held credit owes a traveler whose optimizer charge failed). |
| 4 | **#1255** §13 zero-fill: commission fetcher returns 0 on error and on a missing field | **BRIEFED** — `docs/briefs/AFFILIATE_COMMISSION_UNKNOWN_VS_ZERO.md`. Blocked on ONE decision-maker ruling (how a partial total is presented once unknown stops being 0). |
| 5 | ~~**#1429**~~ | **RETRACTED — false positive.** `expert/inbox.tsx:180` already filters the list to `pending`. No lane. |
| 6 | **#1725** no uniqueness on expert applications | **BLOCKED on an operator step.** A UNIQUE index is the fix, but the deploy-push rule means a violated UNIQUE fails the publish and offers the destructive copy-dev-over-prod option, so production must be checked for existing duplicates FIRST (`SELECT user_id, count(*) FROM local_expert_forms GROUP BY 1 HAVING count(*) > 1`). That query is Replit's — it needs the production database. |
| 7 | **#302** ad-hoc ZodError handling | **SURVEYED 2026-09-22, shape not yet chosen.** 78 sites under `server/`, **all** answering 400 — so the status code is not the problem — across at least **seven** body shapes: `errors: err.errors` (27), `message: err.errors[0].message` (20), `error.message` (5), `error.errors` (4), `error.errors[0].message` (2), `error.flatten()` (1), `err.errors[0]?.message ?? "Invalid input"` (1). §18 rule 1: one question answered seven ways. **The defect worth fixing is the 20:** taking `errors[0]` alone discards every issue after the first, so a caller with three invalid fields is told about one, fixes it, and is handed a new error — a §13 partial answer presented as the whole one. **No schema leak was established and none is claimed:** the only `.strict()` rails returning the raw issue array are `admin.routes.ts` (behind §2's blanket guard) and `content.routes.ts` (which already projects to `{field, message}`). **#1184 is RETRACTED:** the three sanitizers do different jobs and `text-sanitizer.ts:10-43` says the divergence is intentional; consolidating would reintroduce board #1317's defect. |
| — | remaining ~58 tier-A rows | Scheduled after the above |

**Already fixed, on no register:** the NUL-byte guard blind spot (`demand-rollup.compute.ts:161`,
`vendor-contract-board.ts:138`) — one raw NUL per file made grep skip them entirely, blinding every
shell guard including the fee-literal gate (`90f9635`).

## Sequencing

**Nothing here blocks the dispatch.** Batches A–E are independent of F–H: no closure in A depends
on a ruling in H or a lane in F. Send it now and run the two tracks in parallel — that is what the
"Not yours" section in the dispatch exists to keep straight.
