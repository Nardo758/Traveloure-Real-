# Audit brief — What the Optimizer Sees

**Mock:** `docs/design/optimizer-catalog-mock.html` (open in a browser; theme-aware light/dark)
**Ledger:** `2026-08-22-optimizer-catalog-honesty` (primary fix), `2026-08-22-booking-price-provenance` (money-price fix), `2026-08-23-optimizer-three-variants` (variant-count ratification + first-run closure)
**Status:** merged Aug 22–23 set — code shipped against this mock; ruling text > merged code > mock pixels on any disagreement. Note: this mock is itself framed as an **audit document** (a findings report, not a UI screen) — its §09 "Findings that need a decision" section is the load-bearing part; treat it as a claim list to re-verify, not as static reference copy.
**Live surfaces:**
- `server/services/optimizer-baseline.service.ts` — `loadOptimizerCatalog()` (exists, confirmed: filters `status='active'` AND `approvalStatus='approved'`, plus destination `ILIKE` scoping when a destination is present; unscoped active+approved when destination is null; zero matches on a market ⇒ empty result, no fallback to another city)
- `server/itinerary-optimizer.ts` (exists; contains `selectThirdVariantStrategy` at line ~469 and `aiResponse.variants.slice(0, 3)` at line ~1397)
- `server/routes.ts` — both optimizer entry points (`~8680`, `~9029`) call `loadOptimizerCatalog`
- `server/services/booking.service.ts` — re-derive-from-catalog-or-refuse price logic present (references `provider_service_id` / `provider_services.price`)

## Behaviors the mock ratifies

Findings marked "Defect"/"Gap" in §09 of the mock are PRE-fix descriptions of bugs found in the Aug 22 audit — the ledger closes them. Audit the CURRENT code against the ledger's fix, not against the finding's bug description.

1. **(Closed by `optimizer-catalog-honesty`)** The optimizer's catalog pull must filter on BOTH `status='active'` AND `approval_status='approved'` — not active-only. This applies at both optimizer entry points in `routes.ts` and to the upsell query.
2. **(Closed)** The catalog pull is destination-scoped: `location ILIKE %city%` (or the full destination string) when a destination is known; zero city matches ⇒ the AI is offered NO catalog rows (may only propose free-text activities, `providerServiceId` NULL) — never another city's inventory as a fallback (§13).
3. **(Closed)** A null/absent destination gets the unscoped active+approved set — never an invented city.
4. **(Closed)** Variant items get REAL coordinates: baseline items carry the item's own pin or the linked catalog row's coordinates; AI variant items copy the validated `providerServiceId`'s catalog coordinates; an AI-invented item with no catalog row stays NULL/NULL (coordinates are never geocoded from a guess). This unblocks real (non-LLM-guessed) transport-leg/drive-time calculations.
5. **(Closed by `booking-price-provenance`)** A booking price is never trusted from the LLM's own JSON. `booking.service.ts`'s fallback re-derives `finalPrice` from `provider_services.price` for a LINKED variant item; an UNLINKED item (pure AI invention) is REFUSED with an honest error rather than booked at a model-authored price. The `itinerary_items.estimated_cost` branch (ordinary trip-item booking) is explicitly OUT of scope for this fix — do not expect it changed.
6. **(Ratified by `optimizer-three-variants`)** The optimizer persists EXACTLY THREE AI variants (plus the traveler's plan as baseline) — not two, not an unbounded model-returned count. `selectVariantStrategy` returns two preference-driven primaries; `selectThirdVariantStrategy` appends a genuinely-distinct third from a standing pool; `aiResponse.variants` is capped to the first three before the persist loop; the prompt asks for exactly 3.
7. **(Closed/ratified)** First-run optimizations ARE personalized: the create path now passes first-run trip preferences and loads the traveler profile on every run — this is CONFIRMED intended behavior, not a remaining gap. (The mock's own §09 marks this "Resolved" with strikethrough on the old finding text.)
8. Money boundary: the optimizer imports no fee logic and makes no charge decisions — fee resolution/enforcement happens entirely before any AI call (pre-existing, unchanged posture; not itself a fix from this session but a structural invariant the mock documents).
9. Grok-3 first with Claude Sonnet 4.5 fallback; only the Anthropic fallback path writes `ai_cost_tracking` — Grok runs are not cost-tracked (documented as a known note, not something this session's ledger fixed — do not report as a new defect).

## Visual grammar

This mock is a text/table-heavy audit report, not a product UI mock — its visual grammar is secondary to its content claims. Notable conventions if relaying visually:
- Provenance/severity pills: `--good` (fix confirmed/real data), `--warn` (open gap/LLM-sourced), `--crit` (defect), `--blind` (invisible to the AI), `--llm` (model-authored data) — a consistent "data provenance" color vocabulary distinct from, but conceptually parallel to, the grounded-plan-card provenance-pill system.
- Findings use a left-border-colored `.finding` card (crit=red, warn=amber, note=accent) — a severity-coded callout pattern.
- Bricolage Grotesque display type + Public Sans body + IBM Plex Mono for code/citations — a different type pairing from the other Aug 22–23 mocks (those use Fraunces/Instrument Sans/JetBrains Mono), consistent with this being an internal audit artifact rather than a customer-facing design mock.

## How to audit

1. Confirm the approved+active+destination filter (already spot-checked; auditor should re-confirm on a fresh read):
   `grep -n "approvalStatus.*approved\|status.*active" server/services/optimizer-baseline.service.ts`
2. Confirm both optimizer entry points call the shared loader (no re-implemented inline query):
   `grep -n "loadOptimizerCatalog" server/routes.ts` — expect exactly the two call sites the ledger names (`~8680`, `~9029`), not a third ad hoc query.
3. Confirm the upsell query also gained the approved filter:
   search `routes.ts` for the upsell services query and confirm it filters `approvalStatus='approved'` alongside `status='active'`.
4. Confirm three-variant capping:
   `grep -n "slice(0, 3)\|selectThirdVariantStrategy" server/itinerary-optimizer.ts`
5. Confirm the booking-price refuse-or-rederive path:
   `grep -n "provider_service_id\|finalPrice\|refuse\|throw" server/services/booking.service.ts` — confirm an unlinked AI-invented item is refused, not booked at the stored LLM price.
6. Confirm coordinate provenance on variant items (existence check only): search `itinerary-optimizer.ts` / `optimizer-baseline.service.ts` for where variant-item lat/lng is populated and confirm it traces to either the item's own pin or the linked catalog row — not a geocode-from-name call.
7. In the running app: run an optimization for a trip in a market with sparse/no approved catalog inventory and confirm the AI proposes only free-text activities (no cross-city services surfacing), and that exactly 3 AI variants + baseline appear on the review page.

## Known divergences / notes

- This mock predates and documents its OWN corrections in-place (§09 "Resolved" finding is struck through with the ratified text appended) — this is intentional self-updating, not a stale artifact. Auditors should read §09 as already reconciled with the ledger for the "first runs ignore preferences" item.
- Per `2026-08-23-optimizer-three-variants`, this mock's own earlier text said "exactly two" variants and was corrected to "three" — the CURRENT file content already reads "exactly three AI variants," so no further correction is needed here; just confirm code matches "three," not "two."
- The AI-price money-provenance fix only covers the `itinerary_variant_items.price` fallback path — the ledger explicitly did NOT touch the separate `itinerary_items.estimated_cost` branch. Do not flag that branch as a divergence.
