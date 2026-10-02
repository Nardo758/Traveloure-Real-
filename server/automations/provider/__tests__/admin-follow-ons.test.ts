import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import * as ts from "typescript";
import { dispatchAutomationEvent } from "../../event-dispatcher";
import { createAutomationRegistry } from "../../registry";
import { providerAdminAutomations } from "../admin-index";

const registry = createAutomationRegistry(providerAdminAutomations);

test("admin follow-on metadata is limited to six enabled provider nodes", () => {
  assert.equal(providerAdminAutomations.length, 6);
  assert.equal(registry.byId.size, 6);
  assert.deepEqual([...registry.byId.keys()].sort(), [
    "provider.expert-application-decision-follow-ons",
    "provider.expert-rejection-feedback-notification",
    "provider.listing-review-decision-notification",
    "provider.provider-application-decision-follow-ons",
    "provider.provider-rejection-feedback-follow-ons",
    "provider.verification-decision-email",
  ]);
  for (const definition of providerAdminAutomations) {
    assert.equal(definition.domain, "provider");
    assert.equal(definition.enabled, true);
    assert.equal(definition.delay, null);
    assert.deepEqual(definition.cancels, []);
    assert.ok(definition.condition.description.length > 0);
    assert.ok(definition.actionGuard.length > 0);
    assert.ok(definition.retryPolicy.length > 0);
    assert.ok(definition.failureBehavior.length > 0);
  }
  assert.match(registry.byId.get("provider.listing-review-decision-notification")!.idempotencyKey!, /SQL unique dedupe_key/);
  assert.equal(registry.byId.get("provider.expert-rejection-feedback-notification")!.idempotencyKey, null);
});

test("dispatch gates existing decision/request context and preserves callback result, order, and errors", async () => {
  const calls: string[] = [];
  const callback = async () => {
    calls.push("notification");
    calls.push("email-scheduled");
    return "unchanged-result";
  };

  assert.deepEqual(await dispatchAutomationEvent(
    registry,
    "provider.expert-application-decision-follow-ons",
    { event: "expert.application.decision", applicationId: "app-1", userId: "user-1", decision: "approved" },
    callback,
  ), { executed: false, reason: "condition" });
  assert.deepEqual(await dispatchAutomationEvent(
    registry,
    "provider.expert-application-decision-follow-ons",
    {
      event: "expert.application.decision",
      applicationId: "app-1",
      userId: "user-1",
      decision: "approved",
      enteredTerminalStatus: true,
    },
    callback,
  ), { executed: true, result: "unchanged-result", actionOutcome: "success" });
  assert.deepEqual(calls, ["notification", "email-scheduled"]);

  assert.deepEqual(await dispatchAutomationEvent(
    registry,
    "provider.provider-rejection-feedback-follow-ons",
    {
      event: "provider.application.rejection-feedback-updated",
      applicationId: "app-2",
      userId: "user-2",
      requestedContext: "rejection-feedback-update",
    },
    callback,
  ), { executed: true, result: "unchanged-result", actionOutcome: "success" });
  assert.deepEqual(await dispatchAutomationEvent(
    registry,
    "provider.provider-rejection-feedback-follow-ons",
    {
      event: "provider.application.rejection-feedback-updated",
      applicationId: "app-2",
      userId: "user-2",
      requestedContext: "rejection-feedback-update",
    },
    callback,
  ), { executed: true, result: "unchanged-result", actionOutcome: "success" });
  assert.deepEqual(await dispatchAutomationEvent(
    registry,
    "provider.provider-rejection-feedback-follow-ons",
    {
      event: "provider.application.rejection-feedback-updated",
      applicationId: "app-2",
      userId: "user-2",
      requestedContext: "different-request",
    },
    callback,
  ), { executed: false, reason: "condition" });
  assert.deepEqual(calls, [
    "notification", "email-scheduled",
    "notification", "email-scheduled",
    "notification", "email-scheduled",
  ]);

  assert.deepEqual(await dispatchAutomationEvent(
    registry,
    "provider.listing-review-decision-notification",
    {
      event: "provider.listing-review.decision-notification",
      userId: "user-4",
      serviceId: "service-4",
      dedupeKey: "service:service-4:approved",
      requestedContext: "listing-review-decision-notification",
    },
    () => {
      calls.push("listing-insert");
      return "insert-attempted";
    },
  ), { executed: true, result: "insert-attempted", actionOutcome: "success" });
  assert.equal(calls.at(-1), "listing-insert");

  await assert.rejects(dispatchAutomationEvent(
    registry,
    "provider.expert-rejection-feedback-notification",
    {
      event: "expert.application.rejection-feedback-updated",
      applicationId: "app-3",
      userId: "user-3",
      requestedContext: "rejection-feedback-update",
    },
    async () => {
      calls.push("failing-notification");
      throw new Error("existing insert failure");
    },
  ), /existing insert failure/);
  assert.deepEqual(calls.at(-1), "failing-notification");
});

