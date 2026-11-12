# QA round 3 · PR 4 Phase 0 — traveler path hygiene (major 7; decision 2)

Base: `main` `f258c1366`. Dispatch: QA round 3 fixes (Drive `10tIIPZNh-LR00Rs0wgK3BD-bPc-Pu4UGWqH5tZ2Rlqs`), PR 4.
Rulings (Leon, Nov 11, 11:23 AM ET): ruling 7, *"ticker off for signed-in members on home too (traveler path)."*;
ruling 2, *"Partner recruit cards come off the traveler /discover feed."* This audit is read-only and every pin is on
`f258c1366`. **Phase 0 is a hard stop: nothing is built until Leon's go.** No new string, no migration, #1705 untouched.

## 1. Ticker — one auth-aware rule

- `client/src/lib/ticker-mount.ts:24` `showsTicker(location)` is path-only (marketing list `:6–20`, prefixes `:22`).
- ONE caller: `client/src/components/layout.tsx:807` `{showsTicker(location) && <CityTickerTape />}` inside `Layout`
  (`:613`). `Layout` already reads `const { user, isLoading: isAuthLoading, logout } = useAuth()` (`:622`).
- `/admin/ticker` imports `TickerRibbon` for its preview (`client/src/pages/admin/ticker.tsx:18`), not `showsTicker`,
  so it is unaffected.
- **Build:** `showsTicker(location, { signedIn })` → `false` whenever `signedIn` is true, on every path (`/` included);
  otherwise today's path rule. `layout.tsx:807` passes `{ signedIn: !!user }`. The rule lives in ONE place.
- **Default, stated (for Leon's go):** while auth is still loading, `user` is undefined, so the ribbon shows as for a
  guest, which is today's behaviour. A signed-in member may see it for the moment before `/api/auth/user` answers.
  The alternative is to hold the ribbon until auth settles, which delays it for every guest by that request. Default:
  hold it (`signedIn` unknown ⇒ no ribbon), so a member never sees it. Leon to confirm.
- Pins that move: `client/src/lib/__tests__/ticker-rules.test.ts:110–121` (K6) gains signed-in rows (every marketing
  path and `/` ⇒ false). `client/src/lib/__tests__/header-plan.test.ts:176` pins the exact mount expression and is
  updated to the new call. Both run in CI (`.github/workflows/build.yml:1244`; client lib job).

## 2. Recruit cards — off the traveler /discover feed

`client/src/pages/discover-location.tsx` puts four recruitment surfaces on the traveler feed:

| # | Surface | Where it is built / rendered |
|---|---|---|
| a | **Wanted slots** ("Local guide wanted in {nb}"), filler built from `uncoveredOfferings` / `expertOfferingTypes`, demand-enriched | query `:1515–1525`; pool `:1768–1783`; slots `:1785–1808`; demand fetch `:1810–1829`; merge `:1836–1843`; composed by `composeDiscoverFeed(…, wantedSlotsData, …)` `:1861–1868`; rendered `FeedWantedSlotCard` `:598`; re-homed per section `:1008–1032` |
| b | **Earn card** (→ `/earn`) | injected `:1885–1889` (one at position 9, "all" view); rendered `FeedEarnCard` `:599–600` |
| c | **Unstocked neighbourhood "Wanted" hero** | `neighbourhoodWantedHeroItem` `client/src/lib/bento-spans.ts:103–154`; section rule `discover-location.tsx:720–730`; rendered `FeedNeighbourhoodWantedCard` `:590–596` |
| d | **Empty-market recruitment section** ("Local experts wanted in {City}", shown only with no experts and no neighbourhoods) | `:2076–2096` (`data-testid="section-expert-recruitment-generic"`) |

- **Build (a) and (b) — the dispatch names (a); (b) is the same kind of card in the same stream:** stop building and
  composing them. `composeDiscoverFeed` gets `[]` for wanted slots; the earn-card splice is removed. The
  `/api/offering-types/experts` and `/api/services/demand` queries feed only (a), so they go too (a query with no
  reader is the §18c shape). The components `client/src/components/feed/wanted-slot-card.tsx`,
  `earn-card.tsx` and the `itineraryExpertLink` copy are **kept**, as ruled.
- **Note:** on `main` nothing outside `discover-location.tsx` renders `FeedWantedSlotCard` or `FeedEarnCard`
  (`client/src/pages/earn.tsx` does not), so after this PR they have no live renderer. Kept by ruling for `/earn` and
  the expert pages; mounting them there is not in this PR.
- **Question (c) and (d):** both are recruitment cards on the traveler feed. Removing (c) leaves an unstocked
  neighbourhood as a heading with nothing under it, so the default is to **drop the unstocked neighbourhood's section
  entirely** (no heading, no tile). Removing (d) leaves an empty market with the page's existing empty state.
  **Default: remove (c) and (d) too**, so no recruit card stays on the traveler feed. Leon to confirm or narrow to
  (a) + (b).
- Pins that move: `client/src/components/plancard/__tests__/row-entry1-shared-draft.test.tsx:197` reads
  `wanted-slot-card.tsx` source (the component stays, so the pin stays). `client/src/components/__tests__/row300b-wanted-tiles.test.tsx:61`
  pins the (d) markup on the page, and moves or is retired with (d).
  `client/src/lib/__tests__/feed-stream-empty-neighbourhood.test.ts:144` covers filler kinds including
  `wanted-slot`/`earn-card` in the stream helper. The helper is unchanged, so the pin stays.
  `row302a`/`row302b`/`row303b`/`bento-action-state` exercise the kinds through their components and helpers, which
  stay.
- **New test:** a `discover-location` source/render pin that the traveler feed composes no `wanted-slot`, `earn-card`
  (and, if confirmed, no unstocked Wanted hero and no `section-expert-recruitment-generic`).

## 3. Not in this PR

PRs 1–3 and 5 of the dispatch, majors 4 and 8 (Phase 0-only reports), and anything on `/earn`.
