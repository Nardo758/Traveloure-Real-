import assert from "node:assert/strict";
import test from "node:test";
import { createAutomationRegistry } from "../../registry";
import { coreMessages } from "../_core-index";
import {
  dispatchMessagingProducer,
  producerAutomations,
  wrapEmailProviderTransport,
} from "../producer-index";

test("messaging producer definitions register ten unique active boundaries with welcome cancellation dependencies", () => {
  const reminders = coreMessages.filter((message) => message.kind.startsWith("verify_reminder_")).map((message) => message.node);
  const registry = createAutomationRegistry([...producerAutomations, ...reminders]);
  assert.deepEqual(Array.from(registry.byId.keys()).slice(0, producerAutomations.length), [
    "messaging.auth-password-reset-email",
    "messaging.auth-verification-email",
    "messaging.auth-welcome-email",
    "messaging.plan-delivered-email",
    "messaging.plan-approved-email",
    "messaging.plan-changes-requested-email",
    "messaging.plan-suggestion-email",
    "messaging.activity-email",
    "messaging.guest-invite-send",
    "messaging.email-provider-transport",
  ]);
  assert.equal(producerAutomations.every((node) => node.trigger.kind === "event"), true);
  const transport = producerAutomations.find((node) => node.id === "messaging.email-provider-transport")!;
  assert.deepEqual(transport.trigger, { kind: "event", events: ["email.provider_send"] });
  assert.equal(transport.condition.evaluate({ providerConfigured: true }), true);
  assert.equal(transport.condition.evaluate({ providerConfigured: false }), false);
  assert.equal(transport.actionOutcome?.({ data: { id: "ok" }, error: null }, {}), "success");
  assert.equal(transport.actionOutcome?.({ data: null, error: { message: "rejected" } }, {}), "failure");
});

test("producer adapter forwards its stable ID and preserves result via a mocked dispatcher", async () => {
  for (const definition of producerAutomations) {
    let dispatcherCalls = 0;
    let actionCalls = 0;
    const event = definition.trigger.kind === "event" ? definition.trigger.events[0] : "";
    const result = await dispatchMessagingProducer(
      definition,
      async <T>(id, dispatchedEvent, payload, context, action) => {
        dispatcherCalls++;
        assert.equal(id, definition.id);
        assert.equal(dispatchedEvent, event);
        assert.deepEqual(payload, { producer: definition.id });
        assert.deepEqual(context, { test: true });
        return action();
      },
      event,
      { producer: definition.id },
      { test: true },
      () => {
        actionCalls++;
        return `result:${definition.id}`;
      },
    );
    assert.equal(result, `result:${definition.id}`);
    assert.equal(dispatcherCalls, 1);
    assert.equal(actionCalls, 1);
  }
});

test("provider transport adapter keeps mocked SDK arguments and response unchanged", async () => {
  const sdkResponse = { data: { id: "provider-id" }, error: null };
  const sdkErrorResponse = { data: null, error: { message: "mock rejected" } };
  const sdkArgs: [{ to: string; subject: string }, { idempotencyKey: string }] = [
    { to: "test@example.invalid", subject: "test" },
    { idempotencyKey: "sdk-key" },
  ];
  let receivedArgs: unknown[] = [];
  let dispatcherCalls = 0;
  const wrapped = wrapEmailProviderTransport(
    async (...args: typeof sdkArgs) => {
      receivedArgs = args;
      return sdkResponse;
    },
    async <T>(id, event, payload, context, action) => {
      dispatcherCalls++;
      assert.equal(id, "messaging.email-provider-transport");
      assert.equal(event, "email.provider_send");
      assert.equal(payload, null);
      assert.deepEqual(context, { providerConfigured: true });
      return action();
    },
  );

  assert.equal(await wrapped(...sdkArgs), sdkResponse);
  assert.deepEqual(receivedArgs, sdkArgs);
  assert.equal(dispatcherCalls, 1);
  const metadataWrapped = wrapEmailProviderTransport(
    async (_request: { to: string }, _options: { idempotencyKey: string }) => sdkErrorResponse,
    async <T>(_id, _event, _payload, _context, action) => action(),
  );
  const response = await metadataWrapped(...sdkArgs);
  assert.equal(response, sdkErrorResponse);
  const transport = producerAutomations.find((node) => node.id === "messaging.email-provider-transport")!;
  assert.equal(transport.actionOutcome?.(response, {}), "failure");
});

test("provider transport adapter propagates original SDK errors unchanged", async () => {
  const sdkError = new Error("mock provider rejection");
  const wrapped = wrapEmailProviderTransport(
    async (_request: { to: string }) => {
      throw sdkError;
    },
    async <T>(_id, _event, _payload, _context, action) => action(),
  );
  await assert.rejects(wrapped({ to: "test@example.invalid" }), (error) => error === sdkError);
});