import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { dispatchAutomationEvent } from "../../event-dispatcher";
import { createAutomationRegistry } from "../../registry";
import { chatAutomations } from "../chat-index";

const registry = createAutomationRegistry(chatAutomations);

test("messaging chat boundary nodes are metadata-only and have stable unique identities", () => {
  assert.equal(chatAutomations.length, 4);
  assert.equal(registry.byId.size, 4);
  for (const definition of chatAutomations) {
    assert.equal(definition.domain, "messaging");
    assert.equal(definition.enabled, true);
    assert.equal(definition.delay, null);
    assert.deepEqual(definition.cancels, []);
    assert.equal(definition.idempotencyKey, null);
    assert.ok(definition.actionGuard.length > 0);
    assert.ok(definition.retryPolicy.length > 0);
    assert.ok(definition.failureBehavior.length > 0);
  }
});

test("post-persist follow-on callbacks are condition-gated and run once without changing results", async () => {
  let calls = 0;
  const callback = () => {
    calls += 1;
    return "scheduled";
  };

  assert.deepEqual(await dispatchAutomationEvent(
    registry,
    "messaging.chat-follow-ons",
    { event: "chat.created", chatId: "chat-1", receiverId: "recipient-1" },
    callback,
  ), { executed: true, result: "scheduled", actionOutcome: "success" });
  assert.deepEqual(await dispatchAutomationEvent(
    registry,
    "messaging.chat-follow-ons",
    { event: "chat.created", chatId: "chat-2" },
    callback,
  ), { executed: false, reason: "condition" });
  assert.deepEqual(await dispatchAutomationEvent(
    registry,
    "messaging.message-follow-ons",
    { event: "message.created", messageId: "message-1", senderId: "sender-1", recipientId: "recipient-1" },
    callback,
  ), { executed: true, result: "scheduled", actionOutcome: "success" });
  assert.deepEqual(await dispatchAutomationEvent(
    registry,
    "messaging.notification-create",
    { event: "notification.created", notificationId: "notification-1" },
    callback,
  ), { executed: true, result: "scheduled", actionOutcome: "success" });
  assert.equal(calls, 3);
});

test("chat realtime callback runs synchronously once and preserves its result", async () => {
  let delivered = 0;
  const pending = dispatchAutomationEvent(
    registry,
    "messaging.chat-realtime-fanout",
    { event: "chat.realtime.requested", transport: "websocket", recipientId: "recipient-1" },
    () => {
      delivered += 1;
      return "forwarded";
    },
  );
  assert.equal(delivered, 1);
  assert.deepEqual(await pending, { executed: true, result: "forwarded", actionOutcome: "success" });
  assert.equal(delivered, 1);
});

test("legacy POST /api/chat/start retains its guards and dispatches existing follow-ons and fanout", async () => {
  const source = readFileSync(join(process.cwd(), "server/routes/content.routes.ts"), "utf8");
  const start = source.indexOf('router.post("/api/chat/start"');
  const end = source.indexOf("// Instagram API routes", start);
  assert.ok(start >= 0 && end > start, "legacy chat-start route should remain in content.routes.ts");
  const route = source.slice(start, end);

  assert.match(route, /await getUserById\(expertId\)/);
  assert.match(route, /checkMessageRateLimit\(\{ senderId: userId, recipientId: expertId, isNewConversation, peerIp: req\.ip \}\)/);
  assert.match(route, /if \(await isBlockedBetween\(userId, expertId\)\)/);
  assert.match(route, /await insertExpertChat\(\{/);
  assert.match(route, /await dispatchMessagingEvent\(\s*"messaging\.message-follow-ons",\s*"message\.created"[\s\S]*?async \(\) => \{[\s\S]*?await insertChatNotification\([\s\S]*?void import\("\.\.\/services\/activity-email\.service"\)/);
  assert.match(route, /await dispatchMessagingEvent\(\s*"messaging\.chat-realtime-fanout",\s*"chat\.realtime\.requested"[\s\S]*?transport: "http"[\s\S]*?\(\) => broadcastToUser\(expertId, frame\)/);
  assert.equal((route.match(/broadcastToUser\(/g) ?? []).length, 1);
});

test("legacy start callback preserves notification/activity order and immediately fans out once", async () => {
  const order: string[] = [];
  await dispatchAutomationEvent(
    registry,
    "messaging.message-follow-ons",
    { event: "message.created", messageId: "legacy-chat-1", senderId: "sender-1", recipientId: "expert-1" },
    async () => {
      order.push("notification");
      order.push("activity-email-scheduled");
    },
  );
  const pendingFanout = dispatchAutomationEvent(
    registry,
    "messaging.chat-realtime-fanout",
    { event: "chat.realtime.requested", transport: "http", messageId: "legacy-chat-1", recipientId: "expert-1" },
    () => {
      order.push("frame");
    },
  );
  assert.deepEqual(order, ["notification", "activity-email-scheduled", "frame"]);
  await pendingFanout;
  assert.deepEqual(order, ["notification", "activity-email-scheduled", "frame"]);
});