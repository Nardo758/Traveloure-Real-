import { checkoutClaimSweepAutomation } from "./checkout-claim-sweep";
import { checkoutPaidPromotionAutomation } from "./checkout-paid-promotion";
import { balancePaidPromotionAutomation } from "./balance-paid-promotion";
import { lateSuccessRefundAutomation } from "./late-success-refund";
import { connectDisputeLifecycleAutomation } from "./connect-dispute-lifecycle";
import { connectPaymentIntentFailedAutomation } from "./connect-payment-intent-failed";
import { connectPaymentIntentSucceededAutomation } from "./connect-payment-intent-succeeded";
import { connectTransferStatusAutomation } from "./connect-transfer-status";
import { bundlePartialSettlementAutomation } from "./bundle-partial-settlement";
import { earningsReleaseAutomation } from "./earnings-release";
import { affiliateAdminReconciliationViewAutomation } from "./affiliate-admin-reconciliation-view";
import { affiliateExactReportAdoptionAutomation } from "./affiliate-exact-report-adoption";
import { affiliateBookingPurchaseLedgerAutomation } from "./affiliate-booking-purchase-ledger";
import { partnerizeCampaignSyncAutomation } from "./partnerize-campaign-sync";
import { partnerizeReportPollAutomation } from "./partnerize-report-poll";
import { platformChargeRefundedAutomation } from "./platform-charge-refunded";
import { platformCheckoutSessionCompletedAutomation } from "./platform-checkout-session-completed";
import { platformPaymentIntentCanceledAutomation } from "./platform-payment-intent-canceled";
import { platformPaymentIntentFailedAutomation } from "./platform-payment-intent-failed";
import { platformPaymentIntentRequiresActionAutomation } from "./platform-payment-intent-requires-action";
import { platformPaymentIntentSucceededAutomation } from "./platform-payment-intent-succeeded";
import { readyMadePurchaseFulfilmentAutomation } from "./ready-made-purchase-fulfilment";
import { platformLegacyBookingSuccessAutomation } from "./platform-legacy-booking-success";
import { platformStripeBankPayoutAlertAutomation } from "./platform-stripe-bank-payout-alert";
import { platformStripeDisputeLifecycleAutomation } from "./platform-stripe-dispute-lifecycle";
import { platformSubscriptionMembershipAutomation } from "./platform-subscription-membership";
import { stripeReconciliationAutomation } from "./stripe-reconciliation";
import { stripeReconciliationManualAutomation } from "./stripe-reconciliation-manual";
import { stripeConnectReminderAutomation } from "./stripe-connect-reminder";
import { travelpayoutsReportPollAutomation } from "./travelpayouts-report-poll";
import { createAutomationRegistry } from "../registry";

export const paymentAutomations = [
  stripeReconciliationAutomation,
  stripeReconciliationManualAutomation,
  checkoutClaimSweepAutomation,
  checkoutPaidPromotionAutomation,
  balancePaidPromotionAutomation,
  lateSuccessRefundAutomation,
  earningsReleaseAutomation,
  travelpayoutsReportPollAutomation,
  bundlePartialSettlementAutomation,
  partnerizeCampaignSyncAutomation,
  partnerizeReportPollAutomation,
  stripeConnectReminderAutomation,
  platformPaymentIntentSucceededAutomation,
  readyMadePurchaseFulfilmentAutomation,
  platformLegacyBookingSuccessAutomation,
  platformPaymentIntentFailedAutomation,
  platformPaymentIntentCanceledAutomation,
  platformPaymentIntentRequiresActionAutomation,
  platformChargeRefundedAutomation,
  platformCheckoutSessionCompletedAutomation,
  platformSubscriptionMembershipAutomation,
  connectPaymentIntentSucceededAutomation,
  connectPaymentIntentFailedAutomation,
  connectDisputeLifecycleAutomation,
  connectTransferStatusAutomation,
  platformStripeDisputeLifecycleAutomation,
  platformStripeBankPayoutAlertAutomation,
  affiliateBookingPurchaseLedgerAutomation,
  affiliateAdminReconciliationViewAutomation,
  affiliateExactReportAdoptionAutomation,
] as const;

export const paymentAutomationRegistry = createAutomationRegistry(paymentAutomations);
export {
  affiliateAdminReconciliationViewAutomation,
  affiliateExactReportAdoptionAutomation,
  affiliateBookingPurchaseLedgerAutomation,
  bundlePartialSettlementAutomation,
  connectDisputeLifecycleAutomation,
  connectPaymentIntentFailedAutomation,
  connectPaymentIntentSucceededAutomation,
  connectTransferStatusAutomation,
  earningsReleaseAutomation,
  partnerizeCampaignSyncAutomation,
  partnerizeReportPollAutomation,
  platformChargeRefundedAutomation,
  platformCheckoutSessionCompletedAutomation,
  platformPaymentIntentCanceledAutomation,
  platformPaymentIntentFailedAutomation,
  platformPaymentIntentRequiresActionAutomation,
  platformPaymentIntentSucceededAutomation,
  platformStripeBankPayoutAlertAutomation,
  platformStripeDisputeLifecycleAutomation,
  platformSubscriptionMembershipAutomation,
  stripeConnectReminderAutomation,
  stripeReconciliationAutomation,
  stripeReconciliationManualAutomation,
  travelpayoutsReportPollAutomation,
  checkoutClaimSweepAutomation,
  checkoutPaidPromotionAutomation,
  balancePaidPromotionAutomation,
  lateSuccessRefundAutomation,
  readyMadePurchaseFulfilmentAutomation,
  platformLegacyBookingSuccessAutomation,
};