# OPERATION TRAILHEAD — Kickoff Brief

**Status:** Plan of record, named by Leon. Becomes dispatchable on the Partner Demand lane's close-out merge.

**What it is:** The content-first bootstrap campaign — seed real, bookable content across the eight markets so real travelers plan real trips, generating the organic demand data that every asset built this quarter is waiting to render.

**Why now (the post-R38 fact this brief opens with):** The provenance ruling revealed that most apparent platform demand was seeder residue — Kyoto 27, Lisbon 43, SF 19; the true organic baseline is single digits per market. The one-pager generator idles honestly at NO ARTIFACT. The partner demand surfaces render honest empty states. The demand map waits on grain that doesn't exist. Nothing downstream unlocks until supply exists for demand to form against. Trailhead is therefore the critical path, not an optimization.

## THE LOOP (staged; each stage names what it can and cannot see)

**Stage 1 — Template-driven content seeding (the first push).** Experience-template slots are the content specification: each slot carries a category, market, and often an implied neighborhood — a typed requirement, not editorial guesswork. `KYOTO_CONTENT_PLAN`'s static targets are replaced by slot-derived targets: walk the templates, count requirements per category against `dmo_extracted_places` holdings, deficits become `content_gap_alerts`, discovery queries generate from slot definitions ("Kyoto garden wedding venue"). The existing gated pipeline (Tavily discovery → `dmo_raw_content` → extraction → born-hidden stubs) runs unchanged — only the source of targets changes, and it self-updates with every new template.

**Stage 2 — Source expansion: DMO registry + free tier.** The system was built around tourist boards — expand `dmo_sources` across the eight markets: JNTO/Kyoto City Tourism, VisitScotland, Turismo de Portugal, ProColombia, Incredible India + state boards. Two tiers per market: scrapeable-now (public sites through the existing attributed path) and partnership-later (formal content-partnership outreach — tourist boards WANT distribution; costs an email, buys rights clarity and credibility). Free tier alongside: Wikivoyage/Wikimedia (open license), OSM (already attributed), UNESCO, municipal open-data portals. Content discipline (standing): facts, names, addresses, coordinates, links. Never lifted descriptions or photos from commercial booking sites — the born-hidden-stub pattern already models this; commercial sites add copyright/ToS exposure the heritage sources didn't.

**Stage 3 — The resolution waterfall (re-runnable, the compounding mechanism).** Every stub resolves its booking path, re-checked whenever a new affiliate feed lands:
1. On-platform provider first, always — if a live provider offers it, the stub links to them and never competes (standing ruling; also the provider-recruitment pitch keeping its integrity).
2. Affiliate network second — Travelpayouts today (⚑ the stay-link check: Booking/Agoda/Hostelworld are standard Travelpayouts offerings — verify stay links ride the existing rail; this decides whether Stage 1 ships monetized); Viator/GYG/Klook as those land.
3. External booking link last — with click-out tracking through the short-link rails from link one. Each stub stores resolution class + `resolved_at`. The pass re-runs on new feeds → existing external stubs upgrade to monetized automatically, no re-scrape. Entity resolution starts high-confidence-only (name+geo+category); unmatched stays external — a wrong match books a traveler into the wrong venue, a §13-class error with money attached.

**Stage 4 — Surfacing + the expert funnel.** Scraped content fills templates and discover pages, typed inventory-class `external` from birth — distinct from provider-listed and affiliate — so demand-against-scraped and demand-against-bookable never blur. A slip item pointing at an external stub IS unmet platform demand (nobody on-platform can fulfill it): scraped content doesn't dilute the demand signal, it GENERATES the recruitment number. The expert CTA wins on value, not friction: the direct link is present (credibility demands it); the expert offer is what self-booking can't do — one coordinated booking across vendors, verified availability, changes handled. A template with twelve external booking sites is exactly the juggling act an expert solves; the CTA says that sentence. Attribution from day one: views, slip-adds, click-outs through the short-link rails — the upper funnel is measurable even where outcomes aren't (outbound links are where attribution dies; expert-mediated bookings are the only observable conversions — experts are the observability, not just the margin).

**Stage 5 — Demand steering (the loop maturing).** Once organic slip volume flows, unmet-demand rollup cells join template slots as a second input to gap targets: templates say what a complete experience needs, demand says what travelers actually reach for, the scraper serves both. This is the wiring that was correctly deferred — a flywheel needs the first push before it can steer.

**Stage 6 — Affiliate leverage.** The API pitch to Viator/Booking/GYG is "we sent you N qualified clicks last quarter" — armed by Stage 4's click-out data. Traffic first, then the ask.

## INHERITED DELIVERABLES (named unblocks from the Partner Demand lane)
1. **Property-coverage read** — "what bookable stays exist per market," produced by the waterfall's typed inventory. Unblocks R35 gap pairing on the one-pager (property-led hero ↔ property gap).
2. **Neighborhood demand map** — coords capture + neighborhood-grain cells clearing the public floor. Unblocks: R36 demand circles on the one-pager's context map (in place, no second map), the Market Research demand layer, R25's ratified row-grain activation, R23 category smart-verbs. Four features, one substrate — this is the queue Trailhead drains.
3. **One-pager unlock** — any figure class clears the public 10-floor on post-R38 counts; the monthly regen job checks automatically.

## GOVERNANCE CARRIED FORWARD
§13 throughout (born-hidden until reviewed; honest absence over filler) · R16/R38 predicate on every count · L6 single-computation for any new metric · attribution/inventory-class stamped at write time, never backfilled (the four-times-learned lesson) · scraped-vs-bookable never blends in copy (R35-class discipline) · Tavily spend capped and gated (the D3 pattern: env-flag + key + cost ceiling) · prior-art grep before any new mechanism (the lane's signature discipline — the codebase has known better six times).

## FIRST DISPATCH SLATE (when Leon opens the campaign)
- **T0** (parallel, this week): ⚑ Travelpayouts stay-link check — decides Stage 1's economics.
- **T1** (Phase 0, read-only): template-slot inventory — walk the experience templates, extract the slot→category/market requirements, diff against current `dmo_extracted_places` holdings, produce the derived-targets table that replaces `KYOTO_CONTENT_PLAN`'s statics. HARD STOP: Leon reviews the targets before any scraping expands.
- **T2:** ignition — `DMO_INGEST_ENABLED=1` for Kyoto with the cost cap, slot-derived targets live, extraction quality eyeballed on the first batch.
- **T3:** waterfall v1 — resolution pass + inventory-class typing + click-out rails on external links.
- **T4:** surfacing — templates/discover consume the stubs; expert CTA per Stage 4.

Sequence gates as standing: Phase-0-first, evidence posts, one lane per branch, Leon rules at each HARD STOP.
