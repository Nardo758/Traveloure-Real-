# Audit brief — Main (Landing page with Wedding)

**Mock:** `docs/design/wedding-flow/Main.dc.html`. The full landing page: navbar (Discover /
**Experiences ▾** / Ready-Made / Experts / Earn), hero ("Plan the trip a local would take", search
input, "Plan my trip" / "Browse local experts" CTAs, a Kyoto bento grid), then the Moments section
— but here the active/featured card is **Wedding** ("A wedding weekend in Kyoto", Nanzen-ji,
@kyotobyaya), the tab strip now shows **Wedding as the active eighth chip** ahead of the same seven
from Before.dc.html, and a new footer callout: "Planning your own? The Earn page's 'Event Planner'
track is for people who *sell* event services. Couples start here: Plan this moment opens your plan
with the occasion already set."
**Status:** This is the proposed "after" — adding Wedding as a live moment plus a disambiguation
callout. Read together with Before.dc.html (companion baseline).
**Live surfaces:**
- `client/src/pages/landing.tsx` — page assembly
- `client/src/components/landing/landing-hero.tsx` — hero (not opened in this audit; the mock's
  hero content is a close visual paraphrase, not this brief's focus)
- `client/src/components/landing/moments-slot.tsx`, `moments-section.tsx` — the Moments block
- `server/services/landing-moments.ts` — the `MOMENTS` roster
- `client/src/pages/start-events.tsx` — the "Event Planner" disambiguation this callout references (see the Planner brief)

## What the mock ratifies

1. Page order: navbar → hero → Moments (position 2), matching `landing.tsx`.
2. Wedding becomes an **eighth live moment**, shown active by default, with its own photo, story,
   three numbered pieces (temple garden ceremony timing, "each its own event on one plan, one
   guest list", multi-country guests "each with their own room and their own RSVP"), and a "Plan
   this moment" CTA.
3. The tab strip carries Wedding alongside the existing seven.
4. A new inline callout disambiguates "Event Planner" (sell services) from "Plan this moment"
   (plan your own), directly addressing the confusion `start-events.tsx`'s own code comments
   describe.

## Findings

| Mock section | Live file:line | Status | Reason |
|---|---|---|---|
| Page order (nav → hero → Moments slot) | `client/src/pages/landing.tsx:32-46` | MATCH | `<LandingHero/>` then `<MomentsSlot/>` in that order, exactly as drawn. |
| Wedding as an eighth live moment (card + tab pill) | `server/services/landing-moments.ts` — `MOMENTS` array (7 entries, keys listed in the Before brief) | **NOT BUILT** | No `key: "wedding"` entry exists in `MOMENTS`. The component (`moments-section.tsx`) would render a wedding card correctly if such a row existed and passed the photo gate — the gap is content/data, not code — but today it cannot appear at all. |
| Moments section itself rendering live (as backdrop for the Wedding addition) | `moments-slot.tsx:26` | DIVERGENCE (operational) | Same empty-state fact as the Before brief: with zero live moments today, `MomentsSlot` renders `ExperiencesRail`, not `MomentsSection` — so even the seven existing moments don't show, let alone an eighth. |
| "Planning your own?" disambiguation callout (Event Planner vs. Plan this moment) | *(no match found)* | **NOT BUILT** | `grep` for this copy ("Planning your own", "opens your plan with the occasion already set") across `client/src` returns nothing. No such callout exists on the landing page today. |
| The callout's underlying problem (Event Planner entry point sending planning couples to sell) | `client/src/pages/start-events.tsx:15-36` | **NOT BUILT / open problem, see Planner brief** | `start-events.tsx`'s own doc comment describes exactly this confusion but the page currently offers only the two supply-side doors (`vendor`, `planner`) — no `"I'm planning my own event"` door exists yet, so the callout's implicit promise ("Couples start here") has nowhere on `/start/events` to land even once the callout is written. |

## Already ruled

- Nothing here is ruled against — Wedding-as-a-moment and the disambiguation callout are both
  unbuilt product surfaces with no ledger row marking them intentionally omitted.

## Not built

- **The Wedding moment row itself** (`server/services/landing-moments.ts`) — adding it is a content/seed change (a new `MomentConfig` entry with a real attributed photo, matching migration-280-era `experience_types.slug = "wedding"` — that catalog row DOES exist, see `server/seed-experience-types.ts:25`, so the occasion itself is real; only the landing *moment* tile is missing).
- **The "Planning your own?" callout** — no code exists for it anywhere on the landing page.
- Both are blocked in practice by the same photo-tier gate noted in the Before brief: even once a Wedding `MomentConfig` row is added, it needs ≥1 attributed real (non-stock) photo to ever render.
