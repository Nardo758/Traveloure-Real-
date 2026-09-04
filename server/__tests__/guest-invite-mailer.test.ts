/**
 * GUEST INVITE MAILER — behavioural proof (ledger `2026-09-04-invite-mailer`).
 *
 * PURE UNIT. No database, no server, no network, no Resend key, no clock — every effect the send
 * rail has is reached through `InviteSendPorts`, and this file supplies fakes for all of them. It
 * runs anywhere:
 *
 *   npx tsx --test server/__tests__/guest-invite-mailer.test.ts
 *
 * WHAT IS PROVEN HERE, and what is NOT.
 *
 * Proven: the DECISIONS. Who is refused, what the message may contain, that a double send enqueues
 * once, that a failed enqueue never leaves a false `invite_sent_at`, that "send all" is decided by
 * the claim rather than by a client-side filter.
 *
 * NOT proven here: the SQL those ports front. `claimInviteSend`'s row lock and its
 * `organizer_id` predicate are real-database behaviour — a fake that enforces them proves the
 * fake. Those live in `server/__tests__/guest-invite-send.db.test.ts`, which is BENCH-ONLY.
 * The HTTP layer (401/403/404/409/429 and the rate limiter) is likewise not exercised here.
 *
 *   M1  the email carries the guest's OWN token link and no private field
 *   M2  an organizer template is applied, escaped, and never loses the link
 *   M3  a hidden occasion is refused — nothing is claimed and nothing is enqueued
 *   M4  a non-owner is refused — nothing is claimed and nothing is enqueued
 *   M5  a double send enqueues exactly ONCE
 *   M6  an enqueue that writes no outbox row rolls `invite_sent_at` back and logs a failure
 *   M7  "send all" sends only what the claim lets through
 *   M8  the event date is rendered UTC-stable, or omitted entirely
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  buildGuestInviteEmailPayload,
  INVITE_TEMPLATE_VARIABLES,
} from "../services/guest-invite-email";
import {
  INVITE_SEND_DEBOUNCE_MS,
  buildInviteLink,
  formatEventDateForEmail,
  isHiddenOccasionRow,
  sendExperienceInvites,
  type ExperienceSendContext,
  type InviteSendPorts,
} from "../services/guest-invite-send.service";
import type { EventInvite, InviteTemplate } from "../../shared/guest-invites-schema";

// ── Fixtures ──────────────────────────────────────────────────────────────────────────────────

const OWNER = "user-owner";
const STRANGER = "user-stranger";
const EXPERIENCE = "exp-1";

function invite(overrides: Partial<EventInvite> & { id: string }): EventInvite {
  return {
    experienceId: EXPERIENCE,
    organizerId: OWNER,
    guestEmail: `${overrides.id}@example.invalid`,
    guestName: "Guest",
    guestPhone: null,
    uniqueToken: `token-${overrides.id}`,
    originCity: null,
    originState: null,
    originCountry: null,
    originLatitude: null,
    originLongitude: null,
    rsvpStatus: "pending",
    rsvpDate: null,
    numberOfGuests: 1,
    dietaryRestrictions: [],
    accommodationPreference: "undecided",
    transportationNeeded: false,
    specialRequests: null,
    message: null,
    inviteSentAt: null,
    inviteViewedAt: null,
    lastViewedAt: null,
    viewCount: 0,
    createdAt: new Date("2026-09-01T00:00:00Z"),
    updatedAt: new Date("2026-09-01T00:00:00Z"),
    ...overrides,
  } as EventInvite;
}

function context(overrides: Partial<ExperienceSendContext> = {}): ExperienceSendContext {
  return {
    id: EXPERIENCE,
    ownerId: OWNER,
    title: "Kyoto Wedding",
    location: "Kyoto, Japan",
    eventDate: "2026-10-11",
    defaultVisibility: null,
    ...overrides,
  };
}

interface Recorded {
  enqueued: Array<{ toEmail: string; inviteId: string; html: string; text: string; subject: string }>;
  logs: Array<{ inviteId: string; status: string; recipientAddress: string; errorMessage?: string | null }>;
  released: Array<{ inviteId: string; previousSentAt: Date | null }>;
  claims: string[];
}

/**
 * Ports backed by an in-memory list. `claimInviteSend` mirrors the real conditional — organizer
 * and experience scoping plus the debounce window — so the ORDERING and idempotency of the service
 * are exercised. It is a model of the SQL, not the SQL: see the file header.
 */
