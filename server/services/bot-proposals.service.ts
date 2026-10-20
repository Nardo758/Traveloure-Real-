/**
 * BOT-1 Phase 1 — the bot channel's ONE service (decision-maker, Oct 15, 2026; ledger `2026-10-15-bot1-phase1`;
 * migration 378). The bot router and the admin routes call it; nothing else writes `bot_accounts` or `bot_proposals`.
 *
 *   · TOKENS: only the SHA-256 of a token is stored; the value is shown once at creation and never logged.
 *   · PROPOSE ONLY: a proposal is admitted (source, page, quote, structured value) and stored as `pending`. It is
 *     never a `place_facts` row until an admin approves it.
 *   · APPROVE is one transaction: an atomic claim on `status = 'pending'` (§15), then the fact through the ONE
 *     writer (`recordFacts`, origin `bot_proposal`, `verified_by` = the admin), then `fact_id` on the proposal.
 *     A refused admission rolls the whole thing back and names the reason.
 *   · REJECT writes the proposal only. A rejected proposal never touches `place_facts`.
 *   · READS FOR BOTS carry no plan id, no traveler's item id, no email, no booking and no user id. The facts read
 *     covers REGISTRY rows only (no plan, a page-read origin, an official license) — never a Places fact.
 */
import crypto from "node:crypto";
import { and, asc, desc, eq, inArray, isNull, lte, sql } from "drizzle-orm";
import { db } from "../db";
import { botAccounts, botProposals, contentSources, placeFacts, platformSettingsTable } from "@shared/schema";
import {
  BOT_FACT_DEFAULT_EXPIRY_SETTING,
  BOT_FACT_ORIGIN,
  BOT_TOKEN_PREFIX,
  admitBotFact,
  admitBotSource,
  botProposalDedupeInput,
  botTokenLive,
  factForKind,
  isBotProposalKind,
  isBotScope,
  type BotProposalKind,
  type BotScope,
} from "@shared/bot-proposals";
import { PAGE_READ_ORIGINS, type LicenseClass } from "@shared/content-facts";
import { admitFeasibilityFact, isFeasibilityFactType } from "@shared/feasibility-facts";
import { resolveReviewedExpiry, type ReviewExpiryRefusal } from "@shared/fact-review";
import { buildCoverageReport, type CoverageSourceRow } from "@shared/content-coverage";
import { recordFacts } from "./content-facts/place-facts.service";
import { structuredFields } from "./content-facts/tavily-extract-adapter";
import { factQuoteMaxChars } from "../config/content-facts.config";

type BotRow = typeof botAccounts.$inferSelect;
type ProposalRow = typeof botProposals.$inferSelect;

const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

/** The bot-facing view of a proposal: what it filed and where it stands. No reviewer id. */
function botView(p: ProposalRow) {
  return {
    id: p.id,
    kind: p.kind,
    placeRef: p.placeRef,
    market: p.market,
    value: p.value,
    sourceId: p.sourceId,
    sourceUrl: p.sourceUrl,
    checkedAt: p.checkedAt,
    status: p.status,
    reviewedAt: p.reviewedAt,
    rejectReason: p.rejectReason,
    createdAt: p.createdAt,
  };
}

// ─── Accounts ────────────────────────────────────────────────────────────────────────────────────

export type CreateBotResult = { ok: true; bot: Omit<BotRow, "tokenHash">; token: string } | { ok: false; reason: "bad_name" | "bad_scopes" | "bad_expiry" };

