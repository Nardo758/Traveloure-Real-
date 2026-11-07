# Canvas boards — November 2026 (22 boards)

Pulled from the Design artifact <https://claude.ai/artifact/WfGh2RjdjLaGfSjL8v5Jmp> (version `1794002699-2220`) on Nov 7, 2026.
Each board is its `project/<Board>.dc.html` source, kept byte for byte, plus `png/<Board>.png` rendered at the board's
canvas size (`$preview` in the source; Playwright, deviceScaleFactor 1). `canvas.json` is the artifact's board layout.

**Rendering note.** The boards load a `./support.js` that is not among the artifact's published files, so each PNG is the
board's own `<helmet>` (fonts and styles) and `<x-dc>` markup drawn as a static page; the boards hold no logic. Text in
square brackets (`[Hotel name]`, `[$ price]`) and "held" tags are canvas placeholders, not copy.

## Boards and their §6 parity rows

Rows are §6 of DeepSeek's dispatch, "planning surface + Trip Card UI rebuild" (to-claude, doc
`1ppMwdDqv3-bkcqdgkz97XjHfE4tD8ekQUlFcrl-88Bw`). This is a first mapping from each board's content; the dispatch's Phase 0
fills the "New home" column and is the record.

| Board | Canvas size | Canvas title | §6 rows |
|---|---|---|---|
| [Main](Main.dc.html) · [png](png/Main.png) | 1280×1180 | Stage 1 · Trip Slip desktop — one column, 194 header, tools row (as built) | 1, 5, 6, 12, 13, 14, 17 |
| [BuildAround](BuildAround.dc.html) · [png](png/BuildAround.png) | 1280×980 | Stage 1 · Build around — Place · Date · Event (OPT-A/OPT-B) | 12, 21 |
| [Review](Review.dc.html) · [png](png/Review.png) | 1280×1100 | Stage 2 · Review board — baseline + 3 versions (as built) | 2, 21 |
| [TripCard](TripCard.dc.html) · [png](png/TripCard.png) | 1280×1100 | Stage 3 · Trip Card desktop — J5 map, 179 line, header menu | 24, 25, 28 |
| [Shipped](Shipped.dc.html) · [png](png/Shipped.png) | 1280×1180 | Shipped pieces — 276 banner, 303 tile panel, CN-1e task log (queued), 242 cost sources | 11, 13, 26 |
| [Entry](Entry.dc.html) · [png](png/Entry.png) | 390×1180 | Entry · Place \| Date \| Event → occasion → Start a plan (main + 2.3 proposal) | — (before the slip exists; no §6 row) |
| [EmptySlip](EmptySlip.dc.html) · [png](png/EmptySlip.png) | 390×1000 | Stage 1 · Empty slip — Quick draft, dates/party chips, expert door | 7, 16, 19 |
| [Drafted](Drafted.dc.html) · [png](png/Drafted.png) | 390×1760 | Stage 2 · Drafted — tools row, Optimize card, day cards, expert note (path a) | 5, 6, 8, 12, 16, 18, 19 |
| [ComparePlaces](ComparePlaces.dc.html) · [png](png/ComparePlaces.png) | 390×1100 | Stage 2 · Compare places to stay — days covered, far-day line (path c) | 8, 23 |
| [Versions](Versions.dc.html) · [png](png/Versions.png) | 390×1400 | Stage 2 · Versions A/B/C — apply by day, Use all fixed days | 2, 21, 22 |
| [VersionsByDay](VersionsByDay.dc.html) · [png](png/VersionsByDay.png) | 390×1100 | Stage 2 · Compare day by day — Take this day, Apply N days | 6, 23 |
| [Moment](Moment.dc.html) · [png](png/Moment.png) | 390×1100 | Stage 2 · Same slip as a Moment — reservation anchor, its tools | 9, 19, 20 |
| [WithExpert](WithExpert.dc.html) · [png](png/WithExpert.png) | 390×1500 | Stage 2 · With an expert — the pen handed off (path b) | 16, 25, 26 |
| [SlipMap](SlipMap.dc.html) · [png](png/SlipMap.png) | 390×1100 | Stage 2 · Slip map — day tabs, version toggle, Browse layer, no lines | 3 (list / map), 4 |
| [Finalize](Finalize.dc.html) · [png](png/Finalize.png) | 390×900 | Finalize — Book it myself · Travel expert (agent lane hidden, concierge off) | 11, 14, 15 |
| [TripCardPhone](TripCardPhone.dc.html) · [png](png/TripCardPhone.png) | 390×1600 | Stage 3 · Trip Card phone — merged October structure + J5/179/CN-1e | 18, 24, 25, 26, 28 |
| [Strips](Strips.dc.html) · [png](png/Strips.png) | 1280×980 | Rows 221 · 222 · 223 — cost strip states, vendor shortlist, hidden expert doors | 13, 16 |
| [DesktopVersions](DesktopVersions.dc.html) · [png](png/DesktopVersions.png) | 1280×760 | Stage 2 · Desktop versions (4c) — drag whole days into Your plan | 21, 23 |
| [Logistics](Logistics.dc.html) · [png](png/Logistics.png) | 1280×1100 | Stage 2 · Logistics sheets (path c) — Getting around · Getting there · Travel party · Pace · Travel options for this leg | 5, 19 |
| [PlannedTools](PlannedTools.dc.html) · [png](png/PlannedTools.png) | 1280×1120 | Six tray tools — planned, not shown (Budget · Getting home · Arrivals & split · Split activities · Who pays what · Getti | 19 (the six coming-soon tools — not drawn) |
| [OccasionSlips](OccasionSlips.dc.html) · [png](png/OccasionSlips.png) | 1280×1000 | Slip variants — Celebration · Hosted event · Group travel · Saved occasions (2.3) | 9, 13, 19 |
| [States](States.dc.html) · [png](png/States.png) | 1280×1060 | States — Optimize error/loading/empty · pay confirm · pin refusal · waitlist Trip Card · restore strip | 12, 15, 21, 22, 26 |

## §6 rows → boards

| Row | Boards |
|---|---|
| 1 · Slip header | Main |
| 2 · Status strip · Optimized badge · See what changed | Review, Versions |
| 3 · View toggle (list / map / calendar) | SlipMap (list / map); **calendar: no board — the canvas shows no calendar view (OPEN-C)** |
| 4 · Map view · located counts | SlipMap |
| 5 · Day columns · items · legs | Drafted, Logistics, Main |
| 6 · Collapse / expand days | Drafted, Main, VersionsByDay |
| 7 · Empty board · notes | EmptySlip |
| 8 · Option sets | ComparePlaces, Drafted |
| 9 · Event group blocks | Moment, OccasionSlips |
| 10 · Ready-made source line | **no board shows the ready-made source line** |
| 11 · Final version · Trip Card link · banner | Finalize, Shipped |
| 12 · Optimizer slot · lead states | BuildAround, Drafted, Main, States |
| 13 · Rail Plan card · budget-in-words | Main, OccasionSlips, Shipped, Strips |
| 14 · Rail actions | Finalize, Main |
| 15 · Finalize prompt · unreachable stops · Trip Pass offer | Finalize, States |
| 16 · Expert card | Drafted, EmptySlip, Strips, WithExpert |
| 17 · Coordination card · browse services | Main |
| 18 · Mobile bottom bar | Drafted, TripCardPhone |
| 19 · Tools tray | Drafted, EmptySlip, Logistics, Moment, OccasionSlips, PlannedTools |
| 20 · Moment anchor card | Moment |
| 21 · Versions board | BuildAround, DesktopVersions, Review, States, Versions |
| 22 · Restore strip | States, Versions |
| 23 · Compare page | ComparePlaces, DesktopVersions, VersionsByDay |
| 24 · Trip Card days | TripCard, TripCardPhone |
| 25 · Trip Card rail | TripCard, TripCardPhone, WithExpert |
| 26 · Concierge task log | Shipped, States, TripCardPhone, WithExpert |
| 27 · Save toasts · save refusal | **no board (wording frozen; every rail)** |
| 28 · P2-A / P2-B | TripCard, TripCardPhone |

Rows with no board: 3's calendar segment (OPEN-C), 10 (ready-made source line), 27 (toasts). Row 17's coordination card has no board; its browse-services half is the stop menu's "Find a host" (Main) and WithExpert.
