---
name: Mockup preview discovery pitfall
description: Shared prop-dependent components in mockups/ folders become crashing preview routes
---
Every .tsx file in artifacts/mockup-sandbox/src/components/mockups/** is auto-registered as a preview route and mounted with no props.
**Why:** A shared `ConsoleShell.tsx` created by a design subagent crashed its auto-generated preview route (`crumbs.map` on undefined).
**How to apply:** Prefix shared/helper components with `_` (e.g. `_ConsoleShell.tsx`, `_consoleShared.tsx`) so they are excluded from discovery; tell subagents this convention in their briefs.
