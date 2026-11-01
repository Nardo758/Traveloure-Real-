/**
 * Row 194 (R2 ruling, Nov 1, 2026): the Trip Card header regroup and the Finalize chooser.
 *
 *   H1 Share stays a visible header button; a ⋯ menu trigger sits beside it
 *   H2 Calendar, PDF and phone delivery (owner exports) and Export (viewer/embedded) are menu entries,
 *      not header buttons, and keep their testids
 *   H3 the menu labels are the four held labels; the trigger's name is a placeholder
 *   H4 the phone dialog lives with the header, so it survives the menu closing
 *   H5 the Finalize chooser does not render the Booking agent lane; myself and expert stay; Concierge unchanged
 *   H6 the mobile BottomActionBar and the slip's SlipPlanMenu still carry their Share entries
 *
 * Run: npx tsx --test client/src/components/plancard/__tests__/row194-header-menu.test.tsx
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { TRIP_CARD_HEADER_MENU_COPY } from "@/lib/trip-card-header-menu";
import { FINALIZE_AGENT_LANE_SHOWN } from "../FinalizeBookingModal";

const read = (f: string) => fs.readFileSync(f, "utf8");
const hero = read("client/src/components/plancard/HeroSection.tsx");
const controls = hero.slice(hero.indexOf("export function HeroControls"), hero.indexOf("export function HeroSection("));
const menu = controls.slice(controls.indexOf("<DropdownMenuContent"), controls.indexOf("</DropdownMenuContent>"));
const outsideMenu = controls.replace(menu, "");

describe("row 194 header menu", () => {
  it("H1 Share visible, ⋯ trigger beside it", () => {
    assert.match(outsideMenu, /data-testid=\{`button-share-\$\{trip\.id\}`\}/);
    assert.match(outsideMenu, /<DropdownMenuTrigger asChild>[\s\S]*data-testid=\{`button-header-menu-\$\{trip\.id\}`\}/);
  });

  it("H2 exports are menu entries with their testids", () => {
    for (const id of ["button-calendar-", "button-pdf-", "button-export-"]) {
      assert.match(menu, new RegExp(`data-testid=\\{\`${id}\\$\\{trip\\.id\\}\`\\}`), id);
      assert.doesNotMatch(outsideMenu, new RegExp(id), `${id} must not be a header button`);
    }
    assert.match(menu, /<PhoneDeliveryButton tripId=\{trip\.id\} asMenuItem/);
    assert.equal((hero.match(/<PhoneDeliveryButton/g) ?? []).length, 1);
  });

  it("H3 held labels", () => {
    assert.deepEqual(
      { ...TRIP_CARD_HEADER_MENU_COPY },
      { calendar: "Add to calendar", pdf: "Download PDF", export: "Export", phone: "Send to my phone", trigger: "[HELD for Leon]" },
    );
    for (const k of ["calendar", "pdf", "export", "phone"]) assert.match(menu, new RegExp(`TRIP_CARD_HEADER_MENU_COPY\\.${k}`));
  });

  it("H4 the phone dialog is rendered by the header, outside the menu", () => {
    assert.match(outsideMenu, /<PhoneDeliveryDialog tripId=\{trip\.id\} open=\{phoneOpen\}/);
    const btn = read("client/src/components/plancard/PhoneDeliveryDialog.tsx");
    assert.match(btn, /\{onOpen \? null : <PhoneDeliveryDialog/);
  });

  it("H5 Finalize: no Booking agent lane; myself and expert stay; Concierge unchanged", () => {
    assert.equal(FINALIZE_AGENT_LANE_SHOWN, false);
    const modal = read("client/src/components/plancard/FinalizeBookingModal.tsx");
    assert.match(modal, /\.\.\.\(FINALIZE_AGENT_LANE_SHOWN\s*\?/);
    assert.match(modal, /data-testid="finalize-option-myself"/);
    assert.match(modal, /\{ id: "expert", label: "Travel expert"/);
    assert.match(modal, /\.\.\.\(conciergeShown \? \[\{ id: "concierge"/);
  });

  it("H6 BottomActionBar and SlipPlanMenu unchanged", () => {
    assert.match(read("client/src/components/plancard/BottomActionBar.tsx"), /button-bottombar-share-/);
    assert.match(read("client/src/components/plancard/SlipRail.tsx"), /data-testid="slip-action-share"/);
  });
});
