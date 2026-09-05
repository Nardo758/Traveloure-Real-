/**
 * TRIP STRIP — the lead does not repeat the eyebrow. Ledger `2026-09-03-slip-convergence`.
 *
 * The strip printed "Your Trip" twice on any screen >=sm: the coral eyebrow (one of the three
 * ratified coral touches, ruling 2026-08-28-chrome-alignment — it stays, and this test asserts it
 * is still rendered) and, immediately beside it, the travel-class lead, which is the literal
 * "Your trip". The fix suppresses only the redundant lead TEXT at exactly the breakpoint where
 * the eyebrow appears (`hidden sm:inline` there ⇒ `sm:hidden` here), so mobile still shows the
 * lead and the pin icon + destination chip are untouched at every width.
 *
 * Harness: react-dom/server renderToString, the DB-free / no-jsdom posture of
 * storefront-link.test.tsx. wouter's useLocation needs a location at render time (<Router
 * ssrPath>), useQuery needs a QueryClientProvider, and useTripContext reads sessionStorage — all
 * three are supplied below rather than mocked away, so the component under test is the real one.
 *
 * Run: npx tsx --test client/src/components/__tests__/trip-strip-lead.test.tsx
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToString } from "react-dom/server";
import { Router } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TripStrip } from "../trip/trip-strip";
// Ledger `2026-09-04-one-modal-many-doors`: the strip's "Edit ›" is a DOOR of the ONE planning
// modal, so the component now calls `usePlanning()` and must be rendered inside its provider (and
// inside the sign-in provider that provider itself consumes). Supplied here rather than mocked
// away, for the same reason the harness supplies wouter and react-query: the component under test
// stays the real one.
import { PlanningProvider } from "../../contexts/PlanningContext";
import { SignInModalProvider } from "../../contexts/SignInModalContext";

// The strip's context comes from sessionStorage (client/src/lib/trip-context.ts). A plain
// in-memory shim; installed before any render, and nothing reads it at import time.
const store = new Map<string, string>();
(globalThis as any).sessionStorage = {
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem: (k: string, v: string) => void store.set(k, String(v)),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
};

// tsconfig sets `jsx: "preserve"`, so under `tsx --test` JSX compiles to the CLASSIC
// `React.createElement` transform and every rendered component file needs React in scope.
// trip-strip.tsx (like most components here) does not import it — Vite supplies it in the real
// build. Publishing it globally for the render is the smallest shim that keeps the component
// under test unmodified; storefront-link.test.tsx does not need it only because that component
// happens to import React itself.
(globalThis as any).React = React;

function renderWithContext(
  ctx: Record<string, unknown>,
  /**
   * Rows as `GET /api/experience-types` returns them. Seeded into the cache rather than fetched:
   * queries are `enabled: false` in this harness, and `setQueryData` is how the strip's real
   * `useQuery(["/api/experience-types"])` gets its data without a network.
   *
   * THE TWO ABSENCES ARE DIFFERENT, and this parameter is how each is expressed (QA check 3):
   *   - `[]`  ⇒ the lookup RESOLVED and found no matching row. A finished answer, so the strip
   *             renders its stated §13 fallback (the class-based label it has always shown).
   *   - OMIT  ⇒ the lookup is STILL IN FLIGHT. The strip's own `enabled` predicate overrides the
   *             harness default whenever the context names an occasion, so an unseeded cache is a
   *             genuinely pending query — the first-paint window in which no noun may be printed.
   * Before that fix both spellings produced the same render, which is exactly the conflation the
   * production walkthrough caught.
   */
  occasions?: Array<Record<string, unknown>>,
  /**
   * Rows as `GET /api/user-experiences` returns them (the user's own experiences, of which the
   * ones bound to THIS trip are the plan's events — migration 277). Seeded the same way, for the
   * same reason. Omit to render the strip that never resolved a list at all, which must read as
   * the same absence as zero events.
   */
  planEvents?: Array<Record<string, unknown>>,
): string {
  store.set("experienceContext", JSON.stringify(ctx));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, enabled: false } } });
  if (occasions) client.setQueryData(["/api/experience-types"], occasions);
  if (planEvents) client.setQueryData(["/api/user-experiences"], planEvents);
  return renderToString(
    <QueryClientProvider client={client}>
      <Router ssrPath="/services">
        <SignInModalProvider>
          <PlanningProvider>
            <TripStrip />
          </PlanningProvider>
        </SignInModalProvider>
      </Router>
    </QueryClientProvider>,
  );
}

