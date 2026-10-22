/**
 * Where a supply sign-up continues (ledger `2026-10-21-supply-entry-paths`).
 *
 * One path per role — the same destinations `/earn`'s "I do this" already uses.
 * A door that names no role, or a role this map does not carry, lands on `/earn`.
 * It does not invent a service. `?qa=1` stays on the account form so a tester can
 * still type the server-side QA code. Anything that is not `intent=supply` is
 * left on the account form (traveler sign-up, including the waitlist redirect).
 */
import { normalizeSignupIntent } from "./launch-signup";
import { sameSiteReturnPath } from "./safe-return-path";

/** Application paths keyed by the earn-role name, plus the application `type` alias and EA. */
export const SUPPLY_APPLICATION_BY_ROLE = {
  service_provider: "/become-provider",
  event_planner: "/start/events",
  trip_planner: "/become-expert?type=travel_expert",
  /** The application `type` for a trip planner. The earn card's key stays `trip_planner`. */
  travel_expert: "/become-expert?type=travel_expert",
  local_expert: "/become-expert?type=local_expert",
  executive_assistant: "/become-expert?type=executive_assistant",
} as const;

export type SupplyApplicationRole = keyof typeof SUPPLY_APPLICATION_BY_ROLE;

export const LOCAL_EXPERT_APPLY_PATH = SUPPLY_APPLICATION_BY_ROLE.local_expert;

const OFFERING_KEY = /^[A-Za-z0-9_-]{1,80}$/;

export type SupplyContinuation =
  | { kind: "account" }
  | { kind: "chooser"; href: string }
  | { kind: "application"; href: string };

function searchParamsOf(search: string): URLSearchParams {
  const raw = search.startsWith("?") ? search.slice(1) : search;
  return new URLSearchParams(raw.split("#")[0] ?? "");
}

/** A catalog key, or null. A value that is not a key is omitted — never guessed onto a form. */
export function carriedOfferingTypeKey(raw: string | null): string | null {
  if (!raw) return null;
  const v = raw.trim();
  return OFFERING_KEY.test(v) ? v : null;
}

/** A display name to prefill, or null. Control characters and over-long values are omitted. */
export function carriedOfferingName(raw: string | null): string | null {
  if (!raw) return null;
  if (/[\u0000-\u001f\\]/.test(raw)) return null;
  const v = raw.trim().replace(/[ \t]+/g, " ");
  if (!v || v.length > 200) return null;
  return v;
}

/**
 * A `?source=` tag safe to put on the next URL. The server's `normalizeSignupSource`
 * still decides what is stored. A scheme, a host, whitespace or a control character
 * is dropped rather than forwarded.
 */
export function carriedSupplySource(raw: string | null): string | null {
  if (!raw) return null;
  const v = raw.trim().slice(0, 200);
  if (!v) return null;
  if (/[\u0000-\u001f\s\\]/.test(v) || v.includes("://") || v.startsWith("//")) return null;
  return v;
}

function withCarried(path: string, params: URLSearchParams): string {
  const qIndex = path.indexOf("?");
  const base = qIndex === -1 ? path : path.slice(0, qIndex);
  const next = new URLSearchParams(qIndex === -1 ? "" : path.slice(qIndex + 1));
  const key = carriedOfferingTypeKey(params.get("offeringTypeKey"));
  const name = carriedOfferingName(params.get("offeringName"));
  const source = carriedSupplySource(params.get("source"));
  if (key) next.set("offeringTypeKey", key);
  if (name) next.set("offeringName", name);
  if (source) next.set("source", source);
  const q = next.toString();
  const href = q ? `${base}?${q}` : base;
  return sameSiteReturnPath(href) ?? base;
}

function chooserHref(params: URLSearchParams): string {
  const source = carriedSupplySource(params.get("source"));
  const href = source ? `/earn?source=${encodeURIComponent(source)}` : "/earn";
  return sameSiteReturnPath(href) ?? "/earn";
}

/** Where `intent=supply` continues. Account means "do not redirect". */
export function supplySignupContinuation(search: string): SupplyContinuation {
  const params = searchParamsOf(search);
  if (normalizeSignupIntent(params.get("intent")) !== "supply") return { kind: "account" };
  if (params.get("qa") === "1") return { kind: "account" };
  const role = params.get("role");
  const path = role && Object.prototype.hasOwnProperty.call(SUPPLY_APPLICATION_BY_ROLE, role)
    ? SUPPLY_APPLICATION_BY_ROLE[role as SupplyApplicationRole]
    : null;
  if (!path) return { kind: "chooser", href: chooserHref(params) };
  return { kind: "application", href: withCarried(path, params) };
}

/**
 * The public ticker href. Only a `/signup` link whose intent is supply is rewritten,
 * and only into the continuation above. Every other href, including `?qa=1`, is
 * returned unchanged. The stored row is not modified.
 */
export function publicSupplyEntryHref(storedHref: string | null): string | null {
  if (storedHref === null) return null;
  if (!storedHref.startsWith("/signup")) return storedHref;
  const pathPart = storedHref.split(/[?#]/, 1)[0];
  if (pathPart !== "/signup") return storedHref;
  const query = storedHref.includes("?") ? storedHref.slice(storedHref.indexOf("?")) : "";
  const next = supplySignupContinuation(query.split("#")[0] ?? "");
  if (next.kind === "account") return storedHref;
  return next.href;
}
