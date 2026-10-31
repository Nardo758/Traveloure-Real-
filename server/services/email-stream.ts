/**
 * Marketing stream configuration (Z-21).
 *
 * The sender and the Resend tag or audience id are read from the environment.
 * Nothing here names a domain. A marketing send is refused when the sender is
 * missing, when it is the same string as the transactional sender, or when
 * neither a tag nor an audience id is set.
 */

export const EMAIL_FROM_MARKETING_ENV = "EMAIL_FROM_MARKETING";
export const RESEND_MARKETING_TAG_ENV = "RESEND_MARKETING_TAG";
export const RESEND_MARKETING_AUDIENCE_ENV = "RESEND_MARKETING_AUDIENCE_ID";

export const MARKETING_STREAM_UNCONFIGURED = "marketing_stream_unconfigured";

export interface MarketingStreamTag {
  name: string;
  value: string;
}

export type MarketingStreamConfig =
  | { ok: true; from: string; tags: MarketingStreamTag[] }
  | { ok: false; missing: string[] };

function trimmed(env: NodeJS.ProcessEnv, key: string): string {
  const value = env[key];
  return typeof value === "string" ? value.trim() : "";
}

/**
 * transactionalFrom is the sender the transactional stream would use.
 * A marketing sender that copies it is not a separate stream.
 */
export function marketingStreamConfig(
  env: NodeJS.ProcessEnv = process.env,
  transactionalFrom?: string | null,
): MarketingStreamConfig {
  const from = trimmed(env, EMAIL_FROM_MARKETING_ENV);
  const tag = trimmed(env, RESEND_MARKETING_TAG_ENV);
  const audience = trimmed(env, RESEND_MARKETING_AUDIENCE_ENV);
  const missing: string[] = [];
  const transactional = typeof transactionalFrom === "string" ? transactionalFrom.trim() : "";
  if (!from || (transactional.length > 0 && from === transactional)) missing.push(EMAIL_FROM_MARKETING_ENV);
  if (!tag && !audience) missing.push(RESEND_MARKETING_TAG_ENV, RESEND_MARKETING_AUDIENCE_ENV);
  if (missing.length > 0) return { ok: false, missing };
  const tags: MarketingStreamTag[] = [];
  if (tag) tags.push({ name: "stream", value: tag });
  if (audience) tags.push({ name: "audience", value: audience });
  return { ok: true, from, tags };
}
