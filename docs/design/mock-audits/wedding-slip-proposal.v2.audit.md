# `SlipProposal.dc.html` — v2 (post-build) audit

**Artboard:** `docs/design/wedding-flow/SlipProposal.dc.html` (the slip · a private proposal, `default_visibility: hidden`)
**Live surface:** `client/src/components/plancard/SlipView.tsx`, `client/src/components/plancard/SlipLogisticsSection.tsx`, `client/src/hooks/use-occasion-switches.ts`, `client/src/lib/occasion-switches.ts` (`isHiddenOccasion`)
**Repo state audited:** `origin/main` @ `fcbc1d097`, 2026-09-04
**Authority:** ledger `2026-09-03-switch-readers`; CLAUDE.md **Locked Decision 28**. README fidelity: **ruled**.
**v1 brief:** none.

## Findings

| # | Mock section | Live `file:line` | Verdict | Evidence |
|---|---|---|---|---|
| 1 | Header "Slip TRV-000131 · v1" + "Planning" chip | `SlipView.tsx:185`–`212` | MATCH | |
| 2 | Badge "**Private plan**" beside the phase chip | — (no such element) | **DIVERGENCE — not built** | Nothing on the slip header says the plan is private. The *behaviour* is correct (#3, #4) but it is silent: the traveler is given no positive signal that Share and Guests are absent **by design** rather than missing. |
| 3 | **Share is absent** | `SlipView.tsx:1042`–`1046` | **MATCH — hidden, not disabled** | `{!occasionHidden && (<Button … slip-action-share>)}`. This is exactly the ruled posture: an absent capability is omitted, never rendered greyed out. |
| 4 | **Guests is absent** | `SlipLogisticsSection.tsx:71`–`85`, `:134` | **MATCH — hidden, not disabled** | `isEventTrip = !isHidden && (…)`, so the whole "Guests & invites" collapsible does not render. `plan-guests.tsx:172`–`182` refuses the page too (`plan-guests-hidden`) and **fetches nothing** in that state. |
| 5 | §13 fallback for an unresolvable occasion | `SlipLogisticsSection.tsx:76`–`82`; `occasion-switches.ts:84`–`88` | MATCH | NULL / unrecognised ⇒ **not hidden**, the pre-switch behaviour. "Nothing disappears because a row was never given a value." |
| 6 | Body: one day, one event ("The moment", 18:40 · Miradouro da Vitória) | `SlipView.tsx:574`–`600`; `slip-events.ts:182`–`194` | MATCH | Same event-header derivation as `Slip.dc.html`; see that brief's #6 for the day-format divergence. |
| 7 | Item rows under the event ("18:00 Photographer in position — with expert", "20:00 Dinner, corner table held — ready for checkout") | `SlipView.tsx:1375`–`1387`, `slip-tokens.ts:47`–`50` | MATCH in shape | Pill vocabulary is the four routing statuses; see `wedding-slip.v2.audit.md` #10. |
| 8 | Footer: **Download PDF** and **Add all to checkout (1)** only — no Share | `SlipView.tsx:1042`–`1075` | MATCH | |
| 9 | Expert card "Nuno · Porto local · with 2 items / Message" | `SlipView.tsx:420`–`466` | PARTIAL | Same as `wedding-slip.v2.audit.md` #15. |
| 10 | Annotation "Share and Guests are hidden on private plans. Nothing here is linkable." | `occasion-switches.ts:84`–`88`; `SlipLogisticsSection.tsx:71`–`78` | MATCH (as intent) | Annotation, not UI. **Caveat:** "nothing here is linkable" is stronger than the code — the `/plans/:tripId` URL itself is not made unguessable by the hidden switch; the switch removes the *share affordance* and the guest surface, not route access. Recorded, not filed: no ruling claims otherwise. |
| 11 | `proposal` really is a hidden occasion | `server/seeds/experience-template-tabs.seed.ts:4821`–`4823` | **MATCH** | `visibility: "hidden"`, `guests: false`, `stops: "one"`, `duration: "day"`, `schedule: true` — the row this artboard depends on exists. |

## Classification

- **(A) contained:** **#2** — render a "Private plan" marker in the slip header (`client/src/components/plancard/SlipView.tsx:185`–`212`), gated on the same `isHidden` the actions already read, so the absence of Share/Guests is *explained* rather than merely silent.
- **(B) needs a ruling:** none. (#10's "nothing here is linkable" is an artboard annotation, not a ratified access rule; do not implement route-level secrecy off a caption.)
- **(C) ruled omission / correct as is:** #3, #4, #5, #8.

**Not verifiable without a running server:** that a real `proposal` plan resolves `isHidden === true` through `useOccasionSwitches` (a data path, pinned by `client/src/lib/__tests__/slip-proposal-preview.test.ts`).
