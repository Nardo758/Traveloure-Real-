/**
 * Feed title filter (ledger `2026-10-21-blog-fever-followup`).
 * Supply activities are cleaned with the same list the blog refuses, then capped at three.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildFeedStream } from "../feed-stream";

test("FT1: a refused title is cleaned or omitted and does not consume a feed slot", () => {
  const stream = buildFeedStream([], [], [], [], [], [
    { id: "a", title: "Hidden gems of Kyoto" },
    { id: "b", title: "Hidden gem" },
    { id: "c", title: "Tea ceremony" },
    { id: "d", name: "Secret Garden Tour" },
    { id: "e", title: "Night market" },
  ]);
  const activities = stream.filter((item) => item.kind === "supply-activity");
  assert.deepEqual(activities.map((item) => item.data.title ?? item.data.name), [
    "Kyoto",
    "Tea ceremony",
    "Garden Tour",
  ]);
  assert.equal(activities.some((item) => item.id === "activity-b"), false);
  assert.equal(JSON.stringify(activities).includes("Hidden gem"), false);
  assert.equal(JSON.stringify(activities).includes("Secret"), false);
});
