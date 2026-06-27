import type { Express, Request, Response } from "express";
import Anthropic from "@anthropic-ai/sdk";
import { chatStorage } from "./storage";
import { isAuthenticated } from "../auth";
import { trackAICost, calculateAnthropicCost } from "../../services/ai-cost-tracker";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

function getUserId(req: Request): string {
  const userId = (req as any).user?.claims?.sub ?? (req as any).user?.id;
  if (!userId) throw new Error("User ID not found in session");
  return userId;
}

function parseId(raw: string): number | null {
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function registerChatRoutes(app: Express): void {
  app.get("/api/conversations", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      const conversations = await chatStorage.getAllConversations(userId);
      res.json(conversations);
    } catch (error) {
      console.error("Error fetching conversations:", error);
      res.status(500).json({ error: "Failed to fetch conversations" });
    }
  });

  app.get("/api/conversations/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const id = parseId(req.params.id);
      if (!id) return res.status(400).json({ error: "Invalid conversation ID" });
      const userId = getUserId(req);
      const conversation = await chatStorage.getConversation(id, userId);
      if (!conversation) {
        return res.status(404).json({ error: "Conversation not found" });
      }
      const messages = await chatStorage.getMessagesByConversation(id);
      res.json({ ...conversation, messages });
    } catch (error) {
      console.error("Error fetching conversation:", error);
      res.status(500).json({ error: "Failed to fetch conversation" });
    }
  });

  app.post("/api/conversations", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const { title } = req.body;
      const userId = getUserId(req);
      const conversation = await chatStorage.createConversation(title || "New Chat", userId);
      res.status(201).json(conversation);
    } catch (error) {
      console.error("Error creating conversation:", error);
      res.status(500).json({ error: "Failed to create conversation" });
    }
  });

  app.patch("/api/conversations/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const id = parseId(req.params.id);
      if (!id) return res.status(400).json({ error: "Invalid conversation ID" });
      const { title } = req.body;
      if (!title || typeof title !== "string" || !title.trim()) {
        return res.status(400).json({ error: "Title is required" });
      }
      const userId = getUserId(req);
      const updated = await chatStorage.renameConversation(id, title, userId);
      if (!updated) return res.status(404).json({ error: "Conversation not found" });
      res.json(updated);
    } catch (error) {
      console.error("Error renaming conversation:", error);
      res.status(500).json({ error: "Failed to rename conversation" });
    }
  });

  app.delete("/api/conversations/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const id = parseId(req.params.id);
      if (!id) return res.status(400).json({ error: "Invalid conversation ID" });
      const userId = getUserId(req);
      await chatStorage.deleteConversation(id, userId);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting conversation:", error);
      res.status(500).json({ error: "Failed to delete conversation" });
    }
  });

  app.post("/api/conversations/:id/messages", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const conversationId = parseId(req.params.id);
      if (!conversationId) return res.status(400).json({ error: "Invalid conversation ID" });
      const { content } = req.body;
      if (!content || typeof content !== "string" || !content.trim()) {
        return res.status(400).json({ error: "Message content is required" });
      }

      const userId = getUserId(req);
      const conversation = await chatStorage.getConversation(conversationId, userId);
      if (!conversation) {
        return res.status(404).json({ error: "Conversation not found" });
      }

      await chatStorage.createMessage(conversationId, "user", content);

      const messages = await chatStorage.getMessagesByConversation(conversationId);
      
      const chatMessages: Array<{ role: "user" | "assistant"; content: string }> = [];
      for (const m of messages) {
        const lastRole = chatMessages.length > 0 ? chatMessages[chatMessages.length - 1].role : null;
        if (lastRole === m.role) {
          chatMessages[chatMessages.length - 1].content += "\n" + m.content;
        } else {
          chatMessages.push({
            role: m.role as "user" | "assistant",
            content: m.content,
          });
        }
      }
      
      if (chatMessages.length > 0 && chatMessages[0].role !== "user") {
        chatMessages.unshift({ role: "user", content: "Hello" });
      }

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      let fullResponse = "";
      let inputTokens = 0;
      let outputTokens = 0;

      const SYSTEM_PROMPT = `You are Traveloure's AI Travel Assistant — a knowledgeable, friendly, and highly practical travel planning expert. Your job is to help users plan unforgettable trips by giving specific, actionable advice tailored to their needs.

## Your expertise covers:
- **Destination advice**: Best times to visit, local culture, neighborhoods, hidden gems, safety tips
- **Itinerary building**: Day-by-day schedules, pacing, logical routing between sights, how to avoid tourist traps
- **Experiences**: Tours, activities, restaurants, nightlife, local events, off-the-beaten-path spots
- **Logistics**: Flights, trains, ferries, local transport, visas, currency, travel insurance
- **Accommodation**: Hotels, guesthouses, ryokans, hostels — matched to the user's budget and style
- **Budget planning**: Realistic cost estimates per person per day by destination and travel style
- **Special trips**: Honeymoons, proposals, weddings, family holidays, solo travel, group trips, corporate retreats

## How to respond:
- Be **specific** — name actual places, restaurants, neighborhoods, and transport options rather than giving vague tips
- Be **concise but complete** — use bullet points, numbered lists, and headers to keep advice easy to scan
- **Ask clarifying questions** when needed (dates, budget, travel style, group size) before giving a full plan
- Always mention **practical next steps** — what the user should book first, what to check, what to watch out for
- When suggesting a full itinerary, structure it by day with morning / afternoon / evening sections
- Be warm and encouraging — travel planning should feel exciting, not overwhelming

## About Traveloure:
Traveloure is a platform where users can:
- Generate AI-powered itineraries (click "Plan a Trip with AI" on the homepage)
- Browse and book local expert travel advisors for personalised guidance
- Discover hidden gems and local experiences curated by residents
- Compare optimised trip variants side by side
- Book experiences, tours, and transport through the platform

When relevant, encourage users to use these features to get the most out of their trip planning.

Always respond in the same language the user writes in.`;

      const stream = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 2048,
        system: SYSTEM_PROMPT,
        messages: chatMessages,
        stream: true,
      });

      for await (const event of stream) {
        if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
          const text = event.delta.text;
          fullResponse += text;
          res.write(`data: ${JSON.stringify({ content: text })}\n\n`);
        } else if (event.type === "message_start") {
          inputTokens = event.message.usage?.input_tokens ?? 0;
        } else if (event.type === "message_delta") {
          outputTokens = event.usage?.output_tokens ?? outputTokens;
        }
      }

      // Track cost for CON-B analysis (chat is informational; tracked as ai_chat)
      if (inputTokens > 0 || outputTokens > 0) {
        trackAICost({
          sourceType: "ai_chat",
          modelUsed: "claude-sonnet-4-20250514",
          costUsd: calculateAnthropicCost(inputTokens, outputTokens),
          tokensIn: inputTokens,
          tokensOut: outputTokens,
        }).catch(err => console.error("[cost-tracker] chat:", err));
      }

      await chatStorage.createMessage(conversationId, "assistant", fullResponse);

      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      res.end();
    } catch (error) {
      console.error("Error sending message:", error);
      if (res.headersSent) {
        res.write(`data: ${JSON.stringify({ error: "Failed to send message" })}\n\n`);
        res.end();
      } else {
        res.status(500).json({ error: "Failed to send message" });
      }
    }
  });
}
