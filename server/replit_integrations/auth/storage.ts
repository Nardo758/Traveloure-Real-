import { users, type User, type UpsertUser } from "@shared/models/auth";
import { db } from "../../db";
import { eq } from "drizzle-orm";

// Interface for auth storage operations
// (IMPORTANT) These user operations are mandatory for Replit Auth.
export interface IAuthStorage {
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  acceptTerms(userId: string, termsVersion: string, privacyVersion: string): Promise<User | undefined>;
}

class AuthStorage implements IAuthStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(userData)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          ...userData,
          updatedAt: new Date(),
        },
      })
      .returning();
    return user;
  }

  async acceptTerms(userId: string, termsVersion: string, privacyVersion: string): Promise<User | undefined> {
    const now = new Date();
    const [user] = await db
      .update(users)
      .set({
        termsAcceptedAt: now,
        privacyAcceptedAt: now,
        termsVersion,
        privacyVersion,
        updatedAt: now,
      })
      .where(eq(users.id, userId))
      .returning();
    return user;
  }
}

export const authStorage = new AuthStorage();