function makePorts(opts: {
  ctx?: ExperienceSendContext | null;
  invites: EventInvite[];
  template?: InviteTemplate | null;
  enqueueResult?: (inviteId: string) => number | null;
  now?: Date;
}): { ports: InviteSendPorts; rec: Recorded; rows: Map<string, EventInvite> } {
  const rows = new Map(opts.invites.map((i) => [i.id, { ...i }]));
  const rec: Recorded = { enqueued: [], logs: [], released: [], claims: [] };
  const now = opts.now ?? new Date("2026-09-04T12:00:00Z");

  const ports: InviteSendPorts = {
    async getExperienceSendContext() {
      return opts.ctx === undefined ? context() : opts.ctx;
    },
    async getInvitesByExperience() {
      return Array.from(rows.values());
    },
    async claimInviteSend(p) {
      const row = rows.get(p.inviteId);
      if (!row) return null;
      if (row.experienceId !== p.experienceId) return null;
      if (row.organizerId !== p.organizerId) return null;
      const prev = row.inviteSentAt ? new Date(row.inviteSentAt as unknown as string) : null;
      if (prev !== null && prev >= p.notSentSince) return null; // inside the debounce window
      row.inviteSentAt = p.claimedAt;
      rows.set(p.inviteId, row);
      rec.claims.push(p.inviteId);
      return { invite: { ...row }, previousSentAt: prev };
    },
    async releaseInviteSendClaim(inviteId, claimedAt, previousSentAt) {
      const row = rows.get(inviteId);
      if (row && row.inviteSentAt && +new Date(row.inviteSentAt as unknown as string) === +claimedAt) {
        row.inviteSentAt = previousSentAt;
        rows.set(inviteId, row);
      }
      rec.released.push({ inviteId, previousSentAt });
    },
    async recordInviteSendLog(v) {
      rec.logs.push(v);
      return v;
    },
    async getInviteTemplateForUser(templateId, userId) {
      if (!opts.template) return null;
      // Self-scoped, exactly like the storage method.
      return opts.template.userId === userId && opts.template.id === templateId ? opts.template : null;
    },
    async enqueue(p) {
      const payload = buildGuestInviteEmailPayload(p.email);
      const id = opts.enqueueResult ? opts.enqueueResult(p.inviteId) : 1;
      if (id !== null) {
        rec.enqueued.push({
          toEmail: p.toEmail,
          inviteId: p.inviteId,
          html: payload.html,
          text: payload.text,
          subject: payload.subject,
        });
      }
      return id;
    },
    now: () => now,
  };

  return { ports, rec, rows };
}

// ── M1 — the message carries the guest's own link and nothing private ─────────────────────────

