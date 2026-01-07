import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "http";
import { storage } from "./storage";
import { log } from "./index";

interface ChatMessage {
  type: "chat" | "typing" | "read" | "join" | "leave";
  chatId?: string;
  senderId: string;
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

export function setupWebSocket(server: Server) {
  const wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", (ws, req) => {
    let userId: string | null = null;

    ws.on("message", async (data) => {
      try {
        const message = JSON.parse(data.toString()) as ChatMessage;

        switch (message.type) {
          case "join":
            userId = message.senderId;
            clients.set(userId, {
              ws,
              userId,
              activeChats: new Set(),
            });
            log(`User ${userId} connected to WebSocket`);
            
            ws.send(JSON.stringify({
              type: "connected",
              userId,
              timestamp: new Date().toISOString(),
            }));
            break;

          case "chat":
            if (!userId || !message.recipientId || !message.content) {
              ws.send(JSON.stringify({
                type: "error",
                error: "Missing required fields for chat message",
              }));
              break;
            }
            
            try {
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
              console.error("Failed to save chat message:", err);
              ws.send(JSON.stringify({
                type: "error",
                error: "Failed to send message",
              }));
            }
            break;

          case "typing":
            if (!userId || !message.recipientId) break;
            
            const typingRecipient = clients.get(message.recipientId);
            if (typingRecipient && typingRecipient.ws.readyState === WebSocket.OPEN) {
              typingRecipient.ws.send(JSON.stringify({
                type: "typing",
                senderId: userId,
                timestamp: new Date().toISOString(),
              }));
            }
            break;

          case "read":
            if (!userId || !message.chatId) break;
            
            break;

          default:
            break;
        }
      } catch (err) {
        console.error("WebSocket message error:", err);
      }
    });

    ws.on("close", () => {
      if (userId) {
        clients.delete(userId);
        log(`User ${userId} disconnected from WebSocket`);
      }
    });

    ws.on("error", (err) => {
      console.error("WebSocket error:", err);
      if (userId) {
        clients.delete(userId);
      }
    });
  });

  log("WebSocket server initialized on /ws");
  return wss;
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
