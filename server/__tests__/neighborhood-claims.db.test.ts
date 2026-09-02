/**
 * neighborhood-claims.db.test.ts — expert field-knowledge claims, Phase 1
 * (ledger 2026-08-29-neighborhood-claims).
 *
 * Proves against a real database that:
 *   C1. createDraftClaim births a draft row with consent stamped NOW (server-side)
 *   C2. a second createDraftClaim for the same (expert, neighborhood) returns the EXISTING
 *       row rather than inserting a duplicate
 *   C3. submitClaim moves draft -> submitted, owner-scoped; a non-owner's submit matches 0 rows
 *   C4. verifyClaim moves submitted -> verified and births EXACTLY ONE expert_neighborhoods row
 *       (never sets is_lead)
 *   C5. a second verifyClaim on an already-verified claim loses (409) — one expert_neighborhoods
 *       row, never two
 *   C6. declineClaim requires a non-empty reason; a valid decline stamps the reason verbatim
 *   C7. §19 allowlist proof: createDraftClaim's signature has no path for a client-supplied
 *       status/score — every claim it births is status='draft' with every score column NULL,
 *       regardless of what a caller might try to smuggle in
 *   C8. UNIQUE(expert_id, neighborhood_id) holds at the DB layer
 *
 * Run with:
 *   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/traveloure \
 *   npx tsx --test server/__tests__/neighborhood-claims.db.test.ts
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

process.env.DATABASE_URL ??= "postgresql://postgres:postgres@localhost:5432/traveloure";
process.env.STRIPE_SECRET_KEY ??= "sk_test_dummy";

const { db, pool } = await import("../db");
const { eq, and, inArray, sql } = await import("drizzle-orm");
const { users, cityNeighborhoods, expertNeighborhoodClaims, expertNeighborhoods } = await import("../../shared/schema");
const {
  createDraftClaim,
  submitClaim,
  verifyClaim,
  declineClaim,
  listMyClaims,
  listClaimCandidates,
} = await import("../services/neighborhood-claims.service");

// ── Disposable-DB guard (mirrors gem-promotion's; never defaults open) ──
const DISPOSABLE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", ""]);
async function assertDisposableDb(): Promise<void> {
  if (process.env.JOURNEY_DB_WRITES_OK === "1") return;
  let host: string | null = null;
  try {
    host = new URL(process.env.DATABASE_URL ?? "").hostname.toLowerCase();
  } catch {
    host = null;
  }
  let serverAddr: string | null = null;
  try {
    const r = await db.execute(sql`SELECT host(inet_server_addr()) AS addr`);
    serverAddr = ((r.rows[0] as any)?.addr as string) ?? null;
  } catch {
    /* local socket ⇒ NULL ⇒ disposable signal */
  }
  const ok =
    (host !== null && DISPOSABLE_HOSTS.has(host)) ||
    (host === null && (serverAddr === null || DISPOSABLE_HOSTS.has(serverAddr)));
  if (!ok) {
    throw new Error(
      `[neighborhood-claims] REFUSING to write fixtures: DATABASE_URL host '${host ?? "<none>"}' is not a ` +
        `recognized disposable dev/CI database. Opt in DELIBERATELY with JOURNEY_DB_WRITES_OK=1. Never against prod.`,
    );
  }
}

const RUN = crypto.randomUUID().slice(0, 8);
const CITY = `ClaimsTest-${RUN}`;
const COUNTRY = "Testland";
const expertId = crypto.randomUUID();
const otherExpertId = crypto.randomUUID();
const adminId = crypto.randomUUID();
const createdUserIds = [expertId, otherExpertId, adminId];
let neighborhoodId: string;
let neighborhoodId2: string;

