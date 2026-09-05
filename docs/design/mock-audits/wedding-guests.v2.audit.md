# `Guests.dc.html` — v2 (post-build) audit

**Artboard:** `docs/design/wedding-flow/Guests.dc.html` (One list, a column per event)
**Live surface:** `client/src/pages/plan-guests.tsx` (`/plans/:tripId/guests`), `server/services/plan-guest-roster.service.ts`, `client/src/components/GuestInviteManager.tsx` (the ONE invite writer)
**Repo state audited:** `origin/main` @ `fcbc1d097`, 2026-09-04
**Authority:** ledger `2026-09-04-guests-per-event`; CLAUDE.md **Locked Decision 37**.
**v1 brief:** `wedding-guests.audit.md` — its central correction **stands**: `participant-travel-tracker.tsx` is unmounted and was never the live surface.

## Findings

| # | Mock section | Live `file:line` | Verdict | Evidence |
|---|---|---|---|---|
| 1 | Title "Guests"; subline "Your Kyoto wedding · Oct 2 to 4" | `plan-guests.tsx:165`–`170` (`heading-plan-guests`, `text-plan-subline`) | MATCH | Subline is `${planTitle} · ${start} to ${end}`. |
| 2 | Header actions "**Copy links**" and "**Invite by email**" | — (no page-level actions) | **DIVERGENCE — not built** | Live has no page-level invite actions. Inviting is a **per-column** "Invite" button (`plan-guests.tsx:256`–`267`, `button-invite-${event.id}`) that opens `GuestInviteManager` for THAT event — which is the ruled shape (an invite belongs to one event, one writer), but it means the artboard's two header buttons have no counterpart. |
| 3 | Stat tiles: 64 Invited · 58 Attending · 4 Countries of origin | `plan-guests.tsx:216`–`221` (`stat-invited`, `stat-attending`, `stat-countries`) | **MATCH** | `stat-countries` is rendered **only when the roster has one** — OMITTED rather than 0 (§13, Locked Decision 37). |
| 4 | 4th tile "**22 Brunch (family only)**" | `plan-guests.tsx:13`–`16`, `:223`–`227` | **ALREADY-RULED** | "Nothing in the data marks an event 'family only': that is a host's description of who they invited, and no column holds it." The tile is replaced by **Events** (a fact the roster carries). Stated departure. |
| 5 | Columns: Guest · From · RSVP · Dietary, then one per event | `plan-guests.tsx:240`–`252` | **MATCH — the artboard's thesis, built** | One column per event, in `storage.getUserExperiencesByTrip`'s order (never restated — §18 rule 1). |
| 6 | Column header carries the event name | `plan-guests.tsx:250` (`column-event-${event.id}`) | MATCH, plus a per-event count | Live adds "N of M attending" under each event name (`:251`–`253`) — additive, and derived from the roster. |
| 7 | One row per person, deduplicated | `server/services/plan-guest-roster.service.ts` (`buildPlanGuestRoster`) | MATCH (ruled) | Dedupe by **normalised email** only; **no name matching and no fuzzy match of any kind** (`2026-09-04-guest-list-reconciliation`), so a guest with no email is its own row. |
| 8 | Per-cell RSVP glyphs, with the **same dash** for declined and never-invited | `plan-guests.tsx:20`–`25`, `:71`–`86` | **ALREADY-RULED — declined gets its own ✕** | Stated departure: declined and not-invited are different facts, and the column-per-event layout exists to keep them apart. Every cell also carries a written label for screen readers; the glyph is never the only carrier of meaning. |
| 9 | Blank "From" / "Dietary" cells | `plan-guests.tsx:293`–`299` | **MATCH (§13)** | Blank when unstated — never "Unknown"/"None". |
| 10 | Footer "One list. Each column is an event. An invite belongs to an event, so brunch can be family only without a second list." | `plan-guests.tsx:305`–`308` (`text-guests-footer`) | **MATCH (verbatim)** | |
| 11 | Event start TIMES on the columns | `plan-guests.tsx:17`–`18`; CLAUDE.md Locked Decision 37 | **STALE COMMENT — the stated reason no longer holds** | Both the file comment ("`user_experiences` has `event_date` and no time-of-day column") and Locked Decision 37's "no event start TIME is emitted because `user_experiences` has no time-of-day column" were written **before migration 282**, which added `start_time` (Locked Decision 35). The artboard draws no times here, so there is **no UI divergence** — but the recorded reason is now false. |
| 12 | Hidden occasions | `plan-guests.tsx:172`–`182` (`plan-guests-hidden`) | MATCH (ruled) | A `default_visibility: hidden` occasion has no guest surface at all and **nothing is fetched**. |
| 13 | The traveling party merged into this list | `plan-guests.tsx:27`–`29` | **ALREADY-RULED** | `trip_participants` is a different population under a different predicate and is never merged (Locked Decision 37). |

## Classification

- **(A) contained:**
  - **#2** — if the header actions are wanted, they are page-level affordances in `client/src/pages/plan-guests.tsx:154`–`171`. "Invite by email" must still open the **one** writer (`GuestInviteManager`) for a chosen event — never a second invite rail. "Copy links" has no ratified target today and should not be invented.
  - **#11** — correct the stale reason in `client/src/pages/plan-guests.tsx:17`–`18` (documentation only; do not start emitting times unless the artboard is amended).
- **(B) needs a ruling:** none. (Note for the ledger: Locked Decision 37's time clause is now historically inaccurate; the entry is append-only and is not to be edited — this brief records the correction.)
- **(C) ruled omission / correct as is:** #4, #8, #9, #12, #13.

**Not verifiable without a running server:** the roster's real dedupe behaviour and the owner-tier gate on `GET /api/trips/:tripId/guests`.
