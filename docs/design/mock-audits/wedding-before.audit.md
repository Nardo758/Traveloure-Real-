# Audit brief — Before (Moments section today)

**Mock:** `docs/design/wedding-flow/Before.dc.html`. A single artboard: the landing "Some trips are
really one evening" section as of the mock's own dateline ("Today · Moments section · main @
0437692f · seven keys, none of them a wedding"). One live moment card (Anniversary, Porto) with a
photo/story split layout, and a tab strip of seven occasion chips: Proposal, Golf trip, Girls'
trip, **Anniversary (active)**, Honeymoon, Milestone birthday, Family occasion.
**Status:** This is a "before" snapshot — a baseline, not a target to build toward. Its job is to
establish what existed before Main.dc.html's proposed addition of Wedding.
**Live surfaces:**
- `client/src/components/landing/moments-section.tsx` — the component the mock draws
- `client/src/components/landing/moments-slot.tsx` — the position-2 slot that decides whether this
  component renders at all
- `server/services/landing-moments.ts` — the seven-moment roster (`MOMENTS` array)
- `server/routes/landing.routes.ts:176` — `GET /api/landing/moments`, `roster = MOMENTS.map(...)`

## What the mock ratifies

1. One moment renders at a time (photo slideshow left, eyebrow/headline/numbered-pieces story
   right), with a "Plan this moment" CTA and a "built by @handle · N reviews" byline.
2. A tab strip below shows all seven occasion keys as pills; the active one is highlighted.
3. "All occasions →" link in the section header.
4. The roster is exactly seven keys, and explicitly **none of them is a wedding** — this is the
   mock's own stated point (it is the "before" half of the Before/Main pair).

## Findings

| Mock section | Live file:line | Status | Reason |
|---|---|---|---|
| Photo/story split card, numbered pieces list, "Plan this moment" CTA, byline | `moments-section.tsx:128-227` | MATCH | Structure, copy fields (`eyebrow`/`headline`/`pieces`/`builder`) and CTA all present verbatim. |
| Tab strip of occasion pills, active-state styling | `moments-section.tsx:230-281` | MATCH | Renders `roster` (all seven) as pills; live ones clickable, non-live ones a faint dashed "Coming as locals join" pill. |
| "All occasions →" header link | `moments-section.tsx:120-125` (`SectionHeader` `link` prop) | MATCH | Present, though it targets `/experiences/travel` rather than a literal "all occasions" hub — a reasonable resolution, not a divergence worth flagging. |
| Seven keys, no wedding | `server/services/landing-moments.ts` — `MOMENTS` array, keys `proposal`/`golf`/`girls_trip`/`anniversary`/`honeymoon`/`milestone_birthday`/`family_occasion` | MATCH | Exactly seven keys, exactly the mock's chip set, no `wedding` key — confirms the mock's own "seven keys, none of them a wedding" claim. |
| Anniversary card populated and shown live | `moments-section.tsx:114` (`if (moments.length === 0 \|\| !moment) return null;`) + `server/services/landing-moments.ts` top comment | **DIVERGENCE (operational, not structural)** | The component code that renders this mock's exact layout is correct, but **today's live render is empty**: `resolveLandingMoments` (photo-tier gate, ledger `2026-09-01-photo-tiers`) returns zero moments because every gem photo currently on file is Unsplash stock, not an attributed real photo. So on the actual site right now, this whole section does not render — `MomentsSlot` (`moments-slot.tsx:26`) falls back to `ExperiencesRail` instead. This is documented, intended behavior (§13 empty-state posture), not a bug — see ALREADY-RULED below — but it means the mock's "today" state is aspirational even for the Anniversary card, not only for Main's added Wedding card. |

## Already ruled

- The empty-state suppression is **ruled**: ledger `2026-09-01-landing-moments` / `2026-09-01-photo-tiers` (cited in `landing-moments.ts:1-16`) — "Empty State B": the section renders nothing until ≥1 moment has a real attributed photo, and the position-2 slot (`moments-slot.tsx`) holds `ExperiencesRail` in its place. This is intended §13 honesty (never show a moment whose only imagery is stock), not a defect.
- The seven-key roster (no wedding) is the deliberate baseline this mock exists to document — not itself a divergence, it is the mock's thesis.

## Not built

Nothing in this artboard depicts an unbuilt surface — its entire content already exists in code. The one caveat is the operational empty-state above.
