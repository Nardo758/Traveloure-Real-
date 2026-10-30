/**
 * Row 263, client half (Architect, Oct 28, 2026, 00:45 ET: Q1 CS3 sanction, Q2 the flow ends on the
 * confirmation card, Q3 the two sentences removed, not reworded): the guest invite page no longer
 * calls GET /api/invites/:token/recommendations, holds no recommendations state and renders no Tabs.
 * Reads the page with fs; runs no git and compares to no ref.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { siteNeverSayHits } from "@shared/banned-copy";
import { GUEST_LANDING_COPY } from "../../../lib/guest-landing-copy";
import { GUEST_CARD_COPY } from "../../../lib/guest-card-copy";

const CLIENT = resolve(fileURLToPath(new URL(".", import.meta.url)), "../../..");
const GUEST = readFileSync(resolve(CLIENT, "pages/GuestInvitePage.tsx"), "utf8");

/** Text nodes between JSX tags that carry letters (the visible copy, not expressions). */
function visibleText(src: string): string[] {
  const out = new Set<string>();
  for (const m of Array.from(src.matchAll(/>([^<>{}]*?[A-Za-z][^<>{}]*?)</g))) {
    const t = m[1].split(/\s+/).filter(Boolean).join(" ");
    if (t && !/useState|const |=>|&&/.test(t)) out.add(t);
  }
  return Array.from(out).sort();
}

/** The page's visible copy after this PR: every entry already existed on main; none is new. */
const VISIBLE = [
  "Accommodation Preference",
  "Back",
  "Canada",
  "City *",
  "Continue",
  "Country",
  "Dietary Restrictions",
  "Get Started",
  "Haven't decided yet",
  "Hotel block (group rate)",
  "I'll book my own",
  "I'll need transportation from the airport/hotel to the venue",
  "Including yourself",
  "Invite Not Found",
  "Let us know if you can make it",
  "Maybe / Not sure yet 🤔",
  "Message to Host (optional)",
  "Mexico",
  "Number of Guests",
  "Other",
  "Please RSVP",
  "RSVP Confirmed!",
  "Sorry, can't make it ❌",
  "Special Requests",
  "State/Province",
  "Staying with family/friends",
  "Submit RSVP",
  "This invite link is invalid or has been deleted.",
  "United Kingdom",
  "United States",
  "We're excited to have you join us for this special occasion.",
  "Where are you traveling from?",
  "Will you be attending? *",
  "Yes, I'll be there! ✅",
].sort();

/**
 * Row 278 (sanctioned GR3 addition, Architect, Oct 28, 2026, 20:50 ET): the landing's labels render
 * from GUEST_LANDING_COPY, not as JSX text, so they are pinned here. Held for Leon.
 */
const LANDING_COPY = {
  hostedBy: "Hosted by Maya",
  date: "Date",
  time: "Time",
  venue: "Venue",
  city: "City",
  noteFrom: "Note from Maya",
  rsvpBy: "RSVP by 3/1/2027",
  addressAfterRsvp: "The address is shared after you RSVP.",
};

/**
 * Order 279 (sanctioned GR3 addition, Architect, Oct 29, 2026): the post-RSVP card's words render
 * from GUEST_CARD_COPY, not as JSX text, so they are pinned here. Leon's words; held for his approval.
 */
const CARD_COPY = {
  lineWithCity: "See what there is to do around this event in Kyoto.",
  lineWithoutCity: "See what there is to do around this event.",
  button: "See how it works",
  href: "/experiences",
  // Row 280b (sanctioned GR3 addition, Architect Oct 29, 2026): the approved button label.
  planButton: "Plan my day around this",
};

describe("row 263 guest invite drops recommendations", () => {
  it("GR1 no recommendations fetch, state, branch or literal", () => {
    for (const gone of ["/recommendations", "needsApiIntegration", "<Tabs", "fetchRecommendations", "setRecommendations"]) {
      assert.ok(!GUEST.includes(gone), gone);
    }
    assert.doesNotMatch(GUEST, /recommendation/i, "the step is renamed 'confirmed' everywhere; no literal says recommendations");
  });

  it("GR2 the RSVP flow stays, and a returning guest still lands on the confirmation card", () => {
    assert.match(GUEST, /fetch\(`\/api\/invites\/\$\{token\}\/rsvp`/);
    assert.ok(GUEST.includes("RSVP Confirmed!"));
    assert.ok(GUEST.includes("useState<'welcome' | 'origin' | 'rsvp' | 'confirmed'>('welcome')"));
    for (const step of ["welcome", "origin", "rsvp", "confirmed"]) assert.ok(GUEST.includes(`currentStep === '${step}' &&`), step);
    const returning = GUEST.slice(GUEST.indexOf("if (data.invite.rsvpStatus !== 'pending')"), GUEST.indexOf("} else if (data.invite.originCity)"));
    assert.ok(returning.includes("setCurrentStep('confirmed');"));
    assert.equal((GUEST.match(/setCurrentStep\('confirmed'\)/g) ?? []).length, 2, "the returning guest and a fresh RSVP");
    const step = GUEST.slice(GUEST.indexOf("currentStep === 'confirmed' &&"));
    assert.ok(step.includes("RSVP Confirmed!"));
    assert.ok(!step.includes("CardDescription"), "nothing after the confirmation title");
  });

  it("GR3 the two sentences are removed and no new visible string was added", () => {
    assert.ok(!GUEST.includes("personalized travel recommendations"));
    assert.ok(!GUEST.includes("Here are your"));
    // Ruling on #1741 (Oct 28, 2026): the welcome step's travel-planning promise is deleted, not replaced.
    assert.ok(!GUEST.includes("Personalized Travel Planning"));
    assert.ok(!GUEST.includes("accommodation near"));
    assert.deepEqual(visibleText(GUEST), VISIBLE);
    const copy = GUEST_LANDING_COPY;
    assert.deepEqual(
      {
        hostedBy: copy.hostedBy("Maya"),
        date: copy.date,
        time: copy.time,
        venue: copy.venue,
        city: copy.city,
        noteFrom: copy.noteFrom("Maya"),
        rsvpBy: copy.rsvpBy("3/1/2027"),
        addressAfterRsvp: copy.addressAfterRsvp,
      },
      LANDING_COPY,
    );
    assert.ok(GUEST.includes("guestLandingRows("), "the page renders the landing through the one helper");
    assert.deepEqual(
      {
        lineWithCity: GUEST_CARD_COPY.line("Kyoto"),
        lineWithoutCity: GUEST_CARD_COPY.line(),
        button: GUEST_CARD_COPY.button,
        href: GUEST_CARD_COPY.href,
        planButton: GUEST_CARD_COPY.planButton,
      },
      CARD_COPY,
    );
  });

  it("GR4 never-say sweep over the remaining visible text", () => {
    for (const t of visibleText(GUEST)) assert.deepEqual(siteNeverSayHits(t), [], t);
  });
});
