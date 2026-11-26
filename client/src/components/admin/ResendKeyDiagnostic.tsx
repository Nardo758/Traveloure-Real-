import { useState } from "react";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";
import { RESEND_AUTH_LABELS, type ResendDiagnostic } from "@shared/resend-diagnostic";

export function ResendKeyDiagnostic() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ResendDiagnostic | null>(null);
  const [error, setError] = useState<string | null>(null);
  const run = async () => {
    setBusy(true);
    setResult(null);
    setError(null);
    try {
      const response = await apiRequest("POST", "/api/admin/system/email-key-diagnostic");
      setResult(await response.json());
    } catch {
      setError("Could not run the diagnostic. Check your admin session and try again.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="border-t pt-4 space-y-3" aria-label="Resend key diagnostic">
      <h3 className="text-base font-medium">Production email key diagnostic</h3>
      <p className="text-sm text-gray-500">
        Checks the server you are visiting. No email is sent and no secrets are changed.
        Use the published site to check production.
      </p>
      <Button variant="outline" size="sm" disabled={busy} onClick={run} data-testid="button-resend-key-diagnostic">
        {busy ? "Checking…" : "Check loaded email key"}
      </Button>
      <div role="status" aria-live="polite" className="text-sm">
        {error && <p className="text-red-700">{error}</p>}
        {result && (
          <div className="rounded-md border p-3 space-y-2 break-words" data-testid="resend-key-diagnostic-result">
            <p className="font-medium">{RESEND_AUTH_LABELS[result.authentication.state]}</p>
            <dl className="space-y-1">
              <div><dt className="inline font-medium">Key loaded: </dt><dd className="inline">{result.key.present ? "Yes" : "No"}</dd></div>
              <div><dt className="inline font-medium">SHA-256 fingerprint: </dt><dd className="inline font-mono">{result.key.fingerprint ?? "Unavailable"}</dd></div>
              <div><dt className="inline font-medium">Surrounding whitespace: </dt><dd className="inline">{result.key.surroundingWhitespace ? "Detected" : "Not detected"}</dd></div>
              <div><dt className="inline font-medium">Surrounding quotes: </dt><dd className="inline">{result.key.surroundingQuotes ? "Detected" : "Not detected"}</dd></div>
              <div><dt className="inline font-medium">Provider HTTP status: </dt><dd className="inline">{result.authentication.httpStatus ?? "Not available"}</dd></div>
              <div><dt className="inline font-medium">Build: </dt><dd className="inline font-mono">{result.buildCommit ?? "Unknown"}</dd></div>
              <div><dt className="inline font-medium">Checked at: </dt><dd className="inline">{result.checkedAt}</dd></div>
            </dl>
            <p className="text-xs text-gray-500">
              Compare this 16-character fingerprint through a secure process, not by pasting a key here.
              Authentication does not confirm sender-domain permission or email delivery.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
