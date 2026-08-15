---
name: Realtime message delivery
description: Which send paths live-push chat messages to an open recipient client, and how the chat UI actually re-renders.
---

Live push to a recipient's open chat page happens ONLY when the sender goes through the /ws socket: the server relays the "chat" frame to the recipient's connected client, whose handler calls refetch() — the thread renders from the refetched `chats` query, NOT from the `realtimeMessages` state (dead state, never rendered).

**Why:** HTTP sends (POST /api/messages, /api/chats) persist but do not notify connected ws clients, and the chats query has no polling — so an HTTP-path send is invisible to an open recipient until reload. The chat UI's own send path falls back to HTTP when ws is disconnected or the recipient id is short/non-UUID (demo experts), silently losing realtime for the recipient.

**How to apply:** when testing or debugging "recipient doesn't see messages live," first check which send path the sender used. To make HTTP sends realtime, call broadcastToUser (exported by server/websocket.ts) from the HTTP paths. Also: the Playwright tester's proxied browser can fail wss:// handshakes and second-context navigations (ERR_TIMED_OUT) — verify server-side relay with raw node ws clients instead.
