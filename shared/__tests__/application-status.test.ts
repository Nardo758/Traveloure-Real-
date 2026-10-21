/**
 * S-20 / S-17: one application timeline, draft-only writes for a pending account,
 * and a denied page that says why.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  accessDeniedCopy,
  buildExpertApplicationTimeline,
  buildProviderApplicationTimeline,
  currentStepCount,
  listingWriteRefusal,
  type ExpertApplicationFacts,
  type ProviderApplicationFacts,
  type SupplyWriteAccount,
} from "../application-status";

function expert(over: Partial<ExpertApplicationFacts> = {}): ExpertApplicationFacts {
  return {
    hasForm: true,
    formStatus: "pending",
    destinationsCount: 1,
    specialtiesCount: 0,
    hasBio: true,
    hasPortfolio: false,
    identityStatus: "pending",
    ...over,
  };
}

function provider(over: Partial<ProviderApplicationFacts> = {}): ProviderApplicationFacts {
  return {
    hasForm: true,
    formStatus: "pending",
    hasServiceOffers: false,
    hasOfferingTypeKey: false,
    hasDescription: true,
    hasLocation: true,
    identityStatus: "pending",
    businessStatus: "pending",
    ...over,
  };
}

function assertOneCurrent(steps: { status: string }[]) {
  assert.ok(currentStepCount(steps as never) <= 1);
  const active = steps.filter((s) => s.status === "in_progress");
  assert.ok(active.length <= 1);
}

test("a missing expert form is not under review", () => {
  const timeline = buildExpertApplicationTimeline(expert({ hasForm: false, formStatus: null, destinationsCount: 0, hasBio: false }));
  assert.equal(timeline.phase, "not_started");
  assert.equal(timeline.phaseTitle, "Not started");
  assert.equal(timeline.currentStepId, null);
  assert.ok(timeline.steps.every((s) => s.status === "pending"));
  assert.equal(currentStepCount(timeline.steps), 0);
  assert.match(timeline.phaseDetail, /Nothing is in review yet/);
});

test("provider categories complete from a description, not a missing serviceType column", () => {
  const timeline = buildProviderApplicationTimeline(provider());
  const categories = timeline.steps.find((s) => s.title === "Service Categories");
  const location = timeline.steps.find((s) => s.title === "Location & Documentation");
  const identity = timeline.steps.find((s) => s.title === "Owner Identity Verification");
  const business = timeline.steps.find((s) => s.title === "Business Verification");
  assert.equal(categories?.status, "completed");
  assert.equal(location?.status, "completed");
  assert.equal(identity?.status, "in_progress");
  assert.equal(business?.status, "pending");
  assert.equal(timeline.phase, "action_needed");
  assert.equal(timeline.currentStepId, identity?.id);
  assertOneCurrent(timeline.steps);
  assert.match(timeline.phaseDetail, /Verify your identity next/);
});

test("business verification is not a second current step while identity is open", () => {
  const timeline = buildProviderApplicationTimeline(provider({ identityStatus: "processing", businessStatus: "pending" }));
  assert.equal(timeline.phase, "under_review");
  assert.match(timeline.phaseDetail, /not with the review team yet/);
  assert.equal(timeline.steps.filter((s) => s.status === "in_progress").length, 1);
  assert.equal(timeline.steps.find((s) => s.title === "Business Verification")?.status, "pending");
  assert.equal(timeline.steps.find((s) => s.title === "Admin Review")?.status, "pending");
});

test("admin review waits only after identity and business are verified", () => {
  const timeline = buildProviderApplicationTimeline(provider({
    identityStatus: "verified",
    businessStatus: "verified",
  }));
  assert.equal(timeline.phase, "under_review");
  assert.equal(timeline.steps.find((s) => s.title === "Admin Review")?.status, "in_progress");
  assert.equal(timeline.steps.find((s) => s.title === "Account Activation")?.status, "pending");
  assert.match(timeline.phaseDetail, /under review/);
  assertOneCurrent(timeline.steps);
});

test("a rejected application does not mark review completed", () => {
  const timeline = buildExpertApplicationTimeline(expert({ formStatus: "rejected", identityStatus: "pending", destinationsCount: 0, hasBio: false }));
  const review = timeline.steps.find((s) => s.title === "Admin Review");
  assert.equal(timeline.phase, "rejected");
  assert.equal(timeline.phaseTitle, "Not Approved");
  assert.equal(review?.status, "failed");
  assert.equal(timeline.currentStepId, review?.id);
  assert.equal(timeline.steps.find((s) => s.title === "Account Activation")?.status, "pending");
  assert.equal(timeline.steps.filter((s) => s.status === "in_progress").length, 0);
  assert.equal(timeline.steps.find((s) => s.title === "Expertise & Destinations")?.status, "pending");
});

test("approval completes the timeline even when identity is still pending", () => {
  const timeline = buildExpertApplicationTimeline(expert({ formStatus: "approved", identityStatus: "pending" }));
  assert.equal(timeline.phase, "approved");
  assert.equal(timeline.phaseTitle, "Approved");
  assert.equal(timeline.currentStepId, null);
  assert.ok(timeline.steps.every((s) => s.status === "completed"));
  assert.match(timeline.phaseDetail, /approved/);
});

test("an open expert profile step is the only current step", () => {
  const timeline = buildExpertApplicationTimeline(expert({ destinationsCount: 0, specialtiesCount: 0, hasBio: false, hasPortfolio: false }));
  assert.equal(timeline.steps.find((s) => s.title === "Basic Information")?.status, "completed");
  assert.equal(timeline.steps.find((s) => s.title === "Expertise & Destinations")?.status, "in_progress");
  assert.equal(timeline.steps.find((s) => s.title === "Identity Verification")?.status, "pending");
  assert.equal(timeline.steps.find((s) => s.id === 4)?.note, undefined);
  assertOneCurrent(timeline.steps);
});

test("the identity note is only on the current open step", () => {
  const timeline = buildExpertApplicationTimeline(expert());
  const identity = timeline.steps.find((s) => s.title === "Identity Verification");
  assert.equal(identity?.status, "in_progress");
  assert.match(identity?.note ?? "", /Verify My Identity/);
  assert.equal(timeline.steps.filter((s) => s.note).length, 1);
});

test("pending accounts may save a draft and may not publish", () => {
  const pending: SupplyWriteAccount = {
    publishesFreely: false,
    canSaveDraftListing: true,
    phase: "under_review",
    applicationStatus: "pending",
  };
  assert.equal(listingWriteRefusal(pending, { draft: true, enteringReview: false, statusActive: false }), null);
  const refused = listingWriteRefusal(pending, { draft: false, enteringReview: true, statusActive: false });
  assert.equal(refused?.code, "APPLICATION_UNDER_REVIEW");
  assert.match(refused?.message ?? "", /save this as a draft/);
  assert.match(listingWriteRefusal(pending, { draft: false, enteringReview: false, statusActive: true })?.message ?? "", /cannot be published/);
});

test("a rejected or missing application cannot create a listing", () => {
  const rejected = listingWriteRefusal(
    { publishesFreely: false, canSaveDraftListing: false, phase: "rejected", applicationStatus: "rejected" },
    { draft: true, enteringReview: false, statusActive: false },
  );
  assert.equal(rejected?.code, "APPLICATION_NOT_APPROVED");
  const none = listingWriteRefusal(
    { publishesFreely: false, canSaveDraftListing: false, phase: "not_started", applicationStatus: null },
    { draft: true, enteringReview: false, statusActive: false },
  );
  assert.equal(none?.code, "APPLICATION_REQUIRED");
  assert.match(none?.message ?? "", /before creating a listing/);
});

test("an earner is not refused by the application gate", () => {
  assert.equal(
    listingWriteRefusal(
      { publishesFreely: true, canSaveDraftListing: false, phase: "approved", applicationStatus: "approved" },
      { draft: false, enteringReview: true, statusActive: true },
    ),
    null,
  );
});

test("access denied names an application under review and the draft that is still allowed", () => {
  const copy = accessDeniedCopy({
    requiredRole: "expert",
    userRole: "user",
    loadState: "ready",
    supply: { kind: "expert", phase: "under_review", canSaveDraftListing: true },
  });
  assert.match(copy.reason, /under review/);
  assert.match(copy.next, /draft listing/);
  assert.match(copy.next, /after approval/);
  assert.equal(copy.secondaryHref, "/dashboard/listing");
});

test("access denied for a missing application does not say under review", () => {
  const copy = accessDeniedCopy({
    requiredRole: "provider",
    userRole: "user",
    loadState: "ready",
    supply: { kind: null, phase: "not_started", canSaveDraftListing: false },
  });
  assert.match(copy.reason, /approved providers/);
  assert.doesNotMatch(copy.reason, /under review/);
  assert.equal(copy.secondaryHref, "/become-provider");
});

test("a provider who opens an expert page is sent to the provider console", () => {
  const copy = accessDeniedCopy({
    requiredRole: "expert",
    userRole: "service_provider",
    loadState: "ready",
    supply: null,
  });
  assert.match(copy.reason, /for experts/);
  assert.equal(copy.primaryHref, "/provider/dashboard");
});

test("an unknown role keeps the permission sentence", () => {
  const copy = accessDeniedCopy({
    requiredRole: "moderator",
    userRole: "user",
    loadState: "ready",
    supply: null,
  });
  assert.match(copy.reason, /don't have permission/);
});
