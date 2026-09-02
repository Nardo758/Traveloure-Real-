# Backfill email — invite existing experts to claim their neighborhoods

**Status:** DRAFT for Leon to send to the twelve existing local experts. Not yet sent.

**Context for Leon (not part of the email):** the neighborhood-claims lane
(`docs/DECISIONS.md`: `2026-08-29-neighborhood-claims`) gates off the old auto-capture that used
to turn an expert's free-text "neighborhoods" answer on their application into
`expert_neighborhoods` rows at approval time. Going forward, `expert_neighborhoods` rows are born
only from a ratified claim. That means existing experts whose profile neighborhoods were captured
the old way (or never matched at all — the auto-match only worked for a handful of exact
name/slug hits) need to actually claim them through the new console flow before the platform's
"Ask about [neighborhood]" routing and local-expert enrichment keep working for them. This email
is the invite to do that.

---

## Draft email

Subject: A quick update to your Traveloure neighborhood listing

Hi [Expert first name],

Quick heads-up on something that changed on our end — nothing you need to worry about, but a
small action on your part will keep your profile working the way it has been.

We've rebuilt how we track which neighborhoods a local expert covers. It used to be pulled
automatically from what you wrote in your application. Now it's a short, direct step you take
yourself from your console: you **claim** the neighborhoods you know, and once we've verified
it — you'll show us a few places, one evening you'd plan there, and a backup if plans change —
it goes live on your profile as **verified**.

Because of this change, your existing neighborhoods will need to be (re-)claimed. Here's how:

1. Open your Traveloure console → **Content Studio** → **My Neighborhoods**.
2. You'll see the neighborhoods available in your city. Claim the ones you cover.
3. Submit each claim for review when you're ready — verifying it just means showing us the
   neighborhood, not a test. We'll get back to you quickly.

If this sits unclaimed for a while, it just means that neighborhood stays off your profile until
you claim it — nothing is removed or held against you, and there's no deadline pressure here.

Thanks for being one of the first experts on the platform — this new flow also means your
knowledge now doubles as real content for travelers (places you recommend, an evening you'd plan,
tips for when something's closed), so it's worth a few minutes.

Questions — just reply to this email.

Thanks,
Leon

---

## Notes for send

- Send individually (or via the existing expert-comms list) to the twelve approved local experts
  as of this lane's landing.
- Copy uses **claim / verify** vocabulary only — no "test," "exam," "quiz," or "score" anywhere,
  matching the public-facing vocabulary rule (`2026-08-29-neighborhood-claims`).
- Nothing in this email should be sent before the "My Neighborhoods" console panel is live for
  those experts to use (Phase 1 of this lane ships the panel; this email can go out once that's
  deployed).