/** Create a bot and its token. The token is returned ONCE; only its hash is stored. */
export async function createBotAccount(input: { name: unknown; scopes: unknown; expiresAt?: unknown; createdBy: string }): Promise<CreateBotResult> {
  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (!name || name.length > 120) return { ok: false, reason: "bad_name" };
  if (!Array.isArray(input.scopes) || !input.scopes.length || !input.scopes.every(isBotScope)) return { ok: false, reason: "bad_scopes" };
  let expiresAt: Date | null = null;
  if (input.expiresAt != null && input.expiresAt !== "") {
    const t = Date.parse(String(input.expiresAt));
    if (!Number.isFinite(t) || t <= Date.now()) return { ok: false, reason: "bad_expiry" };
    expiresAt = new Date(t);
  }
  const token = `${BOT_TOKEN_PREFIX}${crypto.randomBytes(32).toString("base64url")}`;
  const [row] = await db
    .insert(botAccounts)
    .values({ id: crypto.randomUUID(), name, scopes: Array.from(new Set(input.scopes as BotScope[])), tokenHash: sha256(token), expiresAt, createdBy: input.createdBy })
    .returning();
  const { tokenHash: _hidden, ...bot } = row;
  return { ok: true, bot, token };
}

/** Revoke a bot. One atomic conditional; revoking twice changes nothing. */
export async function revokeBotAccount(id: string): Promise<{ revoked: boolean }> {
  const [row] = await db.update(botAccounts).set({ revokedAt: new Date() }).where(and(eq(botAccounts.id, id), isNull(botAccounts.revokedAt))).returning({ id: botAccounts.id });
  return { revoked: !!row };
}

/** Every bot for the admin page — never the token hash. */
export async function listBotAccounts() {
  const rows = await db.select().from(botAccounts).orderBy(desc(botAccounts.createdAt));
  return rows.map(({ tokenHash: _hidden, ...r }) => r);
}

/**
 * The bot a Bearer token names, when it is live. The row is found by the token's hash; the stored hash is then
 * compared in constant time. A revoked, expired or unknown token answers null — the caller says only "401".
 */
export async function authenticateBotToken(token: string | null | undefined, now: Date = new Date()): Promise<BotRow | null> {
  if (typeof token !== "string" || !token.startsWith(BOT_TOKEN_PREFIX) || token.length > 200) return null;
  const hash = sha256(token);
  const [row] = await db.select().from(botAccounts).where(eq(botAccounts.tokenHash, hash)).limit(1);
  if (!row) return null;
  const a = Buffer.from(row.tokenHash, "utf8");
  const b = Buffer.from(hash, "utf8");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  if (!botTokenLive(row, now)) return null;
  return row;
}

/** Stamp the bot's last request. Never fails the request it records. */
export async function touchBotLastUsed(botId: string): Promise<void> {
  await db.update(botAccounts).set({ lastUsedAt: new Date() }).where(eq(botAccounts.id, botId)).catch(() => undefined);
}

// ─── Reads for bots ──────────────────────────────────────────────────────────────────────────────

/** Coverage by need for one market — the same pure report the CLI prints. */
export async function botCoverageNeeds(market: string) {
  const rows = await db.select().from(contentSources);
  const sources: CoverageSourceRow[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    market: r.market,
    covers: r.covers,
    doesNotCover: r.doesNotCover,
    active: r.active,
    termsCheckedAt: r.termsCheckedAt,
    licenseClass: r.licenseClass,
    publicOk: r.publicOk,
  }));
  return buildCoverageReport(market, sources);
}

/**
 * Facts past their date. `place_facts`: REGISTRY rows only — no plan, a page-read origin, an official license,
 * not superseded — expired by `expires_at`; each named by its place id (LD 57 allows a place ID outside a plan),
 * never a fact's content. The three tables that store a verification date and never check it are reported as
 * counts: how many rows, how many never verified, and the oldest verification.
 */
