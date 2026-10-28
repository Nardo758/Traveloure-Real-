/** The traveler-facing expert note of an itinerary item: the `expert_note` column and nothing else. */
export function deliveredExpertNote(item: { expertNote?: string | null }): string | null {
  return item.expertNote || null;
}
