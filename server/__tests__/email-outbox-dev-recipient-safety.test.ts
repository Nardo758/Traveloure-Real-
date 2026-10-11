import assert from "node:assert/strict";
import { test } from "node:test";
import { developmentEmailRecipients, developmentRecipientAllowed, sendEmail,
  atEmailProviderHandoff, EmailSendCancelled } from "../services/email.service";
import { randomUUID } from "node:crypto";

for (let loop = 1; loop <= 2; loop++) test(`development recipient pure boundaries: loop ${loop}`, async () => {
  const a = `${randomUUID()}@qa.test`, b = `${randomUUID()}@qa.test`;
  const env = { NODE_ENV: "development", SIGNUP_QA_TEST_INBOX: a, ITINERARY_OUTCOME_TEST_EMAIL: b };
  assert.deepEqual(developmentEmailRecipients(env), [a, b]);
  assert.equal(developmentRecipientAllowed(a, env), true);
  assert.equal(developmentRecipientAllowed([a, b], env), true);
  for (const to of [[a, "outsider@example.invalid"], "", [], null, `${a};${b}`, `Name <${a}>`, `${a},`])
    assert.equal(developmentRecipientAllowed(to, env), false);
  for (const value of [undefined, "", "not-a-mailbox", `${a},${b}`])
    assert.equal(developmentRecipientAllowed(a, { ...env, SIGNUP_QA_TEST_INBOX: value }), false);
  const production = new Proxy({ NODE_ENV: "production" }, {
    get(target, key) {
      if (String(key).includes("INBOX") || String(key).includes("TEST_EMAIL")) throw new Error("QA setting read in production");
      return (target as any)[key];
    },
  });
  const ownAddress = `${randomUUID()}@traveloure-qa.test`;
  assert.equal(developmentRecipientAllowed(ownAddress, production), true);
  assert.equal(ownAddress.endsWith("@traveloure-qa.test"), true); // No substitution performed.
  const original = process.env.NODE_ENV;
  const originals = [process.env.SIGNUP_QA_TEST_INBOX, process.env.ITINERARY_OUTCOME_TEST_EMAIL];
  process.env.NODE_ENV = "development";
  delete process.env.SIGNUP_QA_TEST_INBOX; delete process.env.ITINERARY_OUTCOME_TEST_EMAIL;
  try {
    assert.equal((await sendEmail({ to: a, subject: "deny before SDK/config", html: "" })).error,
      "development_recipient_not_allowed");
    let invoked = 0;
    await assert.rejects(atEmailProviderHandoff(async () => ({
      eligible: developmentRecipientAllowed(a), reason: "development_recipient_not_allowed",
    }), async () => { invoked++; }), EmailSendCancelled);
    assert.equal(invoked, 0);
  } finally {
    if (original === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = original;
    ["SIGNUP_QA_TEST_INBOX","ITINERARY_OUTCOME_TEST_EMAIL"].forEach((key, i) => {
      if (originals[i] === undefined) delete process.env[key]; else process.env[key] = originals[i];
    });
  }
});
