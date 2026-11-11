/**
 * issue-queue.service.ts — the per-market issue queue (slice 0, Addendum A v2). DERIVED, not a table.
 *
 * Addendum A names four existing reads. Two exist on main and are read here (Phase 0 F4):
 *   · expired facts — a public, non-plan `place_facts` row past `expires_at` and not superseded;
 *   · pending bot proposals — `bot_proposals.status = 'pending'`.
 * The other two join when their slices land: provider gaps (`listing_gap`, slice 1) and unclaimed questions (slice 7).
 * Message reports carry no market and stay on their own moderator/admin routes.
 *
 * Scope: `"all"` for owner/platform_admin; otherwise only the assigned markets (an empty scope reads nothing, and a
 * row with no market is in no scope). The bot projection (Ops Bot, `queue:read`) carries ids, kinds, markets and ages
 * only — no proposal body, no bot name, no user id.
 */
import { and, asc, eq, inArray, isNotNull, isNull, lt } from "drizzle-orm";
import { db } from "../db";
import { botAccounts, botProposals, placeFacts } from "@shared/schema";

export type IssueKind = "expired_fact" | "bot_proposal";

export interface IssueQueueItem {
  kind: IssueKind;
  id: string;
  market: string | null;
  since: Date | null;
  /** Admin-only detail. Never on the bot projection. */
  detail?: Record<string, unknown>;
}

const LIMIT = 200;

export async function listIssueQueue(scope: "all" | readonly string[], now: Date = new Date()): Promise<IssueQueueItem[]> {
  if (scope !== "all" && scope.length === 0) return [];
  const marketWhere = (col: any) => (scope === "all" ? undefined : inArray(col, [...scope]));

  const facts = await db
    .select({ id: placeFacts.id, market: placeFacts.market, factType: placeFacts.factType, placeRef: placeFacts.placeRef, expiresAt: placeFacts.expiresAt })
    .from(placeFacts)
    .where(
      and(
        isNotNull(placeFacts.expiresAt),
        lt(placeFacts.expiresAt, now),
        isNull(placeFacts.supersededBy),
        isNull(placeFacts.planId),
        isNull(placeFacts.itineraryItemId),
        marketWhere(placeFacts.market),
      ),
    )
    .orderBy(asc(placeFacts.expiresAt))
    .limit(LIMIT);

  const proposals = await db
    .select({ id: botProposals.id, market: botProposals.market, kind: botProposals.kind, createdAt: botProposals.createdAt, botName: botAccounts.name, assignedTo: botProposals.assignedTo })
    .from(botProposals)
    .leftJoin(botAccounts, eq(botAccounts.id, botProposals.botId))
    .where(and(eq(botProposals.status, "pending"), marketWhere(botProposals.market)))
    .orderBy(asc(botProposals.createdAt))
    .limit(LIMIT);

  return [
    ...facts.map((f) => ({
      kind: "expired_fact" as const,
      id: f.id,
      market: f.market ?? null,
      since: f.expiresAt ?? null,
      detail: { factType: f.factType, placeRef: f.placeRef },
    })),
    ...proposals.map((p) => ({
      kind: "bot_proposal" as const,
      id: p.id,
      market: p.market ?? null,
      since: p.createdAt ?? null,
      detail: { proposalKind: p.kind, proposedBy: p.botName ?? null, assignedTo: p.assignedTo ?? null },
    })),
  ];
}

/** Pure: the Ops Bot's view of the queue — ids, kinds, markets and ages. Nothing else crosses. */
export function botQueueProjection(items: readonly IssueQueueItem[]): Array<Omit<IssueQueueItem, "detail">> {
  return items.map(({ kind, id, market, since }) => ({ kind, id, market, since }));
}
