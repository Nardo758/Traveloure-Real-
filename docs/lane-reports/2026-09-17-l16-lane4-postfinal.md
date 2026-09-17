# L16 lane 4 — the Ask-AI drawer, POST-FINAL on the Trip Card

**Ledger row:** `2026-09-17-l16-lane4-postfinal` · **Landed** 2026-09-17 · **Client only** — no
server route, no service, no schema, no migration, no new endpoint, no amount, no rate, no band, no
idempotency key, no claim, no entitlement.

**Brief of record:** `docs/design/ASK_AI_DRAWER_BRIEF.md` §5.1 and §7.2 item 4, built to the LOCKED
rulings **D-45..D-50** (`2026-09-16-l16-rulings-d45-d50`). **CLAUDE.md:** Locked Decision **45 (3)**
and **45 (6)**, Locked Decision **41 (b)**, Locked Decision **42 D8 / D16 / D18**, §8, §13,
§18 rule 1.

This is the LAST lane of L16. Lane 5 (the conversation binding) was ruled OUT by D-45 and does not
exist until a new ruling.

---

## 1 · Which rail slot, and why that one

**Ask AI takes the SUGGESTION card's slot — position 3 — with `ExpertSuggestionsPanel` directly
beneath it.** The ratified board (LD 45 (6)) draws four cards: Booking agent · Your expert ·
Suggestion · Back to planning. `ExpertSuggestionsPanel` renders **nothing** unless the expert has
actually posted a suggestion (its own §13 rule), so in the ordinary case the rail draws three
today; Ask AI in that slot brings it back to **four**, and it reads five only when a suggestion is
genuinely pending — which is the case the board was drawn for.

**The Suggestion card was NOT deleted to make room.** It is a ratified board card, and its data is
`trip_suggestions` — an expert's own words — which the brief itself names as the reason the two
panels are a LAYOUT precedent for each other and never a data one. Removing a ratified card to keep
an arithmetic count would be a board decision taken by whoever happened to touch the rail.

---

## 2 · What landed