describe("M1 — the invite email body", () => {
  test("carries the guest's OWN token link, in both the HTML and the text part", () => {
    const link = buildInviteLink("tok-abc");
    const payload = buildGuestInviteEmailPayload({
      guestName: "Aiko",
      eventTitle: "Kyoto Wedding",
      eventLocation: "Kyoto, Japan",
      eventDate: "October 11, 2026",
      inviteLink: link,
    });

    assert.ok(payload.html.includes("tok-abc"), "HTML must carry the guest's token");
    assert.ok(payload.text.includes(link), "text part must carry the link");
    assert.ok(payload.html.includes("/invite/tok-abc"));
  });

  test("cannot leak budget, preferences, prices or another guest — there is no parameter for them", () => {
    // The redaction IS the parameter list. Feeding the builder a fully-populated call and then
    // asserting on the OUTPUT is the only check that matters: anything private would have to
    // arrive through a field this interface does not have.
    const payload = buildGuestInviteEmailPayload({
      guestName: "Aiko",
      eventTitle: "Kyoto Wedding",
      eventLocation: "Kyoto, Japan",
      eventDate: "October 11, 2026",
      inviteLink: buildInviteLink("tok-abc"),
    });

    const body = `${payload.html}\n${payload.text}\n${payload.subject}`.toLowerCase();
    for (const forbidden of [
      "budget",
      "preference",
      "price",
      "$",
      "stepdata",
      "step_data",
      "dietary",
      "rsvpstatus",
      "guest_email",
      "other guest",
    ]) {
      assert.ok(!body.includes(forbidden), `body must not mention "${forbidden}"`);
    }
  });

  test("escapes a hostile event title rather than emitting markup", () => {
    const payload = buildGuestInviteEmailPayload({
      guestName: `<img src=x onerror="alert(1)">`,
      eventTitle: "<script>steal()</script>",
      inviteLink: buildInviteLink("tok-abc"),
    });
    // The invariant is that nothing user-supplied survives as MARKUP. The literal text
    // "onerror=" may still appear — escaped, inside a text node, where it is inert — so the
    // assertion is about tags and attribute quotes, not about the word.
    assert.ok(!payload.html.includes("<script>"), "no raw script tag");
    assert.ok(!payload.html.includes("<img"), "no raw img tag");
    assert.ok(!payload.html.includes('onerror="'), "no live event-handler attribute");
    assert.ok(payload.html.includes("&lt;script&gt;"));
    assert.ok(payload.html.includes("&lt;img"));
  });

  test("omits a fragment it has no value for instead of inventing one", () => {
    const payload = buildGuestInviteEmailPayload({
      eventTitle: "Kyoto Wedding",
      eventLocation: null,
      eventDate: null,
      inviteLink: buildInviteLink("tok-abc"),
    });
    const body = `${payload.html} ${payload.text}`;
    assert.ok(!/TBD|to be confirmed|to be announced/i.test(body), "no invented placeholder");
  });

  test("never claims the guest received, opened or read anything", () => {
    const payload = buildGuestInviteEmailPayload({
      eventTitle: "Kyoto Wedding",
      inviteLink: buildInviteLink("tok-abc"),
    });
    const body = `${payload.html} ${payload.text} ${payload.subject}`.toLowerCase();
    for (const claim of ["delivered", "you opened", "read receipt"]) {
      assert.ok(!body.includes(claim), `body must not claim "${claim}"`);
    }
  });
});

// ── M2 — templates ────────────────────────────────────────────────────────────────────────────