export async function botOverdueFacts(now: Date = new Date()) {
  const expired = await db
    .select({ market: placeFacts.market, placeRef: placeFacts.placeRef, factType: placeFacts.factType, origin: placeFacts.origin, expiresAt: placeFacts.expiresAt, sourceId: placeFacts.sourceId })
    .from(placeFacts)
    .where(
      and(
        isNull(placeFacts.planId),
        isNull(placeFacts.itineraryItemId),
        inArray(placeFacts.origin, [...PAGE_READ_ORIGINS]),
        eq(placeFacts.license, "official"),
        isNull(placeFacts.supersededBy),
        lte(placeFacts.expiresAt, now),
      ),
    )
    .orderBy(asc(placeFacts.expiresAt))
    .limit(500);
  const ages = async (table: string, column: string) => {
    const r = await db.execute(sql`SELECT count(*)::int AS total, count(*) FILTER (WHERE ${sql.raw(column)} IS NULL)::int AS never_verified, min(${sql.raw(column)}) AS oldest_verified_at FROM ${sql.raw(table)}`);
    const row = (r as any).rows?.[0] ?? {};
    return { table, total: Number(row.total ?? 0), neverVerified: Number(row.never_verified ?? 0), oldestVerifiedAt: row.oldest_verified_at ?? null };
  };
  return {
    registryFactsExpired: expired,
    unchecked: [
      await ages("service_transport_facts", "verified_at"),
      await ages("local_knowledge_nuggets", "verified_at"),
      await ages("ready_made_trips", "last_verified_at"),
    ],
  };
}

// ─── Proposals ───────────────────────────────────────────────────────────────────────────────────

export type ProposalRefusal =
  | "bad_kind"
  | "bad_place"
  | "bad_checked_at"
  | "bad_text"
  | "no_quote"
  | "quote_too_long"
  | "bad_fields"
  | "not_feasible"
  | "source_not_eligible"
  | "url_not_https"
  | "url_off_source_host";

const TEXT_MAX = 500;

/**
 * File a proposal. Admitted only when the kind is one of Phase 1's two, the place is a place id, the source row is
 * active, official and terms-checked, the page is https on the source's own host, the quote is present and within
 * the cap, and the structured value parses the way an official crawl's would (`structuredFields`, the ONE rule)
 * with every time printed in the quote. A second identical claim answers the first proposal's id.
 */
export async function fileBotProposal(
  bot: { id: string },
  body: { kind: unknown; placeId: unknown; market?: unknown; sourceId: unknown; sourceUrl: unknown; checkedAt: unknown; text: unknown; quote: unknown; fields: unknown },
): Promise<{ ok: true; proposal: ReturnType<typeof botView>; duplicate: boolean } | { ok: false; reason: ProposalRefusal }> {
  if (!isBotProposalKind(body.kind)) return { ok: false, reason: "bad_kind" };
  const kind: BotProposalKind = body.kind;
  const placeRef = typeof body.placeId === "string" ? body.placeId.trim() : "";
  if (!placeRef || placeRef.length > 300 || /\s/.test(placeRef)) return { ok: false, reason: "bad_place" };
  const checkedMs = Date.parse(String(body.checkedAt ?? ""));
  if (!Number.isFinite(checkedMs) || checkedMs > Date.now() + 60_000) return { ok: false, reason: "bad_checked_at" };
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text || text.length > TEXT_MAX) return { ok: false, reason: "bad_text" };
  const quote = typeof body.quote === "string" ? body.quote.trim() : "";
  if (!quote) return { ok: false, reason: "no_quote" };
  if (quote.length > factQuoteMaxChars()) return { ok: false, reason: "quote_too_long" };

  const { factType } = factForKind(kind);
  const fields = structuredFields(factType, body.fields, quote);
  if (!fields || fields === "refused") return { ok: false, reason: "bad_fields" };

  const sourceId = typeof body.sourceId === "string" ? body.sourceId.trim() : "";
  const sourceUrl = typeof body.sourceUrl === "string" ? body.sourceUrl.trim() : "";
  const [src] = sourceId ? await db.select().from(contentSources).where(eq(contentSources.id, sourceId)).limit(1) : [];
  const verdict = admitBotSource(src ?? null, sourceUrl);
  if (!verdict.ok) return { ok: false, reason: verdict.reason };

  const value = { text, quote, ...fields };
  if (isFeasibilityFactType(factType)) {
    const f = admitFeasibilityFact({ factType, value, origin: BOT_FACT_ORIGIN, license: "official", sourceUrl });
    if (!f.ok) return { ok: false, reason: "not_feasible" };
  }
  const market = typeof body.market === "string" && body.market.trim() ? body.market.trim().slice(0, 64) : src?.market ?? null;
  const dedupeHash = sha256(botProposalDedupeInput({ kind, placeRef, sourceUrl, value }));

  const [inserted] = await db
    .insert(botProposals)
    .values({
      id: crypto.randomUUID(),
      botId: bot.id,
      kind,
      placeRefKind: "place_id",
      placeRef,
      market,
      value,
      sourceId,
      sourceUrl,
      quote,
      checkedAt: new Date(checkedMs),
      dedupeHash,
      status: "pending",
    })
    .onConflictDoNothing({ target: botProposals.dedupeHash })
    .returning();
  if (inserted) return { ok: true, proposal: botView(inserted), duplicate: false };
  const [existing] = await db.select().from(botProposals).where(eq(botProposals.dedupeHash, dedupeHash)).limit(1);
  return { ok: true, proposal: botView(existing), duplicate: true };
}

