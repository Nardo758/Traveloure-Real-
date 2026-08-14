/**
 * Client Detail — /expert/clients/:id
 *
 * Real-data client profile for a specific traveler the session expert has interacted with.
 * Data sources:
 *   - GET /api/me/customers/:userId  — booking history, purchase history, assigned trips
 *   - GET /api/messages/conversation/:conversationId — live message thread with the client
 *
 * Booking/trip links navigate to the owning module (Inbox History, Workspace) — this page
 * never re-renders another module's surface (§17 one-home-per-list rule).
 */
import { useState, useRef, useEffect } from "react";
import { useParams, Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ExpertLayout } from "@/components/expert/expert-layout";
import { PageHeader, StatusBadge, type StatusBadgeEntry } from "@/components/backoffice/primitives";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  User,
  Calendar,
  Map,
  Package,
  MessageSquare,
  Send,
  ArrowLeft,
  ExternalLink,
} from "lucide-react";

// ── Types (mirror customers.routes.ts shapes) ────────────────────────────────

interface CustomerBookingItem {
  id: string;
  serviceName: string | null;
  status: string | null;
  totalAmount: number;
  createdAt: string | null;
}

interface CustomerPurchaseItem {
  id: string;
  readyMadeTripId: string;
  listingTitle: string;
  status: string;
  pricePaid: number;
  purchasedAt: string | null;
}

interface CustomerTripItem {
  advisorId: string;
  tripId: string;
  title: string | null;
  destination: string | null;
  tripStatus: string;
  startDate: string | null;
  assignedAt: string | null;
}

interface CustomerRow {
  userId: string | null;
  displayName: string;
  relationship: "active_trip" | "repeat" | "one_time";
  bookings: number;
  pendingPaymentBookings: number;
  purchases: number;
  trips: number;
  hasActiveTrip: boolean;
  bookedValue: number;
  purchaseValue: number;
  totalBookedValue: number;
  lastActivity: string | null;
  items: {
    bookings: CustomerBookingItem[];
    purchases: CustomerPurchaseItem[];
    trips: CustomerTripItem[];
  };
}

interface ChatMessage {
  id: string;
  senderId: string;
  receiverId: string | null;
  message: string;
  createdAt: string | null;
  isFromMe: boolean;
  conversationId: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Mirrors server/services/messages.service.ts — sorted join so both ends produce the same id. */
function buildConversationId(a: string, b: string): string {
  return [a, b].sort().join("_");
}

const RELATIONSHIP_MAP: Record<string, StatusBadgeEntry> = {
  active_trip: { label: "Active trip", className: "bg-primary/10 text-primary border-transparent" },
  repeat: { label: "Repeat", className: "bg-green-100 text-green-700 border-green-200" },
  one_time: { label: "One-time", className: "bg-muted text-muted-foreground border-transparent" },
};

function money(n: number): string {
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function shortDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : format(d, "MMM d, yyyy");
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-wide text-console-mid mb-2">
      {children}
    </p>
  );
}

