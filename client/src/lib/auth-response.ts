/**
 * Auth form bodies. A proxy in front of an unhealthy app answers
 * `text/plain` "Internal Server Error" or an empty 502. Reading that with
 * the Response JSON method throws, and the sign-in window was showing the
 * parser sentence ("Unexpected token 'I'… is not valid JSON").
 *
 * Read the bytes as text and parse them here. Callers never parse the body
 * themselves. A body that is not a JSON object is `non-json`; the form then
 * shows `AUTH_GENERIC_ERROR` — the English sentence of
 * `signupPage.genericError` in `client/src/locales/en/auth.json`. Translated
 * surfaces pass `t("signupPage.genericError")` instead of this constant.
 */

export const AUTH_GENERIC_ERROR = "Something went wrong";

export interface AuthJsonBody {
  message?: unknown;
  code?: unknown;
  redirectTo?: unknown;
  emailVerificationRequired?: unknown;
  nextStep?: unknown;
  user?: {
    id?: string;
    email?: string;
    firstName?: string | null;
    lastName?: string | null;
    role?: string;
  };
  mode?: unknown;
  launchMarketSlug?: unknown;
}

export type AuthResponseRead =
  | { kind: "json"; status: number; ok: boolean; data: AuthJsonBody }
  | { kind: "non-json"; status: number; ok: boolean };

function nonJson(response: Response): AuthResponseRead {
  return { kind: "non-json", status: response.status, ok: response.ok };
}

/** Text first, then JSON.parse. Never throws for an empty or non-JSON body. */
export async function readAuthResponse(response: Response): Promise<AuthResponseRead> {
  let text: string;
  try {
    text = await response.text();
  } catch {
    return nonJson(response);
  }
  const trimmed = text.replace(/^\uFEFF/, "").trim();
  if (!trimmed) return nonJson(response);
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return nonJson(response);
    return { kind: "json", status: response.status, ok: response.ok, data: parsed as AuthJsonBody };
  } catch {
    return nonJson(response);
  }
}

/**
 * The sentence to show for a failed auth response. A JSON object keeps the
 * server's `message` when it sent one. Anything else — plain text, HTML, an
 * empty body — is the caller's generic sentence, never the raw body and never
 * a parser error.
 */
export function authFailureMessage(read: AuthResponseRead, generic: string, jsonFallback: string): string {
  if (read.kind === "non-json") return generic;
  const message = read.data.message;
  if (typeof message === "string" && message.trim()) return message;
  return jsonFallback;
}
