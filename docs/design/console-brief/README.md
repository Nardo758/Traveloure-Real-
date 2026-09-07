# Console & AI Concierge brief — ratified mock artboards

18 `.dc.html` artboards, the `canvas.json` that lays them out, and `gen.py`, the generator that produced the
console-tab, Trip Card and build-sequence boards (the four row-1 boards were hand-authored). Committed 2026-09-07
as the Wave 0 preservation step of `docs/design/CONSOLE_AND_AI_CONCIERGE_BRIEF.md`: the rulings ratified as
CLAUDE.md Locked Decision 45 cite this canvas, and a ruling that cites a mock nobody can open is unfalsifiable
(the `wedding-flow/README.md` precedent; the slip canvas that was never committed is recorded as unrecoverable in
ledger `2026-09-07-slip-canvas-unrecoverable`).

**Canvas of record:** claude.ai artifact `04dfd827` ("AI Concierge on the Slip"). These files are that canvas's
content as of the save that added the build sequence; later edits in the canvas editor are not mirrored here
automatically.

## What each artboard shows

| Row | File | Shows | Fidelity |
|---|---|---|---|
| Brief | `Main.dc.html` | The brief as a flowing memo, §1–§10 (§11 exists in the markdown only) | doc |
| 1 | `Console.dc.html` | Proposed sidebar (8 tabs), spine strip, six view cards, two retirements | **ruled** (rulings 4, 5, 7) |
| 1 | `SlipDrawer.dc.html` | The slip with the Ask AI drawer open on a proposal | **ruled** (rulings 1, 3) — L15/L16 unbuilt |
| 1 | `AILifecycle.dc.html` | The AI actor from doors to the Trip Card | ruled |
| 1 | `BuildSequence.dc.html` | Eighteen lanes in four waves | superseded by §10's status table |
| 2 | `HomeBefore.dc.html` / `Home.dc.html` | Today's Home from source / Home as the time axis | **ruled** (ruling 8) — L10 unbuilt; L2 landed |
| 2 | `MyPlansBefore.dc.html` / `MyPlans.dc.html` | Today's My Plans / the lifecycle list | **built** (L3, `2026-09-07-my-plans-rows`) |
| 2 | `DiscoverBefore.dc.html` / `Discover.dc.html` | Today's public destinations page / plan-aware Discover inside the shell | shell **built** (L1); page proposal — L11 unbuilt |
| 2 | `StartWithAI.dc.html` | The draft panel as a door | **built** (L5) |
| 2 | `Experts.dc.html` · `Bookings.dc.html` · `Inbox.dc.html` · `Profile.dc.html` | The remaining tabs in the one grammar | grammar **built** (L1); Bookings/Inbox additions — L12/L13 unbuilt |
| 3 | `TripCard.dc.html` / `TripCardMobile.dc.html` | Post-final card as one page / the phone's live day | honesty items **built** (L4); tab shell — L9 unbuilt |

Fidelity vocabulary follows `wedding-flow/README.md`: **ruled** = a ledger row says so; **built** = the lane
merged and its own tests pin it. The "today" boards are recreations of the pages as of `f3933df` and are
already stale where L1–L5 landed; they are kept as the evidence the redraws answered.

Sample data throughout (the Kyoto wedding, Mika Tanaka, the Lisbon weekend, every price) is illustrative.
