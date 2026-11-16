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