/**
 * Rows 196/197 (client half) and 218 — dispatch CB-2026-10-25-D v2. The "build around a custom
 * location" pin on Optimize: what the dialog shows when the server cannot place it, and how the
 * client echoes the server's signed placement.
 *
 * PURE — no React, no fetch. The server contract is `shared/custom-location-pin.ts` (#1688).
 *
 * ECHO RULE. The server's `placement` is sent back OPAQUE, as received, with the SAME type and the
 * SAME trimmed name, on the payments retry, the create and every generate call. The client never
 * builds, parses, rounds or rebuilds it, and never sends a bare lat/lng for a custom pin: no
 * placement ⇒ the pin goes name only. Editing the name drops the placement. A list pick (an `id`)
 * never carries one.
 */
import {
  isCustomLocationRefusal,
  PINNED_ANCHOR_NOT_FOUND,
  PINNED_ANCHOR_NOT_FOUND_DETAILS,
  type PinnedAnchorNotFoundDetail,
  readCustomPinPlacement,
  type CustomLocationRefusalReason,
  type CustomPinPlacement,
} from "@shared/custom-location-pin";
import { parseApiRefusal } from "./api-refusal";
import type { ComparisonPinnedAnchor, ComparisonPinnedAnchorType } from "./create-comparison";

/**
 * A list pick whose catalog id no longer resolves (#1688): HTTP 400 `pinned_anchor_not_found`, and
 * `pinned_anchor_invalid` if the server adds it. A STALE ID, not a placement refusal — the dialog
 * shows a generic error, refreshes its candidate list and keeps every option, (a) included.
 */
export const STALE_PIN_ERRORS = [PINNED_ANCHOR_NOT_FOUND, "pinned_anchor_invalid"] as const;

/**
 * The dialog's refusal states: the five placement reasons, a stale list-pick id, and (OPT-B) the
 * three reasons the server gives when an event or day pin cannot be built around.
 */
export type PinRefusal = CustomLocationRefusalReason | "stale_pin" | PinnedAnchorNotFoundDetail;

/** The server's `detail` on a 400 `pinned_anchor_not_found`, when it is one of the three it sends. */
export function pinnedAnchorDetail(body: unknown): PinnedAnchorNotFoundDetail | undefined {
  if (!body || typeof body !== "object") return undefined;
  const detail = (body as Record<string, unknown>).detail;
  return typeof detail === "string" && (PINNED_ANCHOR_NOT_FOUND_DETAILS as readonly string[]).includes(detail)
    ? (detail as PinnedAnchorNotFoundDetail)
    : undefined;
}

/** True for the event/day refusal reasons (no name to retry; list or no pin only). */
export function isPlanAnchorRefusal(reason: PinRefusal): reason is PinnedAnchorNotFoundDetail {
  return (PINNED_ANCHOR_NOT_FOUND_DETAILS as readonly string[]).includes(reason);
}

export function isStalePinnedAnchor(status: number, body: unknown): boolean {
  if (status !== 400 || !body || typeof body !== "object") return false;
  const error = (body as Record<string, unknown>).error;
  return typeof error === "string" && (STALE_PIN_ERRORS as readonly string[]).includes(error);
}

/**
 * Every string for the refusal state, in ONE object. Wording approved by Leon, Oct 25, 2026 (relayed
 * on #1690).
 */
export const CUSTOM_PIN_REFUSAL_STRINGS = {
  /** The error for a stale list-pick id. Reachable only on the slip, before any payment. */
  stalePin: "That place is no longer on the list. We've refreshed it and you haven't been charged. Please pick again.",
  reasons: {
    zero_results: "We couldn't find a place called that.",
    ambiguous: "More than one place matches that name.",
    imprecise: "That's too broad to pin on a map.",
    cap_reached: "Place lookups are paused for now. Try again later, or continue without a pin.",
    provider_error: "The place lookup didn't respond. Try again in a bit, or continue without a pin.",
  } satisfies Record<CustomLocationRefusalReason, string>,
  /**
   * OPT-B R1–R3, HELD for Leon's approval (ledger 2026-11-02-opt-b-build-around-place-date-event).
   * Each ends with the stale-pin message's "you haven't been charged" sentence.
   */
  planAnchor: {
    event_not_anchorable: "That event can't be built around — it needs a place and a start time. You haven't been charged.",
    day_not_anchorable: "That day has no located stops to build around. You haven't been charged.",
    day_nothing_to_rebuild: "Everything on your plan is on that day, so there's nothing to rebuild around it. You haven't been charged.",
  } satisfies Record<PinnedAnchorNotFoundDetail, string>,
  options: {
    tryDifferentName: "Try a different name",
    pickFromList: "Pick from the list",
    continueWithoutPin: "Continue without a pin",
    /** One line under option (c), shown only when the run is priced (not covered, not free). */
    optionCPaidNote: "You'll see the price before anything is charged.",
  },
} as const;

