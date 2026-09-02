/**
 * internal-jobs-limiter.http.test.ts — the rate cap + failed-auth lockout on /internal/*.
 *
 * Lane: internal-jobs-hardening, L1 + L7. Finding F3: /internal was the only session-less surface
 * with no rate limit at all, so INTERNAL_JOB_SECRET could be guessed without bound — on a public
 * repository whose workflow file publishes every internal route name.
 *
 *   R1 the 31st request in a window is 429 (rate cap, 30 / 15 min / IP)
 *   R2 ten consecutive 401s lock the IP out — subsequent requests 429 even with a VALID secret
 *      and even though the rate cap has headroom
 *   R3 a different IP is unaffected while another is locked out (per-IP isolation)
 *   R7 sha256-then-timingSafeEqual: secrets of different LENGTH are rejected the same way as
 *      same-length ones, and the correct secret still authenticates (L7 behaviour parity)
 *
 * The app under test mounts the limiter exactly as server/index.ts does — before the router — and
 * enables `trust proxy` so each case can present a distinct client IP. Production does not set
 * `trust proxy` (a pre-existing, app-wide property); that is what makes R3's isolation a property
 * of the KEY GENERATOR here rather than a claim about production bucketing.
 */
import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import type { AddressInfo } from "node:net";
import internalRoutes from "../internal.routes";
import { internalJobsLimiter, __resetInternalJobsLimiter } from "../../middleware/internal-jobs-limiter";

const SECRET = "internal-jobs-limiter-test-secret";

async function withServer<T>(fn: (post: (opts: { ip: string; secret?: string }) => Promise<Response>) => Promise<T>): Promise<T> {
  __resetInternalJobsLimiter();
  process.env.INTERNAL_JOB_SECRET = SECRET;

  const app = express();
  app.set("trust proxy", true);
  app.use(express.json());
  app.use("/internal", internalJobsLimiter);
  app.use(internalRoutes);

  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  const { port } = server.address() as AddressInfo;

  const post = ({ ip, secret }: { ip: string; secret?: string }) =>
    fetch(`http://127.0.0.1:${port}/internal/jobs/earnings-release`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": ip,
        ...(secret === undefined ? {} : { "x-internal-secret": secret }),
      },
      body: "{}",
    });

  try {
    return await fn(post);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    __resetInternalJobsLimiter();
  }
}

test("R1: the 31st request in the window is rate limited", async () => {
  await withServer(async (post) => {
    const ip = "203.0.113.10";
    for (let i = 1; i <= 30; i++) {
      const res = await post({ ip, secret: SECRET });
      assert.equal(res.status, 200, `request ${i} should be allowed, got ${res.status}`);
    }
    const capped = await post({ ip, secret: SECRET });
    assert.equal(capped.status, 429, "the 31st request must be rate limited");
    assert.ok(capped.headers.get("retry-after"), "a 429 must tell the caller when to retry");
  });
});

test("R2: ten consecutive 401s lock the IP out, even for a valid secret under the cap", async () => {
  await withServer(async (post) => {
    const ip = "203.0.113.20";
    for (let i = 1; i <= 10; i++) {
      const res = await post({ ip, secret: "wrong-secret" });
      assert.equal(res.status, 401, `guess ${i} should still be a plain 401, got ${res.status}`);
    }
    // Well inside the 30/window cap — this 429 can only come from the lockout.
    const locked = await post({ ip, secret: SECRET });
    assert.equal(locked.status, 429, "a locked-out IP must be refused even with the correct secret");
    const body = await locked.json() as any;
    assert.match(String(body.message), /authentication failures/i);
  });
});

test("R3: another IP is unaffected while one is locked out", async () => {
  await withServer(async (post) => {
    const attacker = "203.0.113.30";
    const cron = "203.0.113.31";
    for (let i = 1; i <= 10; i++) await post({ ip: attacker, secret: "wrong-secret" });
    assert.equal((await post({ ip: attacker, secret: SECRET })).status, 429, "attacker must be locked");

    const legit = await post({ ip: cron, secret: SECRET });
    assert.equal(legit.status, 200, "the real cron's IP must be untouched by another IP's lockout");
  });
});

test("R7: a correct secret authenticates; wrong secrets of any length are rejected alike", async () => {
  await withServer(async (post) => {
    // Nine attempts max per IP so the lockout never fires and each case is measured cleanly.
    assert.equal((await post({ ip: "203.0.113.40", secret: SECRET })).status, 200);
    assert.equal((await post({ ip: "203.0.113.41", secret: "x" })).status, 401, "much shorter");
    assert.equal((await post({ ip: "203.0.113.42", secret: SECRET + "-longer" })).status, 401, "longer");
    assert.equal(
      (await post({ ip: "203.0.113.43", secret: "z".repeat(SECRET.length) })).status,
      401,
      "same length, wrong value",
    );
    assert.equal((await post({ ip: "203.0.113.44" })).status, 401, "no secret at all");
  });
});
