import { useState, useEffect, useCallback, useRef } from "react";

interface ChatMessage {
  type: "chat" | "typing" | "read" | "connected" | "error";
  id?: string;
  senderId?: string;
  recipientId?: string;
  content?: string;
  timestamp?: string;
  userId?: string;
  error?: string;
}

interface UseWebSocketOptions {
  userId: string | undefined;
  onMessage?: (message: ChatMessage) => void;
  onTyping?: (senderId: string) => void;
  onConnected?: () => void;
  onError?: (error: string) => void;
}

export function useWebSocket({ userId, onMessage, onTyping, onConnected, onError }: UseWebSocketOptions) {
  const [isConnected, setIsConnected] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;

  const connect = useCallback(() => {
    if (!userId) return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
        setConnectionError(null);
        reconnectAttempts.current = 0;

        ws.send(JSON.stringify({
          type: "join",
          senderId: userId,
        }));
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data) as ChatMessage;

          switch (message.type) {
            case "connected":
              onConnected?.();
              break;
            case "chat":
              onMessage?.(message);
              break;
            case "typing":
              if (message.senderId) {
                onTyping?.(message.senderId);
              }
              break;
            case "error":
              if (message.error) {
                onError?.(message.error);
              }
              break;
          }
        } catch (err) {
          console.error("Failed to parse WebSocket message:", err);
        }
      };

      ws.onclose = () => {
        setIsConnected(false);

        if (reconnectAttempts.current < maxReconnectAttempts) {
          const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000);
          reconnectTimeoutRef.current = setTimeout(() => {
            reconnectAttempts.current++;
            connect();
          }, delay);
        }
      };

      ws.onerror = (error) => {
        console.error("WebSocket error:", error);
        setConnectionError("Connection error");
      };
    } catch (err) {
      console.error("Failed to create WebSocket:", err);
      setConnectionError("Failed to connect");
    }
  }, [userId, onMessage, onTyping, onConnected]);

  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connect]);

  const sendMessage = useCallback((recipientId: string, content: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN || !userId) {
      return false;
    }

    wsRef.current.send(JSON.stringify({
      type: "chat",
      senderId: userId,
      recipientId,
      content,
    }));

    return true;
  }, [userId]);

  const sendTyping = useCallback((recipientId: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN || !userId) {
      return;
    }

    wsRef.current.send(JSON.stringify({
      type: "typing",
      senderId: userId,
      recipientId,
    }));
  }, [userId]);

  return {
    isConnected,
    connectionError,
    sendMessage,
    sendTyping,
  };
}
