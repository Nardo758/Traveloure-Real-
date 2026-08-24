# LocationView Wireframe — single-page city marketplace

**Purpose:** replaces CityDetailView's 7 tabs with ONE scrolling page (Decision #5 = Replace).
**Corrected mapping:** AI Insights and Media are their **own sections**, NOT folded into the hero — audit found 9 distinct AI subcards + ~180 lines of media UI. Folding them loses content.
**One template, parameterized by city.** Paris, Kyoto, etc. render identically from their own data.
**Tested against:** Kyoto (has real Phase-1b neighborhood data).

---

## Layout, top to bottom

```
┌──────────────────────────────────────────────┐
│ 1. HERO                          [Overview +   │
│    city · pulse · "happening now" strip        │
│    supply summary ("142 services · 18 experts")│   Happening Now strip]
│    destination photo                           │
├──────────────────────────────────────────────┤
│ 2. EXPLORE SPINE                        [new]  │
│    chips: Neighborhoods·Attractions·Eat·Do·    │
│    Stay·Experts                                │
├──────────────────────────────────────────────┤
│ 3. BY-NEIGHBORHOOD            [new·needs 1b]   │
│    neighborhood ecosystem cards                │
├──────────────────────────────────────────────┤
│ 4. GEMS BY CATEGORY          [Hidden Gems]     │
│    split-row cards (info left, action right)   │
├──────────────────────────────────────────────┤
│ 5. SUPPLY (woven)            [Recommendations] │
│    hotels · experiences · experts · marquee    │
├──────────────────────────────────────────────┤
│ 6. LIVE FEED                 [Live Activity]   │
├──────────────────────────────────────────────┤
│ 7. MEDIA GALLERY             [Media · RICH]    │
├──────────────────────────────────────────────┤
│ 8. INSIGHTS                  [AI Insights·RICH]│
├──────────────────────────────────────────────┤
│ FOOTER → "What's on this week"  [Events→bydate]│
└──────────────────────────────────────────────┘
```

## Section detail (block → contents → which old tab it absorbs)

1. **HERO** — city name, pulse score, "happening now" ticker, supply summary (`{N} services · {M} experts`), destination photo. *Absorbs: Overview + Happening Now (as a strip).* **Do NOT put AI Insights here — see §8.**
2. **EXPLORE SPINE** — filter/nav chips: Neighborhoods · Attractions · Eat · Do · Stay · Experts. *New.*
3. **BY-NEIGHBORHOOD** — neighborhood ecosystem cards (e.g. Le Marais): photo, content/why signal, woven counts ("5 things to do · 3 bookable", "8 eat · 2 reservable", "2 stays from €X", "an expert knows it"), and an **"Add a {neighborhood} day"** action. *New.* **Data dep:** renders from neighborhood rollups; sparse markets show fewer/empty — degrade gracefully, never show empty placeholders.
4. **GEMS BY CATEGORY** — split-row cards, **responsive: split-row ≥768px, stacked <768px** (the existing mobile card). LEFT = photo + name + type + 1-line desc + why-signal. RIGHT = **Book** (if bookable) / **Add to experience** (always) / **Find a local expert** (if nothing bookable). *Absorbs: Hidden Gems.*
5. **SUPPLY (woven)** — hotels (Stay), experiences (Do), experts (Plan with a local), marquee/featured. Blended native + network, **native-first**; featured respects the trust guardrail (never bury a better native result). Each item: **Book / Add to experience.** *Absorbs: Recommendations.*
6. **LIVE FEED** — real-time strip ("3 people viewing · booked 2h ago"). *Absorbs: Live Activity.*
7. **MEDIA GALLERY** — photos & video grid. **Carry over the full existing Media UI (~180 lines). Own section — do NOT crush into hero.** *Absorbs: Media.*
8. **INSIGHTS** — AI insight subcards. **Carry over ALL 9 subcards. Own section — do NOT fold into hero.** *Absorbs: AI Insights.*
9. **FOOTER HANDOFF** — "What's on in {city} this week →" link to the by-date (Events) view. *Absorbs: Events.*

## Global rules
- **Every gem/supply item is actionable** (Book / Add to experience / Find a local expert). No info-only blocks anywhere.
- **Contained max-width column** (~900–1000px, centered) — never full-bleed (fixes horizontal stretch).
- **Don't duplicate descriptions; never show empty metrics** ("0 mentions").
- **CityDetailView is replaced, not deleted (yet):** redirect `/city/:slug` to this view; retire CityDetailView code only after content-parity is confirmed (all 7 old tabs' content present in §1–§9).
