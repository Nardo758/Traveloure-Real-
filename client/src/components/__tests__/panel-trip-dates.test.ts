/**
 * The intake panel's recap pill and the AI draft panel's Dates field read the ONE shared
 * trip-date formatter (client/src/lib/trip-dates.ts) and keep no local copy of their own.
 * Source-level: both panels import formatTripDates and define no formatDateRange.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (rel: string) => readFileSync(resolve(process.cwd(), rel), "utf8");
const INTAKE = "client/src/components/intake-panel.tsx";
const DRAFT = "client/src/components/ai-planner-draft-panel.tsx";
const IMPORT = /import \{ formatTripDates \} from "@\/lib\/trip-dates";/;

describe("panel trip dates read the shared formatter", () => {
  it("PD1: the intake panel imports formatTripDates, keeps the end year, and has no local formatter", () => {
    const src = read(INTAKE);
    assert.match(src, IMPORT);
    assert.doesNotMatch(src, /formatDateRange/);
    assert.match(src, /formatTripDates\(startDate, endDate\)/);
    assert.match(src, /`\$\{recapRange\}, \$\{recapEndYear\}`/);
    assert.match(src, /data-testid="pill-recap-dates"[\s\S]{0,40}\{recapDates\}/);
  });

  it("PD2: the draft panel imports formatTripDates, keeps its missing-dates guard, and has no local formatter", () => {
    const src = read(DRAFT);
    assert.match(src, IMPORT);
    assert.doesNotMatch(src, /formatDateRange/);
    assert.match(src, /value=\{startDate && endDate \? formatTripDates\(startDate, endDate\) : null\}/);
  });
});
