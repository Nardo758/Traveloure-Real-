export interface ExpertSearchRecord {
  firstName?: string | null;
  lastName?: string | null;
  specializations?: string[];
  specialties?: string[];
  expertForm?: {
    specialties?: string[];
    neighborhoods?: string[];
    city?: string | null;
    country?: string | null;
    destinations?: string[];
  };
}

export function expertFacetValues(
  expert: ExpertSearchRecord,
  facet: "specialties" | "neighborhoods",
): string[] {
  const values =
    facet === "specialties"
      ? expert.expertForm?.specialties || expert.specialties || expert.specializations
      : expert.expertForm?.neighborhoods;

  return Array.isArray(values)
    ? values.filter((value): value is string => typeof value === "string" && value.trim() !== "")
    : [];
}

/**
 * Match the free-text search used by the experts browse page.
 *
 * Location is included here because the page also seeds this search value from
 * the URL's destination parameter after the API has already applied its
 * location filter. Without these fields, a valid city-filtered API response
 * can be hidden by this second client-side filter.
 */
export function expertSearchMatches(expert: ExpertSearchRecord, searchQuery: string): boolean {
  if (searchQuery === "") return true;

  const query = searchQuery.toLowerCase();
  const fullName = `${expert.firstName || ""} ${expert.lastName || ""}`.toLowerCase();
  const neighbourhoods = expertFacetValues(expert, "neighborhoods");
  const specialties = expertFacetValues(expert, "specialties");
  const locations = [
    expert.expertForm?.city,
    expert.expertForm?.country,
    ...(expert.expertForm?.destinations || []),
  ].filter((value): value is string => typeof value === "string" && value.trim() !== "");

  return (
    fullName.includes(query) ||
    expert.specializations?.some((specialty) => specialty.toLowerCase().includes(query)) === true ||
    specialties.some((specialty) => specialty.toLowerCase().includes(query)) ||
    neighbourhoods.some((neighbourhood) => neighbourhood.toLowerCase().includes(query)) ||
    locations.some((location) => location.toLowerCase().includes(query))
  );
}