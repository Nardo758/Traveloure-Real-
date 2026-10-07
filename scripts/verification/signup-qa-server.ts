/**
 * Single-use DEVELOPMENT browser verification runner. Run as the existing
 * preview workflow's temporary command, then restore its original command.
 * Never deploy/import this file in production. No account, outbox or registry
 * writes are performed here; the actual signup and dispatcher own those.
 */
import { _outboxTestHooks } from "../../server/services/email-outbox.service";
import { sendEmail, type SendEmailParams } from "../../server/services/email.service";
import { resolveSignupQaRecipient } from "./signup-qa-recipient";

if (process.env.NODE_ENV !== "development") {
  throw new Error("The signup QA recipient harness is development-only");
}
// Fail before accepting signup requests if the monitored inbox is unavailable.
resolveSignupQaRecipient("preflight@traveloure-qa.test", process.env);

_outboxTestHooks.sendEmailFn = async (payload: SendEmailParams) => {
  const accountEmail = Array.isArray(payload.to) ? payload.to.join(", ") : payload.to;
  const destination = resolveSignupQaRecipient(accountEmail, process.env);
  if (destination === accountEmail) return sendEmail(payload);

  // The existing sender logs successful recipients. Hide the monitored inbox
  // in the development log while the original sender performs the real send.
  const originalLog = console.log;
  const originalError = console.error;
  const redact = (value: unknown): unknown =>
    typeof value === "string"
      ? value.replaceAll(destination, "[monitored QA inbox]")
      : value && typeof value === "object"
        ? JSON.parse(JSON.stringify(value).replaceAll(destination, "[monitored QA inbox]"))
        : value;
  console.log = (...values) => originalLog(...values.map(redact));
  console.error = (...values) => originalError(...values.map(redact));
  try {
    return await sendEmail({ ...payload, to: destination });
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
};

await import("../../server/index");
