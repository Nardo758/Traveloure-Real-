# A6 design note: how the four pending decisions change the build

Written 2026-09-30 by the Content & Signals session. **A6 is ON HOLD.** This note builds nothing. It sets out,
for each of the content-sourcing brief's four open decisions (§11), what the A6 build would be under each
answer, so the founder can choose. Everything here is read against what A5 already landed on `main`: the
`content_sources` and `place_facts` tables (migration 333), the vocabulary in `shared/content-facts.ts`
(`CONTENT_NEEDS`, `LICENSE_CLASSES`, `SOURCE_ADAPTERS`, `canActivateSource`, `isPublishable`), and the
`PlacesAdapter`.

A6 as the brief scopes it (§10) has four parts: **(a)** the admin registry surface, **(b)** the coverage report
(`scripts/report-content-coverage.cjs <market>`), **(c)** `TavilyExtractAdapter` with spend caps, and **(d)**
the expert "confirm this fact" tap. The table below shows which parts each decision touches.

| Decision | (a) registry surface | (b) coverage report | (c) Tavily adapter | (d) expert confirm |
|---|---|---|---|---|
| 1. Needs taxonomy | form choices, validation | matrix rows | which need a fetch asks for | which need a nugget files under |
| 2. Terms rule + who checks | the Activate button | the "stale terms" flag | nothing (reads `active`) | — |
| 3. Free/paid line | — | — | when `fetch` may spend | — |
| 4. Kyoto editorial locals | the rows the founder registers | whether `tip`/`neighbourhood` show a gap | the first extract targets | — |

---

## 1. Confirm the needs taxonomy (§4)

**What exists now.** `CONTENT_NEEDS` has 11 flat keys. Migration 333 stores `covers` and `does_not_cover` as
`text[]` with no CHECK, so the vocabulary is app-enforced only.

**What the seed data already assumes.** 15 of the 34 rows in `content_sources.seed.csv` used values that were not
in `CONTENT_NEEDS`:
- dotted sub-needs: `transport.intercity.rail` (google_routes, klook, 12go, jr_west), `.bus` and `.ferry` (12go),
  and `transport.intercity.rail (Japan JR)` (12go);
- free-text qualifiers: `transport.local fares & passes`, `last-service rules`;
- catch-alls: `everything else` (predicthq, besttime, kyoto_stop_official, lothian_buses);
- a fact type used as a need: `tip` (kyoto_editorial_1).

The brief's own 12Go example (`does_not_cover: [transport.intercity.rail_jp, transport.cruise]`) also depends on
sub-needs. **Normalised (Sep 30, 2026):** every row now uses the 11 flat needs; each dotted qualifier moved into the row's `notes` as "Need scope: …", so option B can restore it as a sub-need without losing information.

| Option | Build consequence |
|---|---|
| **A. Keep the 11 flat needs** | Smallest build. The registry form offers 11 checkboxes and refuses anything else. `does_not_cover` cannot say "rail in Japan specifically", so 12Go shows as covering all of `transport.intercity` and the coverage report hides the JR rail gap the brief expects on day one (§9). I'd recommend against this for that reason. |
| **B. Flat needs plus an optional dotted sub-need (recommended)** | `CONTENT_NEEDS` gains a small, named list of sub-needs (`transport.intercity.rail`, `.bus`, `.ferry`, `transport.local.fares`), and a pure helper `needCovers(parent, child)` becomes the ONE rule for "a source covering `transport.intercity` but not `.rail`". The coverage report gets one level of nesting. The engine still asks for the parent need, so A5's code is unchanged. It needs no migration, because the columns are already free `text[]`. It is about a day of extra work. |
| **C. Add or rename top-level needs** (for example `tip`, or splitting `dining` into reservations and basics) | Additive: one list edit and a test update. A **rename** is not free: any `place_facts.need` or `content_sources.covers` rows already written keep the old string (insert-only, no backfill), so readers must map both names. Rename before any source is registered, or not at all. |

Free text such as `everything else` and `last-service rules` is refused in every option. Those values belong in
`notes`, not in the need columns.

## 2. "No source active without terms checked", and who checks (§5)

**What exists now.** `canActivateSource` requires `terms_checked_at` and a license class. `content_sources`
already has `terms_checked_by` (FK → users). No surface writes any of it yet.

