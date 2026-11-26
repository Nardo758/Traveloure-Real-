import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { diagnoseResendKey } from "../resend-diagnostic";

const key = "re_fixture_not_a_real_credential";
const response = (status: number, body: unknown) =>
  (async () => new Response(JSON.stringify(body), { status })) as typeof fetch;

test("missing and empty values never contact Resend", async () => {
  for (const value of [undefined, ""]) {
    const r = await diagnoseResendKey(value, null, async () => { throw new Error("unexpected call"); });
    assert.equal(r.authentication.state, "missing");
    assert.equal(r.key.fingerprint, null);
    assert.equal(r.key.present, false);
  }
});

test("fingerprint uses exact bytes and malformed values are not normalized", async () => {
  for (const value of [" " + key, key + "\n", `"${key}"`, `'${key}'`, "not a key", "   "]) {
    let calls = 0;
    const r = await diagnoseResendKey(value, "a".repeat(40), async () => { calls++; throw new Error("unexpected"); });
    assert.equal(calls, 0);
    assert.equal(r.authentication.state, "malformed");
    assert.equal(r.key.fingerprint, createHash("sha256").update(value).digest("hex").slice(0, 16));
    assert.equal(r.key.surroundingWhitespace, value !== value.trim());
    assert.equal(r.key.surroundingQuotes, /^['"]|['"]$/.test(value.trim()));
    assert.ok(!JSON.stringify(r).includes(key));
  }
});

test("full access uses only GET domains, carries exact credential, and never returns provider data", async () => {
  let calls = 0;
  const r = await diagnoseResendKey(key, "a".repeat(40), (async (url, init) => {
    calls++;
    assert.equal(url, "https://api.resend.com/domains?limit=1");
    assert.equal(init?.method, "GET");
    assert.equal(init?.redirect, "error");
    assert.equal((init?.headers as Record<string,string>).Authorization, `Bearer ${key}`);
    assert.equal(init?.body, undefined);
    return new Response(JSON.stringify({ secret: key, data: [] }), { status: 200 });
  }) as typeof fetch);
  assert.equal(calls, 1);
  assert.equal(r.authentication.state, "accepted");
  assert.equal(r.key.fingerprint?.length, 16);
  assert.equal(r.buildCommit, "a".repeat(40));
  assert.ok(!Number.isNaN(Date.parse(r.checkedAt)));
  assert.ok(!JSON.stringify(r).includes(key));
});

test("sending-only restrictions are positive authentication, not invalid credentials", async () => {
  for (const status of [401, 403]) {
    const r = await diagnoseResendKey(key, null, response(status, {
      name: "restricted_api_key", message: "This API key is restricted to only send emails",
    }));
    assert.equal(r.authentication.state, "sending_only");
    assert.equal(r.authentication.httpStatus, status);
  }
});

test("invalid, rate-limited, forbidden and unexpected responses remain distinct and redacted", async () => {
  for (const [status, body, expected] of [
    [400, { message: "API key is invalid" }, "invalid"],
    [401, { message: "Invalid API key" }, "invalid"],
    [429, {}, "rate_limited"],
    [403, { name: "restricted_api_key", message: "some other restriction" }, "inconclusive"],
    [500, { message: key }, "inconclusive"],
  ] as const) {
    const r = await diagnoseResendKey(key, null, response(status, body));
    assert.equal(r.authentication.state, expected);
    assert.ok(!JSON.stringify(r).includes(key));
  }
});

test("network and malformed JSON errors do not leak exceptions or provider bodies", async () => {
  const r = await diagnoseResendKey(key, null, async () => { throw new Error(key); });
  assert.equal(r.authentication.state, "network_error");
  assert.ok(!JSON.stringify(r).includes(key));
  const badJson = await diagnoseResendKey(key, null, (async () => new Response(key, {status: 502})) as typeof fetch);
  assert.equal(badJson.authentication.state, "inconclusive");
});

test("timeout bounds an uncooperative fetch and response parser", async () => {
  const never = () => new Promise<never>(() => {});
  for (const fetcher of [never, async () => ({ status: 200, json: never } as unknown as Response)]) {
    const r = await diagnoseResendKey(key, null, fetcher as typeof fetch, 10);
    assert.equal(r.authentication.state, "timeout");
  }
});
