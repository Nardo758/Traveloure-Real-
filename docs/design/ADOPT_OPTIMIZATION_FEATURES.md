> **Reading rules (binding).** This file is the feature inventory of the mock. It is not a styling authority. Where it conflicts with `ADOPT_OPTIMIZATION_SPEC.md` or a ledger ruling, the spec/ruling wins:
>
> - §2 Design system → superseded by `2026-08-25-marketplace-earn-grammar`. Fonts: Fraunces / Inter / Geist Mono. Tokens: `--earn-*`. Semantic mapping keeps its meaning with earn colours: save/positive → `--earn-green-ink` + wash; caution/costs-more → `--earn-gold-ink` + wash; recommended/brand → `--earn-teal-ink` + wash. No purple, no `--accent-*`.
> - §3.9 adopt tray + per-stop `+` ticks → **PLANNED, not built** (R-A `2026-08-26-per-stop-adopt-deferred`; [DM] decision owed). §3.10 "saved as its own trip" → **superseded**: versions are proposals, not trips (R-B `2026-08-26-variants-are-proposals`). Adopt **applies in place and "gives access"** (R-C `2026-08-26-adopt-applies-in-place`); §4.2 Finalize note reworded. §3.12 "saved-as-new" → superseded by R-B. Whole-plan Apply is the shipped path; do not build the per-stop tick.
> - §4.1 custom location "geocoded … used as you type" → client never geocodes; submits `{type, name}`; server resolves or omits (SPEC §2.3.5).
> - §5 "Candidate data is illustrative" → candidates come only from `GET /api/trips/:id/anchor-candidates` (pre-comparison) or `GET /api/itinerary-comparisons/:id/anchor-candidates` (rerun).
> - §8 testids are targets for new elements; existing production testids are never renamed.
> - This surface is in instrument mode (`2026-08-25-two-modes`, pending ledger): earn tokens and fonts; Fraunces for the page title only; Inter body; Geist Mono for prices, times, medians, slip id; hairline borders; no photos; colour is semantic only (green save / gold caution / teal recommended); coral reserved for the paid Generate action.
>
> The attached dispatch requires Step 1 to land as its own commit. Steps 3–8 are the subsequent client-only review-board parity commit.

# Adopt the Optimization — Feature & Styling Specification

> Companion reference for `docs/design/adopt-optimization-mock.html` (ratified slip‑review board).
> This document captures **every feature and its styling** so the mock can be rebuilt, reviewed,
> or ported to the React app without re‑reading the raw HTML. Title of the artifact: **"Adopt the Optimization."**

---

## 1. Purpose

The screen lets a plan owner **optimize an itinerary and review the result before anything is applied**. The optimizer produces **three complete plans, each rebuilt around one anchor location** (a hotel, a neighborhood, or a keystone activity). The owner can:

- **Adopt a whole version** (its card button), or
- **Pull single stops** across with per‑stop **`+` ticks** into their own plan, or
- **Keep the original** untouched.

Nothing is charged or applied by viewing. Optimization is **a paid, confirm‑gated step**; applying is **one deliberate action** (`apply-to-trip`). Every claim on screen is **derived server‑side and omitted when unknown** (CLAUDE.md §13).

The flow is two steps: **Step 1 — the slip's action row** (where the journey starts) → **Step 2 — review the proposals**.

---

## 2. Design system

### 2.1 Typography (Google Fonts)

| Role | Family | Usage |
|---|---|---|
| Display | **Bricolage Grotesque** (500/600/700, optical) | `h1`, brand, card names, modal titles, legend heading |
| Sans (body) | **Public Sans** (400/500/600 + italic 400) | all body copy, buttons |
| Mono | **IBM Plex Mono** (400/500/600) | prices, times, totals, anchor "median" figures, step tags, slip id |

CSS variables: `--sans`, `--display`, `--mono` (each with system fallbacks). Base body: `15px / 1.5`, antialiased, `text-rendering: optimizeLegibility`.

Headings: `h1` uses `clamp(1.6rem, 1.1rem + 1.9vw, 2.35rem)`, `letter-spacing: -.02em`, `text-wrap: balance`.

### 2.2 Color tokens

