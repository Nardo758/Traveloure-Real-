/**
 * R3 U5 prerequisite (re-brief Nov 25 2026): the landing decides "does this traveller have a plan?" from the EXISTING
 * `GET /api/trips` (server/routes.ts:1436). This test pins that read's contract where the landing depends on it:
 * signed out is 401, a fresh account gets an empty array, and two accounts never see each other's plans.
 *
 * It adds no server code. If one of these assertions fails, the landing's gate is built on a false premise.
 */
import assert from "node:assert/strict";
import crypto from "node:crypto";

import { registerAndSignIn } from "./fixtures/register-and-sign-in";

const BASE_URL = process.env.JOURNEY_BASE_URL || "http://127.0.0.1:5000";
const PASSWORD = "TestPass123!";
const RUN = crypto.randomUUID().slice(0, 8);

interface Answer {
  status: number;
  body: unknown;
  text: string;
}

async function call(pathname: string, cookie?: string, init: RequestInit = {}): Promise<Answer> {
  const res = await fetch(`${BASE_URL}${pathname}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(cookie ? { cookie } : {}),
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  return { status: res.status, body, text };
}

test("GET /api/trips refuses a signed-out caller", async () => {
  const res = await call("/api/trips");
  assert.equal(res.status, 401);
});

test("GET /api/trips answers an empty array for a fresh account", async () => {
  const actor = await registerAndSignIn({
    baseUrl: BASE_URL,
    email: `r3list-${RUN}-fresh@t.test`,
    password: PASSWORD,
    firstName: "Fresh",
    lastName: "NoPlans",
  });
  const res = await call("/api/trips", actor.cookie);
  assert.equal(res.status, 200, `expected 200, got ${res.status}: ${res.text}`);
  assert.ok(Array.isArray(res.body), `expected an array, got ${res.text}`);
  assert.equal((res.body as unknown[]).length, 0);
});

test("GET /api/trips gives each account only its own plans", async () => {
  const mine = await registerAndSignIn({
    baseUrl: BASE_URL,
    email: `r3list-${RUN}-mine@t.test`,
    password: PASSWORD,
    firstName: "Mine",
    lastName: "Owner",
  });
  const theirs = await registerAndSignIn({
    baseUrl: BASE_URL,
    email: `r3list-${RUN}-theirs@t.test`,
    password: PASSWORD,
    firstName: "Theirs",
    lastName: "Other",
  });

  const createdMine = await call("/api/trips", mine.cookie, {
    method: "POST",
    body: JSON.stringify({ title: `Mine ${RUN}`, destination: "Kyoto, Japan" }),
  });
  assert.ok(createdMine.status >= 200 && createdMine.status < 300, `mint failed (${createdMine.status}): ${createdMine.text}`);
  const createdTheirs = await call("/api/trips", theirs.cookie, {
    method: "POST",
    body: JSON.stringify({ title: `Theirs ${RUN}`, destination: "Kyoto, Japan" }),
  });
  assert.ok(createdTheirs.status >= 200 && createdTheirs.status < 300, `mint failed (${createdTheirs.status}): ${createdTheirs.text}`);

  const mineList = await call("/api/trips", mine.cookie);
  const theirsList = await call("/api/trips", theirs.cookie);
  assert.equal(mineList.status, 200);
  assert.equal(theirsList.status, 200);

  const titlesOf = (answer: Answer) => (answer.body as Array<{ title?: string }>).map((t) => t.title);
  const mineTitles = titlesOf(mineList);
  const theirsTitles = titlesOf(theirsList);
  assert.deepEqual(mineTitles, [`Mine ${RUN}`]);
  assert.deepEqual(theirsTitles, [`Theirs ${RUN}`]);
});
