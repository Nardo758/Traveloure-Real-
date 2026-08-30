---
name: Realtime message delivery
description: Which send paths live-push chat messages to an open recipient client, and how the chat UI actually re-renders.
---

ALL message write paths now live-push a `{type:"chat",...}` frame to the recipient's connected ws client: the /ws handler relays directly, and the HTTP paths (POST /api/messages, canonical /api/chats, /api/chat/start) call broadcastToUser after persisting. The recipient's chat page renders via refetch() triggered by the frame — the `realtimeMessages` state is dead (never rendered).

**Why:** HTTP sends used to persist without notifying ws clients (no polling either), so recipients with the thread open saw nothing until reload. This was a real production path — the expert client-detail composer always sends via HTTP, and the chat page's ws client gives up after 5 failed reconnects. The client's short-recipient-id "demo expert" HTTP branch is dead legacy (all users get UUIDs).

**How to apply:** any NEW message write path must also broadcastToUser with the same frame shape, or recipients silently lose realtime. Don't broadcast inside storage.createChat — the /ws handler already relays, so that would double-push. Tester caveat: the Playwright tester's proxied browser can fail wss:// handshakes and second-context navigations (ERR_TIMED_OUT) — verify relay with raw node ws clients instead.
