# Wording approval — four PENDING strings

**Status: PENDING. Nothing is built from these yet.** Drafted 2026-11-15 by DeepSeek, lane 4 of the architect's dispatch. Every string here needs **Leon's own "Wording approved" comment on this PR** before any code uses it. An approval on another PR does not carry.

These are the three rows already marked **PENDING Leon wording** in `docs/specs/unified-plan-entry.md:162-164`, lifted out of that table so each can be approved or changed one at a time, plus the string that unblocks E8.

## The four

| # | String | Where it would appear | What it unblocks |
|---|---|---|---|
| 1 | **"Days before or after the event"** | The **event-window helper** on an event's plan: the line that explains what the window is, directly above the two fields in row 2. It reads as a label for a control that does not exist yet. | **E8** (event anchor, days before or after). Today the window is derived from the event and stored nowhere; this control names it. |
| 2 | **"How many days before?"** | The **first of the two window bounds** — a number field that sets how many days before the event the plan may start. | E8, lower bound |
| 3 | **"How many days after?"** | The **second window bound** — how many days after the event the plan may run. | E8, upper bound |
| 4 | **"Built around {name}"** | The **anchor line on a plan built from content** — e.g. a plan started from an event shows "Built around Kyoto Ceramics Fair". `{name}` is the content's own name, never a sentence around it. | The unified plan-entry spec's anchor line; nothing ships behind it today |

## What each approval changes

- **Rows 1-3 are one decision, not three.** They are one control: a helper sentence and its two bounds. If the wording changes, all three change together — say so in one comment and I build them as one change.
- **Row 4 is independent.** It can be approved or dropped without touching E8.

## What I need from Leon

A single comment on this PR, in any of these forms:

- **"Wording approved"** — I build against these strings exactly as written, behind a marked PENDING constant until the build lands, per the standing rule.
- **"Wording approved with changes:"** followed by the replacement text — I use the replacement and quote it in the PR body.
- **"Dropped"** with a reason — the row is struck from this file and from `unified-plan-entry.md`, and whatever depended on it is re-scoped.

## What does NOT happen until then

- No E8 build (rows 1-3).
- No anchor line (row 4).
- No new user-facing string enters the codebase on the strength of this file alone.

## Why a file and not a comment on a code PR

E8 has no code PR yet, and the anchor line belongs to a spec that has none either. Putting the wording in one approved, dated place means the later PRs cite an approval instead of re-asking, and a reader can see exactly what was approved and when.

## Provenance

- Rows 1-4: `docs/specs/unified-plan-entry.md:162-164` (the spec's own PENDING rows).
- E8's shape — derived window, nothing new stored — is `docs/specs/unified-plan-entry.md` §2's E8 entry and the master plan's lane 7.
- The approved-strings table immediately above those rows (`:148-161`) is the pattern this file follows: one row per string, the wording, and where it appears.
---

# Two design questions, answered before any wording is approved

Read-only answers, 2026-11-15. They change what rows 1-4 should be, so read them before approving anything.

## Q1 — E8's control shape: can it be the one calendar, not two number fields?

**Yes, and the number fields should not exist.** Two fields labelled "How many days before?" / "How many days after?" would be a second date input, which contradicts **E4** (one calendar in the plan editor, merged #2019) and unified-plan-entry rule 6 (one calendar).

The shared calendar is already most of the way there:

| Evidence | What it gives E8 |
|---|---|
| `client/src/components/plan/PlanDatesCalendar.tsx:59-71` — props are `value, onChange, min, max, onSave, saving, onSkip, trailing, testId` | `min`/`max` already bound a window; the event window can be passed as those bounds |
| `:91` `const disabled = useMemo(...)` | a day set is already computed and handed to the picker |
| `:128-129` `onDayClick={(day, modifiers) => { if (modifiers.disabled) return; ... }}` | a guarded tap already exists: disabled days cannot be picked |
| `:132-134` `disabled={disabled} fromDate={toDate(min)} toDate={toDate(max)}` | the picker honours both bounds and a computed disabled set |

**The shape that fits:** open `PlanDatesCalendar` with the plan's range, pass the event's days as a locked set, and let the traveler extend **either end**. The event days are always *inside* the range; the ends stay movable outward. That needs one new prop (a "must include these days" pair) and a clamp in the range rule — **not** a new widget, **not** a second input.

**Strings it would need: none.** The locked days draw as disabled-and-selected day cells, which is a state, not copy. If you want a sentence explaining the lock, that sentence is the only new string — and it would **replace** "Days before or after the event" rather than sit beside it.

**Consequence for this file: rows 2 and 3 should be dropped, and row 1 re-scoped.** The two number-field prompts lose their control. Row 1 survives only as an optional one-line helper, and if you would rather have no copy at all, E8 ships with **zero new strings**.

## Q2 — "Built around {name}" collides, and partly duplicates the plan label

**Where it collides.** `client/src/lib/custom-pin-refusal.ts:78-80` already speaks this way about the **paid** Build-around tool:

- `:78` "That event can't be built around — it needs a place and a start time."
- `:79` "That day has no located stops to build around."
- `:80` "Everything on your plan is on that day, so there's nothing to rebuild around."

`built around` there means *the paid optimizer pinned an anchor*. Using the same verb for a decorative anchor line would give two different actions one phrase — and the refusals are the strings a traveler sees when a charge is **declined**, so ambiguity is expensive.

**Where it duplicates.** `client/src/lib/plan-entry.ts:289-294` (`planEntryChoiceLabel`) already derives the plan's banner/title wording, and its own comment says it uses **the event's title when the plan is built around an event**; otherwise the chosen occasion. So for the exact case the anchor line targets — a plan started from an event — the **banner already names the event**. The anchor line would print the same name twice on one screen.

**Where it would earn its place, if anywhere:** only where the label does *not* draw — a plan header that shows an occasion name while the plan actually came from content, or a multi-content plan where one banner cannot name several sources. Neither is built, and both are speculative.

**Recommendation: drop row 4.** If the need is real later, propose a wording that does not reuse "built around" (and accept that it is a new string needing its own approval), rather than approve a phrase that already means something else.

## What this means for the approval request

| Row | Effect of the two answers |
|---|---|
| 1 "Days before or after the event" | optional helper only; **E8 can ship with zero strings** |
| 2 "How many days before?" | **drop** — no number field exists under the one-calendar rule |
| 3 "How many days after?" | **drop** — same |
| 4 "Built around {name}" | **drop** — collides with `custom-pin-refusal.ts:78-80` and duplicates `plan-entry.ts:289-294` |

Approve, re-scope or drop on this PR as you prefer; nothing is built either way until the comment is here.