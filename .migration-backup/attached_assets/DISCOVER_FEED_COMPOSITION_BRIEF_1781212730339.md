# Traveloure — Discover Feed Composition Brief

**Status:** Implementation brief. Post-landing, off merged main, designated branch. Frontend/composition only — no engine change.

**Why:** the Discover feed today is four systems stacked into separate blocks — lead expert, "wanted" recruitment slots, a segregated "RECOMMENDED FOR YOU" list of raw keys (`aff_guided_tour`…), and organic gem cards. The recommendation block reads like an ad unit, shows raw keys, and doesn't match the feed; the wanted-slots stack heavily at the top. The engine already produces ranked, relevant, real-inventory candidates — the failure is entirely in **how the feed renders and places them.**

**Principle:** injected content should feel like *discoveries*, not ads. Native styling + interleaved placement + honest disclosure. The relevance work is wasted if the rendering quarantines it.

---

## Step 0 — survey & reuse (read-only, do this first)
- **Reuse the Ways to Earn offering presentation.** Survey the WTE offering-card component (`earn.tsx`) and the `/api/offering-types` data shape — display name, tagline, icon, category/tier. The feed recommendation card **reuses this presentation**; do not build a parallel card. (This is also the raw-key fix: a card that renders the WTE display fields cannot show `aff_guided_tour`.)
- **Survey the organic gem card** — its native chrome (image, badges like "Trending," the Add / Ask / Book actions, matched-provider line).
- Report both components + their props so the recommendation card = WTE offering fields rendered inside gem-card chrome.

## The fix — three parts

**1. Native card (visual parity).**
A recommendation renders as the **gem-style feed card**: image (or the offering's category image/icon as fallback), display name + tagline from offering-types, and the feed's traveler CTAs (Add / Ask / Book) — not "I do this," which is the provider-side CTA. No raw keys anywhere: the card requires resolved display fields, and affiliate offerings (from PR #74) must have their name/tagline/image resolved or fall back to a category image.

**2. Interleave, don't segregate (one coherent stream).**
Remove the standalone "RECOMMENDED FOR YOU" block. A single **feed-composition layer** merges all injected elements into the organic stream at an admin-configurable cadence:
- recommendations from the engine: ~1 per 3–4 organic items, placed near contextually-related content where possible (a photographer near photo-spot gems);
- "wanted" recruitment slots: capped and spaced (e.g. ≤1 visible per screen, not 3 stacked at the top), so a traveler isn't met with a wall of "Apply" cards;
- the lead-expert card: once, near the top.
The composition layer governs **all** injected elements, not just recommendations — that's what makes the feed feel like one feed.

**3. Honest label.**
Each injected card carries a small, honest tag — "Recommended" / "Suggested" for engine picks, and a distinct marker for paid affiliate placements. Native styling, but disclosed. Indistinguishable-from-organic is the deceptive version and erodes the exact trust the relevance work builds.

---

## Wiring
- Recommendations are the upsell engine's discover-location candidates (already real-inventory-sourced). The composition layer consumes the **ranked order as-is** and decides *placement* — it must **not re-rank or override** the engine's relevance order. It places; it does not rank.
- Cadence, the wanted-slot cap, and label copy are **admin-configurable rows** (no hardcode), consistent with the rest of the platform.
- Affiliate display fields: resolve name/tagline from offering-types; if an affiliate offering lacks an image, use its category's fallback image.

## Gates
- **Zero raw keys** rendered in the feed (grep the rendered text / DOM for `aff_*` and any `categoryKey`/`tier` string — none).
- Recommendations render with the **native gem-style card** (visual parity verified against an organic card).
- Feed is **one interleaved stream** — no segregated "RECOMMENDED FOR YOU" block; cadence honored; wanted-slots capped/spaced.
- Each injected card carries an **honest label**.
- The recommendation order still matches the **engine's ranked output** (composition places, doesn't re-rank) — verify the engine order is preserved.
- `tsc` baseline unchanged.

## What NOT to do
- Don't build a parallel recommendation card — reuse the WTE offering presentation inside the gem-card chrome.
- Don't render raw keys, ever.
- Don't hide that something is a recommendation — label honestly.
- Don't let the composition layer re-rank or revenue-override the engine's order — it only places.
- Don't over-stuff: respect the cadence; injected content must never dominate organic content.
- Don't use the provider-side "I do this" CTA on traveler feed cards — Add / Ask / Book.
