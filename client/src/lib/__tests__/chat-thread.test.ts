import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { messageBelongsToPair } from "../chat-thread";

test("a message is in the thread only when both people are the pair", () => {
  assert.equal(
    messageBelongsToPair({ senderId: "traveler", receiverId: "aiko" }, "traveler", "aiko"),
    true,
  );
  assert.equal(
    messageBelongsToPair({ senderId: "aiko", receiverId: "traveler" }, "traveler", "aiko"),
    true,
  );
  assert.equal(
    messageBelongsToPair({ senderId: "traveler", receiverId: "someone-else" }, "traveler", "aiko"),
    false,
  );
  assert.equal(
    messageBelongsToPair({ senderId: "traveler", receiverId: null }, "traveler", "aiko"),
    false,
  );
});

test("the open thread filters /api/chats through that pair", () => {
  const src = readFileSync(new URL("../../pages/chat.tsx", import.meta.url), "utf8");
  assert.match(src, /messageBelongsToPair/);
  assert.match(src, /ref=\{messagesEndRef\}/);
});
