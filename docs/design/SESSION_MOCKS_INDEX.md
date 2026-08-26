# Design mocks — Aug 22–23, 2026 session

The ratified design mocks for the features shipped in the Aug 22–23 lanes, committed here as
self-contained HTML (open any file directly in a browser; each is theme-aware, light/dark). Each
mock is paired with the shipped code that must match it and a one-line verification grep so the
built app can be confirmed against the design.

All features below are merged to `main` (HEAD at authoring: `6509fa2b`).

| Mock | Feature / ledger | Key shipped code |
|------|------------------|------------------|
| `grounded-plan-card-mock.html` | Item 2 — grounded itinerary card (`2026-08-23-item2-affiliate`) | `client/src/components/plancard/AffiliateBookButton.tsx`, `affiliate-booking.ts`, `server/services/slip-grounding.service.ts` |
| `grounded-ai-slips-mock.html` | Item 2 Phase 1 — catalog + DMO grounding (`2026-08-23-item2-phase1`) | `server/services/slip-grounding.service.ts`, `slip-grounding-match.ts`, migrations 255/256 |
| `grounding-affiliates-mock.html` | Item 2 Phase 2 — affiliate rung, §16-safe (`2026-08-23-item2-affiliate`) | `client/src/components/plancard/affiliate-booking.ts`, `server/services/affiliate-grounding.service.ts` |
| `content-history-timeline-mock.html` | Provenance spine Move 3 — admin content history (`2026-08-23-provenance-move3`) | `client/src/components/admin/content-history-dialog.tsx`, `client/src/pages/admin/content-tracking.tsx` |
| `optimizer-catalog-mock.html` | Optimizer catalog: approved-only + destination-scoped | shared optimizer catalog loader (`server/services/itinerary-optimizer*`) |
| `optimized-slip-review-mock.html` | Optimizer results / slip review surface | itinerary-comparison + variant items (`client/src/pages/itinerary-comparison.tsx`) |
| `ready-made-by-theme-mock.html` | Ready-Made trips page centered on theme/experience | `client/src/pages/ready-made*` |
| `storefront-discovery-mock.html` | Storefront reachability round 2 + partner-card rule | storefront routes + `unified-result-card` |
| `concierge-revision-mock.html` | Concierge revision flow (sign-off mock) | concierge entitlement spine + slip card |
| `concierge-revision-p3-mock.html` | Concierge revision P3 — admin dispute + no-self-serve-refund + listing promise | `server/routes` admin dispute path, `ready-made-purchase.service.ts` |
| `adopt-optimization-mock.html` | "Build around a location" + adopt flow (`2026-08-23-optimizer-anchors` / `-pinned-anchor`; 1c shipped · client completion (V3, anchor line, popup) dispatched · server items pending R-A/B/C) | `server/services/anchor-scoring.ts`, `anchor-candidates*.ts`, `server/itinerary-optimizer.ts`, `GET/POST /api/itinerary-comparisons/:id/anchor-candidates` + `/generate` |

## Verifying a mock against the build

Each mock's shipped surface can be confirmed with a grep against the tree. Example (Item 2 card):

```bash
grep -q "Book via your Traveloure agent" client/src/components/plancard/AffiliateBookButton.tsx \
  && ! grep -q "window.open" client/src/components/plancard/AffiliateBookButton.tsx \
  && echo "grounded-plan-card: MATCH"
```

See the session hand-off message / PR description for the full per-mock verification dispatch.

---

## Earn grammar — Marketplace + Experts & Services (2026-08-25 session)

Ratified 2026-08-25 (`audited@f06356f7`). The transcription lanes 1–5 build against this mock; it is
**not yet reflected in merged code** at index time (unlike the Aug 22–23 table above, which is merged).

| Mock | Feature / ledger | Target code (built by lanes 1–5) |
|------|------------------|----------------------------------|
| `marketplace-experts-earn-grammar-mock.html` | Earn-grammar transcription (`2026-08-25-marketplace-earn-grammar` + 14 sibling rulings, SPEC §0); Ready-Made frame: expert-templates shelf superseded 2026-08-26. | `client/src/pages/discover.tsx`, `service-detail.tsx`, `experts.tsx`, `expert-detail.tsx`, `storefront.tsx`, `providers-directory.tsx`, `discover-location.tsx`; `components/travelpulse/CityCard.tsx`; `components/layout.tsx` (`NAV_LEAF_ICONS`) |
| `BENTO_ASSEMBLY.md` | City-feed bento assembly oracle (`2026-08-27-bento-assembly-spec`), including the ordered proof matrix for Mumbai and Kyoto; supersedes prior bento geometry where it differs. | `client/src/pages/discover-location.tsx`, `client/src/components/city-feed-card*.tsx`, `client/src/components/feed/*`, `playwright/tests/discover-tabs.spec.ts` |

- **Spec of record:** `docs/design/MARKETPLACE_EXPERTS_EARN_GRAMMAR_SPEC.md` — the transcription contract (what a lane may and may not change).
- **Visual of record:** `docs/design/marketplace-experts-earn-grammar-mock.html` — what the result must look like.
- Both are read-only through the lanes.
