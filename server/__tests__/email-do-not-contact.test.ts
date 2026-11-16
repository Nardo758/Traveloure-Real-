/**
 * N3 (Leon, Nov 15) — do-not-contact rides the EXISTING suppression gate.
 *
 * `email_suppressions` already holds one row per (email, reason) and `reason` is a free-form varchar
 * (migration 423), so a traveler's do-not-contact request needs NO schema change: it is
 * `reason = "do_not_contact"`, and `suppressionRefusalReason` is where the decision lives — the same
 * function `sendEmail` already consults through `addressSuppressionHit`.
 *
 * The ruling this pins:
 *   · marketing        — refused for ANY row already, so do_not_contact is covered;
 *   · transactional    — NOW refused for do_not_contact (it is the traveler's own ask);
 *   · security mail    — still delivered (a password reset must arrive): only a hard bounce blocks it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  DO_NOT_CONTACT_REASON,
  SUPPRESSED_DO_NOT_CONTACT,
  SUPPRESSED_HARD_BOUNCE,
  suppressionRefusalReason,
} from "../services/email-suppression-rule";

const TRANSACTIONAL = "provider_booking_alert";
const MARKETING = "waitlist_apply_invite";
const SECURITY = "password_reset";

test("a do-not-contact request refuses transactional mail, with its own reason", () => {
  assert.equal(DO_NOT_CONTACT_REASON, "do_not_contact");
  assert.equal(SUPPRESSED_DO_NOT_CONTACT, "suppressed:do_not_contact");
  assert.equal(
    suppressionRefusalReason({ emailType: TRANSACTIONAL, authCritical: false, reasons: [DO_NOT_CONTACT_REASON] }),
    SUPPRESSED_DO_NOT_CONTACT,
  );
});

test("it also refuses marketing, and never lets a security send through a dead address", () => {
  assert.equal(
    suppressionRefusalReason({ emailType: MARKETING, authCritical: false, reasons: [DO_NOT_CONTACT_REASON] }),
    SUPPRESSED_DO_NOT_CONTACT,
  );
});

test("security mail still arrives for a do-not-contact row (a password reset is not a courtesy)", () => {
  assert.equal(
    suppressionRefusalReason({ emailType: SECURITY, authCritical: true, reasons: [DO_NOT_CONTACT_REASON] }),
    null,
  );
  // A hard bounce still blocks it: the address is dead, not unwilling.
  assert.equal(
    suppressionRefusalReason({ emailType: SECURITY, authCritical: true, reasons: ["hard_bounce"] }),
    SUPPRESSED_HARD_BOUNCE,
  );
});

test("the gate stays the ONE place sendEmail consults, and the senders reach it through sendEmail", () => {
  const emailService = fs.readFileSync("server/services/email.service.ts", "utf8");
  assert.match(emailService, /addressSuppressionHit/, "sendEmail consults the gate");
  // The RULE lives in the db-free module (that is why this test can run without postgres); the gate imports
  // and re-exports it, so there is still exactly one decision.
  const rule = fs.readFileSync("server/services/email-suppression-rule.ts", "utf8");
  assert.match(rule, /reasons\.has\(DO_NOT_CONTACT_REASON\)/, "the reason is decided in the rule, not at a call site");
  const gate = fs.readFileSync("server/services/email-suppression.ts", "utf8");
  assert.match(gate, /from "\.\/email-suppression-rule"/, "and the gate re-exports it rather than repeating it");
  assert.doesNotMatch(gate, /reasons\.has\(DO_NOT_CONTACT_REASON\)/, "no second copy of the decision");
  // The four invite senders all leave through the shared send path (one of the two modules below), so the
  // gate covers them without a per-sender check.
  const outbox = fs.readFileSync("server/services/email-outbox.service.ts", "utf8");
  assert.match(outbox, /"guest_invite"/, "guest invites");
  assert.match(outbox, /"provider_booking_alert"/, "provider alerts");
  assert.match(emailService, /"expert_application_approved"/, "expert applications");
  assert.match(outbox, /sendEmail|enqueueEmail/, "and they leave through the shared send/enqueue path");
});