Defined on `:root` (light), re‑declared under both `@media (prefers-color-scheme: dark)` (guarded `:root:not([data-theme="light"])`) **and** `:root[data-theme="dark"]` so the toggle wins either direction.

| Token | Light | Dark | Meaning |
|---|---|---|---|
| `--ground` | `#FAFAF8` | `#14140F` | page background |
| `--surface` | `#FFFFFF` | `#1D1D18` | cards, panels |
| `--surface-2` | `#F4F3EF` | `#24241E` | baseline card, insets, code |
| `--ink` | `#1A1A18` | `#EDECE4` | primary text |
| `--muted` | `#7A7A72` | `#9A9A8F` | secondary text |
| `--hairline` | `#E8E8E2` | `#2E2E27` | borders |
| `--hairline-strong` | `#DAD9D1` | `#3A3A31` | stronger borders, dashed baseline |
| `--save-fg / -bg / -br` | `#1E7A52` / `#E7F3EC` / `#C4E4D1` | `#6FD79E` / `#16281F` / `#244A36` | **savings / positive** (money saved, shorter drive, adopt) |
| `--caution-fg / -bg / -br` | `#8A5E12` / `#F6EDD8` / `#E8D6AF` | `#E7B85E` / `#2A2314` / `#4A3D1E` | **"costs more"**, hotel anchor row |
| `--accent-fg / -bg / -br` | `#5B4B8A` / `#EEEAF6` / `#D8CFEE` | `#B7A9E6` / `#221E33` / `#3A3358` | **brand / recommended**, neighborhood anchor, "new" items |
| `--trend-fg` | `#1E7A52` | `#6FD79E` | trending icon |
| `--season-fg` | `#5B4B8A` | `#B7A9E6` | seasonal icon |

**Semantic mapping (load‑bearing):** green = saving/positive, amber = caution/cost‑increase, purple = brand/recommended. These three also encode the **three anchor types** (see §3.8).

### 2.3 Elevation, radii, spacing

- `--shadow`: resting card/panel shadow. `--shadow-lift`: recommended card + modals.
- Radii: cards `14px`, panels/shell `12px`, modals `16px`, buttons `9px`, chips/pills `999px`, code `4px`.
- Container: `.wrap` max‑width `1180px`, padding `28px 22px 72px`.
- Icons are inline SVG (`stroke="currentColor"`), so they recolor with their text token in both themes.

---

## 3. Features (top → bottom)

### 3.1 App shell bar (`.shell`)
Sticky‑feeling top bar: gradient **mark** (accent → `#8879C6`) with a sparkle SVG, **brand** "Traveloure" (display font), a **breadcrumb** `Plans / Kyoto, 5 days / Optimize` (current crumb bolded), a spacer, and the **user chip** (`MK` avatar + "Mika K.").

### 3.2 Page heading
- `.eyebrow` — uppercase, letter‑spaced, accent color: *"Optimization · Review before applying."*
- `h1` — *"Three ways to sharpen your Kyoto plan."*
- `.sub` (max 62ch) — explains each version is a **complete plan rebuilt around one location**, the original stays untouched, and you can adopt whole or pull single stops with `+`.

### 3.3 Step 1 — the slip action row (`.slip-panel`) — **the entry point**
- `.step-tag`: *"Step 1 · On your slip."*
- `.toolbar` of `.tbtn` pills: **Share**, **Preview Trip Card**, **Add all to checkout (3)**, **✨ Optimize this plan** (the highlighted `.tbtn.optimize` — accent bg/border + `box-shadow: 0 0 0 3px var(--accent-br)` glow), **Finalize plan** (`.tbtn.solid`, ink bg), and a **"start here"** pin (`.startpin`, accent) pointing at Optimize.
- `.cap` caption: the **Optimize** button is **owner‑only**, **greyed with a reason** when there's nothing to optimize; tapping it **charges the fee, builds proposals, lands on the review**, and **no longer changes the plan on its own**.

### 3.4 Flow connector (`.flow`)
Centered "Tap **Optimize this plan** → **Step 2 · Review the proposals** — nothing is applied until you choose," with sparkle + arrow SVGs.

