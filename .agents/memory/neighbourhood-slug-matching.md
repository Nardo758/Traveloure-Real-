---
name: Neighbourhood slug matching
description: Free-text neighbourhood joins (gems/services -> cityNeighborhoods) must normalize both sides or content silently vanishes from the feed.
---

`server/services/location-view.service.ts` computes each neighbourhood's gem/service counts and nested `gems[]` by joining `travelPulseHiddenGems.neighborhood` / `providerServices.neighborhood` (free text, seeded by hand or by script) against `cityNeighborhoods.slug`.

**Why this bites silently:** a raw-equality join has no error path. A mismatched value (display name vs slug, or hyphen vs underscore) just produces a zero count for that neighbourhood. Downstream, `client/src/lib/feed-stream.ts` drops any neighbourhood with a zero gem count out of the feed *entirely* — so the bug doesn't look like "wrong count", it looks like "this neighbourhood and its section chrome (eyebrow/heading/See-all/jump-list) don't exist." Discovered via Mumbai's Bandra/Colaba, which were seeded with display names ("Bandra") instead of slugs ("bandra"); two Kyoto rows had the same class of bug from hyphen/underscore slug inconsistency.

**How to apply:** any free-text field that's later joined against a canonical slug/enum column needs normalization on both sides of the comparison (lowercase, trim, non-alphanumeric → `_`, collapse), not just at write time — old rows and future seed-script regressions both need the read-side join to be forgiving. `normalizeNeighborhoodKey()` is the canonical helper for this specific join; reuse it rather than re-deriving another regex if a new consumer needs the same match. Ledger: `2026-08-27-neighbourhood-slug-match`.
