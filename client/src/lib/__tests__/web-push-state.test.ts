/**
 * The phone-notifications card's state (Locked Decision 53, ledger `2026-09-24-web-push`).
 *   W1 loading until the server has answered; "unavailable" when it has no VAPID keys (§13 — not "off").
 *   W2 an iPhone outside the installed app is told to add it to the Home Screen, never offered a button.
 *   W3 a browser without push, and a denied permission, are their own states.
 *   W4 "on" needs BOTH granted permission and this browser registered to this account.
 *   W5 the VAPID key decoder round-trips base64url.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { derivePhonePushState, urlBase64ToUint8Array, type PhonePushFacts } from "../web-push";

const base: PhonePushFacts = {
  serverAvailable: true,
  supported: true,
  isIos: false,
  standalone: false,
  permission: "default",
  subscribedHere: false,
};

describe("phone push card state", () => {
  it("W1: loading, then unavailable without keys", () => {
    assert.equal(derivePhonePushState({ ...base, serverAvailable: undefined }), "loading");
    assert.equal(derivePhonePushState({ ...base, serverAvailable: false, subscribedHere: true }), "unavailable");
  });
  it("W2: iOS outside the installed app", () => {
    assert.equal(derivePhonePushState({ ...base, isIos: true, supported: false }), "ios_needs_install");
    assert.equal(
      derivePhonePushState({ ...base, isIos: true, standalone: true, permission: "granted", subscribedHere: true }),
      "on",
    );
  });
  it("W3: unsupported and denied", () => {
    assert.equal(derivePhonePushState({ ...base, supported: false }), "unsupported");
    assert.equal(derivePhonePushState({ ...base, permission: "denied", subscribedHere: true }), "denied");
  });
  it("W4: on needs permission and this account's registration", () => {
    assert.equal(derivePhonePushState({ ...base, subscribedHere: undefined }), "loading");
    assert.equal(derivePhonePushState({ ...base, permission: "granted", subscribedHere: false }), "off");
    assert.equal(derivePhonePushState({ ...base, permission: "default", subscribedHere: true }), "off");
    assert.equal(derivePhonePushState({ ...base, permission: "granted", subscribedHere: true }), "on");
  });
  it("W5: base64url decoding", () => {
    const bytes = urlBase64ToUint8Array("AQID_-8");
    assert.deepEqual(Array.from(bytes), [1, 2, 3, 255, 239]);
  });
});
