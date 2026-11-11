/**
 * bot-audit.service.ts — every bot key call is an audit row (slice 0, Addendum A v2, "Audit of every bot key call").
 *
 * ONE writer, `recordBotAudit`, beside `recordAdminAudit`. It writes `bot_audit_logs` (Phase 0 F1: `access_audit_logs`
 * requires a users row and a bot is not one) — reads and proposals alike, with the method, path and scope used, never
 * the token. It never fails the bot's request (§15b): a failed write is logged and swallowed.
 *
 * The admin read is filterable by bot. Rows older than `platform_settings.bot_audit_retention_days` (seeded 90) are
 * pruned by the daily job — a stated limit, not a reason to skip a row.
 */
import { randomUUID } from "node:crypto";
import { and, desc, eq, lt } from "drizzle-orm";
import { db } from "../db";
import { botAccounts, botAuditLogs, platformSettingsTable } from "@shared/schema";
import { logger } from "../infrastructure/logger";

export const BOT_AUDIT_ACTIONS = ["bot.read", "bot.propose", "bot.flag"] as const;
export type BotAuditAction = (typeof BOT_AUDIT_ACTIONS)[number];
export const BOT_AUDIT_RETENTION_SETTING = "bot_audit_retention_days";
const DEFAULT_RETENTION_DAYS = 90;

/** Pure: the audit action a bot request is. A POST to the proposals route proposes; every GET reads. */
export function botAuditActionFor(method: string, path: string): BotAuditAction {
  if (method.toUpperCase() === "POST" && /^\/api\/bot\/proposals\/?$/.test(path)) return "bot.propose";
  if (method.toUpperCase() === "POST" && /^\/api\/bot\/flags(\/|$)/.test(path)) return "bot.flag";
  return "bot.read";
}

export interface BotAuditValues {
  botId: string;
  action: BotAuditAction;
  method: string;
  path: string;
  scope: string | null;
  statusCode?: number | null;
  resourceType?: string | null;
  resourceId?: string | null;
  metadata?: Record<string, unknown> | null;
}

/** Write one bot audit row. Never throws. */
export async function recordBotAudit(values: BotAuditValues): Promise<void> {
  try {
    await db.insert(botAuditLogs).values({
      id: randomUUID(),
      botId: values.botId,
      action: values.action,
      method: values.method.toUpperCase().slice(0, 10),
      path: values.path.slice(0, 2000),
      scope: values.scope,
      statusCode: values.statusCode ?? null,
      resourceType: values.resourceType ?? null,
      resourceId: values.resourceId ? values.resourceId.slice(0, 300) : null,
      metadata: values.metadata ?? null,
    } as any);
  } catch (err: any) {
    logger.error({ botId: values.botId, action: values.action, err: err?.message }, "[bot audit] write failed (request not failed)");
  }
}

/** The admin read, filterable by bot. Newest first. */
export async function listBotAudit(opts: { botId?: string | null; limit?: number } = {}) {
  const limit = Math.min(Math.max(Number(opts.limit) || 100, 1), 500);
  const where = opts.botId ? eq(botAuditLogs.botId, opts.botId) : undefined;
  return db
    .select({
      id: botAuditLogs.id,
      botId: botAuditLogs.botId,
      botName: botAccounts.name,
      action: botAuditLogs.action,
      method: botAuditLogs.method,
      path: botAuditLogs.path,
      scope: botAuditLogs.scope,
      statusCode: botAuditLogs.statusCode,
      resourceType: botAuditLogs.resourceType,
      resourceId: botAuditLogs.resourceId,
      createdAt: botAuditLogs.createdAt,
    })
    .from(botAuditLogs)
    .leftJoin(botAccounts, eq(botAccounts.id, botAuditLogs.botId))
    .where(where as any)
    .orderBy(desc(botAuditLogs.createdAt))
    .limit(limit);
}

/** The retention, read live. A missing or unusable value reads as the seeded 90. */
export async function readBotAuditRetentionDays(): Promise<number> {
  try {
    const [row] = await db
      .select({ v: platformSettingsTable.settingValue })
      .from(platformSettingsTable)
      .where(eq(platformSettingsTable.settingKey, BOT_AUDIT_RETENTION_SETTING))
      .limit(1);
    const n = Number(row?.v);
    return Number.isInteger(n) && n >= 1 ? n : DEFAULT_RETENTION_DAYS;
  } catch {
    return DEFAULT_RETENTION_DAYS;
  }
}

/** Delete bot audit rows older than the retention. Returns how many went. Bot rows only — never an admin's row. */
export async function pruneBotAudit(now: Date = new Date()): Promise<number> {
  const days = await readBotAuditRetentionDays();
  const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const gone = await db.delete(botAuditLogs).where(and(lt(botAuditLogs.createdAt, cutoff))).returning({ id: botAuditLogs.id });
  return gone.length;
}
