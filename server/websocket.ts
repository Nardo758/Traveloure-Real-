import { WebSocketServer, WebSocket } from "ws";
import type { Server, IncomingMessage } from "http";
import { clerkMiddleware, getAuth } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import { getClerkProxyHost } from "./middlewares/clerkProxyMiddleware";
import { storage } from "./storage";
import { logger } from "./infrastructure/logger";
import { getUserId } from "./utils/auth";

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
 * resolved exactly once, server-side, from the Clerk session cookie on the upgrade
 * request. A connection that doesn't resolve a session user is sent an error and
 * closed (1008 "policy violation") BEFORE ever being added to `clients`.
 */
export function setupWebSocket(server: Server) {
  const wss = new WebSocketServer({ server, path: "/ws" });

  // Build a Clerk middleware instance once, shared across all WS upgrade requests.
  // Mirrors the configuration in server/index.ts so both halves agree on which
  // hostname is canonical for custom-domain / multi-domain setups.
  const clerkMw = clerkMiddleware((req: any) => ({
    publishableKey: publishableKeyFromHost(
      getClerkProxyHost(req) ?? "",
      process.env.CLERK_PUBLISHABLE_KEY,
    ),
  }));

  wss.on("connection", (ws, req: IncomingMessage) => {
    // The session lookup below is async (a real JWT verify via Clerk),
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

    // A minimal fake response object — Clerk middleware needs an express-like res to
    // set cookies/headers; WS upgrade has no HTTP response to send, so a no-op stub
    // is sufficient (Clerk only reads the request cookies in this path).
    const fakeRes: any = {
      setHeader: () => fakeRes,
      getHeader: () => undefined,
      removeHeader: () => fakeRes,
      on: () => fakeRes,
      once: () => fakeRes,
      emit: () => false,
      end: () => fakeRes,
      headersSent: false,
      writableEnded: false,
    };

    clerkMw(req as any, fakeRes, () => {
      authPending = false;
      ws.off("message", bufferWhileAuthing);

      const auth = getAuth(req as any);
      const userId = (auth?.sessionClaims as any)?.userId || auth?.userId || null;

      if (!userId) {
        try {
          ws.send(JSON.stringify({ type: "error", error: "unauthenticated" }));
        } catch {
          // socket may already be closing; nothing to do
        }
        ws.close(1008, "unauthenticated");
        return; // `pending` is discarded here, unread — never processed.
      }

      handleAuthenticatedConnection(ws, userId);
      for (const data of pending) {
        ws.emit("message", data);
      }
    });
  });

  log("WebSocket server initialized on /ws");
  return wss;
}

function handleAuthenticatedConnection(ws: WebSocket, userId: string) {
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
        case "join": {
          if (message.chatId) {
            const client = clients.get(userId);
            if (client) {
              client.activeChats.add(message.chatId);
            }
          }
          break;
        }

        case "leave": {
          if (message.chatId) {
            const client = clients.get(userId);
            if (client) {
              client.activeChats.delete(message.chatId);
            }
          }
          break;
        }

        case "chat": {
          // Client sends: { type: "chat", senderId, recipientId, content }
          // Server response: { type: "chat", id, senderId, recipientId, content, timestamp }
          if (!message.recipientId || !message.content) {
            break;
          }

          try {
            // Use the shared storage.createChat write path (same as POST /api/chats and
            // trips.routes.ts) so recipient notifications fire exactly once per message.
            // senderId is always the session-resolved userId (MT-1: never trusts client payload).
            const saved = await storage.createChat({
              message: message.content,
              senderId: userId,
              receiverId: message.recipientId,
            });

            const response = JSON.stringify({
              type: "chat",
              id: saved.id,
              senderId: userId,
              recipientId: message.recipientId,
              content: message.content,
              timestamp: saved.createdAt?.toISOString() || new Date().toISOString(),
            });

            // Confirm to sender
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(response);
            }

            // Deliver to recipient if online
            const recipientClient = clients.get(message.recipientId);
            if (recipientClient && recipientClient.ws.readyState === WebSocket.OPEN) {
              recipientClient.ws.send(response);
            }
          } catch (err) {
            log(`Error persisting chat message from ${userId}: ${err}`);
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: "error", error: "Failed to send message" }));
            }
          }
          break;
        }

        case "typing": {
          if (!message.recipientId) {
            break;
          }

          const recipientClient = clients.get(message.recipientId);
          if (recipientClient && recipientClient.ws.readyState === WebSocket.OPEN) {
            recipientClient.ws.send(
              JSON.stringify({
                type: "typing",
                senderId: userId,
                timestamp: new Date().toISOString(),
              })
            );
          }
          break;
        }

        case "read": {
          // No-op: read receipts are tracked via the REST API (/api/messages/read-all).
          // The WS "read" event is sent by clients for typing-style UX only; no DB write needed here.
          break;
        }
      }
    } catch (error) {
      log(`Error processing message from ${userId}: ${error}`);
    }
  });

  ws.on("close", () => {
    clients.delete(userId);
    log(`User ${userId} disconnected from WebSocket`);
  });

  ws.on("error", (error) => {
    log(`WebSocket error for user ${userId}: ${error}`);
    clients.delete(userId);
  });
}

export function sendWebSocketMessage(userId: string, message: object) {
  const client = clients.get(userId);
  if (client && client.ws.readyState === WebSocket.OPEN) {
    client.ws.send(JSON.stringify(message));
    return true;
  }
  return false;
}

export function broadcastToChat(chatId: string, message: object, excludeUserId?: string) {
  const outbound = JSON.stringify(message);
  for (const [userId, client] of Array.from(clients)) {
    if (excludeUserId && userId === excludeUserId) continue;
    if (client.activeChats.has(chatId) && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(outbound);
    }
  }
}
