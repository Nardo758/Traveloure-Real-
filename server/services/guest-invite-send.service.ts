/**
 * GUEST INVITE SEND RAIL (ledger `2026-09-04-invite-mailer`).
 *
 * THE DEFECT THIS CLOSES. The guest-invite system was wired end to end — per-guest tokens, a
 * public RSVP page, origin capture, travel plans, RSVP stats — EXCEPT that no email was ever
 * sent. `POST /api/events/:id/invites` stamped `invite_sent_at` at creation while calling no
 * mailer at all, so the column asserted a send that had never happened, `invite_templates` could
 * be authored but nothing applied them, and `invite_send_log` had neither a reader nor a writer.
 * The host's only real path was copying each link by hand.
 *
 * ── The rules this rail is built on ──────────────────────────────────────────────────────────
 *
 * ONE MAIL IMPLEMENTATION (§18 rule 1). Nothing here talks to Resend. Every message goes through
 * `enqueueGuestInviteEmail` → `enqueueEmail` → the existing outbox, so the platform kill switch,
 * the retry schedule and the admin dead-letter view apply to invites exactly as they do to
 * booking confirmations. There is no second provider and no direct API call from a route handler.
 *
 * IDENTITY COMES FROM THE SESSION AND THE ROW, NEVER THE BODY (§14). The acting user is passed in
 * from `getUserId(req)`. The recipient is `event_invites.guest_email` as the host stored it — the
 * request body cannot name an address, and there is no parameter here that would let it.
 *
 * THE CLAIM IS THE GUARD (§15). `storage.claimInviteSend` is a row-locked conditional update:
 * a double click claims once and the loser enqueues nothing. `invite_sent_at` is only left
 * standing when the outbox actually accepted the message; a failed enqueue puts the previous
 * value back, because a stamp with no outbox row behind it is a claim the platform cannot
 * support (§13).
 *
 * ENQUEUED IS NOT DELIVERED. The outbox accepting a message says the platform will try, with
 * retries. It says nothing about receipt or opening, and no outcome this module returns —
 * and no `invite_send_log` row it writes — ever claims otherwise. The schema's `opened_at` /
 * `clicked_at` columns stay NULL because nothing in this codebase observes those events.
 *
 * A HIDDEN OCCASION IS NOT SENDABLE. Migration 276's `experience_types.default_visibility`
 * carries "hidden" for the proposal case, where the entire point is that the other person does
 * not find out. The client already hides the guest surface for those; this module refuses the
 * SEND, which is the layer a crafted request cannot skip.
 *
 * ── Testability ──────────────────────────────────────────────────────────────────────────────
 *
 * Every effect is reached through `InviteSendPorts`, defaulting to storage + the outbox. The
 * decision logic — the ownership refusal, the visibility refusal, the claim-once behaviour, the
 * rollback on a failed enqueue — is therefore provable with no database and no network
 * (`server/__tests__/guest-invite-mailer.test.ts`). The SQL those ports front is proven
 * separately against a real database in `server/__tests__/guest-invite-send.db.test.ts`.
 */

import type { GuestInviteEmailParams } from "./guest-invite-email";
import type { EventInvite, InviteTemplate } from "../../shared/guest-invites-schema";

// `storage` and the outbox are reached through DYNAMIC imports inside `defaultInviteSendPorts`,
// never at module load. Both pull in `server/db.ts`, which throws when DATABASE_URL is unset — a
// static import here would make this module unloadable without a database and would take the
// decision logic down with it. The outbox service already uses the same trick for `email.service`.
// The consequence is the point: the rules in this file are provable with no DB and no network.

/**
 * How recently an invite must have been sent for another send to be refused as a duplicate.
 *
 * This is a DEBOUNCE, not a lifetime lock: a double click (or a retried request) inside the
 * window claims exactly once, while a host who deliberately re-sends an hour later is allowed to.
 * Making it permanent would mean a host whose guest lost the email could never re-send, which
 * trades one broken affordance for another.
 */
export const INVITE_SEND_DEBOUNCE_MS = 5 * 60 * 1000;

/** How the send rail addresses a guest today. `invite_send_log.method` records it verbatim. */
export const INVITE_SEND_METHOD = "email" as const;

/**
 * What happened to ONE invite.
 *
 * `enqueued`             — the outbox accepted the message and `invite_sent_at` now stands.
 * `skipped_recently_sent`— the claim matched no row: already sent inside the debounce window,
 *                          or the row does not belong to this experience/organizer pair.
 * `enqueue_failed`       — no durable outbox row could be written; `invite_sent_at` was put back.
 */
export type InviteSendOutcome = "enqueued" | "skipped_recently_sent" | "enqueue_failed";

