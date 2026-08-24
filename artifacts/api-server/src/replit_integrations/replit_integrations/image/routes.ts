import type { Express, Request, Response } from "express";
import { z } from "zod/v4";
import { openai } from "./client";
import { isAuthenticated } from "../auth";
import { strictRateLimiter } from "../../infrastructure/rate-limiter";

const generateImageSchema = z.object({
  prompt: z.string().trim().min(1).max(2_000),
  size: z.enum(["1024x1024", "512x512", "256x256"]).default("1024x1024"),
}).strict();

export function registerImageRoutes(app: Express): void {
  app.post("/api/generate-image", isAuthenticated, strictRateLimiter, async (req: Request, res: Response) => {
    try {
      const parsed = generateImageSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: "Validation failed",
          details: parsed.error.errors.map((issue) => ({ field: issue.path.join("."), message: issue.message })),
        });
      }
      const { prompt, size } = parsed.data;

      const response = await openai.images.generate({
        model: "gpt-image-1",
        prompt,
        n: 1,
        size,
      });

      const imageData = response.data?.[0];
      res.json({
        url: imageData?.url,
        b64_json: imageData?.b64_json,
      });
    } catch (error) {
      console.error("Error generating image:", error);
      res.status(500).json({ error: "Failed to generate image" });
    }
  });
}

