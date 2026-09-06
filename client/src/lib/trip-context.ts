import { useCallback, useEffect, useState } from "react";
// Type only — the stop list's SHAPE has one definition (§18 rule 1), in the pure reducer module
// that also owns its rules. Nothing is imported at runtime, so this adds no module to the graph.
import type { PlanStopPayload } from "./plan-stops";
import type { PlanEventDraft } from "@shared/plan-events";

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
  /**
   * The plan modal's step-4 pair (ledger `2026-09-04-one-modal-many-doors`), mirroring
   * `trips.adults` / `trips.kids`. `travelers` above stays the DERIVED total (`partyTotal` in
   * plan-vocabulary.ts) so the Trip Strip's chip has one number to read; these two are the
   * composition the traveler actually stated. Absent = never stated (§13, migration 241's
   * de-masking) — never a fabricated 2 adults, and never split out of `travelers`.
   *
   * `0` HERE IS THE CLEARED MARKER, not a count. `updateTripContext` merges and cannot delete a
   * key, so a field stepped back to "not set" is written as 0 rather than left stale; every reader
   * turns it back into NOT SET through `travelersForSave`, and `trips.adults`/`trips.kids` are
   * written NULL, never 0 — an unanswered party is not a party of none.
   */
  adults?: number;
  kids?: number;
  /**
   * Step 4's SECOND question, held while no trip row exists (ledger
   * `2026-09-04-step4-variants-fields`, CLAUDE.md Locked Decision 38; migration 284's
   * `trips.budget_approver_name` / `budget_approver_email` / `accessibility_note`).
   *
   * WHICH ONE IS ASKED IS THE OCCASION ROW'S OWN ANSWER, never a class: the approver pair when
   * `experience_types.vocabulary` resolves to "attendees" (corporate events, retreats), the note
   * when `default_guests` is TRUE (weddings, family occasions, parties). The two predicates live
   * once, in `@/lib/plan-steps` — a second copy here is the drift class §18 rule 1 names.
   *
   * `null` IS THE CLEARED MARKER in this blob, exactly as `0` is for the party pair above:
   * `updateTripContext` merges and cannot delete a key, so a field the traveler emptied is written
   * `null` rather than left stale. Every reader treats `null` and ABSENT the same — the question
   * was not answered — and the TRIP ROW is written NULL either way. NULL is never rendered as
   * "no budget approver" or "no accessibility needs" (§13): those are claims only the traveler can
   * make, and the flow does not even put the question to an occasion whose switches send it down
   * the other branch.
   *
   * `accessibilityNote` is deliberately NOT `trip_participants.accessibility_needs` — that is one
   * PARTICIPANT's stated needs about themself, a different person's answer on a different surface
   * (CLAUDE.md Locked Decision 24 draws the same line for the provider-side `access_notes`).
   */
  budgetApproverName?: string | null;
  budgetApproverEmail?: string | null;
  accessibilityNote?: string | null;
  eventType?: string;
  tripId?: string;
  userExperienceId?: string;
  /** Legacy alias some readers fall back to for userExperienceId. */
  id?: string;
  intent?: string;
  /**
   * "HH:MM" — the main moment on a single-day occasion (migration 276 `default_duration = "day"`;
   * ledger `2026-09-03-switch-readers`). Held here ONLY while no trip row exists: once `tripId` is
   * bound the edit panel writes the moment as a `temporal_anchors` row, which is the platform's
   * real home for a time the plan must be built around, and this field is only the pre-trip
   * holding pen. Absent = the traveler never gave one (§13) — never a fabricated time.
   */
  mainMomentTime?: string;
  /**
   * "YYYY-MM-DD" — the DATE of the main moment on a RANGE-shaped occasion that has a schedule
   * (the ratified Step3When artboard; ledger `2026-09-04-one-modal-many-doors`). A single-day
   * occasion needs no such field: its moment falls on the one date the plan already has. Held
   * only while no trip row exists, exactly like `mainMomentTime` beside it; once `tripId` is
   * bound the pair is written as a `temporal_anchors` row. Absent = the traveler never gave one
   * (§13) — a moment inside a three-day range has no date the plan may derive for it.
   */
  mainMomentDate?: string;
  /**
   * THE LEGACY PEN — the "What's happening" chips as BARE TITLES, all this pen could hold before
   * migration 282 gave an event a time of day. **Read for one release, never written again**
   * (ledger `2026-09-04-event-time-ui`): a traveler who ticked chips before that deploy still has
   * this key, and `readPendingEvents` (`@/lib/plan-events`) accepts it as title-only drafts so
   * nothing they chose is lost. The server drain reads both keys and clears both together.
   */
  pendingEventTitles?: string[];
  /**
   * The plan's ORDERED STOPS while no trip row exists yet (ledger `2026-09-04-plan-stops-ui`;
   * `trip_destinations`, migration 281, CLAUDE.md Locked Decision 34). Index 0 is the destination
   * field — the position-0 mirror — so this list and `destination` above always agree on the first
   * city. Once `tripId` is bound the ROWS are the truth and this pen is cleared to `[]`; the one
   * writer of both halves is `client/src/lib/plan-stops-writer.ts`.
   *
   * Absent = the stop question was never asked (an occasion whose `default_stops` is not "many"),
   * which is NOT the same as "this plan has one stop" — a reader falls back to `destination` and
   * says so (§13). Coordinates appear ONLY when a stop was explicitly placed; a stop without them
   * is unlocated and stays visibly so, never guessed onto a map.
   */
  stops?: PlanStopPayload[];
  /**
   * The pen from this release on — step 5's ratified table (Event · Day · Time · Place), held
   * while no trip row exists. Ledger `2026-09-04-event-time-ui`; the row shape is
   * `PlanEventDraft` (`shared/plan-events.ts`), and an ABSENT day/time/place means the traveler
   * did not answer, never a default written as if they had (§13). Once `tripId` is bound each row
   * becomes ONE `user_experiences` row (an event inside the plan, Locked Decision 29); the pen is
   * DRAINED at every traveler-owned mint by `server/services/pending-events.service.ts` (Locked
   * Decision 30 (b)) — the gap this field's predecessor was documented as having is closed.
   */
  pendingEvents?: PlanEventDraft[];
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
/**
 * Fired by `clearTripContext` ONLY — "the traveler cleared the plan", which is a different fact
 * from "the context changed" (CHANGE_EVENT, which every merge fires). A surface holding its own
 * copy of the plan's basics in React state — `experience-template.tsx` holds the destination/date
 * quartet and reverse-syncs it back into this blob — cannot tell those two apart from the blob
 * alone: an empty context looks identical to a context that has not hydrated yet, and treating
 * every empty read as a clear is how a mount pass wipes a live plan. So the clear says so out
 * loud, once, and the surfaces that can re-seed a plan listen for it (QA check 4).
 */
