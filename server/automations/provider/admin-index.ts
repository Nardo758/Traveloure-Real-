import { providerExpertApplicationDecisionFollowOnsAutomation } from "./expert-application-decision-follow-ons";
import { providerExpertRejectionFeedbackNotificationAutomation } from "./expert-rejection-feedback-notification";
import { providerListingReviewDecisionNotificationAutomation } from "./listing-review-decision-notification";
import { providerProviderApplicationDecisionFollowOnsAutomation } from "./provider-application-decision-follow-ons";
import { providerProviderRejectionFeedbackFollowOnsAutomation } from "./provider-rejection-feedback-follow-ons";
import { providerVerificationDecisionEmailAutomation } from "./verification-decision-email";

export const providerAdminAutomations = [
  providerExpertApplicationDecisionFollowOnsAutomation,
  providerProviderApplicationDecisionFollowOnsAutomation,
  providerExpertRejectionFeedbackNotificationAutomation,
  providerProviderRejectionFeedbackFollowOnsAutomation,
  providerVerificationDecisionEmailAutomation,
  providerListingReviewDecisionNotificationAutomation,
] as const;

export {
  providerExpertApplicationDecisionFollowOnsAutomation,
  providerProviderApplicationDecisionFollowOnsAutomation,
  providerExpertRejectionFeedbackNotificationAutomation,
  providerProviderRejectionFeedbackFollowOnsAutomation,
  providerVerificationDecisionEmailAutomation,
  providerListingReviewDecisionNotificationAutomation,
};