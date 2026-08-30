// Pure, importable extraction of the experience-template #462 service filter.
// ---------------------------------------------------------------------------
// This is the EXACT predicate from experience-template.tsx's `filteredServices`
// useMemo (sans sort), lifted verbatim so it can be unit-tested against real
// catalog fixtures and reused by the page. Additive refactor — NO behavior
// change. The page imports `filterServices` and applies sort afterward.

import { matchesCategory } from "./constants/providerCategories";

export interface FilterableService {
  serviceType?: string | null;
  serviceName: string;
  shortDescription?: string | null;
  description?: string | null;
  price?: number | string | null;
  averageRating?: number | string | null;
}

export interface ServiceFilterCriteria {
  /** currentTabCategory — matched via matchesCategory */
  category?: string;
  /** free-text keyword over name/short/description */
  searchQuery?: string;
  /** [min, max]; max >= 500 means "no upper bound" (engine sentinel) */
  priceRange?: [number, number];
  /** minimum averageRating */
  minRating?: number;
  /** keyword tags matched as substrings of name/description (selectedFilters[]) */
  tags?: string[];
}

export function filterServices<T extends FilterableService>(
  services: T[],
  criteria: ServiceFilterCriteria,
): T[] {
  let filtered = [...services];
  const { category, searchQuery, priceRange, minRating, tags } = criteria;

  if (category) {
    filtered = filtered.filter((s) =>
      matchesCategory(s.serviceType || "", s.serviceName, s.description || "", category),
    );
  }

  if (searchQuery) {
    const query = searchQuery.toLowerCase();
    filtered = filtered.filter(
      (s) =>
        s.serviceName.toLowerCase().includes(query) ||
        s.shortDescription?.toLowerCase().includes(query) ||
        s.description?.toLowerCase().includes(query),
    );
  }

  if (priceRange && (priceRange[0] > 0 || priceRange[1] < 500)) {
    filtered = filtered.filter((s) => {
      const price = Number(s.price) || 0;
      return price >= priceRange[0] && (priceRange[1] >= 500 || price <= priceRange[1]);
    });
  }

  if (minRating && minRating > 0) {
    filtered = filtered.filter((s) => (Number(s.averageRating) || 0) >= minRating);
  }

  if (tags && tags.length > 0) {
    filtered = filtered.filter((s) => {
      const desc = (s.description || "").toLowerCase();
      const name = s.serviceName.toLowerCase();
      return tags.some((f) => desc.includes(f.toLowerCase()) || name.includes(f.toLowerCase()));
    });
  }

  return filtered;
}
