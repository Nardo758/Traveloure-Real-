import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { diagnoseLoadedResendKey, diagnoseResendKey } from "../resend-diagnostic";

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

test("the loaded-key probe fingerprints the key actually used and names its variable, never its value", async () => {
  const newKey = "re_fixture_new_name_not_a_real_credential";
  const fp = (v: string) => createHash("sha256").update(v).digest("hex").slice(0, 16);
  const seen: string[] = [];
  const ok = (async (_url: unknown, init?: RequestInit) => {
    seen.push((init?.headers as Record<string, string>).Authorization);
    return new Response(JSON.stringify({ data: [] }), { status: 200 });
  }) as typeof fetch;

  const both = await diagnoseLoadedResendKey(null, { TRAVELOURE_RESEND_API_KEY: newKey, RESEND_API_KEY: key }, ok);
  assert.equal(both.key.source, "TRAVELOURE_RESEND_API_KEY");
  assert.equal(both.key.fingerprint, fp(newKey));
  assert.equal(both.authentication.state, "accepted");

  const fallback = await diagnoseLoadedResendKey(null, { RESEND_API_KEY: key }, ok);
  assert.equal(fallback.key.source, "RESEND_API_KEY");
  assert.equal(fallback.key.fingerprint, fp(key));

  const neither = await diagnoseLoadedResendKey(null, {}, async () => { throw new Error("unexpected call"); });
  assert.equal(neither.key.present, false);
  assert.equal(neither.key.source, null);
  assert.equal(neither.authentication.state, "missing");

  assert.deepEqual(seen, [`Bearer ${newKey}`, `Bearer ${key}`]);
  for (const r of [both, fallback, neither]) {
    assert.ok(!JSON.stringify(r).includes(newKey));
    assert.ok(!JSON.stringify(r).includes(key));
  }
});

test("a directly probed key reports no source unless one is given", async () => {
  const r = await diagnoseResendKey(key, null, response(200, { data: [] }));
  assert.equal(r.key.source, null);
});
