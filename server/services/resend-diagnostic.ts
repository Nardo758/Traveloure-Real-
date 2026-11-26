import { createHash } from "node:crypto";
import type { ResendAuthState, ResendDiagnostic } from "../../shared/resend-diagnostic";

/** A read-only probe. Never log keys, exceptions, or upstream response bodies here. */
export async function diagnoseResendKey(
  key: string | undefined,
  buildCommit: string | null,
  fetcher: typeof fetch = fetch,
  timeoutMs = 5_000,
): Promise<ResendDiagnostic> {
  const present = typeof key === "string" && key.length > 0;
  const result: ResendDiagnostic = {
    checkedAt: new Date().toISOString(),
    buildCommit,
    key: {
      present,
      fingerprint: present ? createHash("sha256").update(key!, "utf8").digest("hex").slice(0, 16) : null,
      surroundingWhitespace: present && key !== key!.trim(),
      surroundingQuotes: present && /^['"]|['"]$/.test(key!.trim()),
    },
    authentication: { state: "missing", httpStatus: null },
  };
  if (!present) return result;
  // Do not normalize a bad value and accidentally test a different credential.
  if (result.key.surroundingWhitespace || result.key.surroundingQuotes || !/^re_[A-Za-z0-9_]+$/.test(key!)) {
    result.authentication.state = "malformed";
    return result;
  }
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    // Bound both the request and response parsing, even if a transport ignores abort.
    await Promise.race([
      (async () => {
        const response = await fetcher("https://api.resend.com/domains?limit=1", {
          method: "GET",
          headers: { Authorization: `Bearer ${key}` },
          signal: controller.signal,
          redirect: "error",
        });
        const status = response.status;
        let state: ResendAuthState = "inconclusive";
        // Never return the response content, even for unexpected provider failures.
        const body = await response.json().catch(() => null) as { name?: string; message?: string } | null;
        if (status === 200) state = "accepted";
        else if (status === 429) state = "rate_limited";
        else if ((status === 401 || status === 403) && body?.name === "restricted_api_key"
          && /only send emails|sending.only|restricted to.*send/i.test(body?.message ?? "")) state = "sending_only";
        else if ([400, 401, 403].includes(status) && /api key is invalid|invalid api key/i.test(body?.message ?? "")) state = "invalid";
        if (!controller.signal.aborted) result.authentication = { state, httpStatus: status };
      })(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => { controller.abort(); reject(new Error("timeout")); }, timeoutMs);
      }),
    ]);
  } catch {
    result.authentication = {
      state: controller.signal.aborted ? "timeout" : "network_error",
      httpStatus: null,
    };
  } finally {
    clearTimeout(timer);
  }
  return result;
}
