/**
 * Row 211 (strings 31–32 of Marketing's 198/211 set, approved by Leon Oct 26, 2026): plain empty
 * states that say what is true now, instead of promising something is coming.
 */
export const EMPTY_STATE_COPY = {
  // #31: the guest invite's last step when the server has no travel suggestions.
  guestNoSuggestions: "No travel suggestions for this event.",
  // #32: the discover feed with nothing to show for a city.
  feedEmpty: (city: string): string => `Nothing here yet for ${city}.`,
} as const;
