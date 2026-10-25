/**
 * Fix-queue 212(a): the traveler line while a card-hold cancel is unconfirmed, and the retry backoff.
 * The released banner sentence is unchanged.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  HANDOFF_HOLD_RELEASE_MAX_ATTEMPTS,
  HANDOFF_HOLD_TRAVELER_COPY,
  handoffBannerState,
  handoffHoldReleaseBackoffMs,
} from "../../../../shared/handoff";
import { handoffBannerLine } from "../handoff-client";

test("release_pending banner is the checking line", () => {
  assert.equal(HANDOFF_HOLD_TRAVELER_COPY.checkingOnHold, "We're checking on your card hold");
  assert.equal(handoffBannerState({ status: "release_pending" })?.kind, "release_pending");
  const line = handoffBannerLine({
    banner: { kind: "release_pending" },
    city: null,
    typicalAcceptHours: null,
    handoff: null,
  });
  assert.equal(line, HANDOFF_HOLD_TRAVELER_COPY.checkingOnHold);
  assert.equal(line?.includes("Nothing was charged"), false);
  const released = handoffBannerLine({
    banner: { kind: "released" },
    city: null,
    typicalAcceptHours: null,
    handoff: null,
  });
  assert.match(released ?? "", /Nothing was charged/);
});

test("hold-release backoff doubles and caps at 24 hours", () => {
  assert.equal(HANDOFF_HOLD_RELEASE_MAX_ATTEMPTS, 5);
  assert.equal(handoffHoldReleaseBackoffMs(1), 3_600_000);
  assert.equal(handoffHoldReleaseBackoffMs(2), 2 * 3_600_000);
  assert.equal(handoffHoldReleaseBackoffMs(3), 4 * 3_600_000);
  assert.equal(handoffHoldReleaseBackoffMs(4), 8 * 3_600_000);
  assert.equal(handoffHoldReleaseBackoffMs(5), 16 * 3_600_000);
  assert.equal(handoffHoldReleaseBackoffMs(8), 24 * 3_600_000);
});
