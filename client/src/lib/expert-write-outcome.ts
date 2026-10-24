/**
 * R323 (step 7b, R-n): on a traveler's plan the server FILES an expert's item write as a suggestion and answers
 * 202 `{ suggested: true, suggestion }`; on the expert's own authoring build the write lands. Row 155: every add
 * path reads this one answer before saying "Added". Pure.
 */
export function isSuggestedWrite(res: unknown): boolean {
  return !!res && typeof res === "object" && (res as { suggested?: unknown }).suggested === true;
}

/** Which toast an add should show. */
export function addOutcome(res: unknown): "suggested" | "added" {
  return isSuggestedWrite(res) ? "suggested" : "added";
}
