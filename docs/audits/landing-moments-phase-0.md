# Landing v2.5 Lane 2 (Moments) — Phase 0 (read-only)

`audited@ origin/main 0f10aa695` · branch `claude/landing-v2.5` · **HARD STOP** after this doc.

Read-only investigation of the six Phase-0 questions the dispatch names, plus the
photo-availability table that decides launch honesty. No code changed here.

## Headline: the photo gate, honestly applied, admits ZERO moments today

The ruling `2026-09-01-landing-moments` photo gate: *a moment enters rotation only when it
has ≥1 **real, attributed** photo — **never stock/AI**.* Applying it to real dev data:

### Photo-availability table (dev, `traveloure_dev`)

| # | Moment | market | gems w/ imageUrl | of those: expert-curated | of those: NON-stock | **qualifies?** |
|---|--------|--------|------------------|--------------------------|---------------------|----------------|
| 1 | Proposal | Kyoto | **8** (of 21) | 0 | **0** (all `images.unsplash.com`) | **NO** |
| 2 | Golf | Edinburgh | 0 (of 3) | 0 | 0 | NO |
| 3 | Girls' trip | Cartagena | 0 (of 11) | 0 | 0 | NO |
| 4 | Anniversary | Porto | 0 (of 3) | 0 | 0 | NO |
| 5 | Honeymoon | Goa | 0 (of 7) | 0 | 0 | NO |
| 6 | Milestone | Mumbai | 0 (of 5) | 0 | 0 | NO |
| 7 | Family | Jaipur | 0 (of 7) | 0 | 0 | NO |

**The mock's optimistic note — "Kyoto's proposal qualifies today from gem photos" — is false
against the gate.** Kyoto has the only photo-bearing gems, but **all 8 are `images.unsplash.com`
stock**, which the gate forbids. No gem anywhere carries `curated_by_expert_id` (0 rows), and the
real Gion anchor expert **Yuki Nakamura has no `handle`** in dev — so even the caption's
`@yuki-flowers` attribution doesn't resolve. `city_media_cache` is explicitly stock
(`source ∈ {unsplash, pexels, google_places}`) and is excluded by the gate too.

