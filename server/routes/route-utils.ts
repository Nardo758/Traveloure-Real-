import { storage } from "../storage";
import { db } from "../db";
import { eq } from "drizzle-orm";
import { users } from "@shared/schema";
import type { Request, Response, NextFunction } from "express";

export async function verifyTripOwnership(tripId: string, userId: string): Promise<boolean> {
  const trip = await storage.getTrip(tripId);
  return trip?.userId === userId;
}

export function logItineraryChange(tripId: string, who: string, action: string, changeType: string, role: string, activityId?: string, metadata?: any) {
  return storage.createItineraryChange({
    tripId,
    activityId: activityId || null,
    who,
    action,
    changeType,
    role,
    metadata: metadata || {},
  }).catch(err => console.error("Failed to log itinerary change:", err));
}

export function mapFeverCategoryToEventType(category: string): string {
  const categoryMap: Record<string, string> = {
    'experiences': 'cultural',
    'concerts': 'cultural',
    'theater': 'cultural',
    'exhibitions': 'cultural',
    'festivals': 'cultural',
    'nightlife': 'nightlife',
    'food-drink': 'culinary',
    'sports': 'sports',
    'wellness': 'wellness',
    'tours': 'cultural',
    'classes': 'cultural',
    'family': 'family',
  };
  return categoryMap[category] || 'other';
}

export function sanitizeInput(input: string): string {
  if (typeof input !== 'string') return input;
  return input
    .replace(/<[^>]*>/g, '')
    .replace(/[<>'"]/g, (char) => {
      const entities: Record<string, string> = { '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' };
      return entities[char] || char;
    })
    .trim();
}

export function sanitizeObject<T extends Record<string, any>>(obj: T): T {
  const result = { ...obj };
  for (const key of Object.keys(result)) {
    if (typeof result[key] === 'string') {
      result[key] = sanitizeInput(result[key]);
    }
  }
  return result;
}

export const requireAdmin = async (req: Request, res: Response, next: NextFunction) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ message: "Authentication required" });
  }
  const user = await db.select().from(users).where(eq(users.id, (req as any).user?.claims?.sub)).then(r => r[0]);
  if (!user || user.role !== "admin") {
    return res.status(403).json({ message: "Admin access required" });
  }
  next();
};

let aiRefreshCount = 0;
let aiRefreshResetTime = Date.now() + 60 * 60 * 1000;

export const checkAIRateLimit = (req: Request, res: Response, next: NextFunction) => {
  if (Date.now() > aiRefreshResetTime) {
    aiRefreshCount = 0;
    aiRefreshResetTime = Date.now() + 60 * 60 * 1000;
  }
  if (aiRefreshCount >= 10) {
    return res.status(429).json({
      message: "AI refresh rate limit exceeded. Maximum 10 manual refreshes per hour.",
      resetAt: new Date(aiRefreshResetTime),
    });
  }
  aiRefreshCount++;
  next();
};
