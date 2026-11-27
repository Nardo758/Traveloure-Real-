// S-22: the provider waitlist confirmation. A live city shows the apply path; any other city shows the
// hold sentence the page already used. The button is full width below the `sm` breakpoint so it fits at 390px.
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import type { WaitlistApplyInvite } from "@shared/waitlist-apply-invite";

export function ProviderWaitlistResult({ invite, hold, applyPath, city }: { invite: WaitlistApplyInvite | null; hold: string; applyPath?: string | null; city?: string | null }) {
  if (!invite) {
    return (
      <div className="mt-6 max-w-full rounded-lg border p-4" role="status" data-testid="text-provider-waitlist-done">
        <p className="break-words text-sm leading-relaxed">{hold}</p>
        {applyPath && city ? (
          <Button asChild className="mt-4 h-auto w-full whitespace-normal px-4 py-3 text-center sm:w-auto">
            <Link href={applyPath} data-testid="link-provider-apply">Apply as a {city} provider</Link>
          </Button>
        ) : null}
      </div>
    );
  }
  return (
    <div className="mt-6 max-w-full rounded-lg border p-4" role="status" data-testid="text-provider-waitlist-done">
      <h3 className="text-xl font-semibold leading-snug" data-testid="heading-provider-apply">{invite.screen.heading}</h3>
      <p className="mt-3 break-words text-sm leading-relaxed" data-testid="text-provider-apply-body">{invite.screen.body}</p>
      <Button asChild className="mt-4 h-auto w-full whitespace-normal px-4 py-3 text-center sm:w-auto">
        <Link href={invite.path} data-testid="link-provider-apply">{invite.screen.button}</Link>
      </Button>
    </div>
  );
}