describe("expert field-knowledge claims (Phase 1)", () => {
  before(async () => {
    await assertDisposableDb();
    for (const [id, role] of [
      [expertId, "local_expert"],
      [otherExpertId, "local_expert"],
      [adminId, "admin"],
    ] as const) {
      await db.insert(users).values({
        id,
        email: `neighborhood-claims-${id.slice(0, 8)}@test.invalid`,
        firstName: id === expertId ? "Yuki" : "Other",
        lastName: "Tester",
        role,
      } as any);
    }
    const [n1] = await db
      .insert(cityNeighborhoods)
      .values({
        city: CITY,
        country: COUNTRY,
        name: "Gion",
        slug: `gion-${RUN}`,
        centroidLat: "35.0037",
        centroidLng: "135.7756",
      } as any)
      .returning();
    neighborhoodId = n1.id;
    const [n2] = await db
      .insert(cityNeighborhoods)
      .values({
        city: CITY,
        country: COUNTRY,
        name: "Arashiyama",
        slug: `arashiyama-${RUN}`,
        centroidLat: "35.0094",
        centroidLng: "135.6693",
      } as any)
      .returning();
    neighborhoodId2 = n2.id;
  });

  after(async () => {
    await db.delete(expertNeighborhoods).where(inArray(expertNeighborhoods.expertId, createdUserIds));
    await db.delete(expertNeighborhoodClaims).where(inArray(expertNeighborhoodClaims.expertId, createdUserIds));
    await db.delete(cityNeighborhoods).where(eq(cityNeighborhoods.city, CITY));
    await db.delete(users).where(inArray(users.id, createdUserIds));
    await pool.end();
  });

  it("C1: createDraftClaim births a draft row with consent stamped now", async () => {
    const result = await createDraftClaim(expertId, neighborhoodId, "v1");
    assert.ok(result.ok);
    const claim = (result as any).claim;
    assert.equal((result as any).created, true);
    assert.equal(claim.status, "draft");
    assert.equal(claim.expertId, expertId);
    assert.equal(claim.neighborhoodId, neighborhoodId);
    assert.equal(claim.consentVersion, "v1");
    assert.ok(claim.consentAt, "consent must be stamped server-side on create");

    const mine = await listMyClaims(expertId);
    const found = mine.find((c) => c.id === claim.id);
    assert.ok(found, "draft claim appears in the expert's own list");
    assert.equal(found!.neighborhoodName, "Gion");
  });

  it("C2: a second createDraftClaim for the same pair returns the existing row", async () => {
    const first = await createDraftClaim(expertId, neighborhoodId2, "v1");
    assert.ok(first.ok);
    const second = await createDraftClaim(expertId, neighborhoodId2, "v2");
    assert.ok(second.ok);
    assert.equal((second as any).created, false);
    assert.equal((second as any).claim.id, (first as any).claim.id);
    // No duplicate row.
    const rows = await db
      .select()
      .from(expertNeighborhoodClaims)
      .where(and(eq(expertNeighborhoodClaims.expertId, expertId), eq(expertNeighborhoodClaims.neighborhoodId, neighborhoodId2)));
    assert.equal(rows.length, 1);
  });

  it("C3: submitClaim moves draft -> submitted, owner-scoped; a non-owner's submit loses", async () => {
    const created = await createDraftClaim(otherExpertId, neighborhoodId, "v1");
    assert.ok(created.ok);
    const claimId = (created as any).claim.id;

    assert.equal(await submitClaim(claimId, expertId), null, "a non-owner's submit must match 0 rows");
    const [untouched] = await db.select().from(expertNeighborhoodClaims).where(eq(expertNeighborhoodClaims.id, claimId));
    assert.equal(untouched.status, "draft", "status untouched by the losing submit");

    const submitted = await submitClaim(claimId, otherExpertId);
    assert.ok(submitted, "owner's submit must win");
    assert.equal(submitted.status, "submitted");
    assert.ok(submitted.submittedAt);

    const candidates = await listClaimCandidates();
    const mine = candidates.find((c) => c.id === claimId);
    assert.ok(mine, "submitted claim appears in the admin queue");
    assert.equal(mine.expertFirstName, "Other");
  });

  it("C4: verifyClaim moves submitted -> verified and births exactly one expert_neighborhoods row", async () => {
    const created = await createDraftClaim(expertId, neighborhoodId, "v1");
    assert.ok(created.ok);
    const claimId = (created as any).claim.id;
    const submitted = await submitClaim(claimId, expertId);
    assert.ok(submitted);

    const result = await verifyClaim({ claimId, adminId });
    assert.ok(result.ok, "verify must succeed");
    assert.equal((result as any).claim.status, "verified");
    assert.equal((result as any).claim.reviewedBy, adminId);
    assert.equal((result as any).neighborhoodJoined, true);

    const joined = await db
      .select()
      .from(expertNeighborhoods)
      .where(and(eq(expertNeighborhoods.expertId, expertId), eq(expertNeighborhoods.neighborhoodId, neighborhoodId)));
    assert.equal(joined.length, 1, "exactly one expert_neighborhoods row");
    assert.equal(joined[0].isLead, false, "ratification never sets is_lead");
    assert.equal(joined[0].claimId, claimId, "provenance marker stamped with the ratifying claim");
  });

  it("C5: a second verify on an already-verified claim loses — one expert_neighborhoods row, never two", async () => {
    const created = await createDraftClaim(otherExpertId, neighborhoodId2, "v1");
    assert.ok(created.ok);
    const claimId = (created as any).claim.id;
    await submitClaim(claimId, otherExpertId);
    const first = await verifyClaim({ claimId, adminId });
    assert.ok(first.ok);
    const second = await verifyClaim({ claimId, adminId });
    assert.equal(second.ok, false);
    assert.equal((second as any).status, 409);

    const joined = await db
      .select()
      .from(expertNeighborhoods)
      .where(and(eq(expertNeighborhoods.expertId, otherExpertId), eq(expertNeighborhoods.neighborhoodId, neighborhoodId2)));
    assert.equal(joined.length, 1, "exactly one row despite the double verify attempt");
  });

  it("C6: decline requires a non-empty reason; a valid decline stamps it verbatim", async () => {
    const created = await createDraftClaim(expertId, neighborhoodId2, "v1");
    assert.ok(created.ok);
    // neighborhoodId2 already claimed by expertId in C2/C4 setup — use a scoped 3rd neighborhood
    // instead to avoid UNIQUE collisions across tests sharing fixtures.
    const [n3] = await db
      .insert(cityNeighborhoods)
      .values({
        city: CITY,
        country: COUNTRY,
        name: "Fushimi",
        slug: `fushimi-${RUN}`,
        centroidLat: "34.9671",
        centroidLng: "135.7727",
      } as any)
      .returning();
    const claimResult = await createDraftClaim(expertId, n3.id, "v1");
    assert.ok(claimResult.ok);
    const claimId = (claimResult as any).claim.id;
    await submitClaim(claimId, expertId);

    const empty = await declineClaim({ claimId, adminId, reason: "   " });
    assert.equal(empty.ok, false, "a blank reason is refused");
    assert.equal((empty as any).status, 400);

    const declined = await declineClaim({ claimId, adminId, reason: "Not enough evidence yet" });
    assert.ok(declined.ok);
    assert.equal((declined as any).claim.status, "declined");
    assert.equal((declined as any).claim.reviewNote, "Not enough evidence yet");
    assert.equal((declined as any).claim.reviewedBy, adminId);

    // No expert_neighborhoods row was born from a decline.
    const joined = await db
      .select()
      .from(expertNeighborhoods)
      .where(and(eq(expertNeighborhoods.expertId, expertId), eq(expertNeighborhoods.neighborhoodId, n3.id)));
    assert.equal(joined.length, 0);
  });

  it("C7: §19 allowlist proof — every claim createDraftClaim births is draft with every score column NULL", async () => {
    const [n4] = await db
      .insert(cityNeighborhoods)
      .values({
        city: CITY,
        country: COUNTRY,
        name: "Higashiyama",
        slug: `higashiyama-${RUN}`,
        centroidLat: "34.9949",
        centroidLng: "135.7850",
      } as any)
      .returning();
    // createDraftClaim's signature is (expertId, neighborhoodId, consentVersion) — there is no
    // parameter through which a caller (i.e. a route relaying a request body) could smuggle a
    // status or score value in. This is the structural proof of the allowlist: it is not that a
    // status/score field gets silently dropped, but that no such field is ever accepted at all.
    const result = await createDraftClaim(expertId, n4.id, "v1");
    assert.ok(result.ok);
    const claim = (result as any).claim;
    assert.equal(claim.status, "draft");
    assert.equal(claim.reviewedBy, null);
    assert.equal(claim.reviewedAt, null);
    assert.equal(claim.scoreSpecificity, null);
    assert.equal(claim.scoreVerifiability, null);
    assert.equal(claim.scoreLocalness, null);
    assert.equal(claim.scorePracticality, null);
    assert.equal(claim.scoredAt, null);
    assert.equal(claim.scoreModel, null);

    // And the expert-facing read never carries score columns at all.
    const mine = await listMyClaims(expertId);
    const found = mine.find((c) => c.id === claim.id) as any;
    assert.ok(found);
    assert.equal("scoreSpecificity" in found, false, "score columns must not be selected on the expert read");
  });

  it("C8: UNIQUE(expert_id, neighborhood_id) holds at the DB layer", async () => {
    const [n5] = await db
      .insert(cityNeighborhoods)
      .values({
        city: CITY,
        country: COUNTRY,
        name: "Downtown",
        slug: `downtown-${RUN}`,
        centroidLat: "35.0",
        centroidLng: "135.7681",
      } as any)
      .returning();
    await db.insert(expertNeighborhoodClaims).values({ expertId, neighborhoodId: n5.id, status: "draft" } as any);
    let caught: any = null;
    try {
      await db.insert(expertNeighborhoodClaims).values({ expertId, neighborhoodId: n5.id, status: "draft" } as any);
    } catch (err: any) {
      caught = err;
    }
    assert.ok(caught, "the duplicate insert must throw");
    const causeCode = caught?.cause?.code ?? caught?.code;
    const causeMessage = String(caught?.cause?.message ?? caught?.message ?? "");
    assert.ok(
      causeCode === "23505" || /duplicate key|unique/i.test(causeMessage),
      `expected a UNIQUE-violation error, got: ${causeMessage} (code=${causeCode})`,
    );
  });
});
