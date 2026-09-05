/**
 * EARNER ADDRESS — how a client names an earner, held to Locked Decision 40.
 * Ledger `2026-09-05-user-id-is-internal`; CLAUDE.md Locked Decision 40, lane 3.
 *
 * WHY THIS EXISTS. "Did this surface send a user id?" is a rule that fails SILENTLY and in the
 * safe-looking direction: a body carrying `expertId` still opens a thread today, because lane 1
 * deliberately kept the deprecated inputs alive for one release. So the day a caller regresses,
 * nothing breaks, nothing logs, and the leak is back. These pins are on the PURE half — the
 * mapping from what a surface holds to the one address the rail accepts — which is the half a
 * regression would have to go through.
 *
 * What these hold:
 *   A1  a service-detail surface maps to `{ serviceId }`; a storefront to `{ handle }`; a booking
 *       row to `{ bookingId }`. Three surfaces, three addresses.
 *   A2  the result NEVER carries a user id, under any input — there is no field for one, and this
 *       asserts the shape rather than trusting the type.
 *   A3  §13 — two addresses is a REFUSAL, not a priority order. The server refuses the same body
 *       for the same reason; a client that ranked them would hide that.
 *   A4  no address is `none`, a finished answer: the caller keeps its own legacy behaviour rather
 *       than inventing one.
 *   A5  a handle is normalised the way the server normalises it (leading `@` dropped, lowercased),
 *       so `@Yuki` and `yuki` are one address and not two.
 *   A6  whitespace-only / empty is ABSENT, not an address.
 *   P1  `earnerProfilePath` prefers the handle and falls back to the id route only when there is
 *       no handle — the one decision, so no card can fork it.
 *   P2  a row with neither is `null`, never a dead `/experts/undefined` link.
 *   U1  `resolveChatUrlTarget` reads the canonical `?conversation=` first.
 *   U2  the legacy `?expertId=` and its `?provider=` alias still resolve (removed after lane 2).
 *   U3  precedence is STATED: an opaque id wins over a legacy id on the same URL.
 *   U4  a URL naming neither is `null`, and a blank param is not an address.
 *
 * Pure unit: no DOM, no DB, no fetch.
 * Run: npx tsx --test client/src/lib/__tests__/earner-address.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  conversationChatPath,
  earnerProfilePath,
  resolveChatUrlTarget,
  resolveContactAddress,
} from "../earner-address";

const USER_ID = "7c9e6679-7425-40de-944b-e07fc1f90ae7";

describe("resolveContactAddress — the three address kinds", () => {
  it("A1 maps each surface to its own address kind", () => {
    assert.deepEqual(resolveContactAddress({ serviceId: "svc_1" }), {
      ok: true,
      address: { serviceId: "svc_1" },
    });
    assert.deepEqual(resolveContactAddress({ handle: "yuki" }), {
      ok: true,
      address: { handle: "yuki" },
    });
    assert.deepEqual(resolveContactAddress({ bookingId: "bk_1" }), {
      ok: true,
      address: { bookingId: "bk_1" },
    });
  });

  it("A2 never emits a user id, whatever it is handed", () => {
    for (const input of [
      { handle: "yuki" },
      { serviceId: "svc_1" },
      { bookingId: "bk_1" },
      // A user id has no field to arrive in; passing one as any other value must not smuggle it
      // through as an address of a different name.
      { handle: null, serviceId: "svc_1", bookingId: null },
    ]) {
      const result = resolveContactAddress(input);
      assert.equal(result.ok, true);
      if (!result.ok) return;
      const keys = Object.keys(result.address);
      assert.equal(keys.length, 1, "exactly one address key");
      assert.ok(
        !keys.some((k) => /user|expert|provider|receiver|sender/i.test(k)),
        `address key ${keys[0]} must not name a person`,
      );
      assert.ok(
        !Object.values(result.address).includes(USER_ID),
        "a user id must never be the address value",
      );
    }
  });

  it("A3 refuses two addresses rather than ranking them (§13)", () => {
    assert.deepEqual(resolveContactAddress({ serviceId: "svc_1", bookingId: "bk_1" }), {
      ok: false,
      reason: "ambiguous",
    });
    assert.deepEqual(resolveContactAddress({ handle: "yuki", serviceId: "svc_1" }), {
      ok: false,
      reason: "ambiguous",
    });
  });

  it("A4 answers `none` for a surface that holds no address", () => {
    assert.deepEqual(resolveContactAddress({}), { ok: false, reason: "none" });
    assert.deepEqual(resolveContactAddress({ handle: null, serviceId: null, bookingId: null }), {
      ok: false,
      reason: "none",
    });
  });

  it("A5 normalises a handle the way the server does", () => {
    assert.deepEqual(resolveContactAddress({ handle: "@Yuki" }), {
      ok: true,
      address: { handle: "yuki" },
    });
    assert.deepEqual(resolveContactAddress({ handle: "  YUKI  " }), {
      ok: true,
      address: { handle: "yuki" },
    });
  });

  it("A6 treats blank as absent, not as an address", () => {
    assert.deepEqual(resolveContactAddress({ handle: "   " }), { ok: false, reason: "none" });
    assert.deepEqual(resolveContactAddress({ handle: "   ", serviceId: "svc_1" }), {
      ok: true,
      address: { serviceId: "svc_1" },
    });
  });
});

describe("earnerProfilePath — one decision about the public page", () => {
  it("P1 prefers the handle, falls back to the id route only without one", () => {
    assert.equal(earnerProfilePath({ handle: "yuki", id: USER_ID }), "/s/yuki");
    assert.equal(earnerProfilePath({ handle: "@Yuki", id: USER_ID }), "/s/yuki");
    assert.equal(earnerProfilePath({ handle: null, id: USER_ID }), `/experts/${USER_ID}`);
  });

  it("P2 answers null rather than building a dead link", () => {
    assert.equal(earnerProfilePath({}), null);
    assert.equal(earnerProfilePath({ handle: "  ", id: null }), null);
  });
});

describe("resolveChatUrlTarget — which thread a /chat URL names", () => {
  it("U1 reads the canonical opaque conversation id", () => {
    assert.deepEqual(resolveChatUrlTarget("?conversation=abc123"), {
      kind: "conversation",
      conversationId: "abc123",
    });
    // Accepts the search string with or without its leading "?" (wouter's useSearch gives both).
    assert.deepEqual(resolveChatUrlTarget("conversation=abc123"), {
      kind: "conversation",
      conversationId: "abc123",
    });
  });

  it("U2 still resolves the legacy id params (removed after LD 40 lane 2)", () => {
    assert.deepEqual(resolveChatUrlTarget(`?expertId=${USER_ID}`), {
      kind: "expert",
      expertId: USER_ID,
    });
    assert.deepEqual(resolveChatUrlTarget(`?provider=${USER_ID}`), {
      kind: "expert",
      expertId: USER_ID,
    });
  });

  it("U3 gives the opaque id precedence over a legacy id on the same URL", () => {
    assert.deepEqual(resolveChatUrlTarget(`?expertId=${USER_ID}&conversation=abc123`), {
      kind: "conversation",
      conversationId: "abc123",
    });
  });

  it("U4 answers null for a URL that names neither, and ignores a blank param", () => {
    assert.equal(resolveChatUrlTarget(""), null);
    assert.equal(resolveChatUrlTarget("?tripId=t1"), null);
    assert.equal(resolveChatUrlTarget("?conversation=&expertId="), null);
    assert.deepEqual(resolveChatUrlTarget(`?conversation=&expertId=${USER_ID}`), {
      kind: "expert",
      expertId: USER_ID,
    });
  });

  it("U1b round-trips the path the start rail's callers navigate to", () => {
    const path = conversationChatPath("abc123", { about: "Kyoto tea houses", name: "Yuki T" });
    assert.ok(path.startsWith("/chat?"));
    assert.deepEqual(resolveChatUrlTarget(path.slice("/chat".length)), {
      kind: "conversation",
      conversationId: "abc123",
    });
    // The subject rides as the COMPOSER prefill, never as a sent message (see startConversation).
    assert.ok(path.includes("about=Kyoto+tea+houses") || path.includes("about=Kyoto%20tea%20houses"));
  });
});

/**
 * The SHIPPED wiring. A pure rule a call site can reach past is not a rule (the
 * `slip-first-paint` precedent), and every defect this lane fixes was a call site sending an id
 * the rail was happy to accept. These read the files.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const CLIENT_SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (rel: string) => readFileSync(join(CLIENT_SRC, rel), "utf8");

describe("shipped wiring — the call sites actually switched", () => {
  it("S1 service detail addresses the LISTING, and no longer reads service.userId for contact", () => {
    const src = read("pages/service-detail.tsx");
    assert.ok(src.includes("serviceId: service.id"), "Contact Provider sends { serviceId }");
    assert.ok(
      !/expertId:\s*service\.userId/.test(src),
      "the CTA must not send the listing owner's user id",
    );
    assert.ok(src.includes('data-testid="button-contact-provider"'), "testid preserved");
  });

  it("S2 the storefront addresses the HANDLE and reads no earner id at all", () => {
    const src = read("pages/storefront.tsx");
    assert.ok(/handle:\s*earner\.handle\s*\?\?\s*handle/.test(src), "Message CTA sends { handle }");
    assert.ok(!/expertId:\s*earner\.id/.test(src), "no user id on the contact rail");
    assert.ok(
      !/String\(user\.id\)\s*===\s*String\(earner\.id\)/.test(src),
      "the own-storefront check compares handles, not ids",
    );
  });

  it("S3 chat sends by opaque conversation id and never sends a senderId", () => {
    const src = read("pages/chat.tsx");
    assert.ok(
      src.includes("conversationId: publicConversationId"),
      "the canonical send names the opaque conversation",
    );
    assert.ok(!/senderId:\s*user\?\.id/.test(src), "senderId is not sent on any branch");
    assert.ok(src.includes("resolveChatUrlTarget"), "the URL is read through the one pure resolver");
  });

  it("S4 the chat thread list carries the opaque id, joined server-side", () => {
    const src = read("hooks/use-conversation-threads.ts");
    assert.ok(src.includes("publicId"), "threads carry the opaque conversation id");
    assert.ok(src.includes('"/api/messages"'), "joined from the read that mints it server-side");
  });

  it("S5 every remaining id-addressed contact surface says so in one grep-able form", () => {
    // The inventory lane 2 works from. Each of these files keeps a user-id address for a stated
    // reason; the marker is what makes the remaining set countable rather than rediscovered.
    for (const rel of [
      "pages/expert-detail.tsx",
      "pages/expert/client-detail.tsx",
      "components/marketplace/concierge-card.tsx",
      "components/city-feed-card.tsx",
      "lib/notification-icons.tsx",
    ]) {
      assert.ok(
        read(rel).includes("LD 40 lane 2: still id-addressed"),
        `${rel} must carry the lane-2 marker`,
      );
    }
  });
});
