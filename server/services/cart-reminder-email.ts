/** Closed allowlist: no caller can invent a fourth step. */
export const CART_REMINDERS = [
  { kind: "cart_reminder_1h", milliseconds: 60 * 60_000 },
  { kind: "cart_reminder_1d", milliseconds: 24 * 60 * 60_000 },
  { kind: "cart_reminder_3d", milliseconds: 72 * 60 * 60_000 },
] as const;
export type CartReminderKind = typeof CART_REMINDERS[number]["kind"];
export const isCartReminder = (kind: unknown): kind is CartReminderKind =>
  CART_REMINDERS.some(step => step.kind === kind);
export const isCartReminderFamily = (kind: unknown): boolean =>
  typeof kind === "string" && kind.startsWith("cart_reminder");

export function dueCartReminder(idleMs: number, sent: readonly string[]): CartReminderKind | null {
  if (!Number.isFinite(idleMs) || idleMs < 0) return null;
  // Do not jump over an unsent step, even when a sweep was missed.
  const next = CART_REMINDERS.find(step => !sent.includes(step.kind));
  return next && idleMs >= next.milliseconds ? next.kind : null;
}

export function cartReminderThreshold(kind: CartReminderKind): number {
  return CART_REMINDERS.find(step => step.kind === kind)!.milliseconds;
}

export function buildCartReminderEmail() {
  // Verification-only copy. No provider transport or inferred item facts.
  return {
    subject: "Your saved cart is ready to review",
    html: "<p>You can return to Traveloure to review your saved cart and current details.</p>",
    text: "You can return to Traveloure to review your saved cart and current details.",
  };
}
