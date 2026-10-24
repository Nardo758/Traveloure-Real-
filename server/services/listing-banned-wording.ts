/**
 * Flag-only scan of a listing's name and description (Architect, Oct 23, 2026).
 * Hits are returned to the caller. This module never refuses a write.
 * The phrase list stays in `blogBannedHits`.
 */
import { blogBannedHits } from "@shared/banned-copy";

export function listingBannedWording(input: {
  serviceName?: string | null;
  description?: string | null;
  /** Staged name or description on an edit-review row. Read here, never written. */
  pendingChanges?: Record<string, unknown> | null;
}): string[] {
  const staged = input.pendingChanges ?? {};
  const stagedName = typeof staged.serviceName === "string" ? staged.serviceName : "";
  const stagedDescription = typeof staged.description === "string" ? staged.description : "";
  const serviceName = [input.serviceName ?? "", stagedName].filter((part) => part.length > 0).join(" ");
  const description = [input.description ?? "", stagedDescription].filter((part) => part.length > 0).join(" ");
  return blogBannedHits(`${serviceName} ${description}`);
}
