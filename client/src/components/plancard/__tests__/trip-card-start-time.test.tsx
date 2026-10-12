/**
 * P0-c item 3 — a Trip Card stop shows its stored start, never end − duration (ledger `2026-10-12-p0c-hotfix`).
 *
 *   ST1 a stop whose stored times disagree (start 10:00, end 12:30, 60 minutes) draws "10:00", never "11:30"
 *
 * The server half (the plan card DTO carries the stored start) is server/__tests__/p0c-plancard-legs-skipped PS4.
 * Run: npx tsx --test client/src/components/plancard/__tests__/trip-card-start-time.test.tsx
 */
import { it } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToString } from "react-dom/server";
import { ItemRow } from "../../plan/ItemRow";

(globalThis as any).React = React;
const text = (html: string) => html.replace(/<!-- -->/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

it("ST1 an inconsistent stop reads its stored start", () => {
  const item = { id: "i1", name: "Kinkaku-ji", time: "10:00", startTime: "10:00", endTime: "12:30", durationMinutes: 60, location: "", type: "activity", status: "planned", cost: 0 } as any;
  const out = text(renderToString(<ItemRow item={item} mode="read" role="traveler" />));
  assert.ok(out.includes("10:00"), out);
  assert.ok(!out.includes("11:30"), "never end − duration");
});