| Option | Build consequence |
|---|---|
| **A. The founder checks every source (recommended for the Kyoto slice)** | Activate is a single admin action that stamps `terms_checked_at = now()` and `terms_checked_by = session user` in the same statement. The date is server-stamped and never taken from a body, the same posture as the affiliate `page-extract-terms` writer (ledger `2026-09-30-affiliate-scrape-terms`). The route sits under `/api/admin` (§2) and is additionally restricted to one allowlisted user id taken from config, so another admin can draft a row but cannot activate it. That restriction is small, but it is new: I found no existing admin route that distinguishes one admin from another. |
| **B. Any admin checks** | Same writer, without the allowlist. It is simpler, and `terms_checked_by` still records who. |
| **C. Two-person rule** (one admin drafts, a different admin activates) | Needs a `drafted_by` distinct from `terms_checked_by`, plus a refusal when they are the same person. `drafted_by` would be the brief's `added_by`, which migration 333 did not create, so this is a **new column → migration → hold**. |

Under every option: the coverage report flags `terms_checked_at + 180 d` as stale (brief §5), and deciding what
a stale source does (keeps serving vs is deactivated) is a follow-on choice. I'd recommend flag-only, because
auto-deactivating a source silently changes plans. Accepting the rule as written also rules out any seed
migration for `content_sources`: the CSVs stay reference files and every row is entered through the surface.

## 3. The free/paid line (§7)

**What exists now.** A5's free draft reads cache and Places only. `SourceAdapter.fetch` takes `budgetCents`, and
no adapter spends yet.

| Option | Build consequence |
|---|---|
| **A. As written: fresh fetches only inside a paid run or an expert action (recommended)** | `TavilyExtractAdapter.fetch` refuses when `budgetCents <= 0`, and ONE caller-side predicate (`mayFetchFresh(context)` → `paid_run` \| `expert_action` \| null) decides the budget. Cost goes to `place_facts.cost_cents` and to the run's `fee_ledger`/`ai_cost_tracking` rows that already exist. The free path cannot call Tavily at all, which is the property a test can pin. |
| **B. A small free allowance** (for example one fresh fetch per new plan) | Needs a per-plan counter claimed atomically (§15-shaped: `UPDATE … WHERE free_fetches_used < N`). There is no column for that today, so this is a **migration**. It also blurs the "paid does work on your behalf" message on `/pricing`. |
| **C. Expert actions also require a paid plan** | The predicate loses the `expert_action` arm. The expert confirm tap (d) still works, because it writes a verified nugget and fetches nothing. The effect is fewer fresh facts on expert-assisted free plans. |

Every option leaves "never paid: a fact's source, or a fact an expert verified" untouched, because
`factProvenanceLine` renders provenance whatever the tier.

## 4. Which editorial locals for Kyoto, if any (§9)

**What exists now.** One placeholder row, `kyoto_editorial_1`, license class `editorial`, covering `tip`.

| Option | Build consequence |
|---|---|
| **A. None for the slice** | The coverage report shows `neighbourhood` and `dining` tips as expert-nugget-only for Kyoto. That is honest, and it is what the flywheel (§8) expects anyway. The Tavily adapter's first targets are then official pages only (kyoto.travel, JNTO, the transport bureau, temple pages), which have the cleanest terms. No build change. |
| **B. One or two named sites (recommended only if named with terms read)** | Each becomes a registry row entered through the surface after a terms check. Build impact is nil beyond (a) and (c); the risk is legal, not technical. Editorial facts are never `isPublishable`, so they cannot leak to public pages, but they do appear in plans under the site's name, and the quote cap (`BLOG_QUOTE_MAX_CHARS`-style, 300) applies to what is stored. |
| **C. Defer the decision until after A6 ships** | Same as A for now. The surface makes adding a site later a data entry, not a deploy, which is the brief's intent. |

Whatever the answer, the placeholder row's `covers: tip` has to become a real need (`neighbourhood` or
`dining`), or `tip` has to be admitted as a need under decision 1C.

---

## What does not depend on any decision

These can be built as soon as A6 is un-held:
- the coverage report's skeleton (need × source matrix, required-need gaps, stale-terms flag) over whatever
  rows exist;
- the registry list and read views;
- `TavilyExtractAdapter`'s egress posture: the same `fetchGuardedText` + robots.txt layers the affiliate scraper
  uses, with the row-derived host allowlist and the R208 resale-host / partner-host refusals on `source_url`.

## Recommendation summary

1B (flat plus named sub-needs), 2A (founder activates, server-stamped), 3A (as written), 4C (defer; official
pages first). Under those answers A6 needs **no migration**. The only answers that force one are 2C and 3B.
