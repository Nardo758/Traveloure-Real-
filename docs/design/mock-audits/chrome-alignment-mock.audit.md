# Audit brief — Chrome Alignment Variant A (header / Your Trip strip / footer)

**Mock:** `docs/design/chrome-alignment-mock.html` (open in a browser; theme-aware light/dark — note the mock itself is a single-theme reconstruction with no dark-mode block; judge the LIVE chrome's dark mode against `layout.tsx`/`trip-strip.tsx`, not this file)
**Ledger:** `2026-08-28-chrome-alignment`
**Status:** merged code came FIRST (PRs #616 + #617); this mock is a post-merge reconstruction authored 2026-08-29. **Where mock and merged code disagree, the MERGED CODE is authoritative** — do not "fix" the code to match this file. Audit for departures from the ledger row's ratified constraints (below), using the mock only as a visual approximation.
**Live surfaces:**
- `client/src/components/layout.tsx`
- `client/src/components/trip/trip-strip.tsx`
- `client/src/components/ui/traveloure-logo.tsx`
- `client/public/traveloure-logo-mono.svg`
- `playwright/tests/navbar-responsive.spec.ts` (readability-floor assertion, amended 14px→12px by the same PRs)

## Behaviors the mock ratifies

1. Chrome (header, Your Trip strip, footer) sits on `--earn-ground`; **white (`#FFFFFF`) is reserved for cards** — the header and strip must NOT be white, only the dropdown panel and footer (footer is "the white card closing the page").
2. **Coral appears exactly three times in chrome**: the `Sign In` button (desktop + mobile sheet), the strip's `YOUR TRIP` eyebrow, and the `BETA` pill. Dropdown section eyebrows (e.g. "Find Help") are coral TEXT, which per the ledger does NOT count against the coral-button budget — text eyebrows are exempt, only coral BUTTONS are counted.
3. Hairlines (`--earn-border`) do all separation — no shadows-as-separators, no colored dividers.
4. Nav links use **Geist Mono, weight 500, 12.5px, `.05em` letter-spacing**; rest state `--earn-ink`; hover/active state is `--earn-teal-ink` with a **2px-offset underline** (replacing an older coral after-bar treatment — the underline, not a coral color, marks hover/active).
5. Caret glyphs are `--earn-faint`.
6. The logo is a **new SVG mark** (~26px in the header); the footer uses the **mono logo variant** (`traveloure-logo-mono.svg`) with `--earn-muted` fill baked into the asset itself, not applied via CSS.
7. Dropdown panels are white cards with hairline borders, teal-wash icon tiles, and teal-wash row hover.
8. The Your Trip strip is 44px tall, sits on ground, hairline bottom border; chips are mono on `--earn-chip`; the cart chip specifically has a teal border/icon with the dollar amount in `--earn-teal-ink`. The cart chip's **data source is unchanged** (still cart-backed) — this reskin does not touch cart-is-slip semantics.
9. Footer columns use mono uppercase eyebrows in `--earn-muted`, Inter links with teal-underline hover, `--earn-chip` social tiles, and a mono `--earn-faint` legal line.
10. **Reskin-only**: structure, links, dropdown open/close logic, auth states, TripStrip mount/data/handlers, i18n, and every `data-testid`/href/handler are unchanged — this is a pure visual pass, not a behavior or route change.
11. Fraunces appears **nowhere in chrome** (it is reserved for editorial content elsewhere) — chrome typography is Geist Mono + Inter only.
12. Variant B (an alternative header treatment) was **rejected** and is deliberately absent from both the mock and the code — do not look for it or treat its absence as a gap.

## Visual grammar

- Tokens: `--earn-ground`, `--earn-card`, `--earn-border`, `--earn-teal`/`-ink`/`-wash`, `--earn-coral-bg`/`-border`/`-ink`, `--earn-navy`, `--earn-ink`, `--earn-muted`, `--earn-faint`, `--earn-chip`.
- Coral budget: exactly 3 buttons/pills chrome-wide (Sign In, strip eyebrow, BETA pill) — text-only coral eyebrows (e.g. dropdown "Find Help") don't count.
- Type: Geist Mono 500 12.5px `.05em` for nav; Inter for buttons and the trip name; Fraunces absent from chrome entirely.
- Card-on-ground: header (60px) and strip (44px) sit directly on `--earn-ground` with hairline bottoms; only the dropdown panel and the footer are white cards.

## How to audit

```bash
# Coral budget — should be exactly 3 coral-colored interactive elements in chrome
grep -n "earn-coral" client/src/components/layout.tsx client/src/components/trip/trip-strip.tsx

# No stray white background on header/strip (white reserved for cards/footer)
grep -n "earn-card\|#FFFFFF\|bg-white" client/src/components/layout.tsx client/src/components/trip/trip-strip.tsx

# Nav link typography — Geist Mono, 12.5px, .05em, teal-ink underline hover (not coral after-bar)
grep -n "Geist Mono\|font-mono\|tracking-\[.05em\]\|underline-offset" client/src/components/layout.tsx

# Mono logo variant wired into the footer
grep -n "traveloure-logo-mono" client/src/components/layout.tsx
test -f client/public/traveloure-logo-mono.svg && echo "mono logo asset present"

# Reskin-only: no testid/href/handler diff expected — spot-check a known testid survives
grep -n "data-testid=\"link-nav-pricing\"\|data-testid=\"button-sign-in\"" client/src/components/layout.tsx

# Readability-floor amendment (14px -> 12px) landed with these PRs
grep -n "12\|14" playwright/tests/navbar-responsive.spec.ts | head -20
```

Route to open: any page (chrome is global) in both light and dark; resize to check the mobile sheet; open the "Experts & Services" (or similar) dropdown to see the white panel + teal-wash tiles; scroll to the footer to see the mono logo variant and column grammar.

## Known divergences / notes

- This mock is a reconstruction, not the original design source — any pixel-level mismatch (exact spacing, exact hex) between the mock and the merged code is expected and should NOT be reported as a defect. Only report a mismatch against the ledger's stated CONSTRAINTS (coral count, white-reserved-for-cards, hairline separation, the three typography rules, mono logo variant, reskin-only scope).
- Variant B is intentionally absent — do not search for it or treat its absence as missing coverage.
- The mock has no dark-mode CSS block; do not use its (single) palette as a dark-mode oracle — check the live code's dark-mode tokens directly.
