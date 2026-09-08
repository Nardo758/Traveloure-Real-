# The "Ask AI about this plan" drawer — design brief

> Lane **L16** of the Console & AI Concierge program. Executes **CLAUDE.md Locked Decision 45 (3)**
> (ledger `2026-09-07-ask-ai-drawer-paid-task`, ratified). Brief of record for the console:
> `docs/design/CONSOLE_AND_AI_CONCIERGE_BRIEF.md` §2 and its `SlipDrawer` artboard, which draw the
> surface; this file adds what a builder needs and the surface drawing cannot carry — where the
> money goes, what may not be written, and what the lane must refuse to invent.
>
> **Compiled 2026-09-08. Blocked on L15** (the conversation trip link) landing first, because a
> thread that belongs to a plan is what makes "one thread per plan" true rather than a claim.

## 1 · What it is, in one sentence

A drawer on the plan's own slip where the traveler asks a question about **this** plan, the AI reads
the plan live and answers with a **proposal**, and nothing changes until the traveler applies it —
at which point, and only then, the task is charged.

## 2 · The three rails it must reuse, and never fork

This lane writes almost no new machinery. Its whole risk is building a second copy of something.

| It needs | It uses | Never |
|---|---|---|
| A place for the answer to land | the EXISTING suggestions rail — a suggestion row with `origin='ai'`, applied through the existing approve path | a second suggestion store, a direct item write |
| A charge | the EXISTING payment-intent pattern with an idempotency key, band `concierge:ai_task` (`CONCIERGE_AI_TASK_BAND`) resolved from `fee_bands` | a literal price anywhere (§8), a second charge rail |
| Protection of paid human work | the EXISTING protected set (LD 42 **D3**): an item carrying `expert_note` or `origin='expert'`, and any booked row | a parallel "is this expert work?" predicate (§18 rule 1) |
| The thread | the AI conversation row, bound to the trip by L15's nullable `trip_id` | a new conversation table |

## 3 · The money rules, which are the whole reason this needs a brief

1. **Charged at APPLY, never at ask.** A question costs nothing. The proposal is free to read and
   free to discard. The charge happens on the traveler's explicit apply.
2. **§15 — claim before charge.** The apply takes an **atomic conditional claim** on the row it is
   about to charge for, then calls Stripe with an **idempotency key**, in that order. A double-click
   or a retry produces one charge and one applied proposal. A check-then-write is the bug, not the
   guard.
3. **§14 — the amount is server-derived** from `fee_bands` and the actor is the session. Nothing
   about the price may arrive in the request body.
4. **The fee line on screen says exactly what will happen**: "$N task · charged only when you
   apply", with N resolved from the band, never typed into the client.
5. **Trip Pass does NOT cover this today, and the drawer must not imply it does.** `ai_task`
   coverage exists in `trip-entitlement.service.ts` as a **no-op with no charge site** (LD 41 (f)
   records it as open debt owned by the memberships lane). So: the Trip Pass chip reads "runs · fee
   waived" and **never "tasks"**, and the drawer claims no waiver it cannot honour. If the lane
   wires coverage instead, it has taken the memberships lane's decision, which is not its to take.

## 4 · What the AI may say, and what it may never say (§13)

- **A proposal is a proposal.** It names what it would replace ("in place of …"), and it names what
  it will not touch — expert items and booked rows — on screen, not only in code.
- **Prices and availability are never invented.** A missing one is said out loud. This is the
  standing note under the composer, and it is a rule about the payload, not a slogan.
- **The AI's words are attributed to the AI.** The origin chip already distinguishes "AI draft" from
  "from your expert"; a proposal must never render in the expert's treatment. This is the same
  false-attribution line LD 42 D4 drew for `expert_note`.
- **A question it cannot answer from the plan is answered with that fact**, never with a plausible
  filler. An empty plan is a draft's job (LD 41 (b)), not a task's.

## 5 · Where it mounts

- **Pre-final:** the slip, beside the rail, as the artboard draws it. The Build card gains one row,
  "Ask AI about this plan", beside Draft and Optimize.
- **Post-final:** the same drawer on the Trip Card, which is where its second tab, the booking agent,
  appears (LD 44 vocabulary — that tab is **L17** and is not this lane).
- **One thread per plan.** Reached from either mount, it is the same conversation.

## 6 · Explicitly out of scope

The booking-agent tab (L17, waits on the agent status vocabulary). Any change to the free draft or
to Optimize (LD 41 settled both). Any charge site for `ai_task` coverage under Trip Pass. Any new
AI write path: the drawer proposes, the traveler applies, and that is the fourth-write-path rule
LD 45 states — agents build and stage, humans pay.

## 7 · What "done" looks like

A traveler asks a question on their own plan; the answer arrives as a proposal naming what it would
replace and what it protects; discarding costs nothing and leaves no row; applying charges once,
even under a double-click, and lands the item through the same approve path an expert suggestion
uses, stamped `origin='ai'`. Expert items and booked rows are still there afterwards.