### 3.5 Review header (`.review-head`)
- `.slip-line` (mono): *"Slip **TRV‑4821** · 3 proposals for your remaining **6 items**."*
- `.exclusions` (right aligned): *"2 purchased items pinned in all"* (with a pin SVG) and *"1 item excluded (with Kenji, your expert)."* — states what is fixed and what is deliberately out of scope.

### 3.6 Context strip (`.context`) — `data-testid="slip-optimize-preview-context"`
Two rows, each an icon + label + muted value:
- **Trending now in Kyoto** (`data-testid="preview-trending-now"`, trend‑green up‑right SVG) — live destination picks.
- **Popular around your travel dates** (`data-testid="preview-seasonal"`, season‑purple calendar SVG) — date‑scoped seasonal picks.
Each line **disappears when there is nothing real to show** (§13).

### 3.7 The board (`.board`) — 4 columns
Responsive grid: **4 cols** → `2 cols` ≤1000px → `1 col` ≤560px. Column order: **current plan (baseline)** + **3 proposals**.

Each column (`.col`) = a **preview chip strip** (`.chips`) stacked above a **PlanCard** (`.card`).

**Preview chip strip (`.chip`):**
- `.chip.save` (green) — e.g. *"Saves $185 (15% less)"* (`data-testid="proposal-preview-money"`), *"40 min less travel"* (`data-testid="proposal-preview-drivetime"`).
- `.chip.caution` (amber) — e.g. *"Costs $40 more."*
- The **baseline** column shows **no chips** (empty, `aria-hidden`); a proposal **omits** a chip when that metric can't be derived (e.g. *Riverside Focus* shows no travel chip).

**PlanCard (`.card`) anatomy:**
| Part | Class | Notes |
|---|---|---|
| Recommended variant | `.card.recommended` | accent border + `--shadow-lift` |
| Baseline variant | `.card.current` | `--surface-2` bg, **dashed** strong border |
| Header | `.card-head` | tag, name, tagline, anchor row |
| Tag | `.tag.rec` / `.tag.cur` | "Recommended" (accent, star SVG) / "Your current plan" (muted outline) |
| Name / tagline | `.card-name` (display) / `.card-tagline` | e.g. "Calm Mornings" — "Clusters west‑side stops…" |
| **Anchor row** | `.card-base` (+ `.t-hotel`/`.t-nbhd`/`.t-act`) | the base location + **median** minutes (see §3.8) |
| Total | `.card-total` | mono `.amt` (e.g. `$1,055`) + muted `.per` (`· $528/person`) |
| Items | `.items` > `li` | grid `46px 1fr auto` = time · name · price |
| Foot | `.card-foot` | action button(s) + (baseline only) the adopt tray |

**Item row (`li`) details:**
- `.day-sep` — mono uppercase day divider ("Day 1 · from the base").
- `.t` — mono time; `.t.anchor` carries a small pin SVG marking a **pinned/purchased** stop; its price shows `—` (not re‑charged).
- `.n` — stop name; a **newly introduced** stop wraps its name in `.new` (accent) and appends the **`.adopt-tick`** button (`+`).
- `.p` — mono price (`$0`, `$85`, `—`).

### 3.8 Anchor types & color coding (`.card-base`)
The base row states **what the plan is built around** plus a **fit median** (median walk minutes from base to stops). Type sets the color, keeping the semantic palette:

| Type | Class | Color | Example |
|---|---|---|---|
| Hotel | `.t-hotel` | caution/amber | "Hotel · Hotel Kanra · 9 min median · 14/17 stops ≤ 15 min" |
| Neighborhood | `.t-nbhd` | accent/purple | "Neighborhood · Pontocho & Kamogawa · 11 min median · stay anywhere in‑area" |
| Activity | `.t-act` | save/green | "Activity · Built around your Gion tea ceremony · 14 min median · the day pivots on it" |

Sub‑grid: icon + `.ak` (mono uppercase kind) / `.an` (bold name) / `.bm` (mono muted median line).

