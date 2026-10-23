import { users, type User, type UpsertUser } from "@shared/models/auth";
import { db } from "../../db";
import { eq } from "drizzle-orm";

// Interface for auth storage operations
// (IMPORTANT) These user operations are mandatory for Replit Auth.
export interface IAuthStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  updateUser(id: string, data: Partial<UpsertUser>): Promise<User | undefined>;
  acceptTerms(userId: string, termsVersion: string, privacyVersion: string): Promise<User | undefined>;
}

/**
 * §19 layer 2. `isTest` is written only by the admin test-flag route and at QA sign-up.
 * `payoutMethodType` / `payoutHandle` are written only by saveOwnPayoutSetup
 * (ledger 2026-10-23-payout-setup-server). These generic writers drop all three,
 * whatever object a caller hands them.
 */
function withoutServerOwnedUserFields<T extends Partial<UpsertUser>>(
  data: T,
): Omit<T, "isTest" | "payoutMethodType" | "payoutHandle"> {
  const { isTest: _test, payoutMethodType: _method, payoutHandle: _handle, ...rest } = data;
  return rest;
}

class AuthStorage implements IAuthStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async upsertUser(input: UpsertUser): Promise<User> {
    const userData = withoutServerOwnedUserFields(input) as UpsertUser;
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

  async updateUser(id: string, data: Partial<UpsertUser>): Promise<User | undefined> {
    const [user] = await db
      .update(users)
      .set({
        ...withoutServerOwnedUserFields(data),
        updatedAt: new Date(),
      })
      .where(eq(users.id, id))
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
