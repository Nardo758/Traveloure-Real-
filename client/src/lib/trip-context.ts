import { useCallback, useEffect, useState } from "react";

/**
 * TripContext — the single typed owner of the site-wide trip details blob.
 *
 * Storage key stays "experienceContext" for back-compat with in-flight sessions;
 * every surface must read/write through this module instead of touching
 * sessionStorage directly. Two load-bearing semantics:
 *
 * 1. MERGE-BY-DEFAULT: updateTripContext() spreads the patch over the existing
 *    blob — a surface can only add/override the fields it knows about, never
 *    silently destroy the rest (the concierge-handoff clobber class).
 * 2. DATE NORMALIZATION AT THE BOUNDARY: startDate/endDate always store as
 *    YYYY-MM-DD regardless of whether the caller passes a Date, an ISO
 *    datetime, or a date-only string (the <input type="date"> seed contract).
 *
 * The Discover by-date calendar's browse date is deliberately NOT part of this
 * context — browsing "what's on date X" is not "when is my trip".
 * Full design: docs/audits/trip-context-scope.md
 */
export interface TripContext {
  experienceSlug?: string;
  experienceType?: string;
  title?: string;
  destination?: string;
  city?: string;
  /** YYYY-MM-DD */
  startDate?: string;
  /** YYYY-MM-DD */
  endDate?: string;
  travelers?: number;
  eventType?: string;
  tripId?: string;
  userExperienceId?: string;
  /** Legacy alias some readers fall back to for userExperienceId. */
  id?: string;
  intent?: string;
  contextFields?: Record<string, unknown>;
  selectedServices?: Array<{ name?: string; provider?: string; price?: number; category?: string }>;
}

/** Values a caller may pass for a date field; normalized to YYYY-MM-DD on write. */
export type TripContextPatch = Omit<Partial<TripContext>, "startDate" | "endDate"> & {
  startDate?: string | Date | null;
  endDate?: string | Date | null;
};

const STORAGE_KEY = "experienceContext";
const CHANGE_EVENT = "trip-context-change";

function normalizeDate(value: string | Date | null | undefined): string | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  if (value instanceof Date) {
    return isNaN(value.getTime()) ? undefined : value.toISOString().split("T")[0];
  }
  // "2026-08-12T00:00:00.000Z" and "2026-08-12" both reduce to the date part.
  const datePart = value.split("T")[0];
  return /^\d{4}-\d{2}-\d{2}$/.test(datePart) ? datePart : undefined;
}

export function getTripContext(): TripContext {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || "{}");
    return parsed && typeof parsed === "object" ? (parsed as TripContext) : {};
  } catch {
    return {};
  }
}

export function updateTripContext(patch: TripContextPatch): TripContext {
  const current = getTripContext();
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    // Skip undefined so a caller's optional field can't erase an existing value;
    // an explicit null on a date field also clears nothing (use clearTripContext).
    if (value === undefined) continue;
    if (key === "startDate" || key === "endDate") {
      const normalized = normalizeDate(value as string | Date | null);
      if (normalized !== undefined) sanitized[key] = normalized;
    } else {
      sanitized[key] = value;
    }
  }
  const next = { ...current, ...sanitized } as TripContext;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* storage full/unavailable — context is best-effort */
  }
  try {
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
  } catch {
    /* non-browser env */
  }
  return next;
}

export function clearTripContext(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
  try {
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
  } catch {
    /* ignore */
  }
}

/**
 * React hook: live view of the trip context. Updates on same-tab writes (via
 * the custom change event) and cross-tab writes (via the storage event).
 */
export function useTripContext(): [TripContext, (patch: TripContextPatch) => void] {
  const [context, setContext] = useState<TripContext>(getTripContext);

  useEffect(() => {
    const refresh = () => setContext(getTripContext());
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY || e.key === null) refresh();
    };
    window.addEventListener(CHANGE_EVENT, refresh);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(CHANGE_EVENT, refresh);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const update = useCallback((patch: TripContextPatch) => {
    setContext(updateTripContext(patch));
  }, []);

  return [context, update];
}
