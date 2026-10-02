import { createAutomationRegistry } from "../registry";
import { bookingArtifactAcceptanceAutomation } from "./artifact-acceptance";
import { bookingAutoCompletionAutomation } from "./auto-completion";
import { bookingAvailabilityBlackoutAuthoringAutomation } from "./availability-blackout-authoring";
import { bookingAvailabilityDateRangeAuthoringAutomation } from "./availability-date-range-authoring";
import { bookingAvailabilityHorizonAutomation } from "./availability-horizon";
import { bookingAvailabilityPatternAuthoringAutomation } from "./availability-pattern-authoring";
import { bookingCancellationFollowOnsAutomation } from "./cancellation-follow-ons";
import { bookingCompletionDeclarationWriterAutomation } from "./completion-declaration-writer";
import { bookingCompletionLedgerReconciliationAutomation } from "./completion-ledger-reconciliation";
import { bookingCompletionWriterAutomation } from "./completion-writer";
import { bookingCoordinationWindowCloseAutomation } from "./coordination-window-close";
import { bookingDeclaredWindowCloseAutomation } from "./declared-window-close";
import { bookingEarnerNoResponseNoticeAutomation } from "./earner-no-response-notice";
import { bookingLegacyPaymentExpiryAutomation } from "./legacy-payment-expiry";
import { bookingOccasionDraftsAutomation } from "./occasion-drafts";
import { bookingProviderAcceptanceFollowOnAutomation } from "./provider-acceptance-follow-on";
import { bookingTripCardHandoverAutomation } from "./trip-card-handover";

export const bookingAutomations = [
  bookingAutoCompletionAutomation,
  bookingDeclaredWindowCloseAutomation,
  bookingArtifactAcceptanceAutomation,
  bookingCoordinationWindowCloseAutomation,
  bookingCompletionLedgerReconciliationAutomation,
  bookingLegacyPaymentExpiryAutomation,
  bookingEarnerNoResponseNoticeAutomation,
  bookingTripCardHandoverAutomation,
  bookingOccasionDraftsAutomation,
  bookingAvailabilityHorizonAutomation,
  bookingAvailabilityPatternAuthoringAutomation,
  bookingAvailabilityDateRangeAuthoringAutomation,
  bookingAvailabilityBlackoutAuthoringAutomation,
  bookingCompletionWriterAutomation,
  bookingCompletionDeclarationWriterAutomation,
  bookingProviderAcceptanceFollowOnAutomation,
  bookingCancellationFollowOnsAutomation,
] as const;

export const bookingAutomationRegistry = createAutomationRegistry(bookingAutomations);

export {
  bookingArtifactAcceptanceAutomation,
  bookingAutoCompletionAutomation,
  bookingAvailabilityBlackoutAuthoringAutomation,
  bookingAvailabilityDateRangeAuthoringAutomation,
  bookingAvailabilityHorizonAutomation,
  bookingAvailabilityPatternAuthoringAutomation,
  bookingCancellationFollowOnsAutomation,
  bookingCompletionDeclarationWriterAutomation,
  bookingCompletionLedgerReconciliationAutomation,
  bookingCompletionWriterAutomation,
  bookingCoordinationWindowCloseAutomation,
  bookingDeclaredWindowCloseAutomation,
  bookingEarnerNoResponseNoticeAutomation,
  bookingLegacyPaymentExpiryAutomation,
  bookingOccasionDraftsAutomation,
  bookingProviderAcceptanceFollowOnAutomation,
  bookingTripCardHandoverAutomation,
};