/** One of the bot's OWN proposals; another bot's or a missing one is the same null (one 404, LD 40). */
export async function getBotProposal(botId: string, id: string) {
  const [row] = await db.select().from(botProposals).where(and(eq(botProposals.id, id), eq(botProposals.botId, botId))).limit(1);
  return row ? botView(row) : null;
}

// ─── Admin review ────────────────────────────────────────────────────────────────────────────────

/**
 * The review queue. Each row carries the bot's name, the source's name, and the CURRENTLY stored registry fact for
 * the same place and fact type (read live, never a stored copy), so the admin compares before approving.
 */
export async function listBotProposalsForReview(status: string) {
  const rows = await db
    .select({ p: botProposals, botName: botAccounts.name, sourceName: contentSources.name })
    .from(botProposals)
    .leftJoin(botAccounts, eq(botAccounts.id, botProposals.botId))
    .leftJoin(contentSources, eq(contentSources.id, botProposals.sourceId))
    .where(eq(botProposals.status, status))
    .orderBy(asc(botProposals.createdAt))
    .limit(200);
  const out = [];
  for (const r of rows) {
    const { factType } = isBotProposalKind(r.p.kind) ? factForKind(r.p.kind) : { factType: null };
    const [current] = factType
      ? await db
          .select({ id: placeFacts.id, value: placeFacts.value, origin: placeFacts.origin, fetchedAt: placeFacts.fetchedAt, expiresAt: placeFacts.expiresAt, sourceId: placeFacts.sourceId })
          .from(placeFacts)
          .where(
            and(
              eq(placeFacts.placeRefKind, "place_id"),
              eq(placeFacts.placeRef, r.p.placeRef),
              eq(placeFacts.factType, factType),
              isNull(placeFacts.planId),
              inArray(placeFacts.origin, [...PAGE_READ_ORIGINS]),
              eq(placeFacts.license, "official"),
              isNull(placeFacts.supersededBy),
            ),
          )
          .orderBy(desc(placeFacts.fetchedAt))
          .limit(1)
      : [];
    out.push({ ...r.p, botName: r.botName ?? null, sourceName: r.sourceName ?? null, currentFact: current ?? null });
  }
  return out;
}

export type ApproveRefusal = "not_found" | "not_pending" | "bad_kind" | "source_not_eligible" | "url_not_https" | "url_off_source_host" | "fact_refused" | ReviewExpiryRefusal;

/**
 * Approve. Checked first, then ONE transaction: claim `pending → approved` (the statement is the guard, §15), write
 * the fact through `recordFacts` (origin `bot_proposal`, the source's license, `verified_by` = the admin, fetched and
 * verified at the approval moment so the provenance line reads "checked <approval date>"), stamp `fact_id`. A fact
 * the writer refuses rolls the claim back.
 */