| # | What | Where | Ruling |
|---|---|---|---|
| 1 | The SAME `AskAiDrawer`, mounted on the Trip Card rail in the Suggestion slot | `TripCardRail.tsx` | brief §5.1, LD 45 (6) |
| 2 | `askAiApplyConsequence` — the ONE post-final addition, in the ONE copy module | `client/src/lib/ask-ai-drawer.ts` | **D-49**, §13, §18 rule 1 |
| 3 | `surface` (test id only) and `planFinal` (the PLAN's state) props on the drawer | `AskAiDrawer.tsx` | D-49, LD 42 D16 |
| 4 | The page hands the rail `finalVersion` and the plan's item count off the plancard it already read | `client/src/pages/trip-details.tsx` | LD 41 (b), §13 |
| 5 | 13 proofs | `client/src/lib/__tests__/ask-ai-postfinal.test.ts` | §18d |

### (i) It is a MOUNT, not a second drawer — and nothing branches on the page

Copy, `askAiRailVisibility`, the money line (the server's `aiTask { coveredByTripPass, priceCents }`
block on the existing `GET …/proposals` — still the ONE fee read, still no literal, §8), the
503/409/429 readings, D-50 (c)'s staleness-as-the-server's-own-refusal with its reason-coded re-ask,
and **PAY/APPLY owner-only** (D-48 as amended) are **identical on both mounts** and read from the
same server answers. The new `surface` prop picks a **test id and nothing else** — pinned by **M4**,
which asserts that every read of it sits inside a `data-testid` expression. What changes after Make
final is a fact about the **PLAN**, not about the page, so the plan's own state is what the one new
derivation reads.

### (ii) D-49's sentence, and every absence it respects

`askAiApplyConsequence(planFinal)` is review-first copy (LD 42 **D18**: seeing what a run would do
before the charge is the whole safeguard, because there is no undo and none is drawn):

- **CURRENTLY final** (`finalizedAt` set) **with a known version** ⇒ applying makes a **NEW** Trip
  Card version, **named `v{n+1}`**, with `v{n}` — the one being read — kept as it was. The number is
  arithmetic, not a forecast: `finalizeTrip` numbers a new final `max(version)+1`, and an EMPTY
  change set draws no apply control at all (copy rule 8), so the fingerprint always moves.
- **CURRENTLY final, version unknown** ⇒ the unnumbered sentence. "A new version" is true; "v3"
  would be invented.
- **REVISING** (a final exists, `finalized_at` NULL) ⇒ the card KEEPS the version it has.
  `reFinalizeIfCurrentlyFinal` returns `null` for exactly that row, so claiming an advance would be
  a promise the server refuses to keep.
- **No final at all**, or **a surface that does not state the plan's final standing** ⇒ **nothing**.
  The slip passes no `planFinal`, so it claims none.

### (iii) The empty-plan branch is kept although it cannot fire

LD 41 (b)'s deferral cannot occur on a plan that has been made final, and the branch is kept anyway:
the Trip Card feeds `slipBuildAiAction(itemCount)` from the plancard the page already read, never a
hardcoded `optimize`. A second answer to "is this plan empty?" typed on the page would be the third
copy of the rule `check-ai-draft-eligibility` exists to prevent.

### (iv) Owner-only is the rail's own gate, not a narrowing of the drawer's rule

`TripCardRail` returns `null` for a non-owner, so the card is mounted `isExpertViewer={false}` — a
fact about this page. A render rule is never what keeps a write out (LD 42 D16's own wording, the
§14 posture); the routes remain the policy and this is additive to them.

---

## 3 · What this lane did NOT do

- **It did not touch the slip mount**, beyond nothing at all: **M2** pins that the slip's
  `<AskAiDrawer …/>` still passes the same four props lane 3 landed, with no `surface` and no
  `planFinal`.
- **It did not add a server change, a route, a schema object or a second rail.** The Trip Card mount
  fetches nothing of its own, reads no `/api/pricing`, and carries no fee literal (**M6**).
- **It did not draw an undo** (LD 42 D18) and it did not widen who may pay or apply (D-48).
- **It did not re-open D-45's thread.** Lane 5 does not exist.

**LEFT, NAMED:** the slip mount passes no `planFinal`, so a plan that is final **while open on the
slip** gets no version sentence there. That is an omission, never a wrong claim (§13), and putting
it there later is **one prop on one existing mount** — `askAiApplyConsequence` keys on the plan's
final standing, not on the surface, precisely so that day needs no second rule.

---

## 4 · Proofs

`client/src/lib/__tests__/ask-ai-postfinal.test.ts` — **13/13**, no database, no DOM. Reachable
through the EXISTING `unit-suite-client-lib` directory glob in `build.yml`, so **no workflow line
was added and `scripts/test-orphan-baseline.txt` is untouched**.

- **F1–F6** — the consequence sentence: no stated standing ⇒ no sentence; a final plan naming both
  versions; the unnumbered fallback with no `v\d` anywhere; the revising plan that is never told an
  apply advances its card; a plan with no final saying nothing about a card it does not have; and
  the sentence being formed in exactly ONE place.
- **M1–M7** — the mounts: the Trip Card mounts the same component and passes the plan's state off
  the DTO; the slip mount is unchanged; **no component spells the sentence** and the drawer renders
  the module's answer twice from one call; `surface` drives only a test id; LD 41 (b)'s branch is
  read from its one home; no undo, no second rail, no fee read, no fee literal; and the rail's card
  order is Your expert → Ask AI → Suggestion → Back to planning.

**NEGATIVE SPACE, and it is the load-bearing half (§18d).** These are PREDICATE and SOURCE facts.
No browser painted anything. **None of the SERVER's gates are proven here** — lane 1's
`server/__tests__/ai-ask-create-rail.db.test.ts` and `proposal-apply-authorization.test.ts` own
those. And **it is not proven that `reFinalizeIfCurrentlyFinal` runs**: that is lane 1's call,
proven by `server/__tests__/trip-card-snapshot-render.db.test.ts` **R4**. What is proven is that the
drawer DESCRIBES it correctly and says nothing where it cannot know.

Bordering suites green and untouched: `ask-ai-drawer` 42/42, `trip-card-one-page`,
`trip-card-status`, `slip-rail`, `slip-conformance`, and the whole `client/src/lib/__tests__` job
**1380/1380**.

---

## 5 · Validation

| Gate | Result |
|---|---|
| `npx tsc --noEmit` | **129** errors = baseline |
| `npm run build` | OK |
| `check-decision-guards.cjs` | OK, 0 deferred |
| `check-money-endpoints.cjs` `--self-test` + scan | OK / exit 0 |
| `phase2-fee-gate.sh` | PASSED |
| `check-ai-draft-eligibility.cjs` `--self-test` + scan | OK (the post-final mount does not become a second free-draft rail) |
| `check-planning-entry.cjs` | OK |
| `check-duplicate-migration-prefixes.cjs` | OK (no migration added) |
| `check-test-files-wired.cjs` `--self-test` + ratchet | `test-orphan-ratchet: OK` — baseline unchanged |
| `grep -c replit.local package-lock.json` | 0 |
| new suite | 13/13 |

---

## 6 · Proposed CLAUDE.md sentence (never edited by a lane)

Under **Locked Decision 45 (3)**, appended:

> **(3) IS COMPLETE: THE DRAWER NOW MOUNTS POST-FINAL TOO, AND IT IS A MOUNT AND NOT A SECOND
> DRAWER (lane 4, ledger `2026-09-17-l16-lane4-postfinal`).** The SAME `AskAiDrawer` renders on the
> Trip Card's rail in the **Suggestion card's slot** — that card draws nothing unless a suggestion
> is actually pending, so the ratified rail still reads four (LD 45 (6)). **Nothing branches on the
> page:** copy, visibility, the `aiTask` money line, the 503/409/429 readings, D-50 (c)'s
> staleness-as-refusal and owner-only pay/apply are identical on both mounts, and the `surface` prop
> picks a test id and nothing else. **The ONE addition is D-49's review-first sentence, in the same
> copy module** (§18 rule 1): a plan that is CURRENTLY final is told, before the charge, that
> applying makes a **NEW Trip Card version** and the version is **NAMED** (`v{n+1}`, the one being
> read kept); a REVISING plan is told its card keeps the version it has, because
> `reFinalizeIfCurrentlyFinal` writes none; and a surface that does not state the plan's final
> standing — the slip — says **NOTHING** (§13). **No undo is drawn** (LD 42 D18), and LD 41 (b)'s
> empty-plan branch is kept although it cannot fire post-final. **L16 is complete**; lane 5 was
> ruled out by D-45.
