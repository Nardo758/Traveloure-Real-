import { WebSocketServer, WebSocket } from "ws";
import type { Server, IncomingMessage } from "http";
import type { RequestHandler } from "express";
import { storage } from "./storage";
import { logger } from "./infrastructure/logger";
import { getUserId } from "./utils/auth";
import { hasExistingConversation } from "./services/messages.service";
import { checkMessageRateLimit } from "./infrastructure/message-rate-limiter";

// `log` previously came from "./index" — the only file in server/ importing back into
// the app entrypoint, which drags in and RUNS the entire bootstrap (migrations, DB
// seeding, its own httpServer.listen) merely by importing this module. That made the
// file impossible to import in isolation (e.g. for a test that boots setupWebSocket on
// an ephemeral port). Swapped for the same structured pino logger every other
// server/**/*.ts file already uses — same log output, no behavior change, no more
// circular bootstrap dependency. Imported from the concrete "./infrastructure/logger"
// module rather than the "./infrastructure" barrel: the barrel also re-exports the
// rate-limiter/metrics/health modules, and rate-limiter.ts starts a bare (non-`.unref()`d)
// `setInterval` as a side effect of being imported — harmless in the long-running server
// process, but it means anything importing the barrel (this file, or a test importing
// it) never lets the event loop go idle. Importing the concrete submodule gets the same
// logger without that side effect.
function log(message: string, source = "websocket") {
  logger.info({ source }, message);
}

interface ChatMessage {
  type: "chat" | "typing" | "read" | "join" | "leave";
  chatId?: string;
  // NEVER used for identity (MT-1). Retained only because existing clients still send it
  // in the "join"/"chat"/"typing" payload shape — the server ignores this field entirely.
  senderId?: string;
  recipientId?: string;
  content?: string;
  timestamp?: string;
}

interface ConnectedClient {
  ws: WebSocket;
  userId: string;
  activeChats: Set<string>;
}

const clients = new Map<string, ConnectedClient>();

/**
 * MT-1 fix: the socket used to trust a client-supplied `senderId` on `join` with no
 * session check — letting an unauthenticated raw WebSocket client impersonate any user
 * (write chats as them, and receive messages addressed to them). Identity is now
 * resolved exactly once, server-side, from the session cookie on the upgrade request —
 * the same session middleware `setupAuth` applies to HTTP routes — via `sessionMiddleware`,
 * passed in by the caller (`server/index.ts`) so this file has no auth-setup ordering
 * dependency. A connection that doesn't resolve a session user is sent an error and
 * closed (1008 "policy violation") BEFORE ever being added to `clients`.
 */
export function setupWebSocket(server: Server, sessionMiddleware: RequestHandler) {
  // Do not let `ws` own every HTTP upgrade on the shared server. Its built-in
  // `path` option rejects unmatched upgrades with 400, which prevents Vite's
  // `/vite-hmr` listener from receiving its own upgrade in development.
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (req, socket, head) => {
    const pathname = new URL(req.url ?? "/", "http://localhost").pathname;
    if (pathname !== "/ws") return;

    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req);
    });
  });

  wss.on("connection", (ws, req: IncomingMessage) => {
    // Real socket peer address (not a spoofable header) — scopes the messaging
    // rate-limiter's CI bypass to loopback only, matching the HTTP paths.
    const peerIp = req.socket?.remoteAddress ?? null;
    // The session lookup below is async (a real DB round-trip via connect-pg-simple),
    // but the WebSocket handshake itself already completed by the time "connection"
    // fires — a legitimate client (see client/src/hooks/use-websocket.ts) sends its
    // first message immediately on its own "open" event, which can land before this
    // callback runs. Buffer any message that arrives during the auth-pending window
    // instead of silently dropping it: an authenticated connection replays the buffer
    // into the real handler; an unauthenticated one discards it unprocessed (the
    // buffer is simply never replayed) — same "never process before auth" guarantee,
    // no lost first message for legitimate clients.
    const pending: Array<Parameters<Parameters<WebSocket["on"]>[1]>[0]> = [];
    let authPending = true;
    const bufferWhileAuthing = (data: unknown) => {
      if (authPending) pending.push(data as any);
    };
    ws.on("message", bufferWhileAuthing);

    // Run the app's real session middleware over the upgrade request with a stub
    // response — express-session reads/verifies the session cookie against the
    // `sessions` table and populates req.session; no HTTP response is ever sent
    // on this stub, so a no-op res is sufficient.
    sessionMiddleware(req as any, {} as any, () => {
      authPending = false;
      ws.off("message", bufferWhileAuthing);

      const sessionUser = (req as any).session?.passport?.user;
      // Replicate getUserId's exact precedence (claims?.sub ?? id) against the
      // session-stored passport user — serialize/deserialize are identity functions,
      // so req.session.passport.user IS the full user object getUserId expects.
      const userId = getUserId({ user: sessionUser } as any);

      if (!userId) {
        try {
          ws.send(JSON.stringify({ type: "error", error: "unauthenticated" }));
        } catch {
          // socket may already be closing; nothing to do
        }
        ws.close(1008, "unauthenticated");
        return; // `pending` is discarded here, unread — never processed.
      }

      handleAuthenticatedConnection(ws, userId, peerIp);
      for (const data of pending) {
        ws.emit("message", data);
      }
    });
  });

  log("WebSocket server initialized on /ws");
  return wss;
}