export interface InviteSendRowResult {
  inviteId: string;
  outcome: InviteSendOutcome;
  /** The timestamp now standing on the row — present only for `enqueued`. */
  sentAt?: string;
}

/** Why a whole send was refused before any message was built. */
export type InviteSendRefusal = "experience_not_found" | "not_owner" | "hidden_occasion";

export type SendInvitesResult =
  | { ok: true; results: InviteSendRowResult[] }
  | { ok: false; refusal: InviteSendRefusal; message: string };

export interface ExperienceSendContext {
  id: string;
  ownerId: string | null;
  title: string | null;
  location: string | null;
  eventDate: string | null;
  defaultVisibility: string | null;
}

/** Every effect this module has, so the decision logic can be tested without either. */
export interface InviteSendPorts {
  getExperienceSendContext(experienceId: string): Promise<ExperienceSendContext | null>;
  getInvitesByExperience(experienceId: string): Promise<EventInvite[]>;
  claimInviteSend(params: {
    inviteId: string;
    experienceId: string;
    organizerId: string;
    notSentSince: Date;
    claimedAt: Date;
  }): Promise<{ invite: EventInvite; previousSentAt: Date | null } | null>;
  releaseInviteSendClaim(inviteId: string, claimedAt: Date, previousSentAt: Date | null): Promise<void>;
  recordInviteSendLog(values: {
    inviteId: string;
    method: string;
    recipientAddress: string;
    status: string;
    errorMessage?: string | null;
  }): Promise<unknown>;
  getInviteTemplateForUser(templateId: string, userId: string): Promise<InviteTemplate | null>;
  enqueue(params: {
    toEmail: string;
    inviteId: string;
    experienceId: string;
    email: GuestInviteEmailParams;
  }): Promise<number | null>;
  now(): Date;
}

async function getStorage() {
  return (await import("../storage")).storage;
}

export const defaultInviteSendPorts: InviteSendPorts = {
  getExperienceSendContext: async (id) => (await getStorage()).getExperienceSendContext(id),
  getInvitesByExperience: async (id) => (await getStorage()).getInvitesByExperience(id),
  claimInviteSend: async (p) => (await getStorage()).claimInviteSend(p),
  releaseInviteSendClaim: async (id, claimedAt, prev) =>
    (await getStorage()).releaseInviteSendClaim(id, claimedAt, prev),
  recordInviteSendLog: async (v) => (await getStorage()).recordInviteSendLog(v),
  getInviteTemplateForUser: async (templateId, userId) =>
    (await getStorage()).getInviteTemplateForUser(templateId, userId),
  enqueue: async (p) => (await import("./email-outbox.service")).enqueueGuestInviteEmail(p),
  now: () => new Date(),
};

/**
 * The ONE place an invite URL is shaped. The organizer list endpoint and the email body both call
 * this, so a host reading a link off the table and a guest clicking one in their inbox are looking
 * at the same string (§18 rule 1).
 */
export function buildInviteLink(uniqueToken: string): string {
  const base = process.env.APP_URL || "https://traveloure.com";
  return `${base}/invite/${uniqueToken}`;
}

/**
 * `experience_types.default_visibility` === "hidden" ⇒ the occasion has no guest surface at all.
 *
 * NULL / unrecognised ⇒ NOT hidden, matching `isHiddenOccasion` in
 * `client/src/lib/occasion-switches.ts` exactly: the column is nullable with no DB CHECK
 * (the publish-trap posture), and hiding on a row nobody has given a value to would silently
 * disable sending for every occasion seeded before migration 276 (§13). The comparison is
 * restated here rather than imported because that reader is a client module; if a third reader
 * ever appears, the reader belongs in `shared/`.
 */
export function isHiddenOccasionRow(ctx: { defaultVisibility: string | null }): boolean {
  return ctx.defaultVisibility === "hidden";
}

/**
 * Render `user_experiences.event_date` (a DATE column, so a bare "YYYY-MM-DD" string) for a human.
 *
 * Fixed to UTC deliberately: a calendar date has no time zone, and re-reading it in the server's
 * local zone is how a date slides back a day. An unparseable or absent value returns null and the
 * message simply omits the date rather than printing a placeholder (§13).
 */
