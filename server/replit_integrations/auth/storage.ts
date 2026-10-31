import { users, type User, type UpsertUser } from "@shared/models/auth";
import { db } from "../../db";
import { eq, sql } from "drizzle-orm";

// Interface for auth storage operations
// (IMPORTANT) These user operations are mandatory for Replit Auth.
export interface IAuthStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByAppleSub(appleSub: string): Promise<User | undefined>;
  getUsersByEmailNormalized(email: string): Promise<User[]>;
  upsertUser(user: UpsertUser, opts?: { providerEmailVerified?: boolean }): Promise<User>;
  updateUser(id: string, data: Partial<UpsertUser>): Promise<User | undefined>;
  createAppleUser(input: {
    id: string;
    email: string | null;
    firstName: string | null;
    lastName: string | null;
    emailVerified: Date | null;
    appleSub: string;
  }): Promise<User>;
  attachAppleIdentity(
    userId: string,
    patch: { appleSub: string; emailVerified?: Date; firstName?: string | null; lastName?: string | null },
  ): Promise<User | undefined>;
  acceptTerms(userId: string, termsVersion: string, privacyVersion: string): Promise<User | undefined>;
}

/**
 * §19 layer 2. `isTest` is written only by the admin test-flag route and at QA sign-up.
 * `payoutMethodType` / `payoutHandle` are written only by saveOwnPayoutSetup
 * (ledger 2026-10-23-payout-setup-server). `appleSub` is written only by
 * createAppleUser and attachAppleIdentity (ledger `2026-10-31-sign-in-with-apple`).
 * These generic writers drop all four, whatever object a caller hands them.
 */
function withoutServerOwnedUserFields<T extends Partial<UpsertUser>>(
  data: T,
): Omit<T, "isTest" | "payoutMethodType" | "payoutHandle" | "appleSub"> {
  const { isTest: _test, payoutMethodType: _method, payoutHandle: _handle, appleSub: _apple, ...rest } = data;
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

  async getUserByAppleSub(appleSub: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.appleSub, appleSub));
    return user;
  }

  /** Case-insensitive match, the same comparison upsertUser uses for an address. At most two rows. */
  async getUsersByEmailNormalized(email: string): Promise<User[]> {
    return db
      .select()
      .from(users)
      .where(sql`lower(btrim(${users.email})) = lower(btrim(${email}))`)
      .limit(2);
  }

  async createAppleUser(input: {
    id: string;
    email: string | null;
    firstName: string | null;
    lastName: string | null;
    emailVerified: Date | null;
    appleSub: string;
  }): Promise<User> {
    const [user] = await db
      .insert(users)
      .values({
        id: input.id,
        email: input.email,
        firstName: input.firstName,
        lastName: input.lastName,
        emailVerified: input.emailVerified,
        authProvider: "apple",
        appleSub: input.appleSub,
      })
      .returning();
    return user;
  }

  async attachAppleIdentity(
    userId: string,
    patch: { appleSub: string; emailVerified?: Date; firstName?: string | null; lastName?: string | null },
  ): Promise<User | undefined> {
    const set: {
      appleSub: string;
      updatedAt: Date;
      emailVerified?: Date;
      firstName?: string;
      lastName?: string;
    } = { appleSub: patch.appleSub, updatedAt: new Date() };
    if (patch.emailVerified instanceof Date) set.emailVerified = patch.emailVerified;
    if (patch.firstName) set.firstName = patch.firstName;
    if (patch.lastName) set.lastName = patch.lastName;
    const [user] = await db.update(users).set(set).where(eq(users.id, userId)).returning();
    return user;
  }

  async upsertUser(input: UpsertUser, opts?: { providerEmailVerified?: boolean }): Promise<User> {
    // Server-owned columns are dropped here, once, before the insert and before the
    // conflict set is built. The CASE expressions below only assign email and
    // emailVerified; they do not put isTest, payoutMethodType, or payoutHandle back.
    const userData = withoutServerOwnedUserFields(input) as UpsertUser;
    // Row 156, amended Oct 24 2026 23:20 ET. The insert of a brand-new id is unchanged
    // (a new Facebook account may still be born with a null email). On conflict, one
    // statement decides the address. A local-password row is users.password set
    // (non-null and not empty) — the column emailAuth.ts reads for login and for
    // "skip OAuth-only" password reset. auth_provider is not that marker (it defaults
    // to "email"). Such a row keeps both email and email_verified unless
    // providerEmailVerified is boolean true AND the incoming address differs, in
    // which case the new address is written and email_verified is stamped now.
    // The same address is never re-stamped. Every other row: a missing or blank
    // incoming email writes nothing and leaves email_verified as stored; the same
    // address, compared case-insensitively after trim, keeps the stored value and
    // its stamp; a different address is written, and email_verified becomes the
    // caller-stated value when the input already carries one, else now() when the
    // provider asserted this address, else null. Never clears a stored email.
    const rest: UpsertUser = { ...userData };
    delete rest.email;
    delete rest.emailVerified;
    const callerStatedVerified =
      Object.prototype.hasOwnProperty.call(input, "emailVerified") && input.emailVerified !== undefined;
    const statedVerified = callerStatedVerified ? (input.emailVerified ?? null) : null;
    const providerVerified = opts?.providerEmailVerified === true;
    // email_verified is timestamp without time zone. A raw Date is sent with a
    // local offset, and ::timestamp drops that offset, so the stored clock would
    // follow the process zone. An ISO string keeps the UTC digits.
    const verifiedAtIso = new Date().toISOString();
    const boundTimestamp = (value: Date | null) =>
      value instanceof Date ? sql`${value.toISOString()}::timestamp` : sql`NULL`;
    const boundNow = () => sql`${verifiedAtIso}::timestamp`;
    // A fresh fragment per interpolation. Drizzle SQL objects are single-use.
    const localPassword = () => sql`${users.password} IS NOT NULL AND ${users.password} <> ''`;
    const incomingDifferent = () => sql`excluded.email IS NOT NULL AND btrim(excluded.email) <> ''
      AND lower(btrim(${users.email})) IS DISTINCT FROM lower(btrim(excluded.email))`;
    const localLocked = providerVerified
      ? sql`${localPassword()} AND NOT (${incomingDifferent()})`
      : localPassword();
    const keepEmail = sql`CASE
      WHEN ${localLocked} THEN ${users.email}
      WHEN excluded.email IS NULL OR btrim(excluded.email) = '' THEN ${users.email}
      WHEN lower(btrim(${users.email})) IS NOT DISTINCT FROM lower(btrim(excluded.email)) THEN ${users.email}
      ELSE excluded.email
    END`;
    const keepVerified = () => sql`excluded.email IS NULL OR btrim(excluded.email) = ''
      OR lower(btrim(${users.email})) IS NOT DISTINCT FROM lower(btrim(excluded.email))`;
    const changedStamp = () => callerStatedVerified
      ? boundTimestamp(statedVerified instanceof Date ? statedVerified : null)
      : providerVerified
        ? boundNow()
        : sql`NULL`;
    const emailVerified = providerVerified
      ? sql`CASE
          WHEN ${localPassword()} AND (${incomingDifferent()}) THEN ${boundNow()}
          WHEN ${localPassword()} THEN ${users.emailVerified}
          ELSE CASE WHEN ${keepVerified()} THEN ${users.emailVerified} ELSE ${changedStamp()} END
        END`
      : sql`CASE
          WHEN ${localPassword()} THEN ${users.emailVerified}
          ELSE CASE WHEN ${keepVerified()} THEN ${users.emailVerified} ELSE ${changedStamp()} END
        END`;
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
