/**
 * instagram-frame-passthrough.http.test.ts
 *
 * Route-level integration test: confirms that POST /api/instagram/publish
 * forwards whichever imageUrl the client sends (story / feed / route frame)
 * unchanged as `image_url` in the Graph API media-container request.
 *
 * The test exercises the real instagram.ts route handler with:
 *   - db.select patched to return a fake user with Instagram credentials
 *   - global fetch replaced with a spy that captures outgoing Graph API calls
 *     and returns controlled responses (token verify → container create →
 *     status poll → publish)
 *
 * If the route ever hard-codes a frame or drops the format= query param from
 * the imageUrl, assertions on capturedContainerBody will fail.
 *
 * Run with:
 *   npx tsx --test server/routes/__tests__/instagram-frame-passthrough.http.test.ts
 */

import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import express from "express";
import type { AddressInfo } from "node:net";

// ── Environment stubs ─────────────────────────────────────────────────────────
process.env.STRIPE_SECRET_KEY = "sk_test_dummy";
process.env.INSTAGRAM_APP_ID = "test-app-id";
process.env.INSTAGRAM_APP_SECRET = "test-app-secret";
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
}
if (!process.env.SESSION_SECRET) {
  process.env.SESSION_SECRET = "test-session-secret";
}

// ── Import shared db (same instance the handler uses) ─────────────────────────
const { db } = await import("../../db.js");

// ── Import the real instagram router ─────────────────────────────────────────
const instagramModule = await import("../instagram.js");
const instagramRouter =
  (instagramModule as any).default ?? instagramModule;

// ── Fake user constants ───────────────────────────────────────────────────────
const USER_ID       = "aaaaaaaa-0000-0000-0000-111111111111";
const IG_USER_ID    = "ig-user-999";
const IG_TOKEN      = "ig-token-abc";
const CONTAINER_ID  = "container-xyz";
const PUBLISH_ID    = "media-post-123";
const ORIGIN        = "https://app.traveloure.com";
const SERVICE_ID    = "svc-deadbeef";

// ── Drizzle mock chain factory ────────────────────────────────────────────────
// db.select().from(...).where(...) → resolves to the provided rows array.
function makeMockSelect(rows: object[]): () => any {
  return () => {
    const chain: any = {
      from:  () => chain,
      where: () => chain,
      then:  (resolve: (v: any) => any) => Promise.resolve(rows).then(resolve),
      // Support both .then() and awaiting the chain directly
      [Symbol.toStringTag]: "SelectChain",
    };
    // Make the chain itself thenable (await db.select()...)
    chain[Symbol.iterator] = undefined;
    return chain;
  };
}

// ── fetch spy ─────────────────────────────────────────────────────────────────
// Captures the container-creation request body so tests can assert on image_url.
// Only intercepts graph.instagram.com calls — all other calls (e.g. the test's
// own HTTP requests to the local server) are forwarded to the real fetch.
let capturedContainerBody: Record<string, unknown> | null = null;

