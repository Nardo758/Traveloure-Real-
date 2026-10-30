/**
 * Row 292b. Renders the provider payout block sentence, or nothing when the
 * block cannot be shown.
 */
import {
  providerPayoutBlockLine,
  type ProviderPayoutBlockValues,
} from "@/lib/provider-payout-block-copy";

export function ProviderPayoutBlock({
  block,
  bookingId,
}: {
  block: ProviderPayoutBlockValues | null | undefined;
  bookingId: string;
}) {
  const line = providerPayoutBlockLine(block);
  if (!line) return null;
  return (
    <p className="text-xs text-green-700 mt-1" data-testid={`provider-payout-block-${bookingId}`}>
      {line}
    </p>
  );
}
