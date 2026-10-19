/**
 * SH-1 item 11 (ruling Q11.4): the /experts page's result states, decided once.
 *   - A spinner only while the list is loading; the empty state only once it has loaded with nobody in it.
 *   - "Clear all filters" only when a filter is set. The role filter (away from the page's own default role) and
 *     "Available now" count as set, and the button clears them too.
 */
export interface ExpertsFilterState {
  searchQuery: string;
  selectedDestination: string;
  selectedLanguage: string;
  selectedSpecialty: string;
  selectedExperienceType: string;
  neighbourhoodQuery: string;
  selectedRole: string;
  availableNowOnly: boolean;
}

export const EXPERTS_ALL_DESTINATIONS = "All Destinations";
export const EXPERTS_ALL_LANGUAGES = "All Languages";
export const EXPERTS_ALL_SPECIALTIES = "All Specialties";

/** The state "Clear all filters" restores, given the page's own default role. */
export function clearedExpertsFilters(defaultRole: string): ExpertsFilterState {
  return {
    searchQuery: "",
    selectedDestination: EXPERTS_ALL_DESTINATIONS,
    selectedLanguage: EXPERTS_ALL_LANGUAGES,
    selectedSpecialty: EXPERTS_ALL_SPECIALTIES,
    selectedExperienceType: "",
    neighbourhoodQuery: "",
    selectedRole: defaultRole,
    availableNowOnly: false,
  };
}

export function expertsFiltersSet(s: ExpertsFilterState, defaultRole: string): boolean {
  const c = clearedExpertsFilters(defaultRole);
  return (
    s.searchQuery.trim() !== c.searchQuery ||
    s.selectedDestination !== c.selectedDestination ||
    s.selectedLanguage !== c.selectedLanguage ||
    s.selectedSpecialty !== c.selectedSpecialty ||
    s.selectedExperienceType !== c.selectedExperienceType ||
    s.neighbourhoodQuery.trim() !== c.neighbourhoodQuery ||
    s.selectedRole !== c.selectedRole ||
    s.availableNowOnly !== c.availableNowOnly
  );
}

/** "loading" ⇒ spinner; "empty" ⇒ the empty state; "results" ⇒ the grid. */
export function expertsResultState(isLoading: boolean, count: number): "loading" | "empty" | "results" {
  if (isLoading) return "loading";
  return count === 0 ? "empty" : "results";
}
