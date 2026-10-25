import { users, type User, type UpsertUser } from "@shared/models/auth";
import { db } from "../../db";
import { eq, sql } from "drizzle-orm";

// Interface for auth storage operations
// (IMPORTANT) These user operations are mandatory for Replit Auth.
export interface IAuthStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser, opts?: { providerEmailVerified?: boolean }): Promise<User>;
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

  async upsertUser(input: UpsertUser, opts?: { providerEmailVerified?: boolean }): Promise<User> {
    const userData = withoutServerOwnedUserFields(input) as UpsertUser;
    // Row 156. The insert of a brand-new id is unchanged (a new Facebook account may
    // still be born with a null email). On conflict, one statement decides the address:
    // a missing or blank incoming email writes nothing and leaves email_verified as stored;
    // the same address, compared case-insensitively after trim, keeps the stored value and
    // its stamp; a different address is written, and email_verified becomes now() only when
    // the provider asserted this address, otherwise null. A caller that already put
    // emailVerified on the input (the new-account OIDC spread) keeps that value when the
    // address changes. Never clears a stored email.
    const rest: UpsertUser = { ...userData };
    delete rest.email;
    delete rest.emailVerified;
    const callerStatedVerified =
      Object.prototype.hasOwnProperty.call(input, "emailVerified") && input.emailVerified !== undefined;
    const statedVerified = callerStatedVerified ? (input.emailVerified ?? null) : null;
    const providerVerified = opts?.providerEmailVerified === true;
    const verifiedAt = new Date();
    const keepEmail = sql`CASE
      WHEN excluded.email IS NULL OR btrim(excluded.email) = '' THEN ${users.email}
      WHEN lower(btrim(${users.email})) IS NOT DISTINCT FROM lower(btrim(excluded.email)) THEN ${users.email}
      ELSE excluded.email
    END`;
    const keepVerified = sql`excluded.email IS NULL OR btrim(excluded.email) = ''
      OR lower(btrim(${users.email})) IS NOT DISTINCT FROM lower(btrim(excluded.email))`;
    const emailVerified = callerStatedVerified
      ? sql`CASE WHEN ${keepVerified} THEN ${users.emailVerified} ELSE ${statedVerified}::timestamp END`
      : providerVerified
        ? sql`CASE WHEN ${keepVerified} THEN ${users.emailVerified} ELSE ${verifiedAt}::timestamp END`
        : sql`CASE WHEN ${keepVerified} THEN ${users.emailVerified} ELSE NULL END`;
    const [user] = await db
      .insert(users)
      .values(userData)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          ...rest,
          email: keepEmail,
          emailVerified,
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
