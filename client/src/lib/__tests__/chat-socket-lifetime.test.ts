/**
 * The chat socket lives as long as the USER, and a message is never dropped because it is not
 * open (ledger `2026-09-24-zero-listing-message`).
 *
 * The chat page passed inline callbacks (`onConnected: () => {}`) into `useWebSocket`, whose
 * `connect` depended on them, so every re-render closed the socket and opened another; a send in
 * between found no open socket, `sendMessage` returned false, and `handleSend` did nothing — no
 * HTTP fallback and no error. A traveler's first message to an expert vanished.
 *   W1 `connect` depends on the user id only; the handlers are read through a ref.
 *   W2 a deliberate close (unmount / user change) clears `onclose` first, so it schedules no
 *      reconnect.
 *   W3 the chat page sends over HTTP whenever the socket send does not go out.
 *
 * Source pins (no DOM). Run: npx tsx --test client/src/lib/__tests__/chat-socket-lifetime.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

describe("chat socket lifetime", () => {
  it("W1 connect depends on the user only", () => {
    const src = read("hooks/use-websocket.ts");
    assert.match(src, /const connect = useCallback\([\s\S]*?\}, \[userId\]\);/);
    assert.ok(src.includes("handlersRef.current.onMessage?.("), "handlers are read through the ref");
    assert.ok(!/\}, \[userId, onMessage/.test(src), "no callback in connect's dependencies");
  });

  it("W2 a deliberate close schedules no reconnect", () => {
    const src = read("hooks/use-websocket.ts");
    assert.match(src, /wsRef\.current\.onclose = null;\s*wsRef\.current\.close\(\);/);
  });

  it("W3 a socket send that does not go out falls through to HTTP", () => {
    const src = read("pages/chat.tsx");
    assert.match(src, /if \(isConnected && recipientId\.length > 10 && wsSendMessage\(recipientId, currentMessage\)\) \{/);
    assert.ok(!/const success = wsSendMessage\(/.test(src), "the silent-drop branch is gone");
  });
});
