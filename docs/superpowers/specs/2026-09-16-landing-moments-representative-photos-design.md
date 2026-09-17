# Landing Moments Representative Photos

## Goal

Show the existing “Plan the moment” section on production before real expert-curated photos are available, without presenting licensed stock photography as expert-provided content.

## Chosen approach

Each configured landing moment receives a licensed representative stock image stored with the application. The existing real-photo resolver remains the preferred source. When a moment has one or more qualifying expert-curated photos, those photos and the real builder attribution are used. When it has none, the representative image is used instead.

Representative images are explicitly labeled **“Representative photo”**. They do not carry an expert handle, builder byline, review count, or any other implication that a local expert supplied them.

## Data contract

The landing-moment response will distinguish real and representative photos with an explicit source classification rather than inferring provenance from the URL.

For every configured moment:

- Real photos remain subject to the current production eligibility query.
- A representative photo is available as a deterministic fallback.
- Real photos take precedence whenever at least one qualifies.
- The representative fallback does not weaken or bypass the existing real-photo eligibility rules.

The representative asset metadata includes meaningful alternative text and the display location. License/source records are retained alongside the assets or in a nearby attribution record as required by the selected license.

## Server behavior

`resolveLandingMoments` continues to query attributed real photos first. If that query returns none for a configured moment, the resolver returns that moment with its representative fallback photo and no builder.

A database/query failure follows the same safe fallback behavior: the representative image may render, but no expert attribution is fabricated.

Because every configured moment has a representative fallback, the public endpoint returns the configured roster even before production receives real expert photos.

## Client behavior

The existing landing-page slot renders “Plan the moment” when the endpoint returns moments.

For a representative image:

- Show a visible **“Representative photo”** label.
- Show the location description without an `@handle`.
- Hide the “built by @expert” line.

For a real expert photo:

- Preserve the current place and `@handle` caption.
- Preserve the current builder byline.
- Do not show the representative-photo label.

If the selected image fails to load, replace the broken image with the existing branded gradient treatment while preserving the representative label and honest caption. The section remains usable and the planning CTA remains available.

## Assets

Provide one licensed representative stock image for each configured visual:

1. Kyoto wedding
2. Kyoto proposal
3. Edinburgh golf trip
4. Cartagena girls’ trip
5. Porto anniversary
6. Goa honeymoon
7. Mumbai milestone birthday
8. Jaipur family occasion

Assets are stored with the application instead of depending on expiring or mutable third-party URLs. Images are web-optimized and use consistent dimensions suitable for the existing responsive crop.

## Rollout

This is a code-and-asset change. After it is published, the section appears without production database seeding or a manual restart. The existing public response cache may delay the visible change briefly.

As qualifying real photos are added, they automatically replace representative images city by city without another code change.

## Verification

- Resolver test: no qualifying real photo returns the representative photo and no builder.
- Resolver test: a qualifying real photo wins over the representative fallback.
- Resolver test: query failure does not fabricate expert attribution.
- Component test: representative photos show the label and omit handle/builder attribution.
- Component test: real photos retain current attribution and omit the representative label.
- Component test: an image-load failure renders the branded fallback without hiding the section or CTA.
- Existing CTA, tabs, rotation, analytics, and responsive behavior remain unchanged.

## Out of scope

- Weakening the real-photo trust gate.
- Seeding representative content into the production database.
- Claiming stock photos were supplied by experts.
- Building the missing `experience_starts` rollup.
- Adding photography to the separate “What people are planning” fallback rail.