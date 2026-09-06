/**
 * HandleClaimBanner — "Claim your handle", shown in the earner consoles until one exists.
 *
 * Ledger `2026-09-05-handles-are-claimed` (CLAUDE.md Locked Decision 40). Post-publish QA found
 * 0 of 12 public experts carrying a handle: the claim form existed, but it sat inside Settings
 * (and the Distribute/Catalog cards) where nothing ever sent an earner to it, so in practice the
 * public addressing scheme was still `/experts/:id` — the printed LD 40 exemption. The platform
 * does not close that by GENERATING a handle on the earner's behalf; a handle is their public
 * identity. It ASKS, here, persistently, until they answer.
 *
 * WHERE IT MOUNTS: once, in `BackofficeShell` — the single shell both the expert and the provider
 * console render through. One mount rather than two is the §18 rule 1 posture: two banners would
 * be two decisions about when to prompt, and they would drift.
 *
 * WHEN IT SHOWS — and every clause is load-bearing:
 *   • `isEarnerRole(user.role)` — an EA or admin who lands on a console shell is not an earner and
 *     has no storefront to name; `PATCH /api/me/handle` would refuse them anyway.
 *   • `!user.handle` — a claimed handle is the finished state; the prompt disappears for good.
 *   • an UNANSWERED auth query shows NOTHING. A user we have not loaded is not a user without a
 *     handle (§13, the `shouldShowUnreadDot` posture in this same shell) — prompting on a
 *     loading/401 render would flash the banner at everyone including a signed-out visitor.
 *
 * DISMISSAL IS PER SESSION, DELIBERATELY. sessionStorage, so it clears with the browser session
 * and the ask returns next time: the ruling calls the banner PERSISTENT, and a permanent dismissal
 * would be the same silence that produced 0 of 12. A throwing or absent store reads as NOT
 * dismissed — showing the ask once more is the harmless failure.
 */
import { useState } from "react";
import { Link2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { useClaimHandle } from "@/hooks/use-claim-handle";
import { HANDLE_MAX_LENGTH, HANDLE_MIN_LENGTH } from "@shared/handle";
import { suggestHandle } from "@shared/handle-suggestion";
import { clearPendingHandle, loadPendingHandle } from "@/lib/pending-handle";
import { shouldPromptHandleClaim } from "@/lib/handle-claim-prompt";

const DISMISS_KEY = "traveloure_handle_banner_dismissed";

function readDismissed(): boolean {
  try {
    return window.sessionStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

function writeDismissed(): void {
  try {
    window.sessionStorage.setItem(DISMISS_KEY, "1");
  } catch {
    /* ignore — the ask simply returns on the next render, which is the safe direction */
  }
}

export function HandleClaimBanner() {
  const { user } = useAuth() as { user?: { role?: string | null; handle?: string | null; firstName?: string | null; lastName?: string | null } | null };
  const { toast } = useToast();
  const [dismissed, setDismissed] = useState(() => readDismissed());
  const [open, setOpen] = useState(false);
  // The prefill, resolved ONCE per mount and in one order: the handle the earner already chose in
  // their application wizard (held because the claim rail refuses a non-earner — see
  // `lib/pending-handle.ts`), else the suggestion computed from the name they gave us, else
  // EMPTY. Never a generated value (§13 — `suggestHandle` returns null rather than inventing one).
  const [handle, setHandle] = useState(
    () => loadPendingHandle() ?? suggestHandle({ firstName: user?.firstName, lastName: user?.lastName }) ?? "",
  );

  const claimMutation = useClaimHandle({
    onClaimed: (claimed) => {
      clearPendingHandle();
      toast({ title: "Handle claimed", description: `Your storefront: /s/${claimed}` });
    },
  });

  if (!shouldPromptHandleClaim(user) || dismissed) return null;

  return (
    <div
      className="flex flex-col gap-2 px-5 py-3 border-b"
      style={{ background: "#FFF8E8", borderColor: "#E8E8E2" }}
      data-testid="handle-claim-banner"
    >
      <div className="flex items-center gap-3 flex-wrap">
        <Link2 className="w-4 h-4 shrink-0" style={{ color: "#B45309" }} />
        <p className="text-[13px] flex-1 min-w-[200px]" style={{ color: "#1A1A18" }}>
          <span className="font-semibold">Claim your handle.</span>{" "}
          It is the public name of your storefront — <code>/s/your-handle</code> — and the one
          address travelers can be told out loud. Until you claim one, your page is only reachable
          by its internal link.
        </p>
        {!open && (
          <Button
            size="sm"
            onClick={() => setOpen(true)}
            className="h-8"
            data-testid="button-open-handle-claim"
          >
            Claim it
          </Button>
        )}
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8"
          aria-label="Dismiss"
          onClick={() => {
            writeDismissed();
            setDismissed(true);
          }}
          data-testid="button-dismiss-handle-claim"
        >
          <X className="w-3.5 h-3.5" />
        </Button>
      </div>

      {open && (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center rounded-md border bg-white px-2 h-9 text-[13px] text-[#7A7A72]">
              /s/
            </div>
            <Input
              value={handle}
              onChange={(e) => setHandle(e.target.value.toLowerCase())}
              placeholder="your-name"
              maxLength={HANDLE_MAX_LENGTH}
              className="h-9 max-w-[240px] bg-white"
              data-testid="handle-claim-input"
            />
            <Button
              size="sm"
              className="h-9"
              disabled={claimMutation.isPending || handle.trim().length < HANDLE_MIN_LENGTH}
              onClick={() =>
                claimMutation.mutate(handle, {
                  // The SERVER's sentence, verbatim — "already taken" / "reserved" are facts only
                  // the database holds, and a client that guessed them would be inventing one.
                  onError: (e: Error) =>
                    toast({ title: "Could not claim that handle", description: e.message, variant: "destructive" }),
                })
              }
              data-testid="handle-claim-submit"
            >
              {claimMutation.isPending ? "Claiming…" : "Claim"}
            </Button>
          </div>
          <p className="text-[11px]" style={{ color: "#7A7A72" }}>
            Lowercase letters, numbers and single hyphens, {HANDLE_MIN_LENGTH}–{HANDLE_MAX_LENGTH}{" "}
            characters. You can change it later in Settings.
          </p>
        </div>
      )}
    </div>
  );
}
