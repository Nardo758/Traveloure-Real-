/**
 * ListingReviewFeedback — the admin's rejection reason, shown to the listing's owner.
 *
 * `provider_services.rejection_reason` is written by the admin review (`rejectProviderServiceListing`,
 * a reason is required there) and returned on the owner's own read (`GET /api/provider/services/:id`),
 * but no owner surface ever rendered it: a rejected listing said "Changes requested" and never which
 * changes. §13: renders only for a rejected listing that carries a reason — a NULL reason is never
 * filled in with a guessed one.
 */
export function ListingReviewFeedback({
  approvalStatus,
  rejectionReason,
}: {
  approvalStatus?: string | null;
  rejectionReason?: string | null;
}) {
  const reason = typeof rejectionReason === "string" ? rejectionReason.trim() : "";
  if (approvalStatus !== "rejected" || !reason) return null;
  return (
    <div
      role="status"
      className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
      data-testid="listing-review-feedback"
    >
      <p className="font-medium">Our review asked for changes</p>
      <p className="mt-1 whitespace-pre-wrap" data-testid="text-listing-rejection-reason">
        {reason}
      </p>
      <p className="mt-1 text-xs text-amber-800">Make the changes, then submit the listing for review again.</p>
    </div>
  );
}
