/**
 * Shared console-error filter predicates used by the navbar smoke test and
 * the crash-filter unit tests.
 *
 * The filter is intentionally narrow: only messages that represent genuine
 * application crashes are captured; third-party SDK noise (Google Maps,
 * Stripe.js, analytics) is ignored.
 *
 * Keeping the predicates here ensures that the unit test in
 * crash-filter-unit.spec.ts always exercises exactly the same logic that
 * the navbar-links.spec.ts smoke test runs.
 */

/** (a) Unhandled exception that reached the browser surface. */
export function isUncaught(text: string): boolean {
  return text.startsWith('Uncaught ');
}

/** (b) React production crash code (e.g. "Minified React error #130"). */
export function isMinifiedReactError(text: string): boolean {
  return /Minified React error #\d+/.test(text);
}

/** (c) React error boundary caught a component-tree throw. */
export function isReactBoundaryCatch(text: string): boolean {
  return text.includes('React') && text.includes('caught an error');
}

/** Returns true if the console error message represents a real app crash. */
export function shouldCapture(text: string): boolean {
  return isUncaught(text) || isMinifiedReactError(text) || isReactBoundaryCatch(text);
}