/** The text inside the party chip, or "" when the chip does not render at all. */
function partyChipText(html: string): string {
  const m = html.match(/data-testid="trip-strip-party"[^>]*>([\s\S]*?)<\/span>/);
  if (!m) return "";
  return m[1].replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

/** The text inside the events chip, or "" when the chip does not render at all. */
function eventsChipText(html: string): string {
  const m = html.match(/data-testid="trip-strip-events"[^>]*>([\s\S]*?)<\/span>/);
  if (!m) return "";
  return m[1].replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

/** The rendered class list of the <span> carrying the lead text. */
function leadTextClasses(html: string): string {
  const m = html.match(/<span[^>]*data-testid="trip-strip-lead-text"[^>]*>/);
  assert.ok(m, "the lead text span must render");
  return (m[0].match(/class="([^"]*)"/) || ["", ""])[1];
}

describe("travel vocabulary — the lead duplicates the eyebrow and is hidden at >=sm", () => {
  it("renders the coral eyebrow (unchanged) AND the lead text, with the lead sm:hidden", () => {
    const html = renderWithContext({ destination: "Kyoto, Japan" });
    // The eyebrow is a ratified coral touch and must survive this fix.
    assert.match(html, /Your Trip/, "the coral eyebrow must still render");
    assert.match(html, /Your trip/, "the lead must still render (it is what mobile sees)");
    assert.match(
      leadTextClasses(html),
      /\bsm:hidden\b/,
      "the duplicated lead text must be suppressed at exactly the breakpoint the eyebrow appears at",
    );
  });

  it("keeps the destination chip at every width", () => {
    const html = renderWithContext({ destination: "Kyoto, Japan" });
    assert.match(html, /data-testid="trip-strip-destination"/);
    assert.match(html, /Kyoto, Japan/);
  });
});

describe("other vocabularies are untouched — their leads are composed, not duplicates", () => {
  it("event class keeps its lead visible at all widths", () => {
    const html = renderWithContext({ destination: "Kyoto, Japan", experienceType: "Wedding" });
    assert.doesNotMatch(leadTextClasses(html), /\bsm:hidden\b/, "a composed event lead is not a duplicate");
    assert.match(html, /Your Kyoto wedding/);
  });

  it("couple class keeps its lead visible at all widths", () => {
    const html = renderWithContext({ destination: "Paris, France", experienceType: "Honeymoon" });
    assert.doesNotMatch(leadTextClasses(html), /\bsm:hidden\b/);
  });

  it("an invite-aware event lead (the event's own title) is never suppressed", () => {
    const html = renderWithContext({
      origin: "guest_invite",
      experienceType: "Wedding",
      title: "Mei & Kenji",
      destination: "Kyoto, Japan",
    });
    assert.doesNotMatch(leadTextClasses(html), /\bsm:hidden\b/);
    assert.match(html, /Mei &amp; Kenji/);
  });
});

/**
 * THE PARTY CHIP READS THE OCCASION ROW (ledger `2026-09-03-switch-readers`; migration 276's
 * `vocabulary` column). Before this lane the chip's wording came from the presentation CLASS,
 * which answers a different question — "how do we headline this occasion", not "what are these
 * people called". These pin both halves: the row wins when it has an answer, and the class-based
 * label is still exactly what renders when it does not.
 */
describe("party chip — the vocabulary column, with the pre-switch label as the stated fallback", () => {
  it("uses the occasion row's vocabulary when the row has one", () => {
    const html = renderWithContext(
      { destination: "Kyoto, Japan", experienceType: "Corporate Events", travelers: 12 },
      [{ slug: "corporate-events", name: "Corporate Events", vocabulary: "attendees", defaultGuests: true }],
    );
    assert.equal(partyChipText(html), "12 attendees");
  });

  it("agrees in number for a party of one", () => {
    const html = renderWithContext(
      { destination: "Kyoto, Japan", experienceType: "Wedding", travelers: 1 },
      [{ slug: "wedding", name: "Wedding", vocabulary: "guests", defaultGuests: true }],
    );
    assert.equal(partyChipText(html), "1 guest");
  });

  it("an occasion with NO guest list shows no guest copy, whatever the vocabulary says", () => {
    const html = renderWithContext(
      { destination: "Paris, France", experienceType: "Proposal", travelers: 2 },
      [{ slug: "proposal", name: "Proposal", vocabulary: "guests", defaultGuests: false }],
    );
    assert.equal(partyChipText(html), "2 travelers");
  });

  it("NULL vocabulary ⇒ the class-based label the strip has always rendered (§13)", () => {
    const html = renderWithContext(
      { destination: "Paris, France", experienceType: "Honeymoon", travelers: 2 },
      [{ slug: "wedding", name: "Wedding", vocabulary: null, defaultGuests: null }],
    );
    // Couple class — "Party of 2" is the pre-switch wording, and it must not be demoted to a
    // fabricated "2 travelers" just because no row spoke.
    assert.equal(partyChipText(html), "Party of 2");
  });

  it("no occasion rows at all ⇒ the class-based label, unchanged", () => {
    // RESOLVED to nothing (an empty catalog): a finished answer, so the stated fallback stands.
    const html = renderWithContext(
      { destination: "Kyoto, Japan", experienceType: "Wedding", travelers: 8 },
      [],
    );
    assert.equal(partyChipText(html), "8 guests");
  });

  /**
   * QA check 3 — the first-paint window. The row is not absent, it has not ARRIVED, and the strip
   * could not tell the two apart: it printed the class-based wording with the row's authority and
   * then swapped the word underneath the reader once the fetch landed. The count is the
   * traveler's own answer and is true whatever the occasion turns out to be; the noun waits.
   */
  it("an occasion lookup still IN FLIGHT renders the count alone — no noun at all", () => {
    const html = renderWithContext({
      destination: "Kyoto, Japan",
      experienceType: "Wedding",
      travelers: 8,
    });
    assert.equal(partyChipText(html), "8");
    // Not the class fallback, and not the plain-plan one either — no word is printed at all.
    assert.ok(!/guest|traveler|attendee|Party of/i.test(partyChipText(html)));
  });

  it("still renders NO chip for a count the traveler never stated", () => {
    const html = renderWithContext(
      { destination: "Kyoto, Japan", experienceType: "Wedding" },
      [{ slug: "wedding", name: "Wedding", vocabulary: "guests", defaultGuests: true }],
    );
    assert.equal(partyChipText(html), "");
  });
});

/**
 * THE EVENTS CHIP (ledger `2026-09-04-slip-events`; migration 277, CLAUDE.md entry 29). An event
 * inside a plan is a `user_experiences` row bound by `trip_id`; the chip counts them. The
 * interesting half is not the count — it is the three ways a count can be ABSENT, all of which
 * must render the same nothing rather than a "0 events" that would look like a fact (§13).
 */
describe("events chip — the count of the plan's events, hidden whenever there is not one", () => {
  it("counts only the rows bound to THIS trip", () => {
    const html = renderWithContext(
      { destination: "Kyoto, Japan", experienceType: "Wedding", tripId: "trip-1" },
      undefined,
      [
        { id: "ev-1", tripId: "trip-1" },
        { id: "ev-2", tripId: "trip-1" },
        // Another plan's event, and a loose experience with no plan at all — neither is counted.
        { id: "ev-3", tripId: "trip-2" },
        { id: "ev-4", tripId: null },
      ],
    );
    assert.equal(eventsChipText(html), "2 events");
  });

  it("agrees in number for a single event", () => {
    const html = renderWithContext(
      { destination: "Kyoto, Japan", experienceType: "Wedding", tripId: "trip-1" },
      undefined,
      [{ id: "ev-1", tripId: "trip-1" }],
    );
    assert.equal(eventsChipText(html), "1 event");
  });

  it("renders NO chip when the plan has no event rows (its one implicit event is not a row)", () => {
    const html = renderWithContext(
      { destination: "Kyoto, Japan", experienceType: "Wedding", tripId: "trip-1" },
      undefined,
      [{ id: "ev-3", tripId: "trip-2" }],
    );
    assert.equal(eventsChipText(html), "", "zero events must be silence, never \"0 events\"");
  });

  it("renders NO chip when the list never loaded — unknown is not zero, and neither is spoken", () => {
    const html = renderWithContext({ destination: "Kyoto, Japan", experienceType: "Wedding", tripId: "trip-1" });
    assert.equal(eventsChipText(html), "");
  });

  it("renders NO chip for a context with no plan yet, whatever else is cached", () => {
    const html = renderWithContext(
      { destination: "Kyoto, Japan", experienceType: "Wedding" },
      undefined,
      [{ id: "ev-1", tripId: "trip-1" }],
    );
    assert.equal(eventsChipText(html), "");
  });

  it("leaves the party chip and the lead untouched", () => {
    const html = renderWithContext(
      { destination: "Kyoto, Japan", experienceType: "Wedding", travelers: 8, tripId: "trip-1" },
      // RESOLVED to nothing, so the party chip's stated fallback is the one under test here —
      // an unseeded (still-pending) lookup is a different assertion, made above.
      [],
      [{ id: "ev-1", tripId: "trip-1" }],
    );
    assert.equal(partyChipText(html), "8 guests");
    assert.match(html, /Your Kyoto wedding/);
  });
});
