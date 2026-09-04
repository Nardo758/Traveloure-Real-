/**
 * Guest Invite Manager Component
 * For event organizers to create and manage guest invites
 */

import React, { useState, useEffect } from 'react';
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
import { useToast } from '@/hooks/use-toast';
import { PLAN_NOUN_LOWER } from '@/lib/plan-vocabulary';

interface Guest {
  email: string;
  name: string;
  phone?: string;
}

/**
 * The most recent `invite_send_log` row for this invite, as the server reports it.
 *
 * `status: 'sent'` means THE OUTBOX ACCEPTED THE MESSAGE — the platform will try, with retries.
 * It is NOT a delivery, open or read receipt, and nothing on this surface may say otherwise
 * (ledger `2026-09-04-invite-mailer`). `'failed'` means no durable outbox row was written, which
 * is why the invite is still shown as un-sent and can be sent again immediately.
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
  /** Stamped server-side by the send rail's claim, and by nothing else. Null ⇒ never sent. */
  inviteSentAt?: string | null;
  lastSend?: InviteLastSend | null;
}

interface Props {
  experienceId: string;
  eventName: string;
  eventDestination: string;
  eventDate: string;
}

export function GuestInviteManager({ experienceId, eventName, eventDestination, eventDate }: Props) {
  const [invites, setInvites] = useState<Invite[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [sendingIds, setSendingIds] = useState<string[]>([]);
  const [isSendingAll, setIsSendingAll] = useState(false);
  const { toast } = useToast();
  
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
    const scope = inviteIds ?? [];
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

      const enqueued = Number(data?.enqueued ?? 0);
      const skipped = Number(data?.skipped ?? 0);
      const failed = Number(data?.failed ?? 0);

      if (enqueued === 0 && failed === 0) {
        toast({
          title: 'Nothing to send',
          description:
            skipped > 0
              ? `${skipped} ${skipped === 1 ? 'invite was' : 'invites were'} emailed moments ago — try again in a few minutes.`
              : 'No guests were selected.',
        });
      } else {
        toast({
          title: enqueued > 0 ? 'Queued for sending' : "Couldn't send",
          description: [
            enqueued > 0
              ? `${enqueued} ${enqueued === 1 ? 'invite is' : 'invites are'} on the way.`
              : null,
            skipped > 0 ? `${skipped} skipped (sent moments ago).` : null,
            failed > 0 ? `${failed} could not be queued.` : null,
          ]
            .filter(Boolean)
            .join(' '),
          variant: enqueued > 0 ? undefined : 'destructive',
        });
      }

      fetchInvites();
      fetchStats();
    } catch (error: any) {
      toast({
        title: "Couldn't send",
        description: error?.message || 'The invites were not sent.',
        variant: 'destructive',
      });
    } finally {
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
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete invite",
        variant: "destructive",
      });
    }
  }
  
  /**
   * The send state of one row, in the three honest states the data actually has. There is no
   * fourth "delivered" state because the platform does not observe delivery.
   */
  function renderSendState(invite: Invite) {
    if (invite.lastSend?.status === 'failed' && !invite.inviteSentAt) {
      return (
        <span className="flex items-center gap-1 text-sm text-red-600" title={invite.lastSend.errorMessage || undefined}>
          <AlertCircle className="h-3 w-3" />
          Send failed
        </span>
      );
    }
    if (invite.inviteSentAt) {
      return (
        <span className="text-sm text-muted-foreground">
          Sent {new Date(invite.inviteSentAt).toLocaleString()}
        </span>
      );
    }
    return <span className="text-sm text-muted-foreground">Never sent</span>;
  }

  const unsentCount = invites.filter((i) => !i.inviteSentAt).length;

  function getRsvpBadgeColor(status: string) {
    switch (status) {
      case 'accepted': return 'bg-green-500';
      case 'declined': return 'bg-red-500';
      case 'maybe': return 'bg-yellow-500';
      default: return 'bg-gray-400';
    }
  }
  
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h2 className="text-2xl font-bold">Guest Invites</h2>
          <p className="text-muted-foreground">
            {eventName} • {eventDestination} • {new Date(eventDate).toLocaleDateString()}
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
              disabled={isSendingAll || unsentCount === 0}
              data-testid="button-send-all-invites"
              title={
                unsentCount === 0
                  ? 'Every guest has already been emailed their invitation'
                  : undefined
              }
            >
              {isSendingAll ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Send className="mr-2 h-4 w-4" />
              )}
              {isSendingAll
                ? 'Sending…'
                : unsentCount === 0
                  ? 'All invites emailed'
                  : `Email ${unsentCount} un-sent ${unsentCount === 1 ? 'invite' : 'invites'}`}
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
            Manage your guest invites and track RSVPs. &ldquo;Sent&rdquo; means we&rsquo;ve queued the email
            and will keep trying — we can&rsquo;t tell you whether a guest opened it. You can still copy a
            link and share it yourself.
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
                      {renderSendState(invite)}
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
                          disabled={sendingIds.includes(invite.id)}
                          data-testid={`button-send-invite-${invite.id}`}
                          title={invite.inviteSentAt ? 'Email this invitation again' : 'Email this invitation'}
                        >
                          {sendingIds.includes(invite.id) ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Send className="h-4 w-4" />
                          )}
                          <span className="sr-only">
                            {invite.inviteSentAt ? 'Email invite again' : 'Email invite'}
                          </span>
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
