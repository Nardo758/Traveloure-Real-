import { test, expect } from '@playwright/test';
import {
  isUncaught,
  isMinifiedReactError,
  isReactBoundaryCatch,
  shouldCapture,
} from '../utils/console-crash-filter';

/**
 * Unit tests for the console-error filter predicates used in navbar-links.spec.ts.
 *
 * These tests have no dependency on a running server or browser page — they
 * exercise the three pure boolean expressions in isolation so that:
 *
 *   1. A future refactor that accidentally widens the filter (starts catching
 *      benign third-party noise) fails here before CI is flooded with false
 *      positives.
 *   2. A future refactor that accidentally narrows the filter (stops catching
 *      genuine React crashes) fails here before real regressions slip through.
 *
 * The predicates are imported from playwright/utils/console-crash-filter.ts,
 * which is also used by navbar-links.spec.ts — so this test always exercises
 * exactly the same logic the smoke test runs.
 */

// ── Positive cases — messages that represent real app crashes ─────────────────

test.describe('crash filter — positive cases (should be captured)', () => {
  test('isUncaught: bare Uncaught Error message', () => {
    expect(isUncaught('Uncaught Error: Cannot read properties of undefined')).toBe(true);
  });

  test('isUncaught: Uncaught TypeError from app code', () => {
    expect(isUncaught('Uncaught TypeError: Cannot set property of null')).toBe(true);
  });

  test('isUncaught: Uncaught ReferenceError from app code', () => {
    expect(isUncaught('Uncaught ReferenceError: myVar is not defined')).toBe(true);
  });

  test('isUncaught: Uncaught (in promise) rejection', () => {
    expect(isUncaught('Uncaught (in promise) Error: fetch failed')).toBe(true);
  });

  test('isMinifiedReactError: production crash code #130 (rendering nothing)', () => {
    expect(isMinifiedReactError('Minified React error #130; visit https://reactjs.org/docs/error-decoder.html?invariant=130')).toBe(true);
  });

  test('isMinifiedReactError: production crash code #185 (invalid hook call)', () => {
    expect(isMinifiedReactError('Minified React error #185')).toBe(true);
  });

  test('isMinifiedReactError: production crash code with single digit', () => {
    expect(isMinifiedReactError('Minified React error #1')).toBe(true);
  });

  test('isMinifiedReactError: production crash code with many digits', () => {
    expect(isMinifiedReactError('Minified React error #99999')).toBe(true);
  });

  test('isReactBoundaryCatch: standard error boundary log message', () => {
    expect(isReactBoundaryCatch('React caught an error during rendering')).toBe(true);
  });

  test('isReactBoundaryCatch: verbose error boundary output with component stack', () => {
    expect(isReactBoundaryCatch(
      'The above error occurred in the <TripCard> component:\n\n    at TripCard\n\nReact will try to recreate this component tree from scratch using the error boundary you provided, ErrorBoundary.\n\nReact caught an error thrown by TripCard.'
    )).toBe(true);
  });

  test('shouldCapture: any of the three predicates triggers capture', () => {
    expect(shouldCapture('Uncaught Error: boom')).toBe(true);
    expect(shouldCapture('Minified React error #42')).toBe(true);
    expect(shouldCapture('React caught an error')).toBe(true);
  });
});

// ── Negative cases — third-party / benign messages that must be ignored ───────

test.describe('crash filter — negative cases (should NOT be captured)', () => {
  // Google Maps SDK noise
  test('ignores Google Maps TypeError during tile loading', () => {
    expect(shouldCapture('TypeError: Cannot read properties of undefined (reading "getNativeProjection")')).toBe(false);
  });

  test('ignores Google Maps ReferenceError during lazy init', () => {
    expect(shouldCapture('ReferenceError: google is not defined')).toBe(false);
  });

  test('ignores Google Maps script load error', () => {
    expect(shouldCapture('[Google Maps JavaScript API] You have included the Google Maps JavaScript API multiple times on this page.')).toBe(false);
  });

  // Stripe.js noise
  test('ignores Stripe.js internal TypeError on payment element setup', () => {
    expect(shouldCapture('TypeError: Cannot read properties of null (reading "getContext")')).toBe(false);
  });

  test('ignores Stripe.js iframe initialisation error', () => {
    expect(shouldCapture('TypeError: Cannot set properties of undefined (setting "onload")')).toBe(false);
  });

  // Analytics / tag manager noise
  test('ignores gtag ReferenceError from optional analytics globals', () => {
    expect(shouldCapture('ReferenceError: gtag is not defined')).toBe(false);
  });

  test('ignores dataLayer ReferenceError from tag manager', () => {
    expect(shouldCapture('ReferenceError: dataLayer is not defined')).toBe(false);
  });

  // Generic React log messages that do NOT indicate a crash
  test('ignores React prop-types warning (contains "React" but not a crash)', () => {
    expect(shouldCapture('Warning: React does not recognize the `myProp` prop on a DOM element.')).toBe(false);
  });

  test('ignores React strict-mode double-invoke log', () => {
    expect(shouldCapture('React: development mode is enabled.')).toBe(false);
  });

  test('ignores plain TypeError without Uncaught prefix (third-party style)', () => {
    expect(shouldCapture('TypeError: Failed to fetch')).toBe(false);
  });

  test('ignores plain ReferenceError without Uncaught prefix', () => {
    expect(shouldCapture('ReferenceError: fbq is not defined')).toBe(false);
  });

  // Case-sensitivity and partial-match safety
  test('isUncaught requires exact prefix — lowercase "uncaught" is ignored', () => {
    expect(isUncaught('uncaught error: something broke')).toBe(false);
  });

  test('isMinifiedReactError requires digits after # — bare hash is ignored', () => {
    expect(isMinifiedReactError('Minified React error #')).toBe(false);
  });

  test('isReactBoundaryCatch requires both "React" AND "caught an error"', () => {
    expect(isReactBoundaryCatch('React rendered successfully')).toBe(false);
    expect(isReactBoundaryCatch('Something caught an error during processing')).toBe(false);
  });
});