export const TRIP_CONTEXT_CLEARED_EVENT = "trip-context-cleared";
/**
 * The per-slug search-settings mirror `experience-template.tsx` writes
 * (`searchSettings_<slug>`), named HERE because `clearTripContext` has to be able to drop every
 * one of them: that store holds the same destination/dates this blob does and reverse-syncs them
 * back in, so a clear that leaves it behind is a clear the next render undoes. One definition,
 * two readers (§18 rule 1) — the page imports this prefix rather than re-typing the literal.
 */
export const SEARCH_SETTINGS_PREFIX = "searchSettings_";

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

/**
 * RELEASE THE PRE-TRIP EVENT PEN — the modal taking its own held events off the table before it
 * mints. Ledger `2026-09-06-event-mint-dedupe`; CLAUDE.md Locked Decision 30 (b).
 *
 * ── WHY THIS EXISTS AND WHY IT IS AWAITED ───────────────────────────────────────────────────
 * The pen (`pendingEvents` / the legacy `pendingEventTitles`) is drained SERVER-SIDE inside the
 * mint: `storage.createTrip` awaits `drainPendingEventsIntoTrip`, which promotes every held title
 * into a `user_experiences` row. The plan modal's own save then creates the rows that are ON
 * SCREEN — and those rows were SEEDED FROM THAT SAME PEN, so a finish that mints with a pen in
 * hand writes every ticked event twice. The modal is the author of the events it collected (it
 * holds the resolved occasion, and it honours an untick the pen still remembers), so it clears the
 * pen first and the drain then has nothing of its to replay.
 *
 * It is AWAITED, and it disarms the 1.5s debounced push it just armed, because a release that
 * lands after `POST /api/trips` is not a release at all — the drain would read the pen it was
 * meant to empty. That is the same ordering `clearTripContext` closes for the plan as a whole.
 *
 * It clears ONLY the two pen keys: every other held planning field (dates, party, stops, step 4's
 * answers) survives, because this is not a "clear plan".
 *
 * @returns whether the SERVER confirmed the write. `false` is not an error — the caller carries on
 *          and the modal's create is idempotent by title against what the plan already holds, so
 *          an unconfirmed release costs nothing beyond that second layer doing its job. A guest
 *          (401) and an offline tab both land here honestly rather than silently.
 */
