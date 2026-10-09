/** A successful Stripe payment whose local confirmation must be retried, never charged again. */
export class LegacyBookingEmailPersistenceError extends Error {
  readonly code = "LEGACY_BOOKING_EMAIL_PERSISTENCE_FAILED";

  constructor(bookingId: string, cause: unknown) {
    super(`Could not persist the legacy booking confirmation for ${bookingId}`);
    this.name = "LegacyBookingEmailPersistenceError";
    (this as Error & { cause?: unknown }).cause = cause;
  }
}

export function isLegacyBookingEmailPersistenceError(
  error: unknown,
): error is LegacyBookingEmailPersistenceError {
  return error instanceof LegacyBookingEmailPersistenceError
    || (typeof error === "object" && error !== null
      && (error as { code?: unknown }).code === "LEGACY_BOOKING_EMAIL_PERSISTENCE_FAILED");
}