describe("M2 — an organizer template", () => {
  const template = {
    id: "tpl-1",
    userId: OWNER,
    name: "Warm",
    subject: "{{guest_name}}, join us for {{event_name}}",
    messageBody: "Dear {{guest_name}},\n\nWe'd love you at {{event_name}} on {{event_date}}.\n{{invite_link}}",
  } as InviteTemplate;

  test("substitutes all four supported placeholders", () => {
    const link = buildInviteLink("tok-abc");
    const payload = buildGuestInviteEmailPayload({
      guestName: "Aiko",
      eventTitle: "Kyoto Wedding",
      eventDate: "October 11, 2026",
      inviteLink: link,
      template,
    });

    assert.equal(payload.subject, "Aiko, join us for Kyoto Wedding");
    assert.ok(payload.text.includes("Dear Aiko,"));
    assert.ok(payload.text.includes("Kyoto Wedding on October 11, 2026"));
    assert.ok(payload.text.includes(link));
    assert.deepEqual([...INVITE_TEMPLATE_VARIABLES], ["guest_name", "event_name", "event_date", "invite_link"]);
  });

  test("escapes the template body and does not let a substituted value cascade", () => {
    const hostile = {
      ...template,
      subject: null,
      messageBody: "<b>hi</b> {{guest_name}}",
    } as InviteTemplate;
    const payload = buildGuestInviteEmailPayload({
      // A guest name that itself looks like a placeholder must be inserted literally.
      guestName: "{{invite_link}}",
      eventTitle: "Kyoto Wedding",
      inviteLink: buildInviteLink("secret-token"),
      template: hostile,
    });
    assert.ok(!payload.html.includes("<b>hi</b>"), "template markup is escaped, not rendered");
    assert.ok(payload.html.includes("&lt;b&gt;hi&lt;/b&gt;"));
    assert.ok(
      payload.html.includes("{{invite_link}}"),
      "a value that looks like a placeholder is inserted literally, never re-expanded",
    );
  });

  test("still carries a working link when the template forgets the placeholder", () => {
    const linkless = { ...template, subject: null, messageBody: "Come to the thing." } as InviteTemplate;
    const link = buildInviteLink("tok-abc");
    const payload = buildGuestInviteEmailPayload({
      guestName: "Aiko",
      eventTitle: "Kyoto Wedding",
      inviteLink: link,
      template: linkless,
    });
    assert.ok(payload.html.includes(link), "the button/footer link is appended regardless");
    assert.ok(payload.text.includes(link));
  });

  test("leaves an unknown placeholder as the host authored it", () => {
    const unknown = { ...template, subject: null, messageBody: "Meet at {{venue}}." } as InviteTemplate;
    const payload = buildGuestInviteEmailPayload({
      eventTitle: "Kyoto Wedding",
      inviteLink: buildInviteLink("tok-abc"),
      template: unknown,
    });
    assert.ok(payload.text.includes("{{venue}}"), "unknown tokens are returned, never silently blanked");
  });

  test("a template belonging to someone else is not applied", async () => {
    const { ports, rec } = makePorts({
      invites: [invite({ id: "i1" })],
      template: { ...template, userId: STRANGER } as InviteTemplate,
    });
    const out = await sendExperienceInvites(
      { experienceId: EXPERIENCE, organizerId: OWNER, templateId: "tpl-1" },
      ports,
    );
    assert.equal(out.ok, true);
    assert.equal(rec.enqueued.length, 1);
    // Fell back to the default wording rather than borrowing the stranger's message.
    assert.ok(rec.enqueued[0].subject.startsWith("You're invited"));
  });
});

// ── M3 — a hidden occasion is refused ─────────────────────────────────────────────────────────

describe("M3 — hidden occasion", () => {
  test("refuses the whole send, claims nothing and enqueues nothing", async () => {
    const { ports, rec, rows } = makePorts({
      ctx: context({ defaultVisibility: "hidden" }),
      invites: [invite({ id: "i1" }), invite({ id: "i2" })],
    });

    const out = await sendExperienceInvites({ experienceId: EXPERIENCE, organizerId: OWNER }, ports);

    assert.equal(out.ok, false);
    assert.equal(out.ok === false && out.refusal, "hidden_occasion");
    assert.equal(rec.claims.length, 0, "nothing may be claimed");
    assert.equal(rec.enqueued.length, 0, "nothing may be enqueued");
    assert.equal(rec.logs.length, 0);
    assert.equal(rows.get("i1")!.inviteSentAt, null, "invite_sent_at is untouched");
  });

  test("the fallback is SHOWN: a null or unrecognised switch does not block sending", async () => {
    assert.equal(isHiddenOccasionRow({ defaultVisibility: "hidden" }), true);
    assert.equal(isHiddenOccasionRow({ defaultVisibility: "shown" }), false);
    assert.equal(isHiddenOccasionRow({ defaultVisibility: null }), false);
    assert.equal(isHiddenOccasionRow({ defaultVisibility: "something-else" }), false);

    const { ports, rec } = makePorts({
      ctx: context({ defaultVisibility: null }),
      invites: [invite({ id: "i1" })],
    });
    const out = await sendExperienceInvites({ experienceId: EXPERIENCE, organizerId: OWNER }, ports);
    assert.equal(out.ok, true);
    assert.equal(rec.enqueued.length, 1);
  });
});

// ── M4 — a non-owner is refused ───────────────────────────────────────────────────────────────

