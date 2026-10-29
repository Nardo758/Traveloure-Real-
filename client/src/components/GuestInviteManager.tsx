/**
 * Guest Invite Manager Component
 * For event organizers to create and manage guest invites
 */

import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger 
} from '@/components/ui/dialog';
import { 
  UserPlus, 
  Mail, 
  Copy, 
  Check, 
  Users, 
  MapPin, 
  Calendar,
  Trash2,
  Eye,
  BarChart3,
  Send,
  AlertCircle,
  Loader2
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { guestInviteMetaLine } from '@/lib/guest-invite-meta';
import { PLAN_NOUN_LOWER } from '@/lib/plan-vocabulary';
import type { InviteSendState } from '@shared/invite-send-state';
import { INVITE_SEND_COPY, SEND_STATE_COPY } from '@/lib/invite-send-state-copy';
import {
  bulkSendButton,
  displaySendState,
  rowSendButtonDisabled,
  sendResultToast,
} from '@/lib/invite-send-state-screen';

interface Guest {
  email: string;
  name: string;
  phone?: string;
}

/**
 * The most recent `invite_send_log` row for this invite, as the server reports it: an attempt
 * record only. Display reads `sendState` (row 207), never this. Its `errorMessage` is shown as
 * the hover title on a "Didn't send" cell and nowhere else.
 */
interface InviteLastSend {
  status: string;
  sentAt?: string | null;
  errorMessage?: string | null;
}

interface Invite {
  id: string;
  guestEmail: string;
  guestName: string;
  uniqueToken: string;
  inviteLink: string;
  rsvpStatus: string;
  numberOfGuests: number;
  originCity?: string;
  inviteViewedAt?: string;
  viewCount: number;
  createdAt: string;
  /**
   * Stamped server-side by the send rail's claim. It is the claim time, not a send state and not
   * a delivery time, so nothing on this screen displays it or keys off it (row 207).
   */
  inviteSentAt?: string | null;
  lastSend?: InviteLastSend | null;
  /** The server's derived send state (row 207). Absent on an older response ⇒ shown as not sent. */
  sendState?: InviteSendState;
}

/**
 * The send state of one row: the server's derived `sendState`, in the four approved words, with
 * no timestamp beside any of them (row 207). There is no "delivered" or "opened" state because
 * the platform observes neither. Exported so the row 207 test renders the real cell.
 */
export function InviteSendStateCell({ invite }: { invite: Pick<Invite, 'sendState' | 'lastSend'> }) {
  const state = displaySendState(invite);
  if (state === 'failed') {
    return (
      <span
        className="flex items-center gap-1 whitespace-nowrap text-sm text-red-600"
        title={invite.lastSend?.errorMessage || undefined}
      >
        <AlertCircle className="h-3 w-3" />
        {SEND_STATE_COPY.failed}
      </span>
    );
  }
  return <span className="whitespace-nowrap text-sm text-muted-foreground">{SEND_STATE_COPY[state]}</span>;
}

interface Props {
  experienceId: string;
  eventName: string;
  eventDestination: string;
  /**
   * The event's own day as the server states it — `user_experiences.event_date`, a Postgres DATE
   * column, so a bare "YYYY-MM-DD" string. It is parsed with `parseTripDate`, NEVER `new Date`
   * (QA F3): `new Date("2026-10-10")` is specified to be UTC midnight, so every viewer west of
   * UTC renders the previous calendar day.
   */
  eventDate: string;
  /**
   * The plan this event belongs to, when the mounting surface knows it.
   *
   * QA F5 — the plan's guest roster (`GET /api/trips/:tripId/guests`, Locked Decision 37) is
   * DERIVED from the very invites this component writes, so a write here leaves every reader of
   * that key stale (the Guests page's table AND the slip's totals) until a manual reload. This
   * component stays the ONE invite writer; knowing the plan is what lets it retire the answer its
   * own write just changed. Absent ⇒ nothing is invalidated, which is honest: without a plan id
   * there is no roster key to name.
   */
  tripId?: string;
}

export function GuestInviteManager({ experienceId, eventName, eventDestination, eventDate, tripId }: Props) {
  const [invites, setInvites] = useState<Invite[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [sendingIds, setSendingIds] = useState<string[]>([]);
  // A synchronous guard, so a double click on one row's button posts once even before the
  // disabled state re-renders.
  const inFlightIds = useRef<Set<string>>(new Set());
  const [isSendingAll, setIsSendingAll] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  /**
   * Retire the DERIVED plan roster after a write that changed it (QA F5).
   *
   * The roster is computed server-side from `event_invites` (`plan-guest-roster.service.ts`), so
   * creating or deleting an invite here changes the answer both `/plans/:tripId/guests` and the
   * slip's totals render off the SAME query key. One place, both write paths — a second copy of
   * this decision is the drift class CLAUDE.md §18 rule 1 names.
   *
   * Best-effort: a failed invalidation is a stale cache, never a failed write.
   */
  function invalidatePlanGuestRoster() {
    if (!tripId) return;
    void queryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}/guests`] });
  }

  // Guest form state
  const [guests, setGuests] = useState<Guest[]>([{ email: '', name: '', phone: '' }]);
  
  useEffect(() => {
    fetchInvites();
    fetchStats();
  }, [experienceId]);
  
  async function fetchInvites() {
    try {
      const response = await fetch(`/api/events/${experienceId}/invites`);
      const data = await response.json();
      if (response.ok) setInvites(data.invites ?? []);
    } catch (error) {
      console.error('Error fetching invites:', error);
    }
  }
  
  async function fetchStats() {
    try {
      const response = await fetch(`/api/events/${experienceId}/invites/stats`);
      const data = await response.json();
      if (response.ok) setStats(data.stats ?? null);
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  }
  
  async function handleCreateInvites() {
    setIsLoading(true);
    try {
      const validGuests = guests.filter(g => g.email && g.name);
      
      if (validGuests.length === 0) {
        toast({
          title: "Error",
          description: "Please add at least one guest with email and name",
          variant: "destructive",
        });
        return;
      }
      
      const response = await fetch(`/api/events/${experienceId}/invites`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guests: validGuests }),
      });
      
      if (!response.ok) throw new Error('Failed to create invites');
      
      const data = await response.json();
      
      toast({
        title: "Success!",
        description: `Created ${data.invites.length} invite links`,
      });
      
      setShowAddDialog(false);
      setGuests([{ email: '', name: '', phone: '' }]);
      fetchInvites();
      fetchStats();
      invalidatePlanGuestRoster();
      
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }
  
  function addGuestRow() {
    setGuests([...guests, { email: '', name: '', phone: '' }]);
  }
  
  function removeGuestRow(index: number) {
    setGuests(guests.filter((_, i) => i !== index));
  }
  
  function updateGuest(index: number, field: keyof Guest, value: string) {
    const updated = [...guests];
    updated[index][field] = value;
    setGuests(updated);
  }
  
  /**
   * Ask the server to email these invites. `inviteIds` omitted ⇒ everyone the server's own
   * debounce lets through, which is how "send to whoever hasn't had one" is expressed: the
   * decision is the server's claim, never a filter restated here.
   *
   * The response counts are reported verbatim. A queued message is queued — this surface never
   * upgrades that to delivered, received or opened.
   */
  async function sendInvites(inviteIds?: string[]) {
    if (inviteIds?.some((id) => inFlightIds.current.has(id))) return;
    const scope = inviteIds ?? [];
    scope.forEach((id) => inFlightIds.current.add(id));
    if (inviteIds) setSendingIds((prev) => [...prev, ...scope]);
    else setIsSendingAll(true);

    try {
      const response = await fetch(`/api/events/${experienceId}/invites/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(inviteIds ? { inviteIds } : {}),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        toast({
          title: response.status === 429 ? 'Too many sends, briefly' : "Couldn't send",
          description:
            data?.error ||
            (response.status === 429
              ? 'Give it a minute and try again.'
              : 'The invites were not sent.'),
          variant: 'destructive',
        });
        return;
      }

      // Row 207: the counts are the server's; an enqueued row may be held, so the toast never
      // says an email went out. The refetch below moves each row's state cell.
      toast(sendResultToast(data));

      fetchInvites();
      fetchStats();
    } catch (error: any) {
      toast({
        title: "Couldn't send",
        description: error?.message || 'The invites were not sent.',
        variant: 'destructive',
      });
    } finally {
      scope.forEach((id) => inFlightIds.current.delete(id));
      if (inviteIds) setSendingIds((prev) => prev.filter((id) => !scope.includes(id)));
      else setIsSendingAll(false);
    }
  }

  async function copyInviteLink(inviteLink: string, token: string) {
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopiedToken(token);
      setTimeout(() => setCopiedToken(null), 2000);
      
      toast({
        title: "Copied!",
        description: "Invite link copied to clipboard",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to copy link",
        variant: "destructive",
      });
    }
  }
  
  async function handleDeleteInvite(inviteId: string) {
    if (!confirm('Are you sure you want to delete this invite?')) return;
    
    try {
      await fetch(`/api/invites/${inviteId}`, { method: 'DELETE' });
      
      toast({
        title: "Deleted",
        description: "Invite deleted successfully",
      });
      
      fetchInvites();
      fetchStats();
      invalidatePlanGuestRoster();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete invite",
        variant: "destructive",
      });
    }
  }
  
  const bulkButton = bulkSendButton(invites, isSendingAll);

  /**
   * The event caption, composed by the ONE derivation that owns it (QA F3,
   * `@/lib/guest-invite-meta`, pinned under three timezones). It parses the date-only
   * `event_date` as a LOCAL calendar day rather than the UTC midnight `new Date()` gives it, and
   * omits any part that was never stated (§13) instead of printing "Invalid Date".
   */
  const eventMetaLine = guestInviteMetaLine({ eventName, eventDestination, eventDate });

  function getRsvpBadgeColor(status: string) {
    switch (status) {
      case 'accepted': return 'bg-green-500';
      case 'declined': return 'bg-red-500';
      case 'maybe': return 'bg-yellow-500';
      default: return 'bg-gray-400';
    }
  }
  
  return (
    // min-w-0 (row 207, T7): the mounting dialogs lay this out as a grid item, whose default
    // min-width is its content's, so the guest table stretched the whole dialog past a phone's
    // width instead of scrolling inside its own overflow wrapper.
    <div className="min-w-0 space-y-6">
      {/* Header (wraps at phone width, row 207 T7) */}
      <div className="flex flex-wrap justify-between items-start gap-3">
        <div>
          <h2 className="text-2xl font-bold">Guest Invites</h2>
          <p className="text-muted-foreground" data-testid="invite-modal-event-meta">
            {eventMetaLine}
          </p>
          {/* The container noun comes from plan-vocabulary — never "trip", which is only one of
              the things a traveler plans here. */}
          <p className="text-sm text-muted-foreground">
            Everyone on this list gets their own invitation page for this {PLAN_NOUN_LOWER}.
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          {invites.length > 0 && (
            <Button
              variant="outline"
              onClick={() => sendInvites()}
              disabled={bulkButton.disabled}
              data-testid="button-send-all-invites"
              title={bulkButton.title}
            >
              {isSendingAll ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Send className="mr-2 h-4 w-4" />
              )}
              {bulkButton.label}
            </Button>
          )}

        <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
          <DialogTrigger asChild>
            <Button>
              <UserPlus className="mr-2 h-4 w-4" />
              Add Guests
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Add Guest Invites</DialogTitle>
              <DialogDescription>
                Create personalized invite links for your guests. Adding a guest does not email them —
                use <strong>Email invite</strong> on the row (or the button above) when you're ready to send.
                Each guest gets travel recommendations based on the city they're coming from.
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4">
              {guests.map((guest, index) => (
                <div key={index} className="flex gap-2 items-start">
                  <div className="flex-1 grid grid-cols-3 gap-2">
                    <Input
                      placeholder="Guest Name *"
                      value={guest.name}
                      onChange={(e) => updateGuest(index, 'name', e.target.value)}
                    />
                    <Input
                      type="email"
                      placeholder="Email *"
                      value={guest.email}
                      onChange={(e) => updateGuest(index, 'email', e.target.value)}
                    />
                    <Input
                      placeholder="Phone (optional)"
                      value={guest.phone || ''}
                      onChange={(e) => updateGuest(index, 'phone', e.target.value)}
                    />
                  </div>
                  {guests.length > 1 && (
                    <Button 
                      variant="ghost" 
                      size="icon"
                      onClick={() => removeGuestRow(index)}
                    >
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  )}
                </div>
              ))}
              
              <Button 
                variant="outline" 
                onClick={addGuestRow}
                className="w-full"
              >
                <UserPlus className="mr-2 h-4 w-4" />
                Add Another Guest
              </Button>
              
              <div className="flex justify-end gap-2 pt-4">
                <Button variant="outline" onClick={() => setShowAddDialog(false)}>
                  Cancel
                </Button>
                <Button onClick={handleCreateInvites} disabled={isLoading}>
                  {isLoading ? 'Creating...' : 'Create Invites'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
        </div>
      </div>
      
      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Total Invites</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total}</div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Accepted</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{stats.accepted}</div>
              <p className="text-xs text-muted-foreground">{stats.totalGuests} total guests</p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Pending</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-600">{stats.pending}</div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Origin Cities</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.originCities.length}</div>
              <p className="text-xs text-muted-foreground">unique locations</p>
            </CardContent>
          </Card>
        </div>
      )}
      
      {/* Invites Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Invites</CardTitle>
          <CardDescription>
            Manage your guest invites and track RSVPs. {INVITE_SEND_COPY.stateExplainer}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {invites.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Users className="mx-auto h-12 w-12 mb-4 opacity-50" />
              <p className="text-lg mb-2">No invites yet</p>
              <p className="text-sm">Click "Add Guests" to create your first invite</p>
              <p className="text-sm mt-1">They&rsquo;ll show up here, ready to email or share as a link.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Guest</TableHead>
                  <TableHead>Origin City</TableHead>
                  <TableHead>RSVP Status</TableHead>
                  <TableHead>Guests</TableHead>
                  <TableHead>Views</TableHead>
                  <TableHead>Invite Sent</TableHead>
                  <TableHead>Invite Link</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invites.map((invite) => (
                  <TableRow key={invite.id}>
                    <TableCell>
                      <div>
                        <div className="font-medium">{invite.guestName}</div>
                        <div className="text-sm text-muted-foreground">{invite.guestEmail}</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {invite.originCity ? (
                        <div className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          <span>{invite.originCity}</span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-sm">Not set</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge className={getRsvpBadgeColor(invite.rsvpStatus)}>
                        {invite.rsvpStatus}
                      </Badge>
                    </TableCell>
                    <TableCell>{invite.numberOfGuests}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Eye className="h-3 w-3" />
                        {invite.viewCount}
                      </div>
                    </TableCell>
                    <TableCell data-testid={`invite-send-state-${invite.id}`}>
                      <InviteSendStateCell invite={invite} />
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copyInviteLink(invite.inviteLink, invite.uniqueToken)}
                      >
                        {copiedToken === invite.uniqueToken ? (
                          <Check className="h-4 w-4 text-green-500" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </Button>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => sendInvites([invite.id])}
                          disabled={rowSendButtonDisabled(invite, sendingIds.includes(invite.id))}
                          data-testid={`button-send-invite-${invite.id}`}
                          title="Email this invitation"
                        >
                          {sendingIds.includes(invite.id) ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Send className="h-4 w-4" />
                          )}
                          <span className="sr-only">Email invite</span>
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteInvite(invite.id)}
                        >
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