export function formatEventDateForEmail(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const iso = String(raw).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const parsed = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleDateString("en-US", {
    timeZone: "UTC",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export interface SendInvitesParams {
  experienceId: string;
  /** The acting user, from the session. Never from the body. */
  organizerId: string;
  /**
   * Which invites to send. Omitted / empty ⇒ every invite on the event that the debounce window
   * lets through, which is how "send to everyone who hasn't been emailed" is expressed: the claim
   * decides, not a client-side filter.
   */
  inviteIds?: string[];
  /** An `invite_templates` row id, resolved self-scoped against the acting user. */
  templateId?: string;
}

/**
 * Send (enqueue) invite emails for one event.
 *
 * Order is deliberate and follows §15b — CLAIM, then the effect the claim authorizes, and the
 * record last:
 *
 *   1. Load the event and REFUSE the whole send if it is missing, not the caller's, or hidden.
 *   2. Resolve the template once, not per guest.
 *   3. Per invite: claim atomically → build the message from the ROW → enqueue → on failure put
 *      `invite_sent_at` back → append one `invite_send_log` row either way.
 *
 * Never throws for a per-guest failure: one guest's bad row must not abort the rest of the list.
 */
export async function sendExperienceInvites(
  params: SendInvitesParams,
  ports: InviteSendPorts = defaultInviteSendPorts,
): Promise<SendInvitesResult> {
  const ctx = await ports.getExperienceSendContext(params.experienceId);
  if (!ctx) {
    return { ok: false, refusal: "experience_not_found", message: "Event not found" };
  }

  // The route's own ownership gate produces the 403 that matches the rest of this rail; this is
  // the copy that cannot be bypassed by a caller reaching the service another way, and the
  // organizer-scoped claim below is the third layer, at the DB.
  if (!ctx.ownerId || ctx.ownerId !== params.organizerId) {
    return {
      ok: false,
      refusal: "not_owner",
      message: "You don't have permission to send invites for this experience",
    };
  }

  if (isHiddenOccasionRow(ctx)) {
    return {
      ok: false,
      refusal: "hidden_occasion",
      message:
        "This occasion is hidden, so invites can't be emailed — sending one is how the surprise gets spoiled. Change the occasion's visibility first.",
    };
  }

  let template: InviteTemplate | null = null;
  if (params.templateId) {
    // Self-scoped: a template the acting user did not author resolves to null and the send falls
    // back to the default wording rather than borrowing someone else's message.
    template = await ports.getInviteTemplateForUser(params.templateId, params.organizerId);
  }

  const all = await ports.getInvitesByExperience(params.experienceId);
  const wanted = params.inviteIds?.length ? new Set(params.inviteIds) : null;
  const targets = wanted ? all.filter((i) => wanted.has(i.id)) : all;

  const now = ports.now();
  const notSentSince = new Date(now.getTime() - INVITE_SEND_DEBOUNCE_MS);
  const eventDate = formatEventDateForEmail(ctx.eventDate);

  const results: InviteSendRowResult[] = [];

  for (const target of targets) {
    const claim = await ports.claimInviteSend({
      inviteId: target.id,
      experienceId: params.experienceId,
      organizerId: params.organizerId,
      notSentSince,
      claimedAt: now,
    });

    if (!claim) {
      results.push({ inviteId: target.id, outcome: "skipped_recently_sent" });
      continue;
    }

    const invite = claim.invite;
    let outboxId: number | null = null;
    let failure: string | null = null;

    try {
      outboxId = await ports.enqueue({
        toEmail: invite.guestEmail,
        inviteId: invite.id,
        experienceId: params.experienceId,
        email: {
          guestName: invite.guestName,
          eventTitle: ctx.title,
          eventLocation: ctx.location,
          eventDate,
          // The guest's OWN token. Built by the one link builder, never by string-concatenation
          // at a call site, and never another guest's token.
          inviteLink: buildInviteLink(invite.uniqueToken),
          template: template ? { subject: template.subject, messageBody: template.messageBody } : null,
        },
      });
    } catch (err: unknown) {
      // enqueueEmail is documented never to throw; be defensive so one guest cannot abort the run.
      failure = err instanceof Error ? err.message : String(err);
      console.error("[guest-invite] enqueue threw", { inviteId: invite.id, error: failure });
    }

    if (outboxId === null) {
      // No durable outbox row ⇒ nothing will ever be retried ⇒ the stamp would be false.
      await ports.releaseInviteSendClaim(invite.id, now, claim.previousSentAt);
      await ports.recordInviteSendLog({
        inviteId: invite.id,
        method: INVITE_SEND_METHOD,
        recipientAddress: invite.guestEmail,
        status: "failed",
        errorMessage: failure ?? "outbox did not accept the message",
      });
      results.push({ inviteId: invite.id, outcome: "enqueue_failed" });
      continue;
    }

    await ports.recordInviteSendLog({
      inviteId: invite.id,
      method: INVITE_SEND_METHOD,
      recipientAddress: invite.guestEmail,
      // 'sent' here means THE OUTBOX ACCEPTED IT. The outbox row carries the real delivery state
      // and its own retries; this log row records that the host asked and the platform took it.
      status: "sent",
      errorMessage: null,
    });
    results.push({ inviteId: invite.id, outcome: "enqueued", sentAt: now.toISOString() });
  }

  return { ok: true, results };
}
