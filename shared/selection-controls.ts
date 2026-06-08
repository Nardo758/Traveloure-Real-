// Selection-Control Model (filter reconcile, Option 2)
// ---------------------------------------------------------------------------
// Drives #462's EXISTING filter query through a few lean, template-aware
// selection controls instead of a facet wall. Selection ≠ filtering: a control
// presents intent-level choices, each of which resolves into values across
// #462's real dimensions. This module is the additive layer (model + resolver)
// — it does NOT introduce a parallel query engine and does NOT touch #462's
// schema, dimensions, or migration 025.
//
// Ground truth (Phase 0): #462's *functioning* query path is the client-side
// `filteredServices` useMemo in experience-template.tsx, which applies these
// keys only:
//     category  (matchesCategory)   searchQuery (keyword)
//     priceRange [min,max]          minRating
//     selectedFilters[] (keyword tags)   sortBy
// The DB facet-wall Record is display-only and is intentionally left inert.
//
// Working-vs-forward rule (decision-maker refinement):
//   * The MODEL/RESOLVER can express the full taxonomy (forward-compatible),
//     so future catalog-enrichment dimensions need no schema change here.
//   * Only dimensions in WORKING_DIMENSION_KEYS are actually translated into a
//     query. Everything else degrades gracefully to a no-op.
//   * Do NOT fake true dimensions as keyword tokens. Controls for intensity /
//     capacity / formality / party-suitability / age-suitability /
//     location-type must be PRUNED from the active seed, not mapped to a
//     keyword search that looks meaningful but never narrows. Topical
//     selections that genuinely match content (food, cultural, nightlife) may
//     map to `tags`/`keyword`. Rich-dimension discrimination is deferred to a
//     separate catalog-enrichment brief (real fields on provider_services +
//     engine wiring).

export type SelectionControlType = "single_select" | "multi_select" | "guided";

export interface SelectionOption {
  id: string;
  label: string;
  /**
   * Maps this option onto REAL #462 dimension keys. Admin-configurable via
   * control_config/seed — never hard-coded in app logic. Values may be a
   * scalar or an array. Price ranges are carried as a [min, max] pair so tier
   * thresholds live in seed, not in the resolver.
   */
  filterMapping: Record<string, string | number | Array<string | number>>;
}

export interface SelectionControl {
  id: string;
  label: string;
  type: SelectionControlType;
  options: SelectionOption[];
}

export interface SelectionControlSet {
  /** Template slug, optionally `${templateSlug}:${providerCategory}`. */
  key: string;
  /** Ordered, capped lean (target 2–4 controls; hard ceiling 5). */
  controls: SelectionControl[];
}

/**
 * The #462 query shape the resolver emits into. Every field corresponds to a
 * filter the functioning `filteredServices` path already applies — there is no
 * new query engine.
 */
export interface SelectionFilterQuery {
  category?: string;
  /** Keyword tokens, accumulated into selectedFilters[] / searchQuery. */
  tags?: string[];
  priceRange?: [number, number];
  minRating?: number;
}

/**
 * Dimension keys the #462 engine actually applies today. Keys outside this set
 * are forward-compatible only and are ignored by the resolver (graceful
 * degrade) until the catalog-enrichment build wires them.
 */
export const WORKING_DIMENSION_KEYS = [
  "category",
  "tags",
  "keyword",
  "search",
  "price",
  "price_tier",
  "pricerange",
  "rating",
  "minrating",
] as const;

export type WorkingDimensionKey = (typeof WORKING_DIMENSION_KEYS)[number];

const GENERIC_SET_KEYS = ["generic", "custom"];

/**
 * Resolve the selection-control set for a template (+ optional provider
 * category) from the supplied sets, falling back to a generic set, then to an
 * empty list (open browse). Pure: callers pass the sets fetched from
 * control_config so this stays testable and free of I/O.
 */
export function getSelectionControls(
  sets: SelectionControlSet[] | undefined | null,
  templateSlug: string,
  providerCategory?: string,
): SelectionControl[] {
  if (!sets || sets.length === 0) return [];

  const exact = providerCategory
    ? sets.find((s) => s.key === `${templateSlug}:${providerCategory}`)
    : undefined;
  const byTemplate = sets.find((s) => s.key === templateSlug);
  const generic = sets.find((s) => GENERIC_SET_KEYS.includes(s.key));

  return (exact ?? byTemplate ?? generic)?.controls ?? [];
}

function toNumberPair(
  values: Array<string | number>,
): [number, number] | undefined {
  if (values.length < 2) return undefined;
  const min = Number(values[0]);
  const max = Number(values[1]);
  if (Number.isNaN(min) || Number.isNaN(max)) return undefined;
  return [min, max];
}

/**
 * Resolve a flat list of selected options into a #462 filter query.
 *
 * Merge semantics (spec default): options within one control are OR'd (the
 * caller passes all selected options flat); different controls narrow via AND.
 * For scalar dimensions the most-specific value wins (last write / max rating);
 * tags accumulate as a deduped OR set. Unknown / forward-compatible / foreign
 * dimension keys and malformed options are ignored, never errored.
 */
export function resolveSelectionsToFilterQuery(
  selectedOptions: SelectionOption[] | undefined | null,
): SelectionFilterQuery {
  const query: SelectionFilterQuery = {};
  const tags = new Set<string>();

  for (const option of selectedOptions ?? []) {
    const mapping = option?.filterMapping;
    if (!mapping || typeof mapping !== "object") continue;

    for (const [rawKey, rawValue] of Object.entries(mapping)) {
      const key = rawKey.toLowerCase();
      const values = Array.isArray(rawValue) ? rawValue : [rawValue];
      if (values.length === 0) continue;

      switch (key) {
        case "category":
          query.category = String(values[values.length - 1]);
          break;
        case "tags":
        case "keyword":
        case "search":
          for (const v of values) {
            const token = String(v).trim();
            if (token) tags.add(token);
          }
          break;
        case "price":
        case "price_tier":
        case "pricerange": {
          const pair = toNumberPair(values);
          if (pair) query.priceRange = pair;
          break;
        }
        case "rating":
        case "minrating": {
          const rating = Number(values[0]);
          if (!Number.isNaN(rating)) {
            query.minRating = Math.max(query.minRating ?? 0, rating);
          }
          break;
        }
        default:
          // Forward-compatible / foreign dimension key — degrade gracefully.
          break;
      }
    }
  }

  if (tags.size > 0) query.tags = [...tags];
  return query;
}
