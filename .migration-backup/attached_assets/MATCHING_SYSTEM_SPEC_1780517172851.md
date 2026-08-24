# Traveloure — Matching System Spec

**What it is:** the engine that links **canonical content** (gems, locations, neighborhoods, trends) to **both supply types** — service providers *and* experts — so the three converge around the same place. It is the bridge between the two backbones (location intelligence + content/supply).
**Status:** expert-scoring and provider-scoring exist; **content-driven matching is new** (this spec).

---

## 1. Two jobs

### Job A — Entity matching (link supply to a place)
Resolve which provider service / expert content belongs to which gem or location.
- A provider's "Arashiyama photography" service → linked to the Arashiyama neighborhood + nearby photo-spot gems.
- An expert's curated "Kyoto food" itinerary → linked to the relevant restaurant/neighborhood gems.
- Match keys: **geo/neighborhood**, **service category ↔ gem type**, **destination/name**.
- Output: every gem/location knows its related provider services + expert content.

### Job B — Relevance matching (rank what to surface)
For a given gem, decide *which* supply to pull in and rank it.
- **Match-rule** (gem type/trend → relevant supply): the table below.
- Delegate scoring to the existing engines:
  - **Providers** → `provider-matching.service` (proximity, availability, rating).
  - **Experts** → `lead-routing.service` scoring (destination 40 / specialty 25 / availability 20 / response 15).
- Rank by **relevance + quality**, with the **trust guardrail**: monetization/featured is a *tiebreaker*, never an override of a better-relevance match.

---

## 2. The match-rule (gem → supply, both sides)

| Gem / content | Provider categories | Expert specialty |
|---|---|---|
| Photo spot | Photography & Videography | — |
| Hotel / lodging | Transportation (transfer/car) | — |
| Attraction | Tours & Experiences (guide), tickets | cultural |
| Restaurant | reservation (OpenTable), Food & Culinary | foodie |
| Neighborhood | — (its nested gems carry matches) | local expert covering that area |
| Wedding / proposal / venue | Floral · Music & Performance · Food & Culinary · Photography | event/specialty |
| Wellness place | Health & Wellness · Beauty & Styling | — |
| Trip-level (any) | logistics complements (eSIM, insurance, transfer) | **itinerary-planning expert** |

*Every gem also resolves a relevant expert for "Ask an expert" / "Plan with" — even when no provider matches.*

---

## 3. Flow
```
content item (gem/location + type, category, geo, neighborhood, trend, season)
        │
   MATCH RESOLVER (match-rule §2 → relevant provider categories + expert specialties)
        ├──► provider-matching.service   → ranked provider matches (proximity, availability, rating)
        └──► lead-routing scoring         → ranked expert matches (destination, specialty, ...)
        │
   RANK (relevance + quality; trust guardrail: featured = tiebreaker, native-first; affiliate fill)
        │
   OUTPUT: { gem, matchedProviders[], matchedExperts[] }
```

## 4. Consumers (what the matches power)
- **Feed matched services** — photo spot → photographer, hotel → car ("Book both").
- **Complements** — content-driven trip-level services (cherry blossom → kimono rental).
- **"Ask an expert" / "Plan with"** — the matched expert; tapping creates an `expert_request` → the lead pipeline (admin-confirm → workspace).
- **Recommendations** — the demand-signal feed surfaces matched gems+supply.
- **Trending matches** — surface the matched supply on whatever the intelligence flags trending.

## 5. Unify the scattered matchers (centralization)
This system should *be* the single matching layer. Today the pieces are scattered: `lead-routing` (experts), `provider-matching` (providers, booking-driven), `service-recommendation-engine` + `ai-recommendation-engine` (two engines). Fold them under one matching system: one match-rule config, the two scorers as backends, the recommendation engines reconciled to consume it. (See `CENTRALIZATION_AUDIT.md`.)

## 6. Trust & quality (non-negotiable)
- Matches must be **genuinely relevant** (a car that serves that hotel, a photographer who shoots that spot, an expert who actually covers that topic/place).
- Rank on **relevance + quality first**; featured/monetization breaks ties only.
- Sparse markets: degrade gracefully — no match → still offer Add + Ask-an-expert (never a dead end); affiliate fill backstops providers.

## 7. Data the system needs (confirm these exist)
- **Content/gems:** `type`, `category`, lat/lng or `neighborhood`, `trend`/season tags.
- **Provider services:** `category`, location (geo or `neighborhood`), availability/rating, `is_featured`.
- **Expert:** `destinations`, `specialties`, availability, response rate (lead-routing already reads these).
- **Link tables:** gem ↔ provider-service, gem ↔ expert-content (Job A output) — likely new.

If the content/gem records lack `type`/`neighborhood`/`category` and the link tables don't exist, Job A (entity matching) is the prerequisite build before Job B can rank anything.

---

*The matching engine is the connective tissue of the three-party marketplace: it's where canonical content, provider supply, and expert advisory converge around a place. Build = the content-driven resolver + entity links; reuse = the two existing scorers.*
