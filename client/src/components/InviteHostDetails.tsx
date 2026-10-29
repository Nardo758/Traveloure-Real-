/**
 * Order 290 (ledger `2026-10-29-invite-host-details`): the host's "Details for your guests" on the
 * guest list. GuestInviteManager mounts it once; both of its mounts (the plan's guest page and the
 * slip's logistics section) are the organizer's own surfaces.
 *
 * READS the event's own row from the owner-scoped GET /api/user-experiences/:id (the whole row, so
 * it carries the three fields; the plancard projection is not widened). WRITES one PATCH to the
 * same owner-scoped route with only the changed keys. Nothing is shown as saved until the request
 * succeeds and the GET is refetched; a synchronous guard makes a double click one PATCH. This
 * section sends no email and creates no invite.
 */
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { INVITE_HOST_DETAILS_COPY as COPY } from "@/lib/invite-host-details-copy";
import {
  hostDetailsDraft,
  hostDetailsPatch,
  type InviteHostDetails as Stored,
  type InviteHostDetailsDraft,
} from "@/lib/invite-host-details";

export function InviteHostDetails({ experienceId }: { experienceId: string }) {
  const { toast } = useToast();
  const queryKey = [`/api/user-experiences/${experienceId}`];
  const { data: stored } = useQuery<Partial<Stored>>({ queryKey });
  const [draft, setDraft] = useState<InviteHostDetailsDraft>(() => hostDetailsDraft(stored));
  // The row is the truth: a refetch replaces the fields, and another event never inherits this draft.
  useEffect(
    () => setDraft(hostDetailsDraft(stored)),
    [experienceId, stored?.hostNote, stored?.venueAddress, stored?.rsvpBy],
  );
  const inFlight = useRef(false);

  const patch = hostDetailsPatch(draft, stored);
  const changed = Object.keys(patch).length > 0;

  const save = useMutation({
    mutationFn: (body: Partial<Stored>) => apiRequest("PATCH", `/api/user-experiences/${experienceId}`, body),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey });
      toast({ title: COPY.saved });
    },
    onError: () => toast({ title: COPY.saveFailed, variant: "destructive" }),
    onSettled: () => {
      inFlight.current = false;
    },
  });

  const submit = () => {
    if (!changed || inFlight.current) return;
    inFlight.current = true;
    save.mutate(patch);
  };

  const set = (key: keyof InviteHostDetailsDraft) => (e: { target: { value: string } }) =>
    setDraft((d) => ({ ...d, [key]: e.target.value }));
  const id = (k: string) => `invite-host-${k}-${experienceId}`;

  return (
    <Card data-testid="invite-host-details">
      <CardHeader>
        <CardTitle>{COPY.heading}</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="min-w-0 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <div className="space-y-2">
            <Label htmlFor={id("note")}>{COPY.hostNote}</Label>
            <Textarea
              id={id("note")}
              value={draft.hostNote}
              onChange={set("hostNote")}
              maxLength={1000}
              rows={3}
              disabled={save.isPending}
              className="w-full"
              data-testid="input-invite-host-note"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={id("address")}>{COPY.venueAddress}</Label>
            <Input
              id={id("address")}
              type="text"
              value={draft.venueAddress}
              onChange={set("venueAddress")}
              maxLength={255}
              disabled={save.isPending}
              className="w-full"
              aria-describedby={id("address-help")}
              data-testid="input-invite-venue-address"
            />
            <p id={id("address-help")} className="text-sm text-muted-foreground" data-testid="text-invite-venue-address-help">
              {COPY.venueAddressHelper}
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor={id("rsvp-by")}>{COPY.rsvpBy}</Label>
            <Input
              id={id("rsvp-by")}
              type="date"
              value={draft.rsvpBy}
              onChange={set("rsvpBy")}
              disabled={save.isPending}
              className="w-full"
              data-testid="input-invite-rsvp-by"
            />
          </div>
          <Button type="submit" disabled={!changed || save.isPending} data-testid="button-save-invite-host-details">
            {COPY.save}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
