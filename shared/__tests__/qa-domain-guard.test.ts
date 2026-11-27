/**
 * The QA-bypass boot guard (ledger `2026-11-27-s5-qa-domain-boot-guard`).
 *
 * Both directions matter: a production boot with the domain set must refuse, and a production boot
 * without it — or a dev/staging boot with it — must start. The CI gates' own shape
 * (`NODE_ENV=production` + `ALLOW_TEST_ACCOUNTS=1` + the domain) is the one exemption, and it is
 * pinned here so a later tightening cannot silently turn every production-bundle gate red.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { qaDomainRefusal } from "../qa-domain-guard";

const env = (e: Record<string, string | undefined>) => e as NodeJS.ProcessEnv;

test("production + QA_ACCOUNT_EMAIL_DOMAIN refuses to boot, and says why", () => {
  const refusal = qaDomainRefusal(env({ NODE_ENV: "production", QA_ACCOUNT_EMAIL_DOMAIN: "traveloure-qa.test" }));
  assert.ok(refusal, "a production boot with the bypass set must refuse");
  assert.match(refusal!, /QA_ACCOUNT_EMAIL_DOMAIN/);
  assert.match(refusal!, /traveloure-qa\.test/, "the variable's value is named so the operator can act");
  assert.match(refusal!, /waitlist pay gate/, "the reason is the bypass, not a generic failure");
});

test("production without the domain boots", () => {
  assert.equal(qaDomainRefusal(env({ NODE_ENV: "production" })), null);
  assert.equal(qaDomainRefusal(env({ NODE_ENV: "production", QA_ACCOUNT_EMAIL_DOMAIN: "" })), null);
  assert.equal(qaDomainRefusal(env({ NODE_ENV: "production", QA_ACCOUNT_EMAIL_DOMAIN: "   " })), null);
});

test("a non-production boot with the domain is fine - CI and staging need it", () => {
  assert.equal(qaDomainRefusal(env({ NODE_ENV: "development", QA_ACCOUNT_EMAIL_DOMAIN: "traveloure-qa.test" })), null);
  assert.equal(qaDomainRefusal(env({ NODE_ENV: "test", QA_ACCOUNT_EMAIL_DOMAIN: "traveloure-qa.test" })), null);
  assert.equal(qaDomainRefusal(env({ QA_ACCOUNT_EMAIL_DOMAIN: "traveloure-qa.test" })), null, "no NODE_ENV is not production");
});

test("the CI gates' own boot shape is the one exemption, and it is explicit", () => {
  assert.equal(
    qaDomainRefusal(env({ NODE_ENV: "production", QA_ACCOUNT_EMAIL_DOMAIN: "traveloure-qa.test", ALLOW_TEST_ACCOUNTS: "1" })),
    null,
    "a production bundle booted against a throwaway database keeps working",
  );
  assert.equal(
    qaDomainRefusal(env({ NODE_ENV: "production", QA_ACCOUNT_EMAIL_DOMAIN: "traveloure-qa.test", ALLOW_TEST_ACCOUNTS: "true" })) !== null,
    true,
    "the marker is the exact string 1, like every other gate that reads it",
  );
});