function makeFetchSpy(realFetch: typeof fetch): typeof fetch {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;

    // Only intercept Graph API calls; pass everything else (e.g. local server
    // requests from the test itself) through to the real fetch.
    if (!url.includes("graph.instagram.com")) {
      return realFetch(input, init);
    }

    // 1. Token verify: GET graph.instagram.com/me
    if (url.includes("/me?fields=")) {
      return new Response(
        JSON.stringify({ id: IG_USER_ID, account_type: "BUSINESS" }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    // 2. Container creation: POST /{userId}/media (not media_publish)
    if (url.includes(`/${IG_USER_ID}/media`) && !url.includes("_publish")) {
      const body = init?.body ? JSON.parse(init.body as string) : {};
      capturedContainerBody = body;
      return new Response(
        JSON.stringify({ id: CONTAINER_ID }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    // 3. Status poll: GET /{containerId}?fields=status_code
    if (url.includes(CONTAINER_ID) && url.includes("status_code")) {
      return new Response(
        JSON.stringify({ id: CONTAINER_ID, status_code: "FINISHED" }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    // 4. Publish: POST /{userId}/media_publish
    if (url.includes("media_publish")) {
      return new Response(
        JSON.stringify({ id: PUBLISH_ID }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    // Unexpected Graph API call — fail loudly so we notice.
    return new Response(
      JSON.stringify({ error: { code: 0, message: `Unhandled Graph API fetch: ${url}` } }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  };
}

// ── Express app factory ───────────────────────────────────────────────────────
function buildApp(): express.Express {
  const app = express();
  app.use(express.json());

  // Inject a fake Passport session so isAuthenticated + getUserId pass.
  app.use((req, _res, next) => {
    (req as any).user = { claims: { sub: USER_ID } };
    (req as any).isAuthenticated = () => true;
    next();
  });

  app.use("/api/instagram", instagramRouter);
  return app;
}

// ── Server lifecycle ──────────────────────────────────────────────────────────
let server: http.Server;
let baseUrl: string;
let originalFetch: typeof fetch;
let originalDbSelect: typeof db.select;

describe("POST /api/instagram/publish — frame passthrough (route-level)", () => {
  before(async () => {
    // Save originals
    originalFetch = globalThis.fetch;
    originalDbSelect = db.select.bind(db);

    // Mock db.select to return our fake IG user
    (db as any).select = makeMockSelect([
      {
        instagramUserId: IG_USER_ID,
        instagramAccessToken: IG_TOKEN,
      },
    ]);

    // Start the server
    server = http.createServer(buildApp());
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  after(async () => {
    // Restore originals
    globalThis.fetch = originalFetch;
    (db as any).select = originalDbSelect;
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  });

  beforeEach(() => {
    // Install a fresh fetch spy and clear any captured body from prior test.
    capturedContainerBody = null;
    globalThis.fetch = makeFetchSpy(originalFetch);
  });

  // ── Core frame-passthrough tests ─────────────────────────────────────────────

  for (const frame of ["story", "feed", "route"] as const) {
    it(`publishes the ${frame} frame — image_url in container request contains format=${frame}`, async () => {
      const relativeUrl = `/api/share-image/service/${SERVICE_ID}.png?format=${frame}`;
      const absoluteUrl = `${ORIGIN}${relativeUrl}`;

      const res = await fetch(`${baseUrl}/api/instagram/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl: absoluteUrl, caption: `Test ${frame} caption` }),
      });

      const data = await res.json() as Record<string, unknown>;
      assert.equal(res.status, 200, `Expected 200, got ${res.status}: ${JSON.stringify(data)}`);
      assert.ok(data.success === true, `Expected success:true, got: ${JSON.stringify(data)}`);

      // Key assertion: the Graph API container creation received the exact image_url
      // the client sent — not a hardcoded default frame URL.
      assert.ok(
        capturedContainerBody !== null,
        "Expected container creation request to be captured — fetch spy was not called for /{userId}/media",
      );
      assert.equal(
        capturedContainerBody!.image_url,
        absoluteUrl,
        `Graph API image_url must match the sent URL for frame=${frame}.\n` +
        `  Sent:     ${absoluteUrl}\n` +
        `  Received: ${capturedContainerBody!.image_url}`,
      );
      assert.ok(
        (capturedContainerBody!.image_url as string).includes(`format=${frame}`),
        `image_url must include format=${frame}, got: ${capturedContainerBody!.image_url}`,
      );
    });
  }

  it("story and feed frames produce different image_url values in the container request", async () => {
    // Publish story frame
    capturedContainerBody = null;
    const storyUrl = `${ORIGIN}/api/share-image/service/${SERVICE_ID}.png?format=story`;
    await fetch(`${baseUrl}/api/instagram/publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageUrl: storyUrl, caption: "story" }),
    });
    const storyContainerImageUrl = capturedContainerBody?.image_url;

    // Publish feed frame
    capturedContainerBody = null;
    const feedUrl = `${ORIGIN}/api/share-image/service/${SERVICE_ID}.png?format=feed`;
    await fetch(`${baseUrl}/api/instagram/publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageUrl: feedUrl, caption: "feed" }),
    });
    const feedContainerImageUrl = capturedContainerBody?.image_url;

    assert.notEqual(
      storyContainerImageUrl,
      feedContainerImageUrl,
      "Switching from story to feed must change the image_url sent to Graph API — " +
      "if equal, the route is sending the same (default) frame regardless of selection.",
    );
    assert.ok(
      (storyContainerImageUrl as string).includes("format=story"),
      `story publish must send format=story, got: ${storyContainerImageUrl}`,
    );
    assert.ok(
      (feedContainerImageUrl as string).includes("format=feed"),
      `feed publish must send format=feed, got: ${feedContainerImageUrl}`,
    );
  });

  it("caption is forwarded unchanged alongside the image_url", async () => {
    const testCaption = "Unique caption string for frame-passthrough test";
    const imageUrl = `${ORIGIN}/api/share-image/service/${SERVICE_ID}.png?format=story`;

    capturedContainerBody = null;
    await fetch(`${baseUrl}/api/instagram/publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageUrl, caption: testCaption }),
    });

    assert.equal(
      capturedContainerBody?.caption,
      testCaption,
      `caption must be forwarded unchanged to Graph API, got: ${capturedContainerBody?.caption}`,
    );
  });

  it("missing imageUrl returns 400 without calling the Graph API container endpoint", async () => {
    capturedContainerBody = null;
    const res = await fetch(`${baseUrl}/api/instagram/publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ caption: "no image" }),
    });

    assert.equal(res.status, 400, `Expected 400 for missing imageUrl, got ${res.status}`);
    assert.equal(
      capturedContainerBody,
      null,
      "Graph API container endpoint must not be called when imageUrl is absent",
    );
  });
});
