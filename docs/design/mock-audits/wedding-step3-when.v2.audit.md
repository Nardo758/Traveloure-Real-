# `Step3When.dc.html` — v2 (post-build) audit

**Artboard:** `docs/design/wedding-flow/Step3When.dc.html` (Plan modal · step 3 · When, event class — a wedding on a range with a main moment)
**Live surface:** `client/src/components/trip/plan-modal.tsx` step 3; `client/src/lib/occasion-switches.ts` (`durationShape`, `showsSchedule`)
**Repo state audited:** `origin/main` @ `fcbc1d097`, 2026-09-04
**Authority:** ledger `2026-09-04-one-modal-many-doors`; CLAUDE.md **Locked Decisions 33 / 30 / 35**.
**v1 brief:** `wedding-step3-when.audit.md` (flagged the range-vs-anchor branches as mutually exclusive; the artboard's own answer resolved it).

## Findings

| # | Mock section | Live `file:line` | Verdict | Evidence |
|---|---|---|---|---|
| 1 | Eyebrow "Your Kyoto wedding" (no date span) | `plan-modal.tsx:849`–`860` | **DIVERGENCE — cosmetic** | Live appends the span as soon as a start date exists: "Your Kyoto wedding · Oct 2 to 4". On this step, where the dates are being entered, the eyebrow updates live and the artboard's dateless version is only the pre-entry state. Meaning unchanged. |
| 2 | Title "When is it?" | `plan-modal.tsx:866` | MATCH (verbatim) | |
| 3 | Pill "Wedding · change" | `plan-modal.tsx:936`–`949` | MATCH | |
| 4 | "First day" / "Last day" date fields | `plan-modal.tsx:1227`–`1249` (`etp-step3-range`, `input-etp-start-date`, `input-etp-end-date`) | MATCH (verbatim labels) | Rendered because `durationShape(wedding) === "range"` (`experience-template-tabs.seed.ts:4800`). `min={startDate}` on the end field is an addition the artboard does not draw and does not contradict. |
| 5 | "**The main moment**" card on a RANGE | `plan-modal.tsx:1255`–`1293` (`etp-main-moment-card`) | **MATCH — and this is the artboard's own resolution of the v1 finding** | Gated `shape !== "day" && wantsSchedule`, i.e. a range-shaped occasion that HAS a schedule. Wedding is `range` + `schedule: true`, so it renders. |
| 6 | Card row 1: the moment's **name**, "Ceremony" | — (no such control) | **DIVERGENCE — not built** | Live collects only a date and a time. The anchor's identity is the constant `MAIN_MOMENT_DESCRIPTION = "The main moment"` (`plan-modal.tsx:148`), and that string is also the **re-find key** that makes a second save an UPDATE rather than a duplicate anchor (`:558`, `:570`). Letting the traveler name it would move that key onto user data. |
| 7 | Card row 2: date "Sat, Oct 3" and time "15:00" | `plan-modal.tsx:1271`–`1291` (`input-etp-main-moment-date`, `input-etp-main-moment`) | MATCH | Date is `min={startDate} max={endDate}` — inside the plan's own range. **Nothing is written until BOTH are given** (`:1249`–`1254` comment; §13). |
| 8 | Caption "This is the anchor everything else is timed around. **Guests see it in their own time zone.**" | `plan-modal.tsx:1288`–`1290` | **DIVERGENCE — second sentence deliberately dropped (§13)** | Live says only "This is the anchor everything else is timed around." The dropped clause is a **claim the data cannot support**: `trips.timezone` is nullable and NULL means NOT CAPTURED (Locked Decision 30), and `user_experiences.start_time` is wall-clock stored verbatim with no conversion (Locked Decision 35). Promising per-guest zone conversion would be exactly the fabricated-authority failure ruling 30 forbids. **Correct as is.** |
| 9 | Footnote "A travel-class plan asks only for the two days." | `plan-modal.tsx:886`–`889` (`stepNote.when`, range branch) | MATCH (verbatim) | |
| 10 | "Next: Who" | `plan-modal.tsx:1614`–`1622` | MATCH | |

## Classification

- **(A) contained:** #1 — cosmetic only; no change recommended (the live eyebrow is strictly more informative).
- **(B) needs a ruling:** **#6** — does the plan's main moment carry a **traveler-given name**? It cannot simply be added: `temporal_anchors.description` is currently both the label and the idempotency key for the anchor (`plan-modal.tsx:558`, `:570`), so naming the moment requires a second marker column or a different re-find predicate. Decision-maker call (touches `temporal_anchors` semantics — Coordination Prevention).
- **(C) ruled omission / correct as is:** #8 (the time-zone promise is unsupportable and correctly dropped).

**Not verifiable without a running server:** that the anchor round-trips through `GET/POST /api/trips/:id/anchors` as one row across two saves.