function handleAuthenticatedConnection(ws: WebSocket, userId: string, peerIp: string | null) {
  clients.set(userId, {
    ws,
    userId,
    activeChats: new Set(),
  });
  log(`User ${userId} connected to WebSocket`);

  ws.on("message", async (data) => {
    try {
      const message = JSON.parse(data.toString()) as ChatMessage;

      switch (message.type) {
        case "join":
          // Identity is already resolved from the session at connection time — this is
          // now just a client-ready ack. message.senderId is never read for identity.
          ws.send(JSON.stringify({
            type: "connected",
            userId,
            timestamp: new Date().toISOString(),
          }));
          break;

        case "chat": {
          if (!message.recipientId || !message.content) {
            ws.send(JSON.stringify({
              type: "error",
              error: "Missing required fields for chat message",
            }));
            break;
          }

          try {
            // Messaging rate limit (same limits as the HTTP send paths). On breach we
            // send an error frame instead of persisting, so socket sends can't bypass it.
            const isNewConversation = !(await hasExistingConversation(userId, message.recipientId));
            const rate = checkMessageRateLimit({ senderId: userId, recipientId: message.recipientId, isNewConversation, peerIp });
            if (!rate.allowed) {
              ws.send(JSON.stringify({
                type: "error",
                error: rate.message ?? "You're sending messages too quickly. Please slow down.",
                scope: rate.scope,
                retryAfter: rate.retryAfterSec,
              }));
              break;
            }

            // senderId is the session-resolved userId — a forged message.senderId in the
            // payload is never read (MT-1). storage.createChat is the shared write path
            // with POST /api/chats and also fires the MT-2 recipient notification.
            const savedMessage = await storage.createChat({
              message: message.content,
              senderId: userId,
              receiverId: message.recipientId,
            });

            const response = {
              type: "chat",
              id: savedMessage.id,
              senderId: userId,
              recipientId: message.recipientId,
              content: message.content,
              timestamp: savedMessage.createdAt?.toISOString() || new Date().toISOString(),
            };

            ws.send(JSON.stringify(response));

            const recipientClient = clients.get(message.recipientId);
            if (recipientClient && recipientClient.ws.readyState === WebSocket.OPEN) {
              recipientClient.ws.send(JSON.stringify(response));
            }
          } catch (err) {
            // Block enforcement: createChat throws a sentinel when a block row exists.
            // Surface a specific error type so the client can distinguish a policy
            // rejection from an infrastructure failure and show the right message.
            if ((err as any)?.code === "BLOCKED_USER") {
              ws.send(JSON.stringify({
                type: "error",
                errorCode: "BLOCKED_USER",
                error: "You cannot send messages to this user.",
              }));
              break;
            }
            console.error("Failed to save chat message:", err);
            ws.send(JSON.stringify({
              type: "error",
              error: "Failed to send message",
            }));
          }
          break;
        }

        case "typing": {
          if (!message.recipientId) break;

          const typingRecipient = clients.get(message.recipientId);
          if (typingRecipient && typingRecipient.ws.readyState === WebSocket.OPEN) {
            typingRecipient.ws.send(JSON.stringify({
              type: "typing",
              senderId: userId,
              timestamp: new Date().toISOString(),
            }));
          }
          break;
        }

        case "read":
          if (!message.chatId) break;
          break;

        default:
          break;
      }
    } catch (err) {
      console.error("WebSocket message error:", err);
    }
  });

  ws.on("close", () => {
    clients.delete(userId);
    log(`User ${userId} disconnected from WebSocket`);
  });

  ws.on("error", (err) => {
    console.error("WebSocket error:", err);
    clients.delete(userId);
  });
}

export function broadcastToUser(userId: string, message: object) {
  const client = clients.get(userId);
  if (client && client.ws.readyState === WebSocket.OPEN) {
    client.ws.send(JSON.stringify(message));
  }
}

export function getConnectedUsers(): string[] {
  return Array.from(clients.keys());
}
