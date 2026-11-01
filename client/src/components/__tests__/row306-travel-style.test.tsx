/**
 * Row 306 (CS-3 brief 10, E), client: "Your travel style" on the profile and the /privacy line.
 *
 *   TS1 while the server says the profile is off (or has not answered) the card draws nothing
 *   TS2 on, it shows "Built around: [traits]." from the server's traits, and the reset button
 *   TS3 on with no trait, the line is the HELD no-pattern placeholder, never an invented trait
 *   TS4 the profile page mounts the card; the /privacy page carries the approved sentence verbatim
 *   TS5 the card draws no "Edit" and no "Because you picked …" (rows store no place)
 *
 * Run: npx tsx --test client/src/components/__tests__/row306-travel-style.test.tsx
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import React from "react";
import { renderToString } from "react-dom/server";
import { TravelStyleCardView } from "@/components/travel-style-card";
import { PRIVACY_SELECTIONS_LINE, TRAVEL_STYLE_COPY } from "@/lib/travel-style-copy";

(globalThis as any).React = React;
const text = (html: string) => html.replace(/<!--.*?-->/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const view = (data: any) => renderToString(<TravelStyleCardView data={data} onReset={() => {}} resetting={false} />);

describe("row 306 travel style card", () => {
  it("TS1 off or unanswered draws nothing", () => {
    assert.equal(view(undefined), "");
    assert.equal(view({ enabled: false, traits: [{ field: "neighbourhood", value: "gion", count: 3 }] }), "");
  });

  it("TS2 on: the traits line and the reset button", () => {
    const html = view({
      enabled: true,
      traits: [
        { field: "neighbourhood", value: "gion-shirakawa", count: 4 },
        { field: "timeOfDay", value: "evening", count: 3 },
        { field: "stopType", value: "free_time", count: 3 },
      ],
    });
    assert.match(html, /data-testid="card-travel-style"/);
    assert.match(text(html), /Your travel style/);
    assert.match(text(html), /Built around: Gion Shirakawa, evening, free time\./);
    assert.match(html, /data-testid="button-travel-style-reset"[^>]*>Reset my preferences</);
  });

  it("TS3 on with no trait: the held placeholder", () => {
    const t = text(view({ enabled: true, traits: [] }));
    assert.match(t, new RegExp(TRAVEL_STYLE_COPY.noPattern.replace(/[[\]]/g, "\\$&")));
    assert.doesNotMatch(t, /Built around/);
  });

  it("TS4 the profile mounts the card; /privacy carries the approved sentence", () => {
    assert.equal(PRIVACY_SELECTIONS_LINE, "we use your selections to build and improve your plans");
    assert.match(fs.readFileSync("client/src/pages/profile.tsx", "utf8"), /<TravelStyleCard \/>/);
    assert.match(fs.readFileSync("client/src/pages/privacy.tsx", "utf8"), /<li>\{PRIVACY_SELECTIONS_LINE\}<\/li>/);
  });

  it("TS5 no Edit and no 'Because you picked'", () => {
    const t = text(view({ enabled: true, traits: [{ field: "neighbourhood", value: "gion", count: 3 }] }));
    assert.doesNotMatch(t, /\bEdit\b|Because you picked/);
  });
});