function BookingHistory({ bookings }: { bookings: CustomerBookingItem[] }) {
  if (bookings.length === 0) return null;
  return (
    <div>
      <SectionLabel>Bookings</SectionLabel>
      <ul className="space-y-1.5">
        {bookings.map((b) => (
          <li key={b.id} className="flex items-center justify-between gap-3 text-sm">
            <Link
              href="/expert/inbox?tab=history"
              className="flex items-center gap-1.5 text-console-darkest hover:text-primary hover:underline min-w-0"
            >
              <Calendar className="w-3.5 h-3.5 flex-shrink-0 text-console-mid" />
              <span className="truncate">{b.serviceName ?? "Service booking"}</span>
            </Link>
            <span className="text-console-mid flex-shrink-0 flex items-center gap-2">
              {b.status && <StatusBadge status={b.status} />}
              <span>{money(b.totalAmount)}</span>
              {shortDate(b.createdAt) && <span className="hidden sm:inline">{shortDate(b.createdAt)}</span>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PurchaseHistory({ purchases }: { purchases: CustomerPurchaseItem[] }) {
  if (purchases.length === 0) return null;
  return (
    <div>
      <SectionLabel>Store purchases</SectionLabel>
      <ul className="space-y-1.5">
        {purchases.map((p) => (
          <li key={p.id} className="flex items-center justify-between gap-3 text-sm">
            <Link
              href="/expert/catalog"
              className="flex items-center gap-1.5 text-console-darkest hover:text-primary hover:underline min-w-0"
            >
              <Package className="w-3.5 h-3.5 flex-shrink-0 text-console-mid" />
              <span className="truncate">{p.listingTitle}</span>
            </Link>
            <span className="text-console-mid flex-shrink-0 flex items-center gap-2">
              <StatusBadge status={p.status} />
              <span>{money(p.pricePaid)}</span>
              {shortDate(p.purchasedAt) && <span className="hidden sm:inline">{shortDate(p.purchasedAt)}</span>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function AssignedTrips({ trips }: { trips: CustomerTripItem[] }) {
  if (trips.length === 0) return null;
  return (
    <div>
      <SectionLabel>Assigned trips</SectionLabel>
      <ul className="space-y-1.5">
        {trips.map((t) => (
          <li key={t.advisorId} className="flex items-center justify-between gap-3 text-sm">
            <Link
              href={`/expert/workspace/${t.tripId}`}
              className="flex items-center gap-1.5 text-console-darkest hover:text-primary hover:underline min-w-0"
            >
              <Map className="w-3.5 h-3.5 flex-shrink-0 text-console-mid" />
              <span className="truncate">
                {t.title ?? "Trip"}
                {t.destination ? ` · ${t.destination}` : ""}
              </span>
              <ExternalLink className="w-3 h-3 flex-shrink-0 text-console-mid" />
            </Link>
            <span className="text-console-mid flex-shrink-0 flex items-center gap-2">
              <StatusBadge status={t.tripStatus} />
              {shortDate(t.startDate) && <span className="hidden sm:inline">{shortDate(t.startDate)}</span>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function MessageThread({
  messages,
  myUserId,
  clientName,
  conversationId,
  onSent,
}: {
  messages: ChatMessage[];
  myUserId: string;
  clientName: string;
  conversationId: string;
  onSent: () => void;
}) {
  const [draft, setDraft] = useState("");
  const { toast } = useToast();
  const bottomRef = useRef<HTMLDivElement>(null);

  const sendMutation = useMutation({
    mutationFn: async (text: string) => {
      await apiRequest("POST", "/api/messages", { conversationId, message: text });
    },
    onSuccess: () => {
      setDraft("");
      onSent();
    },
    onError: () => {
      toast({ title: "Failed to send message", variant: "destructive" });
    },
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  return (
    <div className="flex flex-col gap-3">
      <SectionLabel>Messages with {clientName}</SectionLabel>
      <div className="border border-console-light rounded-md bg-console-bg/30 max-h-80 overflow-y-auto p-3 space-y-2">
        {messages.length === 0 ? (
          <p className="text-sm text-console-mid text-center py-4">No messages yet.</p>
        ) : (
          messages.map((m) => {
            const isMe = m.senderId === myUserId;
            return (
              <div
                key={m.id}
                className={`flex ${isMe ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[75%] rounded-lg px-3 py-2 text-sm ${
                    isMe
                      ? "bg-primary text-primary-foreground"
                      : "bg-white border border-console-light text-console-darkest"
                  }`}
                >
                  <p>{m.message}</p>
                  {m.createdAt && (
                    <p className={`text-xs mt-1 ${isMe ? "text-primary-foreground/70" : "text-console-mid"}`}>
                      {format(new Date(m.createdAt), "MMM d, h:mm a")}
                    </p>
                  )}
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>
      <div className="flex gap-2">
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={`Message ${clientName}…`}
          className="resize-none min-h-[60px]"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (draft.trim()) sendMutation.mutate(draft.trim());
            }
          }}
          data-testid="input-message-draft"
        />
        <Button
          onClick={() => { if (draft.trim()) sendMutation.mutate(draft.trim()); }}
          disabled={!draft.trim() || sendMutation.isPending}
          size="icon"
          className="self-end"
          data-testid="button-send-message"
        >
          <Send className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function ExpertClientDetail() {
  const { id: clientUserId } = useParams<{ id: string }>();
  const { user } = useAuth();
  const qc = useQueryClient();

  const {
    data: clientData,
    isLoading: clientLoading,
    error: clientError,
  } = useQuery<{ customer: CustomerRow }>({
    queryKey: [`/api/me/customers/${clientUserId}`],
    enabled: !!clientUserId,
  });

  const myUserId = (user as any)?.id ?? (user as any)?.claims?.sub ?? "";
  const conversationId =
    myUserId && clientUserId ? buildConversationId(myUserId, clientUserId) : null;

  const { data: messagesData, isLoading: messagesLoading } = useQuery<ChatMessage[]>({
    queryKey: [`/api/messages/conversation/${conversationId}`],
    enabled: !!conversationId,
    refetchInterval: 15_000,
  });

  const invalidateMessages = () => {
    qc.invalidateQueries({ queryKey: [`/api/messages/conversation/${conversationId}`] });
  };

  const customer = clientData?.customer;
  const messages = messagesData ?? [];

  return (
    <ExpertLayout title={customer?.displayName ?? "Client"}>
      <div className="p-6 max-w-3xl mx-auto space-y-6">
        {/* Back link */}
        <Link
          href="/expert/customers"
          className="inline-flex items-center gap-1.5 text-sm text-console-mid hover:text-primary"
          data-testid="link-back-customers"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Customers
        </Link>

        {/* Header */}
        {clientLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-64" />
          </div>
        ) : clientError ? (
          <div
            className="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
            data-testid="error-client-not-found"
          >
            Client not found or you have no interactions with this person.
          </div>
        ) : customer ? (
          <PageHeader
            title={customer.displayName}
            subtitle={[
              customer.bookings > 0 && `${customer.bookings} booking${customer.bookings === 1 ? "" : "s"}`,
              customer.purchases > 0 && `${customer.purchases} purchase${customer.purchases === 1 ? "" : "s"}`,
              customer.trips > 0 && `${customer.trips} trip${customer.trips === 1 ? "" : "s"}`,
              customer.totalBookedValue > 0 && `${money(customer.totalBookedValue)} booked value`,
            ]
              .filter(Boolean)
              .join(" · ")}
            icon={User}
            testId="text-client-name"
          />
        ) : null}

        {/* Relationship chip */}
        {customer && (
          <div className="flex items-center gap-2">
            <StatusBadge status={customer.relationship} map={RELATIONSHIP_MAP} />
            {customer.lastActivity && (
              <span className="text-xs text-console-mid">
                Last activity {shortDate(customer.lastActivity)}
              </span>
            )}
          </div>
        )}

        {/* Booking / purchase / trip history */}
        {customer && (
          <Card className="border border-console-light" data-testid="card-client-history">
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-semibold text-console-darkest">
                History
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-5">
              <BookingHistory bookings={customer.items.bookings} />
              <PurchaseHistory purchases={customer.items.purchases} />
              <AssignedTrips trips={customer.items.trips} />
              {customer.items.bookings.length === 0 &&
                customer.items.purchases.length === 0 &&
                customer.items.trips.length === 0 && (
                  <p className="text-sm text-console-mid">No history yet.</p>
                )}
            </CardContent>
          </Card>
        )}

        {/* Live message thread */}
        {clientLoading || !customer ? null : (
          <Card className="border border-console-light" data-testid="card-client-messages">
            <CardContent className="px-4 py-4">
              {messagesLoading ? (
                <div className="space-y-2">
                  {[...Array(3)].map((_, i) => (
                    <Skeleton key={i} className="h-10 w-full" />
                  ))}
                </div>
              ) : conversationId ? (
                <MessageThread
                  messages={messages}
                  myUserId={myUserId}
                  clientName={customer.displayName}
                  conversationId={conversationId}
                  onSent={invalidateMessages}
                />
              ) : (
                <p className="text-sm text-console-mid">Sign in to message this client.</p>
              )}
            </CardContent>
          </Card>
        )}

        <p className="text-xs text-console-mid">
          Booked value is what your client paid — it is not your earnings. See Earnings for your
          ledger.
        </p>
      </div>
    </ExpertLayout>
  );
}
