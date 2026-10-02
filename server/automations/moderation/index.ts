import { createAutomationRegistry } from "../registry";
import { claimSubmitScoreAutomation } from "./claim-submit-score";
import { claimScoreHourlyAutomation } from "./claim-score-hourly";
import { claimScoreWarmAutomation } from "./claim-score-warm";
import { verificationHeldListingActivationAutomation } from "./verification-held-listing-activation";
import { pendingReportNotificationAutomation } from "./pending-report-notification";
import { contentFlagCreatedAutomation } from "./content-flag-created";
import { suspensionSessionCleanupAutomation } from "./suspension-session-cleanup";
import { passwordResetSessionPurgeAutomation } from "./password-reset-session-purge";
import { rateLimiterCleanupAutomation } from "./rate-limiter-cleanup";
import { internalLimiterCleanupAutomation } from "./internal-limiter-cleanup";
import { messageLimiterCleanupAutomation } from "./message-limiter-cleanup";

export const moderationAutomations = [
  claimSubmitScoreAutomation,
  claimScoreHourlyAutomation,
  claimScoreWarmAutomation,
  verificationHeldListingActivationAutomation,
  pendingReportNotificationAutomation,
  contentFlagCreatedAutomation,
  suspensionSessionCleanupAutomation,
  passwordResetSessionPurgeAutomation,
  rateLimiterCleanupAutomation,
  internalLimiterCleanupAutomation,
  messageLimiterCleanupAutomation,
] as const;

export const moderationAutomationRegistry = createAutomationRegistry(moderationAutomations);

export {
  claimSubmitScoreAutomation,
  claimScoreHourlyAutomation,
  claimScoreWarmAutomation,
  verificationHeldListingActivationAutomation,
  pendingReportNotificationAutomation,
  contentFlagCreatedAutomation,
  suspensionSessionCleanupAutomation,
  passwordResetSessionPurgeAutomation,
  rateLimiterCleanupAutomation,
  internalLimiterCleanupAutomation,
  messageLimiterCleanupAutomation,
};