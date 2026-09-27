# Lane C — expert-signed blog pipeline (build brief)

> Source: handoff pack, 2026-09-27 (decision-maker). Rulings here are final.

## B. Lane C — expert-signed blog pipeline (build brief)

Design report exists in the previous session's scratchpad as `lane-c-report.md`; if it isn't on any branch, rebuild the design from these rulings.

Model (migration number re-checked at build; 326 likely): `blog_posts`, `blog_post_sources`, `blog_post_reactions`, additive, no DB CHECK, no DEFAULT on status, declared in `shared/schema.ts`, value sets in `shared/blog.ts`. Pipeline: research (Tavily via `getTavilyClient()`, spend-capped, sources capped by `BLOG_QUOTE_MAX_CHARS` = 300 from config) → AI draft (cites only gathered sources, cost-tracked) → expert review and sign (hash of body) → admin publish only when hash matches → withdraw, never delete.

Rulings:
1. Tables and migration: approved.
2. Consent: existing `consent_at` does NOT cover publishing nugget text under the expert's name. New per-post consent captured at signing; the signature is the consent.
3. Any post-sign edit, admin typos included, requires re-signing.
4. Quote cap from config; affiliate-domain refusal list from the partner registry.
5. TravelPulse weekly is platform-authored, labelled "AI signal from public data", no byline.
6. Reactions (useful / been_there / want_this) + `content_impressions` feed blog-index ranking only, via `featured-sort`'s null-until-N pattern. No comments.
7. "Ask the local" opens a conversation with a new `blog_post` context kind (LD 40 amended). Never a lead without a slip (LD 32).
8. A proposal guide does not conflict with `visibility: hidden`.
9. Byline gate: approved expert with a handle, a live storefront, and a verified neighborhood in that market.
10. No payment for posts; `fee_bands` if ever.
11. Separate small lane: the evidence scorer's Anthropic calls must be cost-tracked.
Content types: occasion×market guides; field knowledge (verified, consented nuggets, expert's own byline); TravelPulse weekly; gems roundups (expert-curated only); link roundups (short quotes, attribution, outbound, no affiliate domains). No third-party republishing. Empty and unreviewed states `noindex`; sitemap lists published only.
Scheduling: Kyoto byline count comes from the decision-maker (read-only prod query). Until then, build with an empty schedule. Never pad.

