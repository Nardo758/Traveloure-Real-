/**
 * R3 U7 - Settings, its own page (board V24 v4 panel 9), and the account-deletion REQUEST.
 *
 * "Request deletion" files a request through the existing contact endpoint. It deletes nothing, never calls
 * `DELETE /api/auth/account`, never logs out and never navigates.
 */
import { useEffect, useState } from "react";
import { Redirect, useSearch } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { BOARD_CELL, BOARD_DANGER, BOARD_INK, BOARD_LINE } from "@/components/r3/tokens";
import { R3TopBar } from "@/components/r3/TopBar";
import { useAuth } from "@/hooks/use-auth";
import { readR3SurfaceFlag } from "@/lib/r3-surface";
import { r3DeletionRequestBody } from "@/lib/r3-settings";
import { apiRequest } from "@/lib/queryClient";

type ConfirmState = "ask" | "sending" | "sent" | "error";

export function R3SettingsPage() {
  const search = useSearch();
  const asked = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search).get("surface") === "r3";
  const [flag, setFlag] = useState<boolean | null>(asked ? null : false);
  useEffect(() => {
    if (!asked) return;
    let alive = true;
    readR3SurfaceFlag().then((on) => {
      if (alive) setFlag(on);
    });
    return () => {
      alive = false;
    };
  }, [asked]);

  const { user } = useAuth();
  const { data: plans } = useQuery<Array<{ id: string; title?: string | null; startDate?: string | null; endDate?: string | null }>>({
    queryKey: ["/api/trips"],
    enabled: asked && flag === true,
  });

  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [rowDisabled, setRowDisabled] = useState(false);

  if (!asked) return <Redirect to="/profile" replace />;
  if (flag === null) {
    return <div className="min-h-screen" data-testid="r3-settings-page" data-state="wait:flag" />;
  }
  if (flag === false) return <Redirect to="/profile" replace />;

  const send = async () => {
    setConfirm("sending");
    try {
      await apiRequest("POST", "/api/contact", r3DeletionRequestBody(user));
      setConfirm("sent");
      setRowDisabled(true);
    } catch {
      setConfirm("error");
    }
  };

  const cardStyle = { backgroundColor: BOARD_CELL, borderColor: BOARD_LINE } as const;

  return (
    <div data-testid="r3-settings-page" data-state="ready">
      <R3TopBar tripId={null} plan={null} plans={plans ?? []} />
      <main className="mx-auto max-w-[760px] px-4 py-8">
        <div className="rounded-xl border p-4" style={cardStyle}>
          <h1 className="text-[16px] font-semibold" style={{ color: BOARD_INK }}>
            Settings
          </h1>
          <div className="mt-2 border-t" style={{ borderColor: BOARD_LINE }} />

          <a
            href="/email-preferences"
            className="mt-2 block py-2"
            data-testid="r3-settings-email-prefs"
          >
            <span className="block text-[14px] font-semibold" style={{ color: BOARD_INK }}>
              Contact and email preferences
            </span>
            <span className="block text-[12px] text-muted-foreground">Which emails we send you</span>
          </a>

          <div className="border-t" style={{ borderColor: BOARD_LINE }} />

          <button
            type="button"
            disabled={rowDisabled}
            onClick={() => setConfirm("ask")}
            className="mt-2 block w-full py-2 text-left text-[14px] font-semibold disabled:opacity-50"
            style={{ color: BOARD_DANGER }}
            data-testid="r3-settings-delete-row"
          >
            Request account deletion
          </button>
        </div>

        {confirm ? (
          <div
            className="mt-4 rounded-xl border-2 p-4"
            style={{ ...cardStyle, borderColor: BOARD_DANGER }}
            data-testid="r3-settings-confirm"
            data-state={confirm}
          >
            {confirm === "sent" ? (
              <p className="text-[13px]" style={{ color: BOARD_INK }} data-testid="r3-settings-sent">
                Your request is in. We will confirm by email within 7 days.
              </p>
            ) : (
              <>
                <h2 className="text-[15px] font-semibold" style={{ color: BOARD_INK }}>
                  Delete your account?
                </h2>
                <p className="mt-2 text-[13px]" style={{ color: BOARD_INK }}>
                  We will delete your account and your personal data within 30 days. Records we are required to keep, such as
                  receipts, are kept for as long as the law requires.
                </p>
                {confirm === "error" ? (
                  <p className="mt-2 text-[13px] text-destructive" data-testid="r3-settings-error">
                    Your request did not go through. Try again.
                  </p>
                ) : null}
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={send}
                    disabled={confirm === "sending"}
                    className="min-h-11 rounded-lg px-4 text-[13px] font-semibold text-white hover:brightness-95 disabled:opacity-50"
                    style={{ backgroundColor: BOARD_DANGER }}
                    data-testid="r3-settings-confirm-request"
                  >
                    Request deletion
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirm(null)}
                    disabled={confirm === "sending"}
                    className="min-h-11 rounded-lg border px-4 text-[13px] font-semibold disabled:opacity-50"
                    style={{ borderColor: BOARD_LINE, color: BOARD_INK }}
                    data-testid="r3-settings-confirm-keep"
                  >
                    Keep my account
                  </button>
                </div>
              </>
            )}
          </div>
        ) : null}
      </main>
    </div>
  );
}
