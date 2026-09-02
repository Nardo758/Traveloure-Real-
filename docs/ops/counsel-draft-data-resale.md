# Data-Resale Language — Counsel Draft

**Status:** DRAFT for counsel review — **not legal advice.** These are starting-point clauses for your
attorney to react to, edit, and localize. Bracketed `[…]` text marks a decision or fact counsel must set.
Traveloure LLC (Florida); launch markets: Japan (Kyoto), UK (Edinburgh), Portugal (Porto), Colombia
(Bogotá, Cartagena), India (Mumbai, Goa, Jaipur).

**Why this exists:** The platform already *builds and stores* the data infrastructure (Business Plan
v2.1 §8, §5.5) but treats the **data-licensing revenue line as $0 until counsel clears the terms**
(§8.5). The two gates counsel must open are (1) data-resale language in the **traveler terms** and the
**provider agreement**, and (2) verification that the **X (Twitter) API terms** permit licensing any
X-derived signal. This draft addresses gate (1).

**Where the live terms stand today:** `client/src/pages/terms.tsx` carries a user-content license
(§11.2) and `client/src/pages/privacy.tsx` states "We never sell your personal information to third
parties" and lists a CCPA opt-out with the note that no sale occurs. Neither document mentions
aggregated or de-identified data. The clauses below are additions; the privacy statement must stay
true after they land (aggregated, de-identified data is not personal information — counsel confirms).

---

## What the code already guarantees (verified against `main` @ `596f1e4`, 2026-09-02)

These are the facts the clauses may promise honestly. Each is tied to the file that enforces it so
counsel's promise and the product's behavior cannot drift apart silently.

- **Raw X (Twitter) content is never persisted — derived signals only.** The X adapter writes
  `raw_ref = NULL` on every row (`server/services/trend-engine/adapters/x-api.adapter.ts`, "R9: X
  Content never stored — derived aggregates only"). A DB CHECK (`chk_x_api_raw_ref_null`, migration
  236) backs it as defense-in-depth. **Nuance counsel should hear:** the CHECK is scoped to `x_api`
  rows only, and it is deliberately *not* declared in `shared/schema.ts` (deploy-push safety), so the
  adapter code is the primary guarantee and the CHECK is the second layer — do not describe the DB
  constraint as the sole guard.
- **Every trend signal carries a `resale_class` from creation.** `trend_signals.resale_class` and
  `trend_source_config.resale_class` are `NOT NULL` with **no default** — each source declares
  `first_party | licensed_no_resale | open_license` explicitly (`shared/schema.ts`, migration 232).
  Licensable data is separable from non-licensable data at the row level.