export async function releasePendingEventsPen(): Promise<boolean> {
  // The local half through the ONE local writer — so the on-screen seed, the change event and the
  // stored blob all agree, exactly as any other context write does.
  const next = updateTripContext({ pendingEvents: [], pendingEventTitles: [] });
  // The push `updateTripContext` just armed carries this same blob 1.5s from now; this call sends
  // it immediately instead, so the mint that follows cannot outrun it.
  if (pushTimer) {
    clearTimeout(pushTimer);
    pushTimer = undefined;
  }
  if (typeof fetch !== "function") return false;
  try {
    const res = await fetch(`/api/trip-context${tripScopedQuery(next)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ context: next }),
    });
    return res.ok;
  } catch {
    // Offline / guest — best-effort, exactly like every other write in this module.
    return false;
  }
}

let hydrated = false;
/**
 * Bumped by every `clearTripContext`. A hydrate that started BEFORE a clear must not land AFTER
 * it: the server payload it is carrying describes the plan the traveler just deleted, and writing
 * it back is the same resurrection this lane exists to close (the sibling of the #972 mid-flight
 * race guarded below). Captured at the top of the hydrate and re-checked before the write.
 */
let clearGeneration = 0;

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
  // Clear race (QA check 4): captured BEFORE the request leaves, re-checked before the write.
  const generation = clearGeneration;
  try {
    const requestedLegacyRow = !getTripContext().tripId;
    const res = await fetch(`/api/trip-context${tripScopedQuery(getTripContext())}`, { credentials: "include" });
    if (!res.ok) return; // 401 guest / error — nothing to hydrate
    const data = await res.json().catch(() => null);
    const server = data?.context;
    if (!server || typeof server !== "object" || Object.keys(server).length === 0) return;
    if (clearGeneration !== generation) return; // race: the plan was CLEARED mid-flight — discard
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

/**
 * Clear the SERVER's copy through the EXISTING rail — `PUT /api/trip-context` with an empty
 * context. There is no DELETE route and this lane adds none: the PUT is a full replace of the
 * `trip_contexts.context` blob, so an empty body IS the clear.
 *
 * BOTH ROWS, when a trip was bound. `hydrateTripContextFromServer` picks its row from whatever
 * `tripId` is local at the time, and a cleared context has none — so it will read the LEGACY
 * per-user row on the next load. Clearing only the trip-scoped row would leave that legacy row to
 * resurrect the plan; clearing only the legacy one would leave the trip-scoped row to do it the
 * moment the trip is bound again. Both, or neither is cleared in practice.
 *
 * Best-effort exactly like `schedulePush`: a guest gets a 401 and a failure is swallowed. The
 * server's first-touch `origin` provenance survives by design (the PUT's own CASE preserves it) —
 * that is where the visitor came from, not what they were planning.
 */
function pushClear(tripId?: string): void {
  if (typeof fetch !== "function") return;
  const queries = tripId ? [`?tripId=${encodeURIComponent(tripId)}`, ""] : [""];
  for (const query of queries) {
    fetch(`/api/trip-context${query}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ context: {} }),
    }).catch(() => {
      /* offline / guest — best-effort */
    });
  }
}

/**
 * CLEAR PLAN — the ONE implementation, and it clears every store that can re-seed a plan
 * (QA check 4; CLAUDE.md Locked Decision 33's "Clear plan" control is its only caller).
 *
 * THE DEFECT THIS CLOSES. This used to remove one sessionStorage key and fire one event, which
 * left FOUR live copies of the plan behind, every one of them able to put it back:
 *
 *   1. a DEBOUNCED PUSH already armed by the write that preceded the clear (`schedulePush`, 1.5s)
 *      — it fires afterwards and re-saves the pre-clear blob to the server;
 *   2. the SERVER row itself, which nothing here ever cleared, so the next page load hydrated the
 *      plan straight back;
 *   3. a HYDRATE already in flight, which lands after the clear and writes the server's copy over
 *      the emptied store;
 *   4. the per-slug `searchSettings_<slug>` mirrors, which hold the same destination/dates and
 *      reverse-sync them back into this blob on the next render of `experience-template.tsx`.
 *
 * All four are closed here, and the ORDER matters: the armed push is disarmed and the in-flight
 * hydrate is invalidated BEFORE the store is emptied, so nothing that was already moving can land
 * after it. The pre-trip PEN (`stops`, `pendingEvents`, `pendingEventTitles`, the party
 * pair, step 4's second question) lives INSIDE the blob and therefore goes with it — there is no
 * second key to forget.
 *
 * WHAT IT DOES NOT DO, deliberately: it does not delete the TRIP. A plan row is the traveler's,
 * not this control's, and "clear the planning context" is not "destroy my trip" (§13 — the two
 * would render identically here and are not the same act). Nor does it touch React-Query caches:
 * this module owns the context store and pulls in no query client. The one caller drops its own
 * cached reads beside this call.
 */
export function clearTripContext(): void {
  // (1) Disarm a push carrying the PRE-clear blob before anything else — it is the only writer
  // that is already scheduled, and it would otherwise undo (2) a second later.
  if (pushTimer) {
    clearTimeout(pushTimer);
    pushTimer = undefined;
  }
  const before = getTripContext();
  // (3) Any hydrate already in flight is now describing a plan that no longer exists.
  clearGeneration += 1;
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
  // (4) Every per-slug search-settings mirror. Collected first: removing while iterating
  // `sessionStorage.key(i)` re-indexes the store and skips entries.
  try {
    const stale: string[] = [];
    for (let i = 0; i < sessionStorage.length; i += 1) {
      const key = sessionStorage.key(i);
      if (key && key.startsWith(SEARCH_SETTINGS_PREFIX)) stale.push(key);
    }
    for (const key of stale) sessionStorage.removeItem(key);
  } catch {
    /* ignore */
  }
  // (2) The server's own copy, through the existing PUT rail.
  pushClear(before.tripId);
  try {
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
    // Said out loud and separately: a surface holding its own copy of the basics cannot tell a
    // clear from an un-hydrated read, and must not have to guess.
    window.dispatchEvent(new CustomEvent(TRIP_CONTEXT_CLEARED_EVENT));
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