**Consequence:** built strictly to the gate, `GET /api/landing/moments` returns **[]** today and
the section opens with **zero live slides** — all seven tab-strip pills faint ("coming as locals
join"). That is more honest than the mock assumed, and it forces the decision below.

## DECISION 1 (yours) — what the section does with zero live moments

- **(A) Render the strip, no slide.** Show the seven faint "coming as locals join" pills with no
  photo panel — a pure recruitment strip under the hero. Maximally honest; but an empty marquee in
  the site's #2 slot is a weak first impression.
- **(B) Suppress the section until ≥1 moment qualifies** (the ExperiencesRail precedent — the
  ticker is hidden until `experience_starts` exists). The section simply isn't there until a real
  photo lands; nothing dishonest, nothing empty. **My recommendation** — the build is identical
  either way (data-driven), this is one guard on `moments.length === 0`.
- **(C) Seed one real attributed photo** so Kyoto goes live for the demo — an expert (Yuki)
  contributes a real, non-stock photo of a Gion gem via the field-knowledge evidence capture AND
  gets a handle. This is a **data/ops task in the field-knowledge lane, not this lane** — but it's
  the only path to a live slide at launch, and it's the recruitment loop working as intended.

The build proceeds regardless; DECISION 1 only sets the `moments.length === 0` render (A vs B) and
whether C is worth doing before flip. **Recommendation: build data-driven, default to (B), and
treat (C) as the launch-readiness step** (one real photo → Kyoto lights up → the section appears).

## The six Phase-0 questions — answers

1. **Chooser prefill.** `usePlanning().open(source?)` takes a `PlanningSource`
   (`client/src/contexts/PlanningContext.tsx`) that carries `city/country/destination/tripId/branch`
   — but **NOT `experienceType` and NOT `momentKey`**. The chooser (`EnhancedPlanningModal.tsx`)
   holds `experienceType` in local state defaulting to `'travel'` (line 102) with no prefill wire,
   and maps it to `eventType` at trip creation (line 273). **Build:** add `experienceType?` and
   `momentKey?` to `PlanningSource`, thread both into the modal's initial state, and persist
   `momentKey` at trip creation. The moment CTA calls
   `open({ branch: 'ai', experienceType, momentKey })`.

2. **Photo sources per market.** See the table above. The only photo-bearing source in dev is
   `travel_pulse_hidden_gems.image_url` (Kyoto only, all stock). Real sources per the gate would be
   an expert-curated gem (`curated_by_expert_id` + a non-stock upload) or the field-knowledge
   evidence capture. `city_media_cache` = stock, excluded.

3. **`useRotation` contract.** EXISTS (`client/src/hooks/use-rotation.ts`) — `useRotation(count,
   { intervalMs = 8000, paused })` → current index; holds at 0 under `prefers-reduced-motion`;
   `count ≤ 1` never ticks. Already consumed by cities-rail + hero. **Reuse it** for the slideshow
   (`useRotation(photoCount, { intervalMs: 8000, paused: hovered })`) and the moment rotation. One
   photo ⇒ count 1 ⇒ no tick, dots hidden (matches the gate). No new rotation impl.

4. **Attribution pattern to mirror.** `upsell_impressions` (`shared/schema.ts:7751`) keys on
   `guest_session_id` (varchar) + nullable `user_id` — **no PII beyond a session token**. New table
   **`landing_moment_events`** mirrors it: `{ id, momentKey, kind (impression|tab|dot|cta),
   position, guestSessionId, userId?, createdAt }`. `POST /api/landing/moments/event`. The
   moment→trip→purchase funnel joins on `momentKey` (see Q6).

5. **Old rail to remove.** `ExperiencesRail` (`experiences-rail.tsx`) — the degraded, static
   "What people are planning" (ticker already hidden; `experience_starts` rollup does not exist).
   **Remove `<ExperiencesRail />` from `landing.tsx`.** Keep the component file filed for the
   ticker's return when `experience_starts` lands (a filed, un-built rollup — unchanged).

6. **`momentKey` home + plan-prompt read.** **`trips.momentKey`** — a nullable `varchar(30)` column
   beside the existing `trips.experienceType` / `trips.eventType` (`shared/schema.ts:85`), NOT the
   `trip_contexts` jsonb (the ruling says an additive nullable *column*, and the attribution funnel
   joins on it declaratively). Additive, no CHECK (publish-trap posture), declared in
   `shared/schema.ts`, migration number **verified against origin at build time**. **Plan-prompt
   read site:** `server/routes/content.routes.ts:640` already builds `Event Type: ${eventType}`
   into the generation prompt — the build adds an occasion line (`Occasion: proposal`) when the
   trip carries a `momentKey`, so Yuki's brief says *proposal*, not *event*.

## Build plan (after DECISION 1)

1. `moments` config (server-side, one row per moment: key, copy from `MOMENTS_COPY.md`, market,
   photo-source query, `experienceType`) + `GET /api/landing/moments` returning only moments with
   ≥1 real, attributed, non-stock photo (today: []), each photo with its attribution.
2. Migration: `landing_moment_events` table + `trips.momentKey` column (both declared in
   `shared/schema.ts`; numbers verified against origin). `POST /api/landing/moments/event`
   (impression ≥2s; tab/dot/cta). No PII beyond the upsell session token.
3. Section component: slideshow (`useRotation`, dots, caption place + `@handle`) · story panel
   (eyebrow, headline, three pieces, `Plan this moment` → `open({branch:'ai', experienceType,
   momentKey})`, builder byline from real rows / honest-omit) · tab strip (live pills + faint
   "coming as locals join"). Mount at landing position 2. Remove `ExperiencesRail`.
4. `momentKey` write (chooser → trip) + read (plan prompt at `content.routes.ts:640`).
5. Playwright: section renders only live moments; a zero-photo moment is faint in the strip, absent
   from the slide; tab tap switches slide + posts an event; CTA opens the chooser with the right
   `experienceType`; reduced-motion freezes rotation; coral count = 4.

## Notes to fold into the docs at build time

- `LANDING_SPEC.md` / `MOMENTS_COPY.md` currently repeat the mock's "Kyoto qualifies today" line —
  correct it to the finding here (stock gem photos fail the gate; launch-live set is data-driven
  and today empty).