### 3.9 Card actions
- Proposal: **`.btn.adopt`** — "Select this plan" (green save styling; recommended card gets a resting shadow).
- Baseline: **`.btn.ghost`** — "Keep this plan."
- **Adopt tray** (`.tray`, baseline only, `data-testid="adopt-tray"`): dashed green box — *"Your plan is the landing spot. Stops you pick with **+** land here for one confirm."* + desktop hint *"you can also drag a stop onto this card."*
- **`.adopt-tick`** (`+`) — **PLANNED, not built** (R-A `2026-08-26-per-stop-adopt-deferred`): an 18px round green pill on newly-introduced stops labelled "Pull just this stop into your plan." The shipped review UI is whole-plan Apply only.

### 3.10 Footnote (`.foot-note`, `data-testid="compare-footer"`)
Reiterates: each version works best taken **whole**; **selecting a version applies it in place and gives you access** to it (R-C); versions are **proposals, not separate trips** (R-B — supersedes "saved as its own trip"); **nothing purchased by applying**. Per-stop `+` ticks are **planned** (R-A).

### 3.11 Honesty legend (`.legend`) — §13 in the UI
Heading *"How the preview stays honest"* + a 6‑cell grid, each with a colored `.dot` (save/caution/accent/omit) and a short rule:
1. **Money saved** — baseline vs proposal total; shown only with a real positive baseline.
2. **Costs more, said plainly** — a pricier proposal shows "Costs $40 more" beside its time saving.
3. **Shorter drive time** — sum of located transport‑leg minutes; **time only — distance is never a headline** (§21 L3).
4. **Omitted when unknown** — a stop not located ⇒ no drive‑time chip; baseline shows no chips.
5. **Trending & in season** — live signals; each line disappears when empty.
6. **You confirm — nothing auto‑applies** — one deliberate click via `apply-to-trip`; original preserved, nothing charged.

### 3.12 Mock note (`.mock-note`)
Italic caption summarizing the ratified scope: slip‑review board **kept intact**, extended with anchor‑built versions (hotel/neighborhood/activity), full‑plan reading, keep‑original + saved‑as‑new, per‑stop + adopt ticks, and the Optimize + Finalize popups.

---

## 4. Modals

### 4.1 Optimize — "Build around a location" (live popup)
Rendered twice: a **static snapshot** in the `.modal-showcase` and the **live popup** (`.scrim` → `.modal.pop`, `data-testid="optimize-modal"`). Opened by the `.tbtn.optimize` button; dismissed by ✕, Cancel, backdrop click, or **Escape**. Enters with a `pop` keyframe (respecting `prefers-reduced-motion`).

Contents:
- Title "Build around a location" + sub explaining **Auto** vs **pin your own**.
- **`.opt-row` (Auto — recommended)** — accent panel, sparkle icon: *"The AI scores hotels, neighborhoods & activities against your stops and picks the 3 strongest anchors."*
- Divider "or pin your own anchor" (`.opt-or`).
- **`.opt-grid.three`** of `.opt-pin` type tiles: **Hotel** / **Neighborhood** / **Activity** (each icon + label + `em` hint). Selected tile gets `.on` (accent).
- **`.as-label-inline`** + `.as-list.scrollable` (`data-testid="anchor-list"`, max‑height 216px) of `.as-opt` candidates. Each candidate: `.as-radio`, `.as-main` (`b` name + `em` "4.7★ · Shimogyo"), `.fit` median (`.fit.good` green; `.rec` "best fit" pill), and an `.as-tick` check shown when selected.
- **Custom location** (`.as-custom`, `data-testid="anchor-custom"`): pin SVG + free‑text field accepting *"an address, place name, or 35.0036, 135.7752 — used as you type."*
- **`.as-hint`**: *"'Fit' = median walk from that base to your stops, scored live (§14). A custom location is geocoded and scored the same way — if we can't place it, we say so rather than guess (§13)."*
- Footer: **Cancel** (`.btn.ghost`) + **Generate 3 versions around <anchor>** (`.btn.primary`, `data-testid="button-generate"` — its label updates with the chosen anchor).
- `.modal-note`: *"Optimization is a paid step — you confirm here before anything runs or is charged."*

