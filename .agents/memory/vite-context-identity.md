---
name: Vite context identity
description: Prevents correctly nested React context consumers from disconnecting during Replit/Vite Fast Refresh.
---

Shared React context objects used across the app shell must retain their identity across Vite Fast Refresh module replacement.

**Why:** Replit's long-running preview can hot-reload a context provider and its consumers at slightly different module revisions. React then reports that a hook is outside its provider even when the rendered component stack proves the nesting is correct.

**How to apply:** When a cross-cutting context fails only after HMR while a full reload works, first verify imports and React deduplication. If those are correct, preserve the context object through `import.meta.hot.data` rather than weakening the hook or duplicating providers.