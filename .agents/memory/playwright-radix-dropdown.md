---
name: Playwright + Radix Dropdown testing quirks
description: Hard-won rules for testing Radix DropdownMenu (user-menu.tsx) in Playwright without flake
---

## Rule 1 — Never pointer-click a trigger while menu is open

When a Radix DropdownMenu is open, `<html>` intercepts all pointer events via
DismissableLayer. `page.click('[data-testid="button-user-menu"]')` will block
indefinitely (waiting for the element to be "clickable") because html is in the way.

**How to apply:** Use `page.keyboard.press("Escape")` to close an open menu.
For open/close cycles, use `focus()` + `Enter` / `Escape` instead of pointer clicks.

## Rule 2 — Re-focus trigger before each Enter press

Radix moves focus to the first menu item on open. If your loop does:
`Enter (open) → Escape (close)` without re-focusing the trigger, Escape may
leave focus somewhere unexpected. The next `Enter` then activates whatever is
focused (possibly a menu link → navigates away, unmounting the React tree).

**How to apply:**
```typescript
for (let i = 0; i < N; i++) {
  await page.locator('[data-testid="button-user-menu"]').focus();
  await page.keyboard.press("Enter");   // open
  await page.waitForTimeout(30);
  await page.keyboard.press("Escape");  // close
  await page.waitForTimeout(30);
}
```

## Rule 3 — Auth mock via addInitScript, not page.route catch-all

`page.addInitScript()` intercepts `/api/auth/user` before React boots, making
auth resolution synchronous and eliminating the network round-trip.

**Critical:** Only mock `/api/auth/user` — let all other `/api/*` calls through
to the real server. Intercepting non-auth routes with `[]` responses causes
home-page components to crash (they receive `[]` instead of an expected object),
which unmounts the entire React tree including the navbar/UserMenu.

```typescript
window.fetch = async (input, init) => {
  const url = String(input instanceof Request ? input.url : input);
  if (url.includes("/api/auth/user")) {
    return user === null
      ? new Response("Unauthorized", { status: 401 })
      : new Response(JSON.stringify(user), { status: 200, ... });
  }
  return _original(input, init); // everything else → real server
};
```

## Rule 4 — Check href attribute, not click+waitForURL for nav links

Radix portal unmounts the Link element on menu close before Wouter's pushState
fires. `page.click(link) + page.waitForURL(...)` is racy and flakes. Instead:

```typescript
const href = await page.locator('[data-testid="link-expert-console"]').getAttribute("href");
expect(href).toBe("/expert/dashboard");
```

## Rule 5 — Unauthenticated navbar testid is button-sign-in

The layout navbar's unauthenticated "Sign In" button has `data-testid="button-sign-in"`.
There is NO `button-login` or `button-sign-up` testid in the navbar.
`gotoHome(page, "unauth")` waits for `button-sign-in`, not `button-login`.

**Why:** The existing layout only renders a single "Sign In" CTA in the unauthenticated state.
