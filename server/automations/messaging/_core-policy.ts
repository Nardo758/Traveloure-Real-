export const LOCKOUT_FAILURES = 5;
export const LOCKOUT_MINUTES = 30;
export const DELETION_GRACE_DAYS = 7;
export const VERIFY_LIMIT_PER_HOUR = 3;
export const JOURNEY_RETRY_MINUTES = [1, 5, 30] as const;
export const SIGNUP_RESPONSE = {
  message: "Check your email for the next step. If you already have an account, we'll send sign-in instructions.",
};
export const MARKETING_KINDS = new Set(["profile_nudge", "planner_nudge"]);
/** Keep development journey links on the preview without changing other mail. */
export function journeyBaseUrl(fallback: () => string,
  environment: { NODE_ENV?: string; REPLIT_DEV_DOMAIN?: string } = process.env): string {
  if (environment.NODE_ENV === "development" && environment.REPLIT_DEV_DOMAIN) {
    const host = environment.REPLIT_DEV_DOMAIN;
    if (!/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/i.test(host)) {
      throw new Error("Invalid development host for journey email links");
    }
    return `https://${host}`;
  }
  return fallback();
}
export function marketingPreferences(preferences: unknown) {
  const p = (preferences && typeof preferences === "object" ? preferences : {}) as Record<string, any>;
  const s = p.settings ?? {};
  return {
    consent: (s.notifications?.marketing ?? s.marketingEmails ?? p.notifications?.marketing) === true
      && p.journeyMarketingOptOut !== true,
    language: String(s.language ?? p.language ?? "en"),
    timezone: String(s.timezone ?? p.timezone ?? "UTC"),
  };
}
export function isDaytime(now: Date, timezone: string): boolean {
  try {
    const hour = Number(new Intl.DateTimeFormat("en", {
      timeZone: timezone, hour: "2-digit", hourCycle: "h23",
    }).format(now));
    return hour >= 9 && hour < 20;
  } catch {
    return now.getUTCHours() >= 9 && now.getUTCHours() < 20;
  }
}
export function safeName(value: unknown): string {
  return typeof value === "string" && value.trim() ? value.replace(/[\r\n]/g, " ").trim() : "there";
}