test("admin routes dispatch only existing notification/email groups and leave decisions outside", () => {
  const source = readFileSync(join(process.cwd(), "server/routes/admin.routes.ts"), "utf8");
  const sourceFile = ts.createSourceFile(
    "admin.routes.ts",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  assert.deepEqual(sourceFile.parseDiagnostics, [], "admin route source should parse as TypeScript");
  const dispatchCalls: ts.CallExpression[] = [];
  const collectDispatchCalls = (node: ts.Node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) &&
        node.expression.text === "dispatchProviderEvent") {
      dispatchCalls.push(node);
    }
    ts.forEachChild(node, collectDispatchCalls);
  };
  collectDispatchCalls(sourceFile);
  const dispatchCounts = new Map<string, number>();
  for (const call of dispatchCalls) {
    const nodeId = call.arguments[0];
    assert.ok(nodeId && ts.isStringLiteral(nodeId), "provider dispatch must use a stable literal node id");
    dispatchCounts.set(nodeId.text, (dispatchCounts.get(nodeId.text) ?? 0) + 1);
    assert.ok(call.arguments[4] && (ts.isArrowFunction(call.arguments[4]) || ts.isFunctionExpression(call.arguments[4])),
      "existing follow-on must remain a single callback passed to the dispatcher");
  }
  assert.equal(dispatchCalls.length, 8);
  assert.deepEqual([...dispatchCounts.entries()].sort(([a], [b]) => a.localeCompare(b)), [
    ["provider.expert-application-decision-follow-ons", 2],
    ["provider.expert-rejection-feedback-notification", 1],
    ["provider.listing-review-decision-notification", 1],
    ["provider.provider-application-decision-follow-ons", 2],
    ["provider.provider-rejection-feedback-follow-ons", 1],
    ["provider.verification-decision-email", 1],
  ]);
  const section = (startMarker: string, endMarker: string) => {
    const start = source.indexOf(startMarker);
    const end = source.indexOf(endMarker, start);
    assert.ok(start >= 0 && end > start, `missing route section ${startMarker}`);
    return source.slice(start, end);
  };

  const expertDecision = section(
    'router.patch("/api/admin/expert-applications/:id/status"',
    'router.patch("/api/admin/expert-applications/:id/rejection-reason"',
  );
  assert.match(expertDecision, /updateLocalExpertFormStatus/);
  assert.match(expertDecision, /updateUserRole/);
  assert.match(expertDecision, /revert form status/);
  assert.match(expertDecision, /if \(enteredStatus\(updated, "approved"\)\)[\s\S]*?await dispatchProviderEvent\(\s*"provider\.expert-application-decision-follow-ons"/);
  assert.match(expertDecision, /status === "rejected" && enteredStatus\(updated, "rejected"\)[\s\S]*?await dispatchProviderEvent\(\s*"provider\.expert-application-decision-follow-ons"/);
  assert.equal((expertDecision.match(/provider\.expert-application-decision-follow-ons/g) ?? []).length, 2);

  const expertFeedback = section(
    'router.patch("/api/admin/expert-applications/:id/rejection-reason"',
    'router.patch("/api/admin/users/:id/verification"',
  );
  assert.match(expertFeedback, /updateLocalExpertFormRejectionMessage[\s\S]*?await dispatchProviderEvent\(\s*"provider\.expert-rejection-feedback-notification"/);

  const verification = section(
    'router.patch("/api/admin/users/:id/verification"',
    'router.patch("/api/admin/users/:id/commission-override"',
  );
  assert.match(verification, /await storage\.updateProviderVerification[\s\S]*?decision !== target\.priorStatus[\s\S]*?const email = target\.email;[\s\S]*?if \(email\)/);
  assert.match(verification, /sendVerificationDecisionEmail\([\s\S]*?\)\.catch\(\(e: any\)/);
  assert.equal((verification.match(/provider\.verification-decision-email/g) ?? []).length, 1);

  const providerDecision = section(
    'router.patch("/api/admin/provider-applications/:id/status"',
    'router.patch("/api/admin/provider-applications/:id/rejection-reason"',
  );
  assert.match(providerDecision, /updateServiceProviderFormStatus/);
  assert.match(providerDecision, /updateUserRole/);
  assert.match(providerDecision, /revert provider form status/);
  assert.match(providerDecision, /if \(enteredStatus\(updated, "approved"\)\)[\s\S]*?await dispatchProviderEvent\(\s*"provider\.provider-application-decision-follow-ons"/);
  assert.match(providerDecision, /status === "rejected" && enteredStatus\(updated, "rejected"\)[\s\S]*?await dispatchProviderEvent\(\s*"provider\.provider-application-decision-follow-ons"/);
  assert.equal((providerDecision.match(/provider\.provider-application-decision-follow-ons/g) ?? []).length, 2);

  const providerFeedback = section(
    'router.patch("/api/admin/provider-applications/:id/rejection-reason"',
    'router.post("/api/admin/service-templates"',
  );
  assert.match(providerFeedback, /updateServiceProviderFormRejectionMessage[\s\S]*?await dispatchProviderEvent\(\s*"provider\.provider-rejection-feedback-follow-ons"/);

  const listingHelper = section(
    "async function notifyListingDecision(opts:",
    'router.get("/api/admin/provider-services/pending"',
  );
  assert.match(listingHelper, /try \{[\s\S]*?await dispatchProviderEvent\(\s*"provider\.listing-review-decision-notification"[\s\S]*?storage\.createNotification\([\s\S]*?catch \(err: any\)/);
  assert.match(listingHelper, /pgCode !== "23505"/);

  const listingDecisions = section(
    'router.post("/api/admin/provider-services/:id/approve"',
    "// === Expert Templates",
  );
  assert.match(listingDecisions, /approveProviderServiceListing[\s\S]*?await notifyListingDecision/);
  assert.match(listingDecisions, /rejectProviderServiceListing[\s\S]*?await notifyListingDecision/);
  assert.doesNotMatch(listingDecisions, /dispatchProviderEvent/);
  assert.match(listingDecisions, /recordAdminAudit/);
});

test("all six definitions document real guard semantics and no retry guarantee", () => {
  const expertDecision = registry.byId.get("provider.expert-application-decision-follow-ons")!;
  const providerDecision = registry.byId.get("provider.provider-application-decision-follow-ons")!;
  const expertFeedback = registry.byId.get("provider.expert-rejection-feedback-notification")!;
  const providerFeedback = registry.byId.get("provider.provider-rejection-feedback-follow-ons")!;
  const verification = registry.byId.get("provider.verification-decision-email")!;
  const listing = registry.byId.get("provider.listing-review-decision-notification")!;
  assert.match(expertDecision.actionGuard, /enteredStatus/);
  assert.match(providerDecision.actionGuard, /enteredStatus/);
  assert.match(expertFeedback.condition.description, /repeating the update repeats its notice/);
  assert.match(providerFeedback.condition.description, /repeats both follow-ons/);
  assert.match(verification.condition.description, /differs from the previously-read status/);
  assert.match(listing.actionGuard, /unique-violation interpretation/);
  for (const definition of [expertDecision, providerDecision, expertFeedback, providerFeedback, verification, listing]) {
    assert.match(definition.retryPolicy, /no (?:durable )?retry/i);
    assert.equal(definition.delay, null);
  }
});