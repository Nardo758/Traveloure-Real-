# `Slip.dc.html` — v2 (post-build) audit

**Artboard:** `docs/design/wedding-flow/Slip.dc.html` (the slip · day → event → items)
**Live surface:** `client/src/components/plancard/SlipView.tsx`; `client/src/lib/slip-events.ts`; `client/src/components/plancard/SlipLogisticsSection.tsx`
**Repo state audited:** `origin/main` @ `fcbc1d097`, 2026-09-04
**Authority:** ledgers `2026-09-04-slip-events`, `2026-09-04-event-time-ui`; CLAUDE.md **Locked Decisions 29 / 35 / 37**. Pinned by `client/src/lib/__tests__/slip-events.test.ts` (17/17).
**v1 brief:** none (README marked it **built**).
**Concurrent lane:** the slip's **traveling-party section (#766)** is **NOT on `main`** — marked IN-FLIGHT below.

## Findings

| # | Mock section | Live `file:line` | Verdict | Evidence |
|---|---|---|---|---|
| 1 | Header "Slip TRV-000123 · v2" + "Planning" phase chip | `SlipView.tsx:185`–`212` (`slip-header`, `slip-tracking-ref`, `slip-phase-chip`) | MATCH | |
| 2 | Title "Your Kyoto wedding" | `SlipView.tsx:213`–`215` (`slip-title`) | MATCH | |
| 3 | Meta "Oct 2 – Oct 4, 2026 · 2 travelers · **4 events**" | `SlipView.tsx:216`–`225` (`slip-meta`) | **DIVERGENCE** | Live emits the date span and the traveler count only. The event count is **not** in the slip meta, although the same derivation (`countPlanEvents`, `slip-events.ts:147`–`149`) already ships it to the Trip Strip. |
| 4 | Day heading "**Friday · Oct 2**" | `SlipView.tsx:1356`–`1359` | **DIVERGENCE — copy/format** | Live renders `Day {n}{date ? ` · ${date}` : ""}` → "Day 1 · …". The artboard names the weekday; the live heading names the ordinal. |
| 5 | Items grouped **day → event → items** | `SlipView.tsx:1345`–`1352`, `:1375`–`1387`; `slip-events.ts:109`–`140` | **MATCH — the artboard's thesis, built** | `groupItemsByEvent` places every item in exactly one group; the plan's **implicit unnamed event carries NO heading** and renders as a bare `Fragment` (`SlipView.tsx:1386`), never "unassigned". |
| 6 | Event header: title + "19:00 · Kiyamachi, Kyoto" | `SlipView.tsx:574`–`596` (`slip-event-title-*`, `slip-event-meta-*`); `slip-events.ts:182`–`194` (`eventMetaLine`) | **MATCH in substance, DIVERGENCE in format** | Live meta is `"EEE, MMM d" + " " + HH:MM + " · " + place` → **"Fri, Oct 2 19:00 · Kiyamachi, Kyoto"**. Under a day heading that already names the day, the artboard prints the **time only**. Live repeats the date. |
| 7 | The clock comes from the event's own column | `slip-events.ts:186`–`191` | **MATCH (Locked Decision 35)** | Read from `startTime` and NOWHERE else; shape-checked `^\d{2}:\d{2}$`; a NULL renders day-only and is **never** midnight or "all day". |
| 8 | Per-event "**58 attending**" | `SlipView.tsx:574`–`600`; `slip-events.ts:63` (`guestCount` on the DTO) | **DIVERGENCE — carried but not rendered** | `PlanEvent.guestCount` exists on the payload and no surface prints it on the slip. |
| 9 | Four sections **inside** each event: Timeline / Ceremony & Venues / Vendors & Services / Guest Logistics | `SlipView.tsx:1375`–`1387` | **DIVERGENCE — not built** | Items render **flat** inside the event inset. There is no per-event categorisation, and no column on `itinerary_items` carries one of these four buckets. |
| 10 | Item status pills: "on schedule", "with expert", "ready for checkout", "in planning", "confirmed", "flagged" | `client/src/components/plancard/slip-tokens.ts:47`–`58`; `SlipView.tsx:300`–`310` | **DIVERGENCE — a different, smaller vocabulary** | Live pills are exactly the four routing statuses — **Planning / With your expert / In checkout / Purchased** (+ Booked, Optimized). "on schedule", "confirmed" and "flagged" have no live counterpart. |
| 11 | "Osaka Sweets Studio · in a different city from every event — **flagged**" as a row on the slip | `client/src/lib/location-mismatch.ts`; `client/src/components/location-mismatch-dialog.tsx` | **DIVERGENCE — the mismatch is a pre-add dialog, not a slip badge** | The check is advisory and runs **before** the add (`location-mismatch-dialog.tsx:18`: "it never blocks the add, it writes nothing"). Nothing stamps a persistent "flagged" state on an item, so the slip cannot render one. |
| 12 | Day-level logistics ("Shuttle hotel → Nanzen-ji 14:15") shown **inside** the event | `SlipView.tsx:1390`–`1394` | **ALREADY-RULED** | "Logistics stay at DAY level: a leg connects two stops and carries no event link of its own, so it is never filed under one (§13)." |
| 13 | Footer actions: Share · Download PDF · Add all to checkout (3) | `SlipView.tsx:1041`–`1075` (`slip-action-share`, `slip-action-pdf`, `slip-action-add-all-checkout`) | MATCH | Live adds `Preview Trip Card`, `Optimize` and `Finalize` beside them — additive, ruled by other lanes. |
| 14 | Right rail **Guests** card: "64 invited · 58 attending / 4 countries of origin / Brunch: family only (22) / **Open guest list**" | `SlipLogisticsSection.tsx:134`–`176` | **PARTIAL** | The **"Open guest list"** link exists verbatim (`link-open-guest-list` → `/plans/:tripId/guests`) inside a "Guests & invites" collapsible. The three summary counts are **not** on the slip — they live on the Guests page (`plan-guests.tsx:216`–`227`). "Brunch: family only" is a ruled non-fact (no column marks an event family-only — `plan-guests.tsx:13`–`16`). |
| 15 | Right rail **Expert** card: "Aya · Kyoto local · with 3 items / Message" | `SlipView.tsx:420`–`466` (`slip-event-advisor-*`, `slip-event-hire-*`), `slip-assign-expert-slot` | PARTIAL | An advisor line and a per-event "Hire an expert" affordance exist (owner-only); there is no consolidated "with N items / Message" rail card in the artboard's shape. |
| 16 | Owner may edit an event's time where it is read | `SlipView.tsx:500`–`537` (`slip-event-time-*`) | **MATCH — additive, ruled** | Owner-only inline `type="time"` writing through the SAME `PATCH /api/user-experiences/:id` (no second rail). Empty ⇒ an explicit `null`, never an omitted key. The artboard does not draw it. |
| 17 | The traveling party (`trip_participants`) on the slip | — | **IN-FLIGHT (#766)** | Not on `main`. Distinct from the guest roster by ruling `2026-09-04-guest-list-reconciliation` / Locked Decision 37. |

## Classification

- **(A) contained:**
  - **#3** — append the event count to `slip-meta` in `client/src/components/plancard/SlipView.tsx:216`–`225` using `countPlanEvents` (`client/src/lib/slip-events.ts:147`), hidden at zero exactly as the Trip Strip chip is.
  - **#4** — day heading in `client/src/components/plancard/SlipView.tsx:1356`–`1359`: render the weekday (`format(parseTripDate(day.date), "EEEE · MMM d")`) with the existing `Day {n}` as the fallback when `day.date` is absent.
  - **#6** — in `client/src/lib/slip-events.ts:182`–`194`, either add a `{ omitDay?: boolean }` option for callers that already print the day (the slip), or leave as is for `WhichEvent`, which has no day heading above it. **One derivation, two call sites — do not fork the function.**
  - **#8** — render `event.guestCount` in the event header (`client/src/components/plancard/SlipView.tsx:585`–`596`), **omitted when null**, never "0 attending".
  - **#14** — surface `GET /api/trips/:tripId/guests` totals in the slip's Guests collapsible (`client/src/components/plancard/SlipLogisticsSection.tsx:145`–`160`); `countries` is already OMITTED-when-absent server-side.
- **(B) needs a ruling:**
  - **#9** — do items inside an event group into named sections (Timeline / Venues / Vendors / Guest logistics)? Nothing on `itinerary_items` carries such a bucket; this is a schema + taxonomy question (Coordination Prevention).
  - **#10 / #11** — does an item carry a status vocabulary beyond the four routing statuses ("on schedule", "confirmed"), and does a location mismatch **persist** onto the item as "flagged"? Persisting it contradicts `2026-09-04-location-mismatch`'s advisory posture, so it cannot be a code fix.
  - **#15** — the expert rail card's shape ("with N items", "Message") vs today's per-event affordances.
- **(C) ruled omission / correct as is:** #7, #12, #14's "Brunch: family only" tile, #16.
- **IN-FLIGHT (#766), do not re-file:** #17.

**Not verifiable without a running server:** the rendered order of days/events for a real multi-event plan, and the advisor rail's populated state.
