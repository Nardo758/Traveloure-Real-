/**
 * CAP-2 Phase 3 ("Saved to plan" after, ruling Nov 6): the items whose save the SERVER confirmed in this session,
 * keyed `kind:source_id`. Written only on a confirmed row (dispatch ruling 3) — the guest rail's answer and the owner
 * add dialog's success — and read by PlanActions so the save action says "Saved to plan". In-memory: a reload shows
 * "Save to plan" again (nothing is claimed that this session did not see confirmed).
 */
import { useSyncExternalStore } from "react";

const saved = new Set<string>();
const listeners = new Set<() => void>();

export function savedRefKey(ref: { kind?: string | null; source_id?: string | null } | null | undefined): string | null {
  const kind = typeof ref?.kind === "string" ? ref.kind.trim() : "";
  const id = typeof ref?.source_id === "string" ? ref.source_id.trim() : "";
  return kind && id ? `${kind}:${id}` : null;
}

/** Record a confirmed save. A null key records nothing. */
export function markRefSaved(key: string | null | undefined): void {
  if (!key || saved.has(key)) return;
  saved.add(key);
  listeners.forEach((l) => l());
}

export function isRefSaved(key: string | null | undefined): boolean {
  return !!key && saved.has(key);
}

/** Test seam. */
export function resetSavedRefs(): void {
  saved.clear();
  listeners.forEach((l) => l());
}

export function useRefSaved(key: string | null | undefined): boolean {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => isRefSaved(key),
    () => isRefSaved(key),
  );
}