export interface RefusalOptions {
  /** (a) back to the custom field. Hidden when retrying a name cannot help. */
  tryDifferentName: boolean;
  /** (b) pick from the candidate list already shown. */
  pickFromList: boolean;
  /** (c) continue without a pin — always an explicit choice. */
  continueWithoutPin: true;
}

export function refusalOptions(reason: PinRefusal, hasCandidates: boolean): RefusalOptions {
  return {
    // An event or day pin has no name to retry: list or no pin only.
    tryDifferentName: reason !== "cap_reached" && reason !== "provider_error" && !isPlanAnchorRefusal(reason),
    pickFromList: hasCandidates,
    continueWithoutPin: true,
  };
}

/**
 * A thrown `apiRequest` error (create, generate) that is the custom-location refusal or a stale
 * list-pick id, or null for any other error.
 */
export function refusalFromError(err: unknown): PinRefusal | null {
  const raw = err instanceof Error ? err.message : "";
  const status = Number(raw.match(/^\s*(\d{3}):/)?.[1]);
  const body = parseApiRefusal(err);
  if (isCustomLocationRefusal(status, body)) return body.reason;
  if (!isStalePinnedAnchor(status, body)) return null;
  return pinnedAnchorDetail(body) ?? "stale_pin";
}

/** The dialog's message for a refusal state. */
export function refusalMessage(refusal: PinRefusal): string {
  if (refusal === "stale_pin") return CUSTOM_PIN_REFUSAL_STRINGS.stalePin;
  if (isPlanAnchorRefusal(refusal)) return CUSTOM_PIN_REFUSAL_STRINGS.planAnchor[refusal];
  return CUSTOM_PIN_REFUSAL_STRINGS.reasons[refusal];
}

/** The custom pin the client last sent, with the placement the server last returned for it. */
export interface HeldCustomPin {
  type: ComparisonPinnedAnchorType;
  name: string;
  placement?: CustomPinPlacement;
}

/** True for a custom (name-only) pin: no id, a non-blank name. */
export function isCustomPin(pin: ComparisonPinnedAnchor | undefined): pin is ComparisonPinnedAnchor & { name: string } {
  return !!pin && !pin.id && typeof pin.name === "string" && pin.name.trim() !== "";
}

/**
 * The pin to send. A list pick and Auto go as they are. A custom pin goes `{ type, name }` with the
 * trimmed name, plus the held placement ONLY when the held pin has the same type and the same
 * trimmed name — any edit drops it. Never lat/lng.
 */
export function pinForRequest(
  pin: ComparisonPinnedAnchor | undefined,
  held: HeldCustomPin | null | undefined,
): ComparisonPinnedAnchor | undefined {
  if (!pin) return undefined;
  if (!isCustomPin(pin)) return pin.id ? { type: pin.type, id: planAnchorBareId(pin.type, pin.id), ...(pin.name ? { name: pin.name } : {}) } : undefined;
  const name = pin.name.trim();
  const echo = held && held.placement && held.type === pin.type && held.name === name ? held.placement : undefined;
  return { type: pin.type, name, ...(echo ? { placement: echo } : {}) };
}

/**
 * OPT-B: the server takes an event or day pin by its BARE id (`<itemId>` / `<n>`); the candidate read
 * names them `event:<itemId>` / `day:<n>`. Strips that one prefix; any other id is unchanged.
 */
export function planAnchorBareId(type: ComparisonPinnedAnchorType, id: string): string {
  if (type !== "event" && type !== "day") return id;
  const prefix = `${type}:`;
  return id.startsWith(prefix) ? id.slice(prefix.length) : id;
}

/**
 * What to hold after a response. A custom pin keeps the response's placement — the SAME object the
 * server sent, never rebuilt — when it reads as one; otherwise it keeps what it held for that pin.
 * A list pick or Auto holds nothing.
 */
export function holdAfterResponse(
  sent: ComparisonPinnedAnchor | undefined,
  responsePlacement: unknown,
  held?: HeldCustomPin | null,
): HeldCustomPin | null {
  if (!isCustomPin(sent)) return null;
  const name = sent.name.trim();
  const fresh = readCustomPinPlacement(responsePlacement) ? (responsePlacement as CustomPinPlacement) : undefined;
  const kept = held && held.type === sent.type && held.name === name ? held.placement : undefined;
  const placement = fresh ?? kept;
  return { type: sent.type, name, ...(placement ? { placement } : {}) };
}

/** sessionStorage key for the custom pin a comparison was created with (read by its /generate). */
export function comparisonPinStorageKey(comparisonId: string): string {
  return `comparison_pin_${comparisonId}`;
}

export function readStoredPin(raw: string | null): HeldCustomPin | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<HeldCustomPin>;
    if (!v || typeof v !== "object") return null;
    if (v.type !== "hotel" && v.type !== "neighborhood" && v.type !== "activity" && v.type !== "event" && v.type !== "day") return null;
    if (typeof v.name !== "string" || v.name.trim() === "") return null;
    return { type: v.type, name: v.name, ...(v.placement && readCustomPinPlacement(v.placement) ? { placement: v.placement } : {}) };
  } catch {
    return null;
  }
}