describe("M4 — ownership", () => {
  test("a stranger is refused before any row is touched", async () => {
    const { ports, rec, rows } = makePorts({ invites: [invite({ id: "i1" })] });

    const out = await sendExperienceInvites({ experienceId: EXPERIENCE, organizerId: STRANGER }, ports);

    assert.equal(out.ok, false);
    assert.equal(out.ok === false && out.refusal, "not_owner");
    assert.equal(rec.claims.length, 0);
    assert.equal(rec.enqueued.length, 0);
    assert.equal(rows.get("i1")!.inviteSentAt, null);
  });

  test("an event that does not exist is a refusal, not an empty success", async () => {
    const { ports } = makePorts({ ctx: null, invites: [] });
    const out = await sendExperienceInvites({ experienceId: EXPERIENCE, organizerId: OWNER }, ports);
    assert.equal(out.ok, false);
    assert.equal(out.ok === false && out.refusal, "experience_not_found");
  });

  test("an invite belonging to another organizer is never enqueued, even when named explicitly", async () => {
    const { ports, rec } = makePorts({
      invites: [invite({ id: "i1" }), invite({ id: "foreign", organizerId: STRANGER })],
    });
    const out = await sendExperienceInvites(
      { experienceId: EXPERIENCE, organizerId: OWNER, inviteIds: ["foreign"] },
      ports,
    );
    assert.equal(out.ok, true);
    assert.equal(rec.enqueued.length, 0, "the organizer-scoped claim matched nothing");
    assert.equal(out.ok === true && out.results[0].outcome, "skipped_recently_sent");
  });
});

// ── M5 — a double send enqueues once ──────────────────────────────────────────────────────────

describe("M5 — idempotency", () => {
  test("two sends of the same invite at the same instant enqueue exactly ONCE", async () => {
    const { ports, rec } = makePorts({ invites: [invite({ id: "i1" })] });

    const first = await sendExperienceInvites(
      { experienceId: EXPERIENCE, organizerId: OWNER, inviteIds: ["i1"] },
      ports,
    );
    const second = await sendExperienceInvites(
      { experienceId: EXPERIENCE, organizerId: OWNER, inviteIds: ["i1"] },
      ports,
    );

    assert.equal(first.ok === true && first.results[0].outcome, "enqueued");
    assert.equal(second.ok === true && second.results[0].outcome, "skipped_recently_sent");
    assert.equal(rec.enqueued.length, 1, "exactly one message");
    assert.equal(rec.logs.length, 1, "exactly one invite_send_log row");
  });

  test("concurrent sends enqueue once — the claim, not a pre-check, is the guard", async () => {
    const { ports, rec } = makePorts({ invites: [invite({ id: "i1" })] });
    await Promise.all([
      sendExperienceInvites({ experienceId: EXPERIENCE, organizerId: OWNER, inviteIds: ["i1"] }, ports),
      sendExperienceInvites({ experienceId: EXPERIENCE, organizerId: OWNER, inviteIds: ["i1"] }, ports),
    ]);
    assert.equal(rec.enqueued.length, 1);
  });

  test("a deliberate re-send after the debounce window IS allowed", async () => {
    const t0 = new Date("2026-09-04T12:00:00Z");
    const sentLongAgo = new Date(t0.getTime() - INVITE_SEND_DEBOUNCE_MS - 1000);
    const { ports, rec } = makePorts({
      invites: [invite({ id: "i1", inviteSentAt: sentLongAgo })],
      now: t0,
    });
    const out = await sendExperienceInvites(
      { experienceId: EXPERIENCE, organizerId: OWNER, inviteIds: ["i1"] },
      ports,
    );
    assert.equal(out.ok === true && out.results[0].outcome, "enqueued");
    assert.equal(rec.enqueued.length, 1);
  });
});

// ── M6 — a failed enqueue leaves no false stamp ───────────────────────────────────────────────

