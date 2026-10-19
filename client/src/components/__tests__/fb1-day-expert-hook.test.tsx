/**
 * FB-1 expert hook — the rendered section (ledger `2026-10-18-fb1-expert-hook`).
 *
 * RENDERED (renderToString):
 *   D1 switch off: the title and the OFF line, no button
 *   D2 switch on, chooser has someone: the city line and the button, word for word
 *   D3 switch on, chooser empty: the city line and NO button
 *   D4 FD-5 counts replace the plain line
 *   D5 an in-season count of zero draws nothing; a count with its link draws the line and "See them"
 *   D6 inside an open DayBlock the section is drawn last; a closed day draws nothing
 *   D7 nothing rendered says a never-say phrase, and there is no blur
 * STRUCTURAL:
 *   S1 the slip passes the section only for the owner when the server sent `expertHook`, and then drops the day's top
 *      teaser line so the counts appear once; the button opens the expert door
 *   S2 the Trip Card never mounts it, and the server never sends it on the Trip Card read
 *
 * Run: npx tsx --test client/src/components/__tests__/fb1-day-expert-hook.test.tsx
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import React from "react";
import { renderToString } from "react-dom/server";
import { DayExpertHook } from "../plan/DayExpertHook";
import { DayBlock } from "../plan/DayBlock";
import { EXPERT_HOOK_BUTTON, EXPERT_HOOK_OFF_LINE, EXPERT_HOOK_TITLE, expertHookOnLine } from "@shared/expert-hook";
import { containsNeverSayCopy } from "@shared/banned-copy";

(globalThis as any).React = React;
const text = (html: string) => html.replace(/<!-- -->/g, "").replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
const hook = (h: { switchOn: boolean; canAsk: boolean }, extra: Record<string, unknown> = {}) =>
  renderToString(<DayExpertHook dayKey="2" dayNumber={2} hook={{ ...h, cityName: "Kyoto" }} onAsk={() => {}} {...extra} />);

describe("the section", () => {
  it("D1 switch off: OFF line, no button", () => {
    const t = text(hook({ switchOn: false, canAsk: true }));
    assert.ok(t.includes(EXPERT_HOOK_TITLE));
    assert.ok(t.includes(EXPERT_HOOK_OFF_LINE));
    assert.ok(!t.includes(EXPERT_HOOK_BUTTON));
  });
  it("D2 switch on with someone in the chooser: city line and button", () => {
    const t = text(hook({ switchOn: true, canAsk: true }));
    assert.ok(t.includes(expertHookOnLine("Kyoto")));
    assert.ok(t.includes("Want a local to tune this day?"));
  });
  it("D3 switch on with an empty chooser: no button", () => {
    const t = text(hook({ switchOn: true, canAsk: false }));
    assert.ok(t.includes(expertHookOnLine("Kyoto")));
    assert.ok(!t.includes(EXPERT_HOOK_BUTTON));
  });
  it("D4 counts replace the plain line", () => {
    const t = text(hook({ switchOn: true, canAsk: true }, { teaser: { localPicks: 3, localNotes: 2 } }));
    assert.ok(t.includes("3 local picks and 2 local notes for this day"));
    assert.ok(!t.includes(expertHookOnLine("Kyoto")));
    assert.ok(t.includes(EXPERT_HOOK_BUTTON));
  });
  it("D5 an in-season zero draws nothing", () => {
    for (const inSeason of [null, undefined, { count: 0, href: "/x" }]) {
      const html = hook({ switchOn: true, canAsk: true }, { inSeason });
      assert.ok(!text(html).includes("in-season"), JSON.stringify(inSeason));
      assert.ok(!html.includes("day-in-season-2"));
    }
    const t = text(hook({ switchOn: true, canAsk: true }, { inSeason: { count: 2, href: "/plans/t1?view=versions" } }));
    assert.ok(t.includes("2 in-season additions for Day 2 · See them"));
    const one = text(hook({ switchOn: true, canAsk: true }, { inSeason: { count: 1, href: "/plans/t1?view=versions" } }));
    assert.ok(one.includes("1 in-season addition for Day 2 · See them"), "singular at one");
  });
  it("D6 inside DayBlock: last in an open day, absent in a closed one", () => {
    const section = <DayExpertHook dayKey="2" dayNumber={2} hook={{ switchOn: false, cityName: "Kyoto", canAsk: false }} onAsk={() => {}} />;
    const open = renderToString(<DayBlock dayKey="2" heading="Tue · Oct 20" stats={null} open hook={section}><p>STOP</p></DayBlock>);
    assert.ok(open.indexOf("STOP") < open.indexOf("day-expert-hook-2"), "drawn after the day's stops");
    const closed = renderToString(<DayBlock dayKey="2" heading="Tue · Oct 20" stats={null} open={false} hook={section}><p>STOP</p></DayBlock>);
    assert.ok(!closed.includes("day-expert-hook-2"));
  });
  it("D7 nothing drawn says a never-say phrase, and nothing is blurred", () => {
    for (const html of [
      hook({ switchOn: false, canAsk: false }),
      hook({ switchOn: true, canAsk: true }),
      hook({ switchOn: true, canAsk: true }, { teaser: { localPicks: 1, localNotes: 1 }, inSeason: { count: 1, href: "/x" } }),
    ]) {
      assert.equal(containsNeverSayCopy(text(html)), false, text(html));
      assert.ok(!/blur/.test(html));
    }
  });
});

const read = (f: string) => fs.readFileSync(f, "utf8");
describe("placement", () => {
  it("S1 the slip: owner only, when the server sent it; one count line; the button opens the expert door", () => {
    const slip = read("client/src/components/plancard/SlipView.tsx");
    assert.match(slip, /hook=\{\s*isOwner && data\.expertHook && slot\.dayNum != null \? \(\s*<DayExpertHook/);
    assert.match(slip, /localTeaser=\{isOwner && data\.expertHook \? null : day\?\.localTeaser \?\? null\}/);
    assert.match(slip, /onAsk=\{\(\) => setExpertDoorState\("open"\)\}/);
  });
  it("S2 not on the Trip Card, and not sent on its read", () => {
    assert.ok(!read("client/src/components/plancard/TripCardDays.tsx").includes("DayExpertHook"));
    assert.match(read("server/routes/plancard.routes.ts"), /const expertHook = render === "final" \? null : await expertHookForTrip\(tripId, userId\)/);
  });
});
