# Counsel ask — expert-generated content (field knowledge, photos, scout reports)

**Status:** DRAFT for Leon to send. Not yet sent. Nothing in this lane that depends on an answer
here ships before that answer lands (see the "blocked until" list below).

**Context for Leon (not part of the email):** this draft supports the `expert-field-knowledge`
lane (`docs/DECISIONS.md`: `2026-08-29-neighborhood-claims`, `2026-08-29-evidence-is-the-test`,
`2026-08-29-graded-unlocks`, `2026-08-29-scout-check`). Experts claim neighborhoods, capture
typed evidence (places, one composed evening, a backup plan) that doubles as content inventory,
and — later — can be booked for a "scout check" (a point-in-time verification visit with a
checklist report). All of that content is attributed to a named person and, eventually, feeds
aggregated analytics and possibly a resale-class data product. We want the consent language
right before any of it goes further than an internal admin queue.

---

## Draft email

Subject: Quick legal read — consent language for expert-submitted content

Hi [counsel name],

We're expanding what local experts on Traveloure submit through their console: neighborhood
knowledge (places, a suggested evening, backup plans if something's closed or it rains), photos
they take themselves, and — down the line — paid "scout check" visits where an expert files a
short verification report on a specific place or neighborhood.

Three things we'd like your read on before we build further:

1. **Data-use consent.** When an expert submits this content, we want a clear, versioned consent
   record (we already log *that* consent was given and *when* — a `consent_at` timestamp against
   a `consent_version` string) covering: the content appearing on public Traveloure surfaces,
   being used to power AI trip recommendations, and (this is the part we want your view on)
   being included in **aggregated, de-identified analytics** we might eventually license or
   resell (e.g. "neighborhood interest trends" as a data product, not the raw submissions
   themselves). Is our current one-line consent stamp enough, or do we need distinct opt-ins for
   the resale-class use specifically?

2. **Byline / attribution.** Expert content is attributed by name (or handle) — "recommended by
   [Expert Name]" — with a real photo where available. What's the right boundary between
   attribution the expert has agreed to and something that starts to look like an endorsement or
   testimonial with its own regulatory shape (e.g. FTC disclosure norms if compensation is
   involved)?

3. **Scout-report framing.** This is the one we most want your view on before we build any UI for
   it. A "scout check" report is a checklist of pass/fail-style verdicts against named criteria
   (e.g. "wheelchair-accessible entrance: confirmed" / "posted hours match actual hours: flagged")
   — deliberately not a star rating or a narrative review, because we don't want it read as an
   opinion or endorsement. We want to frame it as **observational** — a factual record of what
   was true on a specific visit, not a recommendation or rating. Does that framing hold up legally
   if we show it to travelers? Is there language we should require in the UI (a disclaimer, a
   "as observed on [date]" stamp, something else) to keep it clearly observational rather than
   editorial?

No rush on this — nothing ships to travelers until we hear back, but we'd like your read before
we start building the UI for #3 specifically, and before we turn on any aggregated-analytics use
of #1.

Thanks,
Leon

---

## What's blocked on this landing

- **Aggregated analytics / resale-class use of expert content** (item 1) stays inert — no export,
  no licensing pipeline, no "sell the trend data" feature — until this consent language is
  reviewed and, if needed, the consent capture is updated to match.
- **Any scout-report UI or public surface** (item 3) — no report is shown to a traveler, no
  booking flow for a scout check goes live, until the observational-framing question is answered.
  This is stated as a hard blocker in `docs/DECISIONS.md` (`2026-08-29-scout-check`).
- Attribution/byline treatment (item 2) is lower-stakes and not a hard blocker, but the answer
  should land before the byline styling on public surfaces is finalized.
