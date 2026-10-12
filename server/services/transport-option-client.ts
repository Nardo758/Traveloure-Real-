/**
 * AF-1 (ledger `2026-10-12-af1-transport-token-leak`) — the two things a `transport_booking_options` row
 * passes through on its way out of the server, each stated ONCE (§18 rule 1).
 *
 *   1. `scrubStoredTransportOption` — storage applies it to every row it reads. Per-leg options written
 *      before AF-1 stored the secret Travelpayouts API token in `external_url` and `affiliate_code`; rows
 *      on disk are not rewritten, so the token is replaced by the public marker on read. That keeps the
 *      click redirect and the booking-agent rail (both read `external_url` server-side) marker-only too.
 *   2. `toClientTransportOption` — the client projection every option response uses. The partner URL
 *      never ships (§16: `hasBookingLink` says one exists), and neither does `affiliateCode`, which
 *      nothing on the client reads.
 */
import { scrubTravelpayoutsToken } from "./travelpayouts/travelpayouts-client";

export function scrubStoredTransportOption<T extends Record<string, any> | null | undefined>(row: T): T {
  if (!row) return row;
  return {
    ...row,
    externalUrl: scrubTravelpayoutsToken(row.externalUrl),
    affiliateCode: scrubTravelpayoutsToken(row.affiliateCode),
  };
}

export function toClientTransportOption<T extends Record<string, any>>(
  option: T,
): Omit<T, "externalUrl" | "affiliateCode"> & { hasBookingLink: boolean } {
  const { externalUrl, affiliateCode: _affiliateCode, ...rest } = option;
  return { ...rest, hasBookingLink: !!externalUrl };
}
