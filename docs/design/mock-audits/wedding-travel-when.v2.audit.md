# `TravelWhen.dc.html` — v2 (post-build) audit

**Artboard:** `docs/design/wedding-flow/TravelWhen.dc.html` (Golf trip · When — range only)
**Live surface:** `client/src/components/trip/plan-modal.tsx` step 3 under `default_duration: range`
**Repo state audited:** `origin/main` @ `fcbc1d097`, 2026-09-04
**Authority:** ledger `2026-09-04-one-modal-many-doors`; CLAUDE.md Locked Decision 33.
**v1 brief:** `wedding-travel-when.audit.md` (1 divergence: "step-rail shell still missing" — **now closed**, the rail is built).

## Findings

| # | Mock section | Live `file:line` | Verdict | Evidence |
|---|---|---|---|---|
| 1 | Eyebrow "Your golf trip · **3 stops**" | `plan-modal.tsx:849`–`860` | **DIVERGENCE — the stop count is not in the eyebrow** | Live composes `Your <city> <occasion>` + a **date** span only. There is no stop-count segment, and the eyebrow's city is stop 1's name, so a three-stop plan reads "Your Edinburgh golf trip · May 14 to 18". |
| 2 | Title "**When are you going?**" | `plan-modal.tsx:866` | **DIVERGENCE — copy** | Live: "When is it?" for every occasion. Same class as `TravelWhere` #2 — `stepTitle` does not branch per occasion on this step. |
| 3 | Pill "Golf trip · change" | `plan-modal.tsx:936`–`949` | MATCH | |
| 4 | "First day" / "Last day" | `plan-modal.tsx:1227`–`1249` (`etp-step3-range`) | **MATCH (verbatim)** | Rendered because `durationShape(golf-trip) === "range"` (`experience-template-tabs.seed.ts:4907`). |
| 5 | **No** main-moment card | `plan-modal.tsx:1261` | **DIVERGENCE — the card DOES render for golf** | The gate is `shape !== "day" && wantsSchedule`. `golf-trip` is `range` **and** `schedule: true`, so the "The main moment" card renders on this step — which the artboard does not draw. It is arguably correct for a wedding (a ceremony is a centre of gravity) and questionable for a golf trip, whose fixed points are four tee times collected on step 5. |
| 6 | Footnote "Four rounds are four timed appointments. Step 5 follows." | `plan-modal.tsx:886`–`889` (`stepNote.when`, range branch) | Annotation vs functional note | Live: "A travel-class plan asks only for the two days." The artboard's line is a design annotation. Its claim is true: step 5 follows because `golf-trip` seeds `schedule: true`. |
| 7 | "Next: Who" | `plan-modal.tsx:1614`–`1622` | MATCH | |
| 8 | No single-date branch for this occasion | `plan-modal.tsx:1197` | MATCH | The "Date + Time" pair is absent, not disabled. |

## Classification

- **(A) contained:**
  - **#5** — the sharpest finding here. Either (a) narrow the main-moment card's gate in `client/src/components/trip/plan-modal.tsx:1261` so it does not render for an occasion whose schedule is a *list of appointments* rather than a single anchor, or (b) accept it and amend the artboard. Note the card writes a `temporal_anchors` row (`plan-modal.tsx:536`–`575`); a golf trip acquiring an unnamed "The main moment" anchor beside four tee-time anchors is a real data consequence, not just a pixel one. **A narrowing predicate would need a switch to key on — there is none today**, which is why this is listed as contained-but-careful.
  - **#1** — a stop-count segment in the eyebrow (`client/src/components/trip/plan-modal.tsx:849`–`860`), derived from `namedStops(stops).length` and shown only under `stopsMany` with >1 named stop.
  - **#2** — same as `TravelWhere` #2; optional.
- **(B) needs a ruling:** none — but see #5's parenthetical: if the answer is "the card should be wedding-only", that is a **seventh switch**, and Locked Decision 31 explicitly warns against growing the switch set casually. Escalate if (a) is chosen.
- **(C) ruled omission / correct as is:** #6 (annotation), #8.

**Not verifiable without a running server:** whether a golf plan in practice ends up with a stray main-moment anchor (a data question).
