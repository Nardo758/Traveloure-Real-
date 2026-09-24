/**
 * THE LIVE CHAT TAB — who you can message about this destination right now (Locked Decision 54,
 * ledger `2026-09-24-live-chat-qa-sessions`).
 *
 * Reads the ONE public expert list (`GET /api/experts?location=`) and orders it by what the server
 * already said: "Available now" first, then the MEASURED reply-time bucket, then the list's own
 * order. It restates neither rule — both come off the row (§18 rule 1). Messaging goes through the
 * shared `useAskExpert` (LD 40 — a handle where the row has one). Messaging is free; a Q&A Session
 * or Text a Local is a listing on the expert's storefront, bought through the one checkout.
 *
 * §13: no destination ⇒ it asks for one rather than listing everyone; an empty list says so and
 * links to the full directory; a missing reply-time draws nothing.
 */
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Loader2, MessageCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useAskExpert } from "@/lib/use-ask-expert";
import { earnerProfilePath } from "@/lib/earner-address";
import { LiveStatusBadges } from "@/components/live/LiveStatusBadges";
import type { ReplyTimeBucket } from "@shared/live-availability";

const REPLY_ORDER: Record<ReplyTimeBucket, number> = {
  within_an_hour: 0,
  within_a_few_hours: 1,
  within_a_day: 2,
};

interface LiveExpertRow {
  id?: string | number;
  handle?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  profileImageUrl?: string | null;
  availableNow?: boolean;
  replyTime?: ReplyTimeBucket | null;
}

/** Pure ordering: available now, then the measured reply bucket, then the server's own order. */
export function orderForLiveChat<T extends LiveExpertRow>(rows: T[]): T[] {
  return rows
    .map((row, i) => ({ row, i }))
    .sort((a, b) => {
      const av = a.row.availableNow ? 0 : 1;
      const bv = b.row.availableNow ? 0 : 1;
      if (av !== bv) return av - bv;
      const ar = a.row.replyTime ? REPLY_ORDER[a.row.replyTime] ?? 3 : 3;
      const br = b.row.replyTime ? REPLY_ORDER[b.row.replyTime] ?? 3 : 3;
      if (ar !== br) return ar - br;
      return a.i - b.i;
    })
    .map((x) => x.row);
}

export function LiveChatExperts({ destination, subject }: { destination: string; subject?: string | null }) {
  const askExpert = useAskExpert();
  const city = destination.trim();

  const { data: experts = [], isLoading } = useQuery<LiveExpertRow[]>({
    queryKey: ["/api/experts", { location: city }],
    enabled: city.length > 0,
    queryFn: async () => {
      const res = await fetch(`/api/experts?location=${encodeURIComponent(city)}`);
      if (!res.ok) throw new Error("Failed to fetch experts");
      return res.json();
    },
  });

  if (!city) {
    return (
      <p className="py-10 text-center text-muted-foreground" data-testid="live-chat-no-destination">
        Choose a destination to see the local experts you can message.
      </p>
    );
  }

  if (isLoading) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const ordered = orderForLiveChat(experts).slice(0, 8);
  const directoryHref = `/experts?destination=${encodeURIComponent(city)}`;

  return (
    <div className="space-y-3" data-testid="live-chat-experts">
      <p className="text-sm text-muted-foreground">
        Message a local expert about {city} — messaging is free. Experts who are available now are listed first.
        For a timed Q&amp;A session or day-by-day texting while you travel, open their profile.
      </p>

      {ordered.length === 0 ? (
        <div className="py-8 text-center" data-testid="live-chat-empty">
          <p className="text-muted-foreground">No local experts have published in {city} yet.</p>
          <Link href="/experts" className="text-sm font-medium text-primary hover:underline">
            Browse all experts
          </Link>
        </div>
      ) : (
        <ul className="divide-y rounded-lg border">
          {ordered.map((e, i) => {
            const name = `${e.firstName || ""} ${e.lastName || ""}`.trim() || "Local expert";
            const profile = earnerProfilePath(e);
            const key = String(e.handle ?? e.id ?? i);
            return (
              <li key={key} className="flex items-center gap-3 p-3" data-testid={`live-chat-expert-${key}`}>
                {e.profileImageUrl ? (
                  <img src={e.profileImageUrl} alt={name} className="h-10 w-10 shrink-0 rounded-full object-cover" />
                ) : (
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold">
                    {name.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  {profile ? (
                    <Link href={profile} className="block truncate font-medium hover:underline">
                      {name}
                    </Link>
                  ) : (
                    <span className="block truncate font-medium">{name}</span>
                  )}
                  <LiveStatusBadges availableNow={e.availableNow} replyTime={e.replyTime} testIdSuffix={`-${key}`} className="mt-0.5" />
                </div>
                <Button
                  size="sm"
                  variant={e.availableNow ? "default" : "outline"}
                  onClick={() =>
                    askExpert({
                      // LD 40: the handle is the address; the id is the deprecated fallback for a
                      // row that has claimed none (the same fallback every expert card uses).
                      handle: e.handle ?? null,
                      expertId: e.handle ? null : e.id != null ? String(e.id) : null,
                      subject: subject ?? null,
                      fallbackName: name,
                      fallbackAvatar: e.profileImageUrl ?? null,
                    })
                  }
                  data-testid={`button-live-chat-message-${key}`}
                >
                  <MessageCircle className="mr-1 h-4 w-4" />
                  Message
                </Button>
              </li>
            );
          })}
        </ul>
      )}

      {ordered.length > 0 && (
        <div className="flex justify-center gap-4 text-sm">
          <Link href={`${directoryHref}&availableNow=1`} className="font-medium text-primary hover:underline" data-testid="link-live-chat-available-now">
            Everyone available now
          </Link>
          <Link href={directoryHref} className="text-muted-foreground hover:underline">
            All experts in {city}
          </Link>
        </div>
      )}
    </div>
  );
}
