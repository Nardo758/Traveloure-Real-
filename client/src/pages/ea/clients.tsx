import { EALayout } from "@/components/ea-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Users,
  Plus,
  Mail,
  CreditCard,
  Bell,
  Trash2,
  ChevronDown,
  ChevronUp,
  User,
  Send,
  Pencil,
  Check,
  X,
} from "lucide-react";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface EaClient {
  id: string;
  clientUserId: string | null;
  clientEmail: string | null;
  displayName: string | null;
  notes: string | null;
  billingName: string | null;
  billingEmail: string | null;
  billingAddress: string | null;
  paymentNotes: string | null;
  preferredCurrency: string | null;
  createdAt: string;
  userFirstName: string | null;
  userLastName: string | null;
  userEmail: string | null;
  userProfileImageUrl: string | null;
}

function initials(client: EaClient) {
  const name = client.displayName || client.userEmail || client.clientEmail || "?";
  return name.slice(0, 2).toUpperCase();
}

function ClientCard({ client, onDelete }: { client: EaClient; onDelete: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [pushOpen, setPushOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [pushTitle, setPushTitle] = useState("");
  const [pushMsg, setPushMsg] = useState("");
  const [editData, setEditData] = useState({
    displayName: client.displayName || "",
    notes: client.notes || "",
    billingName: client.billingName || "",
    billingEmail: client.billingEmail || "",
    billingAddress: client.billingAddress || "",
    paymentNotes: client.paymentNotes || "",
    preferredCurrency: client.preferredCurrency || "USD",
  });

  const { toast } = useToast();
  const qc = useQueryClient();

  const pushMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", `/api/ea/clients/${client.id}/push`, { title: pushTitle, message: pushMsg }).then((r) => r.json()),
    onSuccess: () => {
      toast({ title: "Notification sent", description: `Message pushed to ${client.displayName || client.clientEmail}` });
      setPushTitle("");
      setPushMsg("");
      setPushOpen(false);
    },
    onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: () =>
      apiRequest("PATCH", `/api/ea/clients/${client.id}`, editData).then((r) => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/ea/clients"] });
      toast({ title: "Client updated" });
      setEditOpen(false);
    },
    onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const hasPaymentInfo = client.billingName || client.billingEmail || client.billingAddress || client.paymentNotes;

  return (
    <Card className="border border-gray-200">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-gray-50 transition-colors rounded-t-lg py-4" data-testid={`card-client-${client.id}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-[#FF385C] flex items-center justify-center text-white font-semibold text-sm">
                  {initials(client)}
                </div>
                <div>
                  <div className="font-semibold text-gray-900">{client.displayName || client.clientEmail}</div>
                  <div className="text-sm text-gray-500">{client.userEmail || client.clientEmail}</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {client.clientUserId ? (
                  <Badge className="bg-green-100 text-green-700 border-green-200 text-xs">On Platform</Badge>
                ) : (
                  <Badge variant="outline" className="text-xs text-gray-500">Email Only</Badge>
                )}
                {hasPaymentInfo && (
                  <Badge className="bg-blue-100 text-blue-700 border-blue-200 text-xs">
                    <CreditCard className="w-3 h-3 mr-1" /> Payment Saved
                  </Badge>
                )}
                {open ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
              </div>
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0 space-y-4">
            {client.notes && (
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-sm text-gray-600">{client.notes}</p>
              </div>
            )}

            {/* Payment Info */}
            <div>
              <h4 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-1">
                <CreditCard className="w-4 h-4" /> Payment Info
              </h4>
              {hasPaymentInfo ? (
                <div className="grid grid-cols-2 gap-2 text-sm text-gray-600">
                  {client.billingName && <div><span className="font-medium">Name:</span> {client.billingName}</div>}
                  {client.billingEmail && <div><span className="font-medium">Billing email:</span> {client.billingEmail}</div>}
                  {client.preferredCurrency && <div><span className="font-medium">Currency:</span> {client.preferredCurrency}</div>}
                  {client.billingAddress && (
                    <div className="col-span-2"><span className="font-medium">Address:</span> {client.billingAddress}</div>
                  )}
                  {client.paymentNotes && (
                    <div className="col-span-2 bg-amber-50 border border-amber-100 rounded p-2">
                      <span className="font-medium text-amber-800">Card notes:</span>{" "}
                      <span className="text-amber-700">{client.paymentNotes}</span>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-gray-400 italic">No payment info saved yet.</p>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
              {/* Edit / Payment Info */}
              <Dialog open={editOpen} onOpenChange={setEditOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm" data-testid={`button-edit-client-${client.id}`}>
                    <Pencil className="w-3 h-3 mr-1" /> Edit & Payment
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-lg">
                  <DialogHeader>
                    <DialogTitle>Edit Client — {client.displayName || client.clientEmail}</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-3 mt-2">
                    <div>
                      <Label>Display Name</Label>
                      <Input value={editData.displayName} onChange={(e) => setEditData({ ...editData, displayName: e.target.value })} data-testid="input-edit-displayname" />
                    </div>
                    <div>
                      <Label>Notes</Label>
                      <Textarea value={editData.notes} onChange={(e) => setEditData({ ...editData, notes: e.target.value })} rows={2} data-testid="input-edit-notes" />
                    </div>
                    <hr />
                    <p className="text-sm font-semibold text-gray-700">Payment Info</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label>Billing Name</Label>
                        <Input value={editData.billingName} onChange={(e) => setEditData({ ...editData, billingName: e.target.value })} data-testid="input-billing-name" />
                      </div>
                      <div>
                        <Label>Billing Email</Label>
                        <Input type="email" value={editData.billingEmail} onChange={(e) => setEditData({ ...editData, billingEmail: e.target.value })} data-testid="input-billing-email" />
                      </div>
                    </div>
                    <div>
                      <Label>Billing Address</Label>
                      <Textarea value={editData.billingAddress} onChange={(e) => setEditData({ ...editData, billingAddress: e.target.value })} rows={2} data-testid="input-billing-address" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label>Currency</Label>
                        <Input value={editData.preferredCurrency} onChange={(e) => setEditData({ ...editData, preferredCurrency: e.target.value })} placeholder="USD" data-testid="input-currency" />
                      </div>
                      <div>
                        <Label>Card Notes</Label>
                        <Input value={editData.paymentNotes} onChange={(e) => setEditData({ ...editData, paymentNotes: e.target.value })} placeholder='e.g. "Amex ending 4242"' data-testid="input-payment-notes" />
                      </div>
                    </div>
                    <div className="flex gap-2 pt-2">
                      <Button className="flex-1 bg-[#FF385C] hover:bg-[#e03354]" onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending} data-testid="button-save-client">
                        <Check className="w-4 h-4 mr-1" /> {updateMutation.isPending ? "Saving…" : "Save Changes"}
                      </Button>
                      <Button variant="outline" onClick={() => setEditOpen(false)} data-testid="button-cancel-edit">
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>

              {/* Push Notification */}
              {client.clientUserId && (
                <Dialog open={pushOpen} onOpenChange={setPushOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline" size="sm" data-testid={`button-push-${client.id}`}>
                      <Bell className="w-3 h-3 mr-1" /> Push Update
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-md">
                    <DialogHeader>
                      <DialogTitle>Send Notification to {client.displayName || client.clientEmail}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3 mt-2">
                      <div>
                        <Label>Title</Label>
                        <Input
                          value={pushTitle}
                          onChange={(e) => setPushTitle(e.target.value)}
                          placeholder="e.g. Your hotel is confirmed"
                          data-testid="input-push-title"
                        />
                      </div>
                      <div>
                        <Label>Message</Label>
                        <Textarea
                          value={pushMsg}
                          onChange={(e) => setPushMsg(e.target.value)}
                          placeholder="Write the message you want to send to your client…"
                          rows={4}
                          data-testid="input-push-message"
                        />
                      </div>
                      <Button
                        className="w-full bg-[#FF385C] hover:bg-[#e03354]"
                        onClick={() => pushMutation.mutate()}
                        disabled={pushMutation.isPending || !pushTitle || !pushMsg}
                        data-testid="button-send-push"
                      >
                        <Send className="w-4 h-4 mr-2" />
                        {pushMutation.isPending ? "Sending…" : "Send Notification"}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              )}

              <div className="flex-1" />

              <Button
                variant="ghost"
                size="sm"
                className="text-red-500 hover:text-red-600 hover:bg-red-50"
                onClick={() => onDelete(client.id)}
                data-testid={`button-delete-client-${client.id}`}
              >
                <Trash2 className="w-3 h-3 mr-1" /> Remove
              </Button>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

export default function EAClients() {
  const [addOpen, setAddOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [notes, setNotes] = useState("");
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: clients = [], isLoading } = useQuery<EaClient[]>({
    queryKey: ["/api/ea/clients"],
  });

  const addMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/ea/clients", { email, displayName: displayName || undefined, notes: notes || undefined }).then((r) => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/ea/clients"] });
      toast({ title: "Client added", description: `${email} has been added to your roster.` });
      setEmail("");
      setDisplayName("");
      setNotes("");
      setAddOpen(false);
    },
    onError: async (e: any) => {
      const msg = e.message || "Failed to add client";
      toast({ title: "Could not add client", description: msg, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/ea/clients/${id}`).then((r) => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/ea/clients"] });
      toast({ title: "Client removed" });
    },
    onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const onPlatform = clients.filter((c) => c.clientUserId).length;

  return (
    <EALayout title="Client Roster">
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Client Roster</h2>
            <p className="text-gray-500 text-sm mt-1">
              {clients.length} client{clients.length !== 1 ? "s" : ""} · {onPlatform} on platform
            </p>
          </div>
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <Button className="bg-[#FF385C] hover:bg-[#e03354]" data-testid="button-add-client">
                <Plus className="w-4 h-4 mr-2" /> Add Client
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Add Client</DialogTitle>
              </DialogHeader>
              <div className="space-y-3 mt-2">
                <div>
                  <Label>Client Email <span className="text-red-500">*</span></Label>
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="client@email.com"
                    data-testid="input-client-email"
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    If they have a Traveloure account, it will be linked automatically.
                  </p>
                </div>
                <div>
                  <Label>Display Name <span className="text-gray-400 text-xs">(optional)</span></Label>
                  <Input
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="e.g. James Anderson (CEO)"
                    data-testid="input-client-displayname"
                  />
                </div>
                <div>
                  <Label>Notes <span className="text-gray-400 text-xs">(optional)</span></Label>
                  <Textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Preferences, travel style, important dates…"
                    rows={3}
                    data-testid="input-client-notes"
                  />
                </div>
                <Button
                  className="w-full bg-[#FF385C] hover:bg-[#e03354]"
                  onClick={() => addMutation.mutate()}
                  disabled={addMutation.isPending || !email}
                  data-testid="button-submit-add-client"
                >
                  {addMutation.isPending ? "Adding…" : "Add to Roster"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          <Card className="border border-gray-200">
            <CardContent className="pt-4 pb-4 text-center">
              <div className="text-2xl font-bold text-gray-900">{clients.length}</div>
              <div className="text-sm text-gray-500">Total Clients</div>
            </CardContent>
          </Card>
          <Card className="border border-gray-200">
            <CardContent className="pt-4 pb-4 text-center">
              <div className="text-2xl font-bold text-green-600">{onPlatform}</div>
              <div className="text-sm text-gray-500">On Platform</div>
            </CardContent>
          </Card>
          <Card className="border border-gray-200">
            <CardContent className="pt-4 pb-4 text-center">
              <div className="text-2xl font-bold text-blue-600">
                {clients.filter((c) => c.billingName || c.paymentNotes).length}
              </div>
              <div className="text-sm text-gray-500">Payment Info Saved</div>
            </CardContent>
          </Card>
        </div>

        {/* Client List */}
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 bg-gray-100 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : clients.length === 0 ? (
          <Card className="border border-dashed border-gray-300">
            <CardContent className="py-12 text-center">
              <Users className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <h3 className="font-semibold text-gray-600 mb-1">No clients yet</h3>
              <p className="text-sm text-gray-400 mb-4">
                Add clients to save their payment info and send them updates.
              </p>
              <Button
                className="bg-[#FF385C] hover:bg-[#e03354]"
                onClick={() => setAddOpen(true)}
                data-testid="button-add-first-client"
              >
                <Plus className="w-4 h-4 mr-2" /> Add Your First Client
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {clients.map((client) => (
              <ClientCard
                key={client.id}
                client={client}
                onDelete={(id) => deleteMutation.mutate(id)}
              />
            ))}
          </div>
        )}
      </div>
    </EALayout>
  );
}
