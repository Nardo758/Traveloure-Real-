/**
 * CN-1a-UI (ledger `2026-11-01-cn1a-ui-listing-type`): the expert listing form's type choice — planning or concierge.
 *
 * The labels are CN-1's `listing.type.*` keys, held in `shared/cn1-copy.ts` and pending Leon (the concierge label
 * depends on OPEN call B). Nothing here restates them. `provider_services.service_type` defaults to planning, and the
 * server admits `concierge` for an expert account only (concierge-listing.service.ts).
 */
import { CN1_COPY } from "@shared/cn1-copy";

export const LISTING_TYPES = ["planning", "concierge"] as const;
export type ListingType = (typeof LISTING_TYPES)[number];

export const LISTING_TYPE_CHOICES: ReadonlyArray<{ value: ListingType; label: string }> = [
  { value: "planning", label: CN1_COPY.listingTypePlanning },
  { value: "concierge", label: CN1_COPY.listingTypeConcierge },
];

/** The type a new listing starts with: planning, the column's own default. */
export const DEFAULT_LISTING_TYPE: ListingType = "planning";

/** The form's value for a stored row: the stored type as it is, or planning when the row has none. */
export function listingTypeFromStored(stored: string | null | undefined): string {
  const v = (stored ?? "").trim();
  return v.length > 0 ? v : DEFAULT_LISTING_TYPE;
}

/**
 * Whether the seller may change the type on this listing. An approved listing keeps its type (the server does not yet
 * treat the type as an identity edit that re-enters review, so this client guard holds it until that follow-up lands).
 * A draft, a pending (submitted) or a rejected listing, and a new one, may change it.
 */
export function listingTypeEditable(approvalStatus: string | null | undefined): boolean {
  return approvalStatus !== "approved";
}

/**
 * What the write sends. Only an expert listing carries the choice; a provider listing sends nothing, so its stored type
 * is never touched. An edit sends back the value it loaded, so leaving the choice alone never flips the type.
 */
export function listingTypePayload(role: "expert" | "provider", formType: string): { serviceType?: string } {
  if (role !== "expert") return {};
  return { serviceType: formType };
}
