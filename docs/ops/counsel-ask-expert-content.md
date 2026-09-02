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

3. **Scout-report framing.** This is the one we most want your view on before we build any of it
   — no code exists yet, and no scout-report screen, public surface, or booking flow ships until
   you've answered. The facts:

   - A "scout check" is one of the services a local expert sells through our normal catalog — listed,
     priced by the expert, and booked exactly like any other expert service — in which the expert
     visits a specific place or neighborhood on a stated date and files a structured report. It is evidence about one visit at
     one point in time — deliberately distinct from a "neighborhood claim", which is an expert's
     ongoing assertion of local knowledge.
   - The report is a checklist: for each named criterion the scout records a pass, fail, or flag
     verdict (e.g. "wheelchair-accessible entrance: confirmed" / "posted hours match actual hours:
     flagged"), with two to four attributed photos per entry captured under our existing
     consent-anchored evidence rule. It is never a one-to-five star rating and never an aggregate
     score — we are deliberately avoiding anything that implies a comparative opinion.
   - Each report carries an "as observed on [date]" stamp. Our intent is that it reads as a
     factual record of what the scout observed on that date — **observational** — not as an
     assessment, endorsement, certification, or warranty of quality or safety.
   - The scout is always an independent booked expert — never a Traveloure staff member and never
     the place's own operator. Independence is enforced in software as a join-check at booking and
     at report time: the scout's account may not intersect the target's ownership or affiliation
     graph (curation credit, provider or service ownership, attributed short links, earnings,
     endorsements, affiliate booking requests). There is no "independent reviewer" title or
     credential; independence is the enforced relationship, not a claimed badge.

   The three questions:

   a. **Is it a review?** Can a per-criterion pass/fail/flag checklist with a date stamp be shown
      to travelers without being treated as a review — and what is our exposure under (i)
      consumer-protection / unfair-and-deceptive-practices rules and (ii) defamation, given that
      a "fail" or "flag" is a factual assertion about a named business? Does the answer change
      across our launch jurisdictions (US/Florida, Japan, UK, Portugal, Colombia, India)?
   b. **What keeps it observational?** What wording or labeling, beyond the "as observed on
      [date]" stamp, keeps the report on the observational side of that line — and do the photos
      change your answer, since an image can read as an implied judgment even under a neutral
      caption?
   c. **Is the independence enough disclosure?** Is the enforced join-check sufficient disclosure
      of the scout's relationship to the target, or do we also need an explicit disclosure line
      on the report itself (naming the scout and stating the absence of a relationship)?

   If any of these points to material risk, we would rather constrain the design now — limit the
   surface to the traveler who booked the check, drop photos, narrow the criteria language — than
   ship and correct later. Please tell us the smallest set of changes that would let a scout
   report be shown to a traveler safely.

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
