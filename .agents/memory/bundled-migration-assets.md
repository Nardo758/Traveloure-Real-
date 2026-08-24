---
name: Bundled migration assets
description: Keeping SQL migration inputs available to the deployed API bundle.
---

The Traveloure API migration runner reads SQL files at startup, so the production build must copy its migration directory into the distribution and verify that every manifest entry is present.

**Why:** A bundled server can start successfully against an already-migrated development database while failing before it listens on any fresh or partially migrated database if its SQL inputs were omitted.

**How to apply:** Treat migration SQL as runtime deployment assets, resolve the bundled directory before source-tree fallbacks, and keep an asset-manifest verification step in the API build.