# What is left on the 564-task board

**As of 2026-09-23**, computed from `docs/findings/board-staleness-pass.tsv` (565 lines = header + 564 rows)
at PR #1044's head. This is a **status document, not a ruling** — it records where the triage stands and
what each remaining bucket actually costs. Nothing here decides anything.

---

## 1. The board is three tiers of evidence, not one list

The single most important fact about "what's left" is that **only 166 of the 564 rows have been read
against code.** The rest were routed by class. Mixing them into one number is how "564 tasks" becomes a
figure nobody can act on.

| Tier | Rows | What was actually done | What a count from it means |
|---|---|---|---|
| **A — verified** | **166** | Each row read against the code it names; `file:line` evidence produced | A verdict you can act on |
| **B — probed** | **42** | Rail located and its tests checked, row not fully argued | A verdict that needs one confirming read |
| **C — routed** | **356** | Title read, routing class assigned, **code never opened** | A routing hint. **Not a verdict.** |

**Roughly half of my tier-A `BUILD` verdicts turned out to be misdiagnoses on contact with the code** —
that rate is measured, not estimated, and it is the reason tier C's 356 rows must not be read as 356
pieces of work. It is equally the reason they must not be read as 356 non-problems.

---

## 2. Tier A — the 166 that are actually decided

| Bucket | Rows | State |
|---|---|---|
| **Settled** (`CLOSE-*`, `FIXED`, `VERIFIED-CLOSED`, `DEFERRED`, `RULED`) | **77** | Done. Board closure is the only remaining action, and it is Replit's |
| **Open work** | **47** | Real, evidenced, unstarted |
| **Verify-then-close** (`LIKELY-DONE`, `VERIFY`) | **14** | Almost certainly already done; each needs one confirming read |
| **Coverage program** (`TEST-PROGRAM`) | **13** | Tests to write, not defects to fix |
| **Blocked** (operator / runtime precondition) | **12** | Cannot start from this checkout at all |
| **Other** (`LANE-BRIEF`, `UNVERIFIED-NARROW`, `DOWNGRADE`) | 3 | Needs shaping before it is workable |

### The 47 open tier-A items, by theme

| Theme | Count | Character |
|---|---|---|
| **Money/fee surfacing** (G1) | 16 | Mostly *display* gaps — per-item fee breakdowns, tier badges, converted prices, export filters. Little of it touches a money **rail**; most is read-side |
| **Security / authorization** (G9) | 9 | The only bucket with a genuine severity tail: #1431/#1432 (booking IDOR on PUT/DELETE — both `OPEN-RESHAPE`, meaning the board's framing is wrong and the real finding is structural), #1679 (the 88-route program), #302 (78 ZodError sites, seven response shapes) |
| **Admin/analytics visibility** (G1) | 10 | Alerts, exports, dashboards. Operationally useful, individually small |
| **Expert/booking console** (G13) | 8 | Decline reasons, workload rebalancing, duplicate-booking prevention |
| **Test coverage** (`TEST-PROGRAM` routing) | 4 | Assertions for behaviour that already exists |

**One tier-A `BUILD` remains unclassified: #493** (track insurance fees per booking so reports show real
figures) — the only open item that is a money **rail** change rather than a surface.

### The 12 blocked items are blocked on four distinct things

| Blocker | Items | Note |
|---|---|---|
| A repository secret (`BRANCH_PROTECTION_PAT`) | #713, #786, #787 | `enforce-branch-protection.yml` has 403'd on every run since ~2026-08-30, so `.github/branch-protection.json` is a declaration **no automation applies**. Highest-value operator step on the list; writes no SQL |
| A production `SELECT` | #1725, #298 | Read-only census queries. Both unblock a schema lane the moment they return |
| A production environment variable | #143 | `STRIPE_CONNECT_WEBHOOK_SECRET` — code side already wired |
| A production migration-ledger action | #632, #525, #1258 | Stamping and verification, not schema change |
| Decision-maker ruling (now given) | #215, #411, #495, #1666 | **Deferred on the record** 2026-09-23, each with its own revisit-when |

---

## 3. Two rows corrected in this pass

Both were carried as `RULE-FIRST` — awaiting a decision — when the decision had already been taken on
2026-09-22 under delegation. Left uncorrected, they would have gone back into the decision queue a
second time.