- **X-derived signals are already classed `licensed_no_resale`**, as are BestTime and PredictHQ
  (migration 232 seed; each adapter's `RESALE_CLASS` constant). First-party trip signals are
  `first_party`; Wikimedia, GDELT, Nager.Date and Open-Meteo are `open_license`. So the product-side
  exclusion that §3.1 below asks for is already the declared state of the source table. **What does
  not exist yet:** any licensed-output rail that *reads* `resale_class` — today only the adapters
  (writers) touch the column, which is consistent with the $0 revenue line.
- **Suppression floors are enforced at read time, keyed to the AUDIENCE, with three tiers**
  (`server/config/demand-floors.config.ts`, `DEMAND_FLOORS`; ledger rulings R27/R29):

  | Audience | Floor (underlying records) | Meaning |
  |---|---|---|
  | own_book | 5 (3 for raw counts, labeled "early signal") | a partner viewing their own declared market |
  | cross_partner | 10 | a figure shown to someone other than its subject (admin, partner one-pagers) |
  | **sold** | **25** | **data licensed to a third party** |

  A row below its floor renders `no_data` — never interpolated, never estimated. **The number the
  ToS should reference for licensed data is the `sold` tier, 25, not 10.** Ten is the partner-facing
  tier. Promising 10 in the terms would be *kept* (25 > 10) but would understate the product's own
  guarantee; counsel decides whether to state 25 or "a threshold we reasonably determine, not less
  than [25]".
- **Demand rollups use a STRICT count** — real traveler accounts only; seeded test accounts and
  expert-authored "authoring" trips are excluded by one shared predicate
  (`server/services/demand-test-exclusion.ts`, R16), so a licensed figure never counts platform
  scaffolding as demand.
- **Intended licensed outputs are aggregated** — demand-gap, lead-time/conversion, and
  trend-to-outcome datasets (Business Plan v2.1 §8.5) — not row-level personal data. Whether any
  given market or segment clears the `sold` floor is a live fact of the data, not something the terms
  should assert either way.

---

## 1. Traveler Terms of Service — "Aggregated & De-Identified Data" clause

> **[N]. Aggregated and De-Identified Data.**
> When you plan, book, or otherwise use the Traveloure platform, we collect information about that
> activity as described in our Privacy Policy. In addition to operating the Service, we may create
> **aggregated and de-identified data** derived from your and other users' activity — for example,
> statistics about what travelers to a destination are searching for, how far ahead they plan, which
> requests could not be fulfilled, and how demand relates to price and season.
>
> "**Aggregated and de-identified data**" means data that (a) has been combined with data from a
> sufficient number of other users that it does not identify you and cannot reasonably be used to
> identify you, and (b) has had direct and indirect identifiers removed in accordance with
> [applicable de-identification standard — e.g., GDPR "anonymisation," CCPA "deidentified," and
> equivalent local standards]. We commit that no such dataset is created, shared, or licensed where
> it describes fewer than **[twenty-five]** underlying records for a given market and segment.
>
> You agree that we own all aggregated and de-identified data, and that we may **use, reproduce, and
> license it to third parties** (including destination marketing organizations, hospitality operators,
> and travel partners) for any lawful purpose, including market research and demand analytics. We
> will not sell or license data that identifies you, and we will not re-identify aggregated and
> de-identified data or permit others to do so by contract.
>
> This Section survives termination of your account and these Terms.

**Counsel decision points**
- **De-identification standard to cite** — GDPR (Edinburgh, Porto) and India's DPDP Act, Japan's
  APPI, and Colombia's Law 1581 each define "anonymous"/"de-identified" differently. Counsel should
  decide whether to cite one global standard or localize per market. The `sold` floor of 25 is a
  *product-enforced* fact today; counsel decides whether to state the number in the ToS or reference
  "a threshold we reasonably determine."
- **Consent vs. legitimate-interest basis** — under GDPR/APPI/DPDP, decide whether aggregation for
  licensing rests on consent (checkbox at signup) or legitimate interest, and whether a separate
  opt-out is required. The Privacy Policy, not this clause, likely carries the lawful-basis language.
- **"Sell/share" definitions (CCPA/CPRA)** — confirm that licensing *aggregated, de-identified* data
  is outside the CCPA "sale"/"share" definitions (it generally is, if de-identification is genuine),
  so the existing "we never sell your personal information" statement and its opt-out note remain
  accurate. If any licensed dataset is *pseudonymous* rather than anonymous, this changes.

---

## 2. Provider & Expert Agreement — "Platform Data and Market Insights" clause

> **[N]. Platform Data and Market Insights.**
> Traveloure records activity relating to your listings, availability, pricing, and completed
> bookings as part of operating the Service. You acknowledge and agree that Traveloure may use this
> activity to create **aggregated and de-identified market insights** — for example, unmet-demand
> estimates, booking lead-time and conversion curves, and demand-trend data for a destination or
> service category — and that Traveloure owns and may **license these aggregated insights to third
> parties**.
>
> Traveloure will not license any dataset that identifies you, your business, your individual
> customers, or your specific prices or earnings, and will not create or share any such insight where
> it describes fewer than **[twenty-five]** underlying providers or records for a given market and
> segment. Nothing in this Section grants Traveloure the right to license your **proprietary
> content** (your listing text, photos, and gem contributions) except as needed to operate and
> promote the Service under Section [content-license section — today §11.2 "User Content License"].
>
> Your own confidential business information remains yours. This Section survives termination of
> this Agreement.

**Counsel decision points**
- **Provider-identifying threshold** — providers are far fewer than travelers per market (Kyoto
  launches with ~25 providers and ~19 experts per Business Plan v2.1). The `sold` floor of 25
  protects traveler identity well, but an "aggregate" over a market's entire expert roster can still
  be re-identifying. Counsel should consider a **higher or category-only threshold on the supply
  side**, or restrict supply-side aggregates to demand signals (what travelers wanted) rather than
  provider-performance signals.
- **Interaction with the content license** — this clause deliberately excludes provider proprietary
  content (listings, photos, gems) from the data-license grant; confirm it doesn't conflict with the
  existing user-content license (`terms.tsx` §11.2) or the gem-attribution byline that travels with
  content (`attachGemAttribution`, `server/services/location-view.service.ts`), nor with the
  separate expert-content consent ask in `docs/ops/counsel-ask-expert-content.md`.
- **Beta cohort** — founding providers were recruited before this clause existed. Counsel should
  decide whether to (a) roll it into the next agreement version with notice, or (b) obtain a short
  affirmative re-acceptance from the beta cohort.

---

## 3. Cross-cutting dependencies (for counsel's checklist)

1. **X (Twitter) API terms — separate gate.** Any dataset that includes an X-derived trend signal
   needs the X API terms verified to permit licensing *derived* data. Raw content is never stored
   (adapter-enforced, DB-backed), which helps, but derived-signal licensing is its own review.
   **Product control already in place:** X signals are declared `licensed_no_resale` at the source
   table, so a future licensed-output rail that filters on `resale_class` excludes them by
   construction. That rail must filter on the column — building it without the filter would be the
   defect, and it should carry a test that proves the exclusion.
2. **DMO / partner licensing agreement.** The *buyer* side needs its own agreement (the license
   grant, permitted use, no-re-identification covenant, term, audit). This draft only covers the
   *inbound* rights from travelers and providers.
3. **Privacy Policy alignment.** The lawful-basis, retention, and international-transfer language
   lives in the Privacy Policy; these ToS/agreement clauses should reference it, not duplicate it.
   Specifically reconcile with `privacy.tsx` §"We never sell your personal information" and the CCPA
   opt-out note.
4. **Data-localization review.** India (DPDP), Japan (APPI) and Colombia (Law 1581) each have
   transfer/localization rules that may affect where aggregated data is processed and to whom it can
   be licensed.

---

*Grounded in Traveloure Business Plan v2.1 §8.5 (Data Products — Contingent) and §5.5 (Security,
Data, and Privacy); code facts verified against `main` @ `596f1e4` on 2026-09-02. Drafting only —
Traveloure should have licensed counsel review, edit, and localize before any use.*
