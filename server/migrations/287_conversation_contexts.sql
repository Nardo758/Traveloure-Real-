-- Migration 287: conversation_contexts — WHAT a conversation is about.
-- Ledger `2026-09-05-user-id-is-internal`, CLAUDE.md Locked Decision 40.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- WHAT THIS IS
-- ─────────────────────────────────────────────────────────────────────────────
-- A messaging thread between two people had no record of WHY it exists. The platform could see
-- that A messaged B and nothing else — so pre-service traffic (a storefront enquiry, a question
-- about a listing) and post-service traffic (a thread about a booking already paid for) were the
-- same undifferentiated rows. Locked Decision 40 makes contact ADDRESSED BY CONTEXT: a channel is
-- opened by naming a handle, a service or a booking, and the address that opened it is recorded
-- here.
--
-- `conversation_id` is the INTERNAL pair id from `buildConversationId` (the two user ids sorted
-- and joined). It is deliberately the internal one and NOT the public HMAC id: the public id is a
-- keyed projection that must stay recomputable from — and revocable independently of — what is
-- stored, and a key rotation must never orphan a context row.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- ADDITIVE, NO DB CHECK, NO BACKFILL — deliberately
-- ─────────────────────────────────────────────────────────────────────────────
-- `context_kind` holds `storefront` | `service` | `booking`, APP-ENFORCED (the pick-based zod
-- allowlist on the write path) with NO CHECK constraint. This is the publish-trap posture
-- (migrations 181 / 195 / 273 / 275 / 276 / 277 / 279 / 280 / 281 / 282 / 284): a CHECK over an
-- app-enforced value set is exactly the publish-time drizzle-push failure CLAUDE.md's Coordination
-- Prevention notes warn about, and when it fires it offers the DESTRUCTIVE "copy dev database over
-- production" option.
--
-- NO BACKFILL. Every thread that exists today has NO rows here, and that is a finished answer: an
-- older thread is rendered honestly as having no context (§13), never labelled `storefront` on the
-- assumption that most of them probably were. Stamping a guess would turn "we never recorded it"
-- into "the platform knows this was a storefront enquiry", which is a different claim.
--
-- `created_by` is a user id — INTERNAL by this very ruling, which is why it lives on a row no
-- client body can write and no public payload returns.
--
-- UNIQUE (conversation_id, context_kind, context_id) makes the write idempotent by construction:
-- the start rail inserts ON CONFLICT DO NOTHING, so re-opening the same thread from the same
-- storefront twice records one row, not two, and needs no check-then-insert (§15's posture — the
-- statement is the guard).
--
-- The TABLE, the UNIQUE and the INDEX are ALSO declared in `shared/schema.ts` in this same commit —
-- the deploy-push durability rule: an object that file does not declare is dropped by Replit's
-- publish-time push and never recreated, because this migration is stamped by then.
--
-- Idempotent; safe to re-run.

CREATE TABLE IF NOT EXISTS conversation_contexts (
  id varchar PRIMARY KEY,
  conversation_id text NOT NULL,
  context_kind varchar(20) NOT NULL,
  context_id text NOT NULL,
  created_by varchar,
  created_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS conversation_contexts_unique
  ON conversation_contexts (conversation_id, context_kind, context_id);

CREATE INDEX IF NOT EXISTS conversation_contexts_target_idx
  ON conversation_contexts (context_kind, context_id);

COMMENT ON TABLE conversation_contexts IS
  'What a messaging thread is about (migration 287, ledger 2026-09-05-user-id-is-internal). conversation_id is the INTERNAL pair id. context_kind is storefront|service|booking, app-enforced, no CHECK. Written server-side only. No rows = an older thread with no recorded context; never rendered as a guessed one.';