export async function approveBotProposal(
  id: string,
  adminId: string,
  now: Date = new Date(),
  // CS-1 item 3: the reviewer's expiry. Required for last admission (a safety fact); optional for hours.
  opts: { expiresAt?: unknown } = {},
): Promise<{ ok: true; factId: string } | { ok: false; reason: ApproveRefusal }> {
  const [p] = await db.select().from(botProposals).where(eq(botProposals.id, id)).limit(1);
  if (!p) return { ok: false, reason: "not_found" };
  if (p.status !== "pending") return { ok: false, reason: "not_pending" };
  if (!isBotProposalKind(p.kind)) return { ok: false, reason: "bad_kind" };
  const [src] = p.sourceId ? await db.select().from(contentSources).where(eq(contentSources.id, p.sourceId)).limit(1) : [];
  const verdict = admitBotSource(src ?? null, p.sourceUrl);
  if (!verdict.ok) return { ok: false, reason: verdict.reason };
  const [setting] = await db.select({ v: platformSettingsTable.settingValue }).from(platformSettingsTable).where(eq(platformSettingsTable.settingKey, BOT_FACT_DEFAULT_EXPIRY_SETTING)).limit(1);
  const { factType, need } = factForKind(p.kind);
  // CS-1 item 3: the expiry is the reviewer's — no later than the source's expiry setting (falling back to the
  // platform setting), counted from this approval, the fact's check date. Hours may take that latest date.
  const expiry = resolveReviewedExpiry({ factType, checkedAt: now, sourceIntervalDays: src!.refreshIntervalDays, settingValue: setting?.v ?? null, entered: opts.expiresAt, now });
  if (!expiry.ok) return { ok: false, reason: expiry.reason };
  const factId = crypto.randomUUID();
  const draft = {
    id: factId,
    placeRefKind: "place_id" as const,
    placeRef: p.placeRef,
    placeLat: null,
    placeLng: null,
    market: p.market,
    need,
    factType,
    value: p.value as Record<string, unknown>,
    origin: BOT_FACT_ORIGIN,
    sourceId: p.sourceId,
    sourceUrl: p.sourceUrl,
    license: (src!.licenseClass as LicenseClass) ?? null,
    fetchedAt: now,
    verifiedAt: now,
    verifiedBy: adminId,
    expiresAt: expiry.expiresAt,
    costCents: 0,
  };
  const pre = admitBotFact(draft);
  if (!pre.ok) return { ok: false, reason: "fact_refused" };

  class Refused extends Error {}
  try {
    await db.transaction(async (tx) => {
      const [claimed] = await tx
        .update(botProposals)
        .set({ status: "approved", reviewedBy: adminId, reviewedAt: now })
        .where(and(eq(botProposals.id, id), eq(botProposals.status, "pending")))
        .returning({ id: botProposals.id });
      if (!claimed) throw new Refused("not_pending");
      const n = await recordFacts([draft], { planId: null, itemId: null }, tx);
      if (n !== 1) throw new Refused("fact_refused");
      await tx.update(botProposals).set({ factId }).where(eq(botProposals.id, id));
    });
  } catch (err) {
    if (err instanceof Refused) return { ok: false, reason: err.message as ApproveRefusal };
    throw err;
  }
  return { ok: true, factId };
}

/** Reject with a reason. Touches the proposal only — never `place_facts`. */
export async function rejectBotProposal(id: string, adminId: string, reason: string): Promise<{ ok: true } | { ok: false; reason: "not_found" | "not_pending" }> {
  const [row] = await db
    .update(botProposals)
    .set({ status: "rejected", reviewedBy: adminId, reviewedAt: new Date(), rejectReason: reason })
    .where(and(eq(botProposals.id, id), eq(botProposals.status, "pending")))
    .returning({ id: botProposals.id });
  if (row) return { ok: true };
  const [exists] = await db.select({ id: botProposals.id }).from(botProposals).where(eq(botProposals.id, id)).limit(1);
  return { ok: false, reason: exists ? "not_pending" : "not_found" };
}

