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

/** The dialog's refusal states: the five placement reasons, plus a stale list-pick id. */
export type PinRefusal = CustomLocationRefusalReason | "stale_pin";

export function isStalePinnedAnchor(status: number, body: unknown): boolean {
  if (status !== 400 || !body || typeof body !== "object") return false;
  const error = (body as Record<string, unknown>).error;
  return typeof error === "string" && (STALE_PIN_ERRORS as readonly string[]).includes(error);
}

/** Every new string for the refusal state, in ONE object. Held for Leon — placeholders only. */
export const CUSTOM_PIN_REFUSAL_STRINGS = {
  /** The generic error for a stale list-pick id. */
  stalePin: "TODO(Leon): that place is no longer in the list",
  reasons: {
    zero_results: "TODO(Leon): no place was found for that name",
    ambiguous: "TODO(Leon): more than one place matches that name",
    imprecise: "TODO(Leon): that name is too broad to place",
    cap_reached: "TODO(Leon): place lookups are paused for now",
    provider_error: "TODO(Leon): the place lookup did not answer",
  } satisfies Record<CustomLocationRefusalReason, string>,
  options: {
    tryDifferentName: "TODO(Leon): option (a) try a different place name",
    pickFromList: "TODO(Leon): option (b) pick from the list",
    continueWithoutPin: "TODO(Leon): option (c) continue without a pin",
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
    tryDifferentName: reason !== "cap_reached" && reason !== "provider_error",
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
  return isStalePinnedAnchor(status, body) ? "stale_pin" : null;
}

/** The dialog's message for a refusal state. */
export function refusalMessage(refusal: PinRefusal): string {
  return refusal === "stale_pin" ? CUSTOM_PIN_REFUSAL_STRINGS.stalePin : CUSTOM_PIN_REFUSAL_STRINGS.reasons[refusal];
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
  if (!isCustomPin(pin)) return pin.id ? { type: pin.type, id: pin.id, ...(pin.name ? { name: pin.name } : {}) } : undefined;
  const name = pin.name.trim();
  const echo = held && held.placement && held.type === pin.type && held.name === name ? held.placement : undefined;
  return { type: pin.type, name, ...(echo ? { placement: echo } : {}) };
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
    if (v.type !== "hotel" && v.type !== "neighborhood" && v.type !== "activity") return null;
    if (typeof v.name !== "string" || v.name.trim() === "") return null;
    return { type: v.type, name: v.name, ...(v.placement && readCustomPinPlacement(v.placement) ? { placement: v.placement } : {}) };
  } catch {
    return null;
  }
}