describe("M6 — enqueue failure", () => {
  test("rolls invite_sent_at back and records a failed send-log row", async () => {
    const { ports, rec, rows } = makePorts({
      invites: [invite({ id: "i1" })],
      enqueueResult: () => null, // the outbox wrote no durable row
    });

    const out = await sendExperienceInvites(
      { experienceId: EXPERIENCE, organizerId: OWNER, inviteIds: ["i1"] },
      ports,
    );

    assert.equal(out.ok === true && out.results[0].outcome, "enqueue_failed");
    assert.equal(rows.get("i1")!.inviteSentAt, null, "the stamp must not stand behind a message nobody will retry");
    assert.equal(rec.released.length, 1);
    assert.equal(rec.logs.length, 1);
    assert.equal(rec.logs[0].status, "failed");
  });

  test("a previous successful send is restored, not erased", async () => {
    const t0 = new Date("2026-09-04T12:00:00Z");
    const earlier = new Date(t0.getTime() - INVITE_SEND_DEBOUNCE_MS - 1000);
    const { ports, rows } = makePorts({
      invites: [invite({ id: "i1", inviteSentAt: earlier })],
      enqueueResult: () => null,
      now: t0,
    });

    await sendExperienceInvites({ experienceId: EXPERIENCE, organizerId: OWNER, inviteIds: ["i1"] }, ports);

    assert.equal(
      +new Date(rows.get("i1")!.inviteSentAt as unknown as string),
      +earlier,
      "the earlier send really happened and must survive the rollback",
    );
  });

  test("one guest's failure does not abort the rest of the list", async () => {
    const { ports, rec } = makePorts({
      invites: [invite({ id: "i1" }), invite({ id: "i2" }), invite({ id: "i3" })],
      enqueueResult: (id) => (id === "i2" ? null : 7),
    });
    const out = await sendExperienceInvites({ experienceId: EXPERIENCE, organizerId: OWNER }, ports);
    assert.equal(out.ok, true);
    assert.equal(rec.enqueued.length, 2);
    assert.equal(rec.logs.filter((l) => l.status === "failed").length, 1);
  });
});

// ── M7 — send-all ─────────────────────────────────────────────────────────────────────────────

describe("M7 — send all", () => {
  test("sends only what the claim lets through; already-sent guests are skipped, not re-mailed", async () => {
    const t0 = new Date("2026-09-04T12:00:00Z");
    const { ports, rec } = makePorts({
      invites: [
        invite({ id: "fresh" }),
        invite({ id: "just-sent", inviteSentAt: new Date(t0.getTime() - 1000) }),
        invite({ id: "also-fresh" }),
      ],
      now: t0,
    });

    const out = await sendExperienceInvites({ experienceId: EXPERIENCE, organizerId: OWNER }, ports);

    assert.equal(out.ok, true);
    const byId = new Map((out as { ok: true; results: Array<{ inviteId: string; outcome: string }> }).results.map((r) => [r.inviteId, r.outcome]));
    assert.equal(byId.get("fresh"), "enqueued");
    assert.equal(byId.get("also-fresh"), "enqueued");
    assert.equal(byId.get("just-sent"), "skipped_recently_sent");
    assert.equal(rec.enqueued.length, 2);
  });

  test("each guest gets THEIR OWN token — never another guest's", async () => {
    const { ports, rec } = makePorts({
      invites: [invite({ id: "a" }), invite({ id: "b" })],
    });
    await sendExperienceInvites({ experienceId: EXPERIENCE, organizerId: OWNER }, ports);

    const a = rec.enqueued.find((e) => e.inviteId === "a")!;
    const b = rec.enqueued.find((e) => e.inviteId === "b")!;
    assert.ok(a.html.includes("token-a") && !a.html.includes("token-b"));
    assert.ok(b.html.includes("token-b") && !b.html.includes("token-a"));
    assert.equal(a.toEmail, "a@example.invalid");
    assert.ok(!a.html.includes("b@example.invalid"), "no other guest's address appears in a guest's mail");
  });
});

// ── M8 — the date ─────────────────────────────────────────────────────────────────────────────

describe("M8 — event date rendering", () => {
  test("renders the calendar day it was given, in UTC, whatever the server's zone", () => {
    assert.equal(formatEventDateForEmail("2026-10-11"), "October 11, 2026");
    assert.equal(formatEventDateForEmail("2026-01-01"), "January 1, 2026");
  });

  test("returns null rather than a placeholder when there is no usable date", () => {
    assert.equal(formatEventDateForEmail(null), null);
    assert.equal(formatEventDateForEmail(""), null);
    assert.equal(formatEventDateForEmail("not a date"), null);
  });
});
