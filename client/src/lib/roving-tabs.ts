/**
 * A-24 (ledger `2026-11-05-lane4-places`): the WAI-ARIA tabs pattern's keyboard half. The tablist already carries
 * `role="tab"`, `aria-selected` and a roving `tabIndex`; ArrowLeft/ArrowRight move to the previous/next tab (wrapping),
 * Home/End to the first/last. Any other key ⇒ null (the event is left alone). Pure.
 */
export function nextTabKey<K extends string>(keys: readonly K[], current: K, key: string): K | null {
  if (keys.length === 0) return null;
  const i = Math.max(0, keys.indexOf(current));
  switch (key) {
    case "ArrowRight":
      return keys[(i + 1) % keys.length];
    case "ArrowLeft":
      return keys[(i - 1 + keys.length) % keys.length];
    case "Home":
      return keys[0];
    case "End":
      return keys[keys.length - 1];
    default:
      return null;
  }
}
