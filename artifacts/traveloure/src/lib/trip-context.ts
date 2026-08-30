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
/**
 * Provenance vocabulary for a planning context (Guest-invite A2, docs/briefs/04).
 * Closed set — the server PUT allow-list (server/routes/trip-context.routes.ts)
 * enforces the same enum. Absence of `origin` reads as organic; the explicit
 * "organic" value exists so a surface can assert provenance positively.
 */
export const TRIP_ORIGIN_VALUES = ["organic", "guest_invite"] as const;
export type TripOrigin = (typeof TRIP_ORIGIN_VALUES)[number];

export interface TripContext {
  experienceSlug?: string;
  experienceType?: string;
  /**
   * FIRST-TOUCH provenance: set once at entry (e.g. GuestInvitePage stamps
   * "guest_invite" when a visitor arrives via an invite link) and never
   * overwritten by later merges — an invited guest who later browses
   * organically KEEPS "guest_invite". Enforced in updateTripContext, not at
   * call sites. Not part of SWITCH_FIELDS, so trip switches preserve it too.
   */
  origin?: TripOrigin;
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
  // FIRST-TOUCH ORIGIN (A2): provenance is set once and never overwritten by a
  // later merge — drop any incoming origin once one is already recorded.
  if (current.origin && "origin" in sanitized) {
    delete sanitized.origin;
  }
  // Dev-visible tripwire (no behavior change): a merge write that touches a
  // display field paired with trip identity (destination/dates) while a trip
  // is already bound (`tripId` set — Server-truth mode) and does NOT also
  // re-affirm `tripId` is exactly the #972 desync shape — the Lane-6
  // trip-scoped push then targets the OLD trip's `trip_contexts` row with the
  // NEW destination/dates. Any caller that trips this should switch to
  // switchTripContext / switchTripContextPreservingId instead. Logged, not
  // blocked — this is a diagnostic, not a behavior change.
  if (
    current.tripId &&
    !("tripId" in patch) &&
    ("destination" in sanitized || "startDate" in sanitized || "endDate" in sanitized)
  ) {
    try {
      // eslint-disable-next-line no-console
      console.warn(
        `[trip-context] updateTripContext(merge) wrote destination/dates while tripId="${current.tripId}" ` +
          "was bound, without including tripId — this can desync a trip's identity from its own " +
          "displayed destination/dates (the #972 class). Use switchTripContext or " +
          "switchTripContextPreservingId for identity-changing writes.",
      );
    } catch {
      /* non-browser env */
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
  schedulePush(next);
  return next;
}

// ── Trip switching (atomic identity + display, distinct from merge) ───────────
// The fields a "which trip is this?" switch must set TOGETHER. updateTripContext's
// MERGE-BY-DEFAULT (above) is deliberate for additive edits — a surface adding one
// field must not erase the rest. A *switch* is the opposite contract: any field in
// this set the caller doesn't pass is CLEARED, never carried over from whichever
// trip was previously active. This closes the desync class where a display-only
// write (destination/title/dates via updateTripContext's merge) left `tripId`
// silently pointing at a DIFFERENT trip than what the screen showed — the server
// then priced/optimized the wrong (stale) trip while the traveler looked at the
// right one. Fields outside this set (experienceSlug, city, contextFields,
// selectedServices, …) are untouched by switchTripContext, exactly like
// updateTripContext — this function only owns the trip-identity descriptor.
const SWITCH_FIELDS = [
  "tripId",
  "destination",
  "startDate",
  "endDate",
  "title",
  "travelers",
  "experienceType",
] as const;

/**
 * Atomically switch the active trip: identity (`tripId`) and the display fields
 * it's paired with are written together in ONE call with REPLACE semantics for
 * `SWITCH_FIELDS` — a field the caller omits is cleared, not preserved. Use this
 * (not updateTripContext) for any control that changes WHICH trip is active
 * (e.g. the "Edit trip" panel deciding the destination now describes a different
 * trip than the one `tripId` is bound to, or re-keying the context once a trip is
 * resolved/created). Use updateTripContext for additive edits that don't change
 * trip identity (e.g. selectedServices, contextFields).
 *
 * Debounce-race note: the caller-visible push to the server is scheduled from the
 * fully-resolved `next` object computed synchronously in THIS call (not re-read
 * later), and schedulePush cancels any earlier pending timer before arming a new
 * one — so a push already in flight from a pre-switch write can never fire with
 * post-switch data (or vice versa); each push always carries the identity+payload
 * pair captured together at the moment it was scheduled.
 */
export function switchTripContext(patch: TripContextPatch): TripContext {
  const current = getTripContext();
  const sanitized: Record<string, unknown> = {};
  for (const key of SWITCH_FIELDS) {
    const value = (patch as Record<string, unknown>)[key];
    if (value === undefined) continue;
    if (key === "startDate" || key === "endDate") {
      const normalized = normalizeDate(value as string | Date | null);
      if (normalized !== undefined) sanitized[key] = normalized;
    } else {
      sanitized[key] = value;
    }
  }
  const base: Record<string, unknown> = { ...current };
  for (const key of SWITCH_FIELDS) delete base[key];
  const next = { ...base, ...sanitized } as TripContext;

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
  schedulePush(next);
  return next;
}

/**
 * Convenience for callers that know a CANDIDATE destination/date/etc. set but
 * not necessarily whether it differs from whichever trip is currently bound
 * (e.g. a page-level "reflect my local form state back to context" sync, as
 * opposed to a deliberate "load trip X" action that already has trip X's own
 * `tripId` in hand — those should call switchTripContext directly). Mirrors
 * edit-trip-panel.tsx's save() policy: `tripId` is preserved ONLY when
 * `destination` is unchanged from the live context; a genuine destination
 * change always clears it (the identity no longer matches what's displayed).
 * Fields outside SWITCH_FIELDS in `patch` are dropped exactly like
 * switchTripContext — callers needing those too should follow with a
 * separate updateTripContext() merge call for just the extra fields.
 */
export function switchTripContextPreservingId(
  patch: TripContextPatch & { destination?: string },
): TripContext {
  const live = getTripContext();
  const trimmedDestination =
    typeof patch.destination === "string" ? patch.destination.trim() || undefined : patch.destination;
  const destinationChanged = (live.destination || "") !== (trimmedDestination || "");
  const preservedTripId = live.tripId && !destinationChanged ? live.tripId : undefined;
  return switchTripContext({ ...patch, tripId: preservedTripId });
}

// ── Server persistence (migration 130; trip-scoped by migration 161) ──────────
// For signed-in users the context is mirrored to /api/trip-context so planning
// survives browser restarts and crosses devices. Guests get a 401 which is
// silently ignored — persistence is strictly best-effort.
//
// Trip-scoping (Lane 6): once the context carries a `tripId` (the trip-strip's
// "Server-truth mode" signal — set once a trip actually exists), pushes and hydrates
// target that trip's OWN server row via `?tripId=`, so a second trip started in another
// tab/session doesn't clobber the first trip's saved context. No `tripId` yet → the exact
// pre-Lane-6 behavior: the legacy per-user row, unchanged.
function tripScopedQuery(context: Pick<TripContext, "tripId">): string {
  return context.tripId ? `?tripId=${encodeURIComponent(context.tripId)}` : "";
}

let pushTimer: ReturnType<typeof setTimeout> | undefined;

function schedulePush(context: TripContext): void {
  if (typeof fetch !== "function") return;
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    pushTimer = undefined;
    fetch(`/api/trip-context${tripScopedQuery(context)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ context }),
    }).catch(() => {
      /* offline / guest — best-effort */
    });
  }, 1500);
}

let hydrated = false;

/**
 * Hydrate the local context from the server once per page load. The server copy
 * fills in any fields that are missing from the local session — local fields
 * that are already set always win (fresher intent from the current tab), but
 * server fields that are absent locally are merged in so that trip details
 * (destination, dates, party size) survive browser restarts for signed-in users.
 *
 * Trip-scoped (Lane 6): reads the LOCAL context's own `tripId` (set once a trip
 * exists) to decide which server row to hydrate from — the trip-scoped row when an
 * active trip is already known locally, otherwise the legacy per-user row exactly as
 * before. A brand-new session with no local `tripId` yet always falls back to the
 * legacy row, matching pre-Lane-6 behavior byte-for-byte.
 *
 * Race guard (#972 receipt 3): this fetch is scoped by whichever `tripId` was
 * local at the moment the REQUEST went out — but the request is async, and a
 * trip can get bound locally (switchTripContext, e.g. the dashboard trip-chip)
 * WHILE it's in flight. If the request left scoped to the legacy per-user row
 * (no `tripId` yet) but a trip is bound by the time the response lands, that
 * legacy payload describes a stale/unrelated planning session — merging it in
 * would silently pair a real trip's `tripId` with a DIFFERENT trip's leftover
 * destination/dates (or resurrect fields switchTripContext had just cleared).
 * Discard it instead; the now-bound trip's own data already came from
 * whatever atomically set `tripId` in the first place.
 */
export async function hydrateTripContextFromServer(): Promise<void> {
  if (hydrated) return;
  hydrated = true;
  try {
    const requestedLegacyRow = !getTripContext().tripId;
    const res = await fetch(`/api/trip-context${tripScopedQuery(getTripContext())}`, { credentials: "include" });
    if (!res.ok) return; // 401 guest / error — nothing to hydrate
    const data = await res.json().catch(() => null);
    const server = data?.context;
    if (!server || typeof server !== "object" || Object.keys(server).length === 0) return;
    const local = getTripContext();
    if (requestedLegacyRow && local.tripId) return; // race: a trip was bound mid-flight — discard
    // Merge: server provides the base, local fields override. Only write if
    // at least one server field was missing locally (avoid a no-op write).
    const merged: Record<string, unknown> = { ...server, ...local };
    const addedKeys = Object.keys(server).filter(
      (k) => !(k in local) && server[k] !== undefined && server[k] !== null,
    );
    if (addedKeys.length === 0) return; // local already has everything
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
      window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
    } catch {
      /* ignore */
    }
  } catch {
    /* offline — ignore */
  }
}

/** Mount once (traveler layout): hydrates the context from the server on load. */
export function useTripContextSync(): void {
  useEffect(() => {
    void hydrateTripContextFromServer();
  }, []);
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
