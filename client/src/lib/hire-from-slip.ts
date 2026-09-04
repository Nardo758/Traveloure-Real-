/**
 * HIRE FROM THE SLIP — the ONE derivation of what the expert picker asks for, and of what it is
 * allowed to say about the answer. Ledger `2026-09-04-hire-from-slip`; CLAUDE.md Locked Decisions
 * 31 (`experience_types.roles_needed`) and 29 (an event IS a `user_experiences` row); the missing
 * piece clause (c) of `2026-09-04-slip-precondition`.
 *
 * THE CHAIN THIS IMPLEMENTS: slip -> event -> the event's occasion -> that occasion's
 * `roles_needed` -> a picker. Every link can be absent, and each absence means something
 * DIFFERENT — which is the whole reason this is a pure module with its own test rather than a
 * ternary inside a dialog:
 *
 *   · the group has no event at all      (the plan's implicit unnamed event)
 *   · the event names no occasion        (`user_experiences.experience_type_id` unset)
 *   · the occasion row is not loaded yet (or was filtered out of the list)
 *   · the occasion has `roles_needed` NULL — NOT SET, which Locked Decision 31 spells out is
 *     never "this occasion needs nobody": that is a claim only a planner can make.
 *
 * All four end with NO role list, and every one of them says WHY in its own words (§13). None of
 * them invents a role, and none of them silently degrades into a plain browse that looks like it
 * was filtered.
 *
 * THE HONEST LIMIT THIS MODULE EXISTS TO STATE OUT LOUD:
 * `GET /api/experts` — the ONE expert read this picker uses, and it is reused rather than
 * replaced — filters by `location`, `role`, `neighbourhood`, `experienceType` and
 * `experienceTypeId`. It does NOT accept a `service_categories.category_key`. So the roles are
 * DISPLAYED as chips and the list is NOT narrowed by them, and the picker says so. Filtering the
 * returned list client-side by scanning each expert's embedded services would look like a role
 * filter without being one — a smaller list is a claim about the whole directory, and this
 * payload is not the whole directory. Real role filtering is a server change (a category filter
 * on `/api/experts`), filed in the ledger row, not faked here.
 */

/** The `experience_types` row this module reads — the shape `GET /api/experience-types` ships. */
export interface HireOccasion {
  id: string;
  name?: string | null;
  /** `experience_types.roles_needed` — `service_categories.category_key` values, or NULL = NOT SET. */
  rolesNeeded?: string[] | null;
}

/** The event this hire is being made from: the plancard `events` projection (Locked Decision 29). */
export interface HireEvent {
  id: string;
  title?: string | null;
  experienceTypeId?: string | null;
}

/** A `service_categories` row, used ONLY to label a role key with the name the catalog gave it. */
export interface HireRoleCategory {
  categoryKey?: string | null;
  name?: string | null;
}

export interface ExpertPickerFilter {
  /** Query params for `GET /api/experts`. Empty when the plan has no destination to filter on. */
  params: { location?: string };
  /** The occasion's roles, or `null` when there are none to show — see `rolesNote` for why. */
  roles: string[] | null;
  /** Always a sentence, always true. Says which roles, or says why there are none. */
  rolesNote: string;
  /**
   * Present ONLY when roles exist: the standing statement that the list on screen is not narrowed
   * by them. A role list with no such line reads as a filter that has been applied.
   */
  roleFilterNote: string | null;
  /** Present when the plan has no destination — the list is then the whole directory, and says so. */
  destinationNote: string | null;
}

/** No event at all: the plan's ONE implicit unnamed event, which is not a row and names no occasion. */
export const NO_EVENT_NOTE =
  "This part of the plan isn't an event, so no roles are suggested for it.";
/** The event exists but names no occasion — `experience_type_id` was never set on the row. */
export const NO_OCCASION_ON_EVENT_NOTE =
  "This event has no occasion set, so no roles are suggested for it.";
/** The occasion id is there but the catalog row is not in hand. Never mistaken for "needs nobody". */
export const OCCASION_NOT_LOADED_NOTE =
  "This event's occasion couldn't be looked up, so no roles are suggested — the list below isn't narrowed by role.";
/** `roles_needed` IS NULL: NOT SET (Locked Decision 31), never "this occasion needs nobody". */
export const NO_ROLES_FOR_OCCASION_NOTE = "No roles suggested for this occasion.";
/** The standing honesty line beside any role list. `/api/experts` cannot filter by category key. */
export const ROLE_FILTER_UNSUPPORTED_NOTE =
  "The expert directory can't filter by role yet, so the experts below aren't narrowed by these.";
/** The plan has no destination, so the list is every expert, not the ones who work there. */
export const NO_DESTINATION_NOTE =
  "This plan has no destination yet, so these experts aren't narrowed to one.";

/** `GET /api/experts` accepts no `category_key` filter. Stated as a value so the test can pin it. */
export const EXPERT_ROLE_FILTERING_SUPPORTED = false;

function trimmed(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Work out what the picker asks the server for, and what it may say about the roles.
 *
 * @param destination the PLAN's destination (`trips.destination`) — the only filter the expert
 *                    read actually supports here.
 * @param event       the event whose header was pressed, or `null` for the implicit group.
 * @param occasions   the `experience_types` rows in hand (`GET /api/experience-types`). An empty
 *                    or still-loading list is NOT an answer about roles, and never reads as one.
 */
export function buildExpertPickerFilter(
  destination: string | null | undefined,
  event: HireEvent | null | undefined,
  occasions: readonly HireOccasion[] | null | undefined,
): ExpertPickerFilter {
  const place = trimmed(destination);
  const base = {
    params: place ? { location: place } : {},
    destinationNote: place ? null : NO_DESTINATION_NOTE,
  };
  const none = (rolesNote: string): ExpertPickerFilter => ({
    ...base,
    roles: null,
    rolesNote,
    roleFilterNote: null,
  });

  if (!event) return none(NO_EVENT_NOTE);

  const occasionId = trimmed(event.experienceTypeId);
  if (!occasionId) return none(NO_OCCASION_ON_EVENT_NOTE);

  const occasion = (occasions ?? []).find((o) => o && o.id === occasionId);
  if (!occasion) return none(OCCASION_NOT_LOADED_NOTE);

  // NULL and [] both arrive here as "nothing to show". Locked Decision 31 declined to make the
  // empty array a second empty state, so they are answered identically and with the same words.
  const roles = (occasion.rolesNeeded ?? []).map((r) => trimmed(r)).filter(Boolean);
  if (roles.length === 0) return none(NO_ROLES_FOR_OCCASION_NOTE);

  const label = trimmed(occasion.name);
  return {
    ...base,
    roles,
    rolesNote: label
      ? `Usually hired for a ${label.toLowerCase()}:`
      : "Roles usually hired for this occasion:",
    roleFilterNote: ROLE_FILTER_UNSUPPORTED_NOTE,
  };
}

/**
 * Label a `service_categories.category_key` with the name THE CATALOG gave it, falling back to a
 * plain de-underscored spelling of the key itself when the categories are not in hand. The
 * fallback is the key made readable, never a nicer name invented for it — and
 * `scripts/check-roles-needed-reachability.cjs` guarantees every seeded key HAS a category behind
 * it, so the fallback is a loading state, not a missing taxonomy.
 */
export function roleLabel(
  key: string,
  categories: readonly HireRoleCategory[] | null | undefined,
): string {
  const match = (categories ?? []).find((c) => c && trimmed(c.categoryKey) === key);
  const name = trimmed(match?.name);
  if (name) return name;
  return key.replace(/_/g, " ");
}
