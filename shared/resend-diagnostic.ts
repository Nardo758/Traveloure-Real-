export type ResendAuthState =
  | "missing" | "malformed" | "accepted" | "sending_only"
  | "invalid" | "rate_limited" | "network_error" | "timeout" | "inconclusive";

export interface ResendDiagnostic {
  checkedAt: string;
  buildCommit: string | null;
  key: {
    present: boolean;
    fingerprint: string | null;
    surroundingWhitespace: boolean;
    surroundingQuotes: boolean;
  };
  authentication: { state: ResendAuthState; httpStatus: number | null };
}

export const RESEND_AUTH_LABELS: Record<ResendAuthState, string> = {
  missing: "No key is loaded in this server.",
  malformed: "The loaded value has whitespace, quotes, or an invalid key format. It was not sent to Resend.",
  accepted: "Resend accepted the credential for a read-only request.",
  sending_only: "Resend recognized a sending-only credential. Read access is restricted as expected.",
  invalid: "Resend rejected the credential as invalid.",
  rate_limited: "Resend rate-limited the check. Authentication is not confirmed.",
  network_error: "Could not reach Resend. Authentication is not confirmed.",
  timeout: "Resend did not respond before the timeout. Authentication is not confirmed.",
  inconclusive: "Resend returned an unexpected response. Authentication is not confirmed.",
};
