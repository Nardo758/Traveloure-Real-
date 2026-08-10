# Service Fundamentals — Ratified Decisions (Aug 10, 2026)

**Status:** RATIFIED — the decision-maker delegated the five outstanding decision points of the
service-fundamentals brief ("make the best decision for the outstanding items", Aug 10, 2026 session)
and these are the recorded dispositions. Distinct from `PROVIDER_LOGISTICS_DISTRIBUTION_SPEC.md` §6's
D1–D5 (the Workstation logistics set) — same session lineage, different decision set.

**Framing (the brief's premise, carried forward):** every service a provider creates is analyzed
through three lenses — **client/user logistics** (can the buyer receive what they bought?),
**provider back office** (can the seller configure and operate it?), and **provider marketing**
(can the seller distribute it?). A gap in the client-logistics column is a *fundamental* gap: a sold
service the platform cannot fulfill.

## Dispositions

- **D1 — RATIFIED: the workspace is a fundamentals surface; the map is the in-person instrument.**
  Amends ruling 22(b)'s framing only — the Catalog map view is the instrument for the place-anchored
  lane, not the definition of the workspace. Nothing already shipped moves. Each delivery method gets
  the instrument its fundamentals need (map for in-person/hybrid/property — shipped; delivery for
  artifacts; scheduling for live sessions), built one ratification at a time.

- **D2 — RATIFIED AND LANDED (this commit): method-aware fundamentals replace uniform Listing Health
  scoring.** Advisor-fundamentals pattern (deterministic checks, honest omission with a reason —
  `advisor-fundamentals.service.ts` precedent), read-side only, no schema change. Applicability
  predicates live in **`shared/service-fundamentals.ts`** (one definition, both sides of the wire):
  - `exact_pin` applies only to place-anchored services (`in_person`/`hybrid` delivery, or
    `productShape='property'`).
  - `availability` applies only to services needing calendar slots (place-anchored + live
    `call`/`video` sessions). Note `video` is a LIVE session in this platform's vocabulary (the
    storefront's own label is "Video call") — it schedules; it is not an artifact.
  - `photo` / `description` / `pricing` / `approval` are universal.
  - A row with no `deliveryMethod` and no property shape is unclassifiable → keeps the historical
    all-checks behavior rather than guessing an omission (§13).
  Landed in `provider-listing-health.routes.ts` (per-service `omitted[]`, applicable-only score
  denominator), the hand-synced `demand.routes.ts` mirror, and the Catalog UI (`provider/services.tsx`:
  muted "n/a" note with reason on hover; non-place-anchored cards show a neutral delivery-method chip
  instead of a red "no location" pin chip).

- **D3 — RATIFIED (next build phase): the first fulfillment rail is PDF DELIVERY.** Chosen over call
  join-link and async SLA because it is the sharpest client-logistics gap: a sold artifact with no
  delivery mechanism (`provider_services.serviceFile` is a dead column with zero client references).
  Scope when built: upload UI on the ServiceForm delivery step (owner-gated, allowlist body — §19
  posture), post-purchase delivery surface on the buyer's purchase/booking view (gated on a confirmed
  booking, never public), and a `delivery_asset` fundamentals check that activates ONLY when the rail
  ships — until then the check is not scored, because failing a provider on something the product
  gives them no way to fix is not honest scoring. Call join-link and async SLA follow as the second
  and third rails on the same pattern. NOT started in this commit — it is schema + storage + checkout
  surface work and gets its own phase (publish-trap rules apply: any new column/table declared in
  `shared/schema.ts`).

- **D4 — RATIFIED (small phase, after D3 or parallel): the social closers.** Frame-aware short links
  (one column on the existing link rail), opportunity→frame suggestions, and a publish button inside
  the share kit wired to the existing Content Studio Instagram publishing. Measurement stays on
  Performance (ruling 22(d) — the share rail never grows its own analytics).

- **D5 — RATIFIED AND LANDED (this commit): storefront location chips.** Text-only, city-level chips
  on `/p/:handle` service cards for place-anchored listings (`storefront.routes.ts` now serves
  `city` + `productShape` on the lane-1 select; `storefront.tsx` renders `📍 {city}` beside the
  existing delivery-method chip). Never the meeting point/address pre-purchase; no map tiles on cards.

## Sequencing

D2 + D5 landed together (read-side, zero schema risk). Next: **D3 (PDF delivery rail)** as its own
phase, then D4. The Expert Console is not being forked to build any of this — the provider and expert
consoles already share the load-bearing layers (`provider_services`, the role-aware ServiceForm
wizard, the share-image rail, the availability editor), and what D2 ported from the expert side is the
Advisor fundamentals *pattern* (contract + honesty rules), not copied code: the checks themselves are
provider-shaped and live in the provider lane.