### 4.2 Finalize — "You're set — how do you want to book it?" (`data-testid="finalize-modal"`)
- **Book it myself** (`.opt-row.on`, `data-testid="finalize-self"`, green DIY icon) — book each stop in‑platform at your own pace; nothing handed off.
- Divider "or have someone book it for you."
- `.opt-grid.three`: **Booking agent** (`finalize-booking-agent`, "Books it as‑is"), **Travel expert** (`finalize-expert`, "Refines, then books"), **Concierge** (`finalize-concierge`, "Handles end‑to‑end").
- Footer: **Back** + **Continue** (`data-testid="button-finalize-confirm"`).
- `.modal-note`: choosing a person **hands them a copy** — the plan is never edited out from under the owner, and nothing is charged until a booking is confirmed.

### 4.3 Modal styling (`.modal`)
`--surface` bg, `16px` radius, `--shadow-lift`, max‑width 440px (live popup 460px). `.modal-head` (display‑font `h3` + ✕), `.modal-sub` muted. `.modal-demo` wrappers use a dashed border + 45° hatch background to read as "preview surface." `.opt-grid.three` collapses to 1 column ≤460px.

---

## 5. Interactive behavior (vanilla JS)

Two IIFEs power the live popup:

1. **Anchor picker** — a `DATA` map of `hotel` / `neighborhood` / `activity`, each `{label, items:[{n,s,f,good,best}]}`. Clicking a type tile calls `selectType()`:
   - **Auto** hides the list/label/custom and clears the chosen anchor.
   - A type **renders its candidate list** (`renderList`), auto‑selects the first, wires radio selection, and updates the Generate button label to *"Generate 3 versions around <name>."*
   - Candidate data is illustrative (Kyoto hotels, neighborhoods, and **every stop on the plan** for Activity — which is why the list scrolls).
2. **Scrim controller** — opens on `.tbtn.optimize` click; closes on ✕ / Cancel / Generate / backdrop / Escape.

> These are mock interactions. In the app the candidate lists, medians, and geocoding come from the server (§14); the mock only demonstrates the UX.

---

## 6. Governance baked into the UI

| Rule | Where it shows |
|---|---|
| **§13 honest‑or‑omit** | chips/context lines omitted when no real baseline; "if we can't place it, we say so" |
| **§14 server‑derived** | "fit" median scored live against the plan; amounts from the optimizer, never the client |
| **§21 L3** | drive‑time is **time only** — distance is never a headline claim |
| **Paid, confirm‑gated** | Optimize charges on tap; modal note "you confirm before anything runs or is charged" |
| **Apply is deliberate** | one click via `apply-to-trip`; original preserved; nothing purchased by applying |
| **Owner‑only** | Optimize button is owner‑only, greyed with a reason when nothing to optimize |

---

## 7. Responsive & accessibility

- Breakpoints: board `4→2→1` (1000px / 560px); `.opt-grid.three` and `.modal-showcase` collapse to 1 column (460px / 900px).
- Focus: `.btn:focus-visible` shows a 2px accent outline (offset 2px).
- Motion: modal `pop` animation gated behind `prefers-reduced-motion: no-preference`.
- Semantics: modals use `role="dialog"` (+ `aria-modal` on the live popup); decorative SVGs/empty chip strips are `aria-hidden`; inputs carry `aria-label`.
- Icons are stroke‑based inline SVG, recoloring per theme token — legible on both grounds.

---

## 8. Key `data-testid` hooks (for build parity / e2e)

`slip-optimize-preview-context`, `preview-trending-now`, `preview-seasonal`, `proposal-column-baseline`, `proposal-column-v1..v3`, `proposal-preview-money`, `proposal-preview-drivetime`, `adopt-tray`, `compare-footer`, `optimize-scrim`, `optimize-modal`, `opt-auto`, `opt-hotel`, `opt-neighborhood`, `opt-activity`, `anchor-list`, `as-candidate-1..6`, `anchor-custom`, `button-generate`, `finalize-modal`, `finalize-self`, `finalize-booking-agent`, `finalize-expert`, `finalize-concierge`, `button-finalize-confirm`.

---

*Source: `docs/design/adopt-optimization-mock.html`. Palette, type, and copy above are transcribed verbatim from that file; treat the HTML as the source of truth if the two ever diverge.*