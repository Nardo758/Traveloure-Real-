/**
 * Theme picker and Discover filter markup. No browser.
 * Run: npx tsx --test client/src/components/__tests__/theme-picker.test.tsx
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToString } from "react-dom/server";
import { ListingThemePicker } from "../listing-theme-picker";
import { DiscoverThemeFilter } from "../discover-theme-filter";
import {
  THEME_FILTER_IDLE,
  THEME_OTHER_LABEL,
  UNTAGGED_ADMIN_LABEL,
} from "@shared/experience-themes";

const themes = [
  { id: "hiking_itinerary", slug: "hiking_itinerary", label: "Hiking Itinerary" },
  { id: "wedding_plan", slug: "wedding_plan", label: "Wedding Plan" },
];

describe("ListingThemePicker", () => {
  it("renders the catalog, Other, and the suggestion note", () => {
    const html = renderToString(
      <ListingThemePicker
        themes={themes}
        choice="catalog"
        themeId="hiking_itinerary"
        suggestion=""
        suggested
        onSelectCatalog={() => {}}
        onSelectOther={() => {}}
        onSuggestionChange={() => {}}
      />,
    );
    assert.match(html, new RegExp(THEME_OTHER_LABEL));
    assert.match(html, /data-testid="theme-suggested-note"/);
    assert.match(html, /Suggested from the name/);
    assert.match(html, /data-testid="theme-option-hiking_itinerary"/);
    assert.match(html, /data-testid="theme-option-other"/);
    assert.match(html, /aria-pressed="true"/);
    assert.equal(html.includes(UNTAGGED_ADMIN_LABEL), false);
  });

  it("shows the suggestion box only for Other", () => {
    const html = renderToString(
      <ListingThemePicker
        themes={themes}
        choice="other"
        themeId=""
        suggestion="Lazy afternoon"
        suggested={false}
        onSelectCatalog={() => {}}
        onSelectOther={() => {}}
        onSuggestionChange={() => {}}
      />,
    );
    assert.match(html, /data-testid="theme-suggestion-input"/);
    assert.match(html, /Lazy afternoon/);
    assert.equal(html.includes("theme-suggested-note"), false);
    assert.equal(html.includes(UNTAGGED_ADMIN_LABEL), false);
  });
});

describe("DiscoverThemeFilter", () => {
  it("shows chips and the idle line when nothing is selected", () => {
    const html = renderToString(
      <DiscoverThemeFilter themes={themes} selected={[]} onChange={() => {}} />,
    );
    assert.match(html, /data-testid="discover-theme-filter"/);
    assert.match(html, /data-testid="discover-theme-chip-hiking_itinerary"/);
    assert.match(html, /data-testid="text-theme-filter-idle"/);
    assert.match(html, new RegExp(THEME_FILTER_IDLE));
    assert.equal(html.includes("discover-theme-clear"), false);
    assert.equal(html.includes(UNTAGGED_ADMIN_LABEL), false);
  });

  it("marks the selected chip and offers Clear", () => {
    const html = renderToString(
      <DiscoverThemeFilter themes={themes} selected={["wedding_plan"]} onChange={() => {}} />,
    );
    const chipAt = html.indexOf('data-testid="discover-theme-chip-wedding_plan"');
    const chipTag = html.slice(html.lastIndexOf("<button", chipAt), html.indexOf(">", chipAt));
    assert.match(chipTag, /aria-pressed="true"/);
    assert.match(html, /data-testid="discover-theme-clear"/);
    assert.equal(html.includes("text-theme-filter-idle"), false);
  });
});
