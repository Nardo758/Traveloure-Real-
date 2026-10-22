/**
 * True only for the users.email unique index (`users_email_unique`), checked on the error and on the
 * driver error drizzle wraps it in. Any other unique index, constraint or fault is not a duplicate sign-up.
 */
export function isEmailUniqueViolation(err: unknown): boolean {
  for (let e: any = err, depth = 0; e && depth < 4; e = e.cause, depth += 1) {
    if (e.code === "23505") return e.constraint === "users_email_unique";
  }
  return false;
}