- **#1348** → **`CLOSE-DECLINED`**. Ruled (`2026-09-22-denorm-counters-are-display-only`): the
  `bookings_count` decrement is kept **outside** the money transaction deliberately, and the ruling
  upholds that — widening a transaction that carries the slot release, the notification and the mint in
  order to protect a cosmetic counter can only increase the chance the effects that matter roll back.
  Nothing to build.
- **#861** → **`RULED-PARTIAL`**, and this one is **not** closable. The ruling
  (`2026-09-22-early-adopter-gate-exit`) upheld the fallback direction and named the real hole (beta is
  exited by *setting* a past date, never by deleting the setting). But it also required a §13 half that
  **is not in the code**: `commission.ts:524` (invalid date), `:533` (unknown registration date) and
  `:536` (DB error) each still return `true` **silently**. Only `getSetting`'s own catch at `:511`
  warns. Each of the three must log and surface *"we could not tell"* rather than resolving as *"they
  are an early adopter"* — ruling 32's disposition that filed debt must never become a silent baseline.
  **Verified unimplemented 2026-09-23.** Small, ruled, no rate literal moves, no band changes.

That brings the running total of stale tier-A rows found and corrected in this session to **five**
(#1563, #1347, #1394 earlier; #861, #1348 now).

---

## 4. Tier C — 356 rows, and what the number does and does not mean

| Group | Rows | Theme (from sampled titles) |
|---|---|---|
| G4 | 74 | Provider/EA console authoring — photo upload, category dropdowns, dashboard date management |
| G2 | 63 | Seed data and in-app booking rather than partner hand-off |
| G6 | 50 | Notifications and reports |
| G15 | 38 | Visa data freshness and confidence |
| G5 | 28 | Neighbourhood surfacing |
| G3 | 25 | AI itinerary + expert anchors |
| G14 | 22 | Demand-refresh and cache metrics |
| G12 | 21 | Stream cards, Explore Spine, mobile layout |
| G8 | 17 | Shared caching across hotels/activities/flights |
| G7 | 12 | Partner outage resilience, calendar integration |
| G10/G11 | 6 | Migrations and CI gates |

**260 of the 356 route to `BUILD`.** On tier A's measured hit rate that is **not** 260 pieces of work —
but it is not 260 non-problems either, and the honest statement is that **nobody knows**, because the
code behind these rows has never been opened. The cheapest way to find out is a verification pass, not
a build pass.

---

## 5. The drain rate is the actual problem

Arrival ~35/wk against a drain of ~6.4/wk (353 → 564 over 7.4 weeks, 48 closed). Batches A and B of the
Replit dispatch remove 93 in one pass — but without a WIP cap and an expiry, the board is back over 500
by December.

**This is the finding that outranks every individual row above.** Everything in §2 and §4 is arithmetic
on a list that is growing five times faster than it shrinks.

---

## 6. What the two workstreams hold right now

**This checkout** — 47 evidenced open items, 14 verify-then-close, 13 coverage, one small ruled build
(#861's logging half). The largest single pieces are #1679's 88-route program, #302's validation
standardisation, and #1431/#1432, which need reshaping before they can be worked at all.

**Replit** (dispatched, outstanding) — Stage 2 webhook subscriptions; the `BRANCH_PROTECTION_PAT`
secret; four read-only production censuses (#1725, #298, §7 `form_status`, R-7 `service_type`); the
`#1686` fee-config parity run **(reported PASS — 25/75 across default, activities, dining and provider
commission)**; board closures for the four deferrals and #857; and the #1679 program decision.

**Neither** — the 356 tier-C rows. They are nobody's until somebody decides whether to verify them or
cap them.

---

## 7. Stated negative space

- These counts are **row counts, not effort**. A `BUILD` row may be an afternoon or a month; the TSV
  carries no sizing and none was invented.
- Tier C's routing classes were assigned **from titles**. A row routed `BUILD` may be already done, may
  be a duplicate, or may be a defect more serious than anything in tier A. The class is a hint.
- The tier-A misdiagnosis rate is measured **on rows I personally verified and then built**, which is a
  small sample and is biased toward rows interesting enough to build. Treat it as directional.
- Nothing here re-verifies a row already marked settled. Five stale rows were found in this session by
  accident, not by a sweep, so **the settled bucket has not been audited** and its 77 should be read as
  "77 marked settled", not "77 proven settled".
