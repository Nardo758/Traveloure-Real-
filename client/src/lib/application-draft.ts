/**
 * Guest application draft — preserves in-progress supply-funnel form state
 * (expert / provider application) across a sign-in redirect or an expired
 * session, mirroring the sessionStorage pattern established by
 * `trip-context.ts` and the guest-cart migration (`SignInModal.migrateGuestCart`,
 * `GuestCartMigrator` in `App.tsx`).
 *
 * Both application funnels (`travel-experts.tsx`, `services-provider.tsx`) POST
 * to an `isAuthenticated` endpoint, so a guest who fills the form cannot submit
 * it — the fix is to save the whole in-progress form (including which wizard
 * step they were on) right before sending them to sign in, then restore it
 * when the page remounts after the sign-in redirect. Each funnel uses its own
 * namespaced key so the two drafts never collide.
 */

export interface ApplicationDraft<T> {
  formData: T;
  currentStep: number;
  savedAt: string;
}

export function saveApplicationDraft<T>(key: string, formData: T, currentStep: number): void {
  try {
    const draft: ApplicationDraft<T> = { formData, currentStep, savedAt: new Date().toISOString() };
    sessionStorage.setItem(key, JSON.stringify(draft));
  } catch {
    /* storage full/unavailable — draft is best-effort, never blocks the flow */
  }
}

export function loadApplicationDraft<T>(key: string): ApplicationDraft<T> | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || !("formData" in parsed)) return null;
    return parsed as ApplicationDraft<T>;
  } catch {
    return null;
  }
}

export function clearApplicationDraft(key: string): void {
  try {
    sessionStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

/** Parses the "STATUS: body" shape thrown by `apiRequest`'s `throwIfResNotOk`. */
export function parseApiErrorStatus(error: unknown): number | null {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const match = /^(\d{3}):/.exec(message);
  return match ? parseInt(match[1], 10) : null;
}

/** Strips the leading "STATUS: " prefix `apiRequest` errors carry, for display. */
export function stripApiErrorStatus(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return message.replace(/^\d{3}:\s*/, "");
}

/**
 * Honest, action-oriented copy for a failed application submit — never surfaces
 * a raw "401: Unauthorized" or claims success on a server error.
 */
export function describeSubmitError(error: unknown): { title: string; description: string; isAuthError: boolean } {
  const status = parseApiErrorStatus(error);
  if (status === 401) {
    return {
      title: "Sign in to submit your application",
      description: "We've saved everything you entered — sign in and we'll pick up right where you left off.",
      isAuthError: true,
    };
  }
  if (status && status >= 500) {
    return {
      title: "Something went wrong on our end",
      description: "Your answers are safe — please try submitting again in a moment.",
      isAuthError: false,
    };
  }
  const detail = stripApiErrorStatus(error);
  return {
    title: "Submission failed",
    description: detail && detail !== "Failed to fetch" ? detail : "There was a problem submitting your application. Please try again.",
    isAuthError: false,
  };
}
