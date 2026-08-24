import { EALayout } from "@/components/ea-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Search,
  Send,
  Bot,
  Mail,
  Phone,
  MessageSquare,
} from "lucide-react";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useDelegateToAi } from "./use-ea-ai-delegate";

interface EaCommunication {
  id: string; type: string; executiveId?: string | null; executiveName?: string; subject: string;
  recipient?: string; sentAt?: string; status: string; body?: string;
}

interface EaExecutive {
  id: string;
  name: string;
}

const TEMPLATES: Record<string, { subject: string; body: string }> = {
  "Thank You Note": { subject: "Thank you", body: "Thank you so much for your time and hospitality — it meant a great deal.\n\nWarm regards," },
  "Booking Confirmation": { subject: "Your booking is confirmed", body: "This confirms your booking is all set. Details below:\n\n" },
  "Event Reminder": { subject: "Reminder: upcoming event", body: "A quick reminder about the upcoming event. Details below:\n\n" },
  "Travel Itinerary": { subject: "Your travel itinerary", body: "Here is your finalized travel itinerary:\n\n" },
  "Status Update": { subject: "Status update", body: "Quick status update on where things stand:\n\n" },
};

export default function EACommunications() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [type, setType] = useState("email");
  const [executiveId, setExecutiveId] = useState<string>("");
  const [recipient, setRecipient] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");

  const { data: recentComms = [] } = useQuery<EaCommunication[]>({
    queryKey: ["/api/ea/communications"],
  });
  const { data: executives = [] } = useQuery<EaExecutive[]>({
    queryKey: ["/api/ea/executives"],
  });

  const sendMutation = useMutation({
    mutationFn: () => {
      const exec = executives.find((e) => e.id === executiveId);
      return apiRequest("POST", "/api/ea/communications", {
        type,
        executiveId: executiveId || undefined,
        executiveName: exec?.name || undefined,
        subject,
        recipient: recipient || undefined,
        body: message || undefined,
        status: "sent",
      }).then((r) => r.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ea/communications"] });
      toast({ title: "Logged", description: "Communication recorded." });
      setRecipient("");
      setSubject("");
      setMessage("");
    },
    onError: (e: any) => toast({ title: "Could not send", description: e.message, variant: "destructive" }),
  });

  const delegate = useDelegateToAi();

  // Derive the "This Week" stats from the real communications list (were hardcoded
  // 24/38/12/15 — §13). Counts sent items of each type in the last 7 days.
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const inThisWeek = (c: EaCommunication) =>
    !!c.sentAt && !isNaN(new Date(c.sentAt).getTime()) && new Date(c.sentAt) >= weekAgo;
  const emailsSent = recentComms.filter((c) => c.type === "email" && inThisWeek(c)).length;
  const messagesCount = recentComms.filter((c) => c.type === "message" && inThisWeek(c)).length;
  const callsLogged = recentComms.filter((c) => c.type === "call" && inThisWeek(c)).length;

  const filteredComms = recentComms.filter((c) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return c.subject.toLowerCase().includes(q) || (c.recipient ?? "").toLowerCase().includes(q) || (c.executiveName ?? "").toLowerCase().includes(q);
  });

  function applyTemplate(name: string) {
    const t = TEMPLATES[name];
    if (!t) return;
    setSubject(t.subject);
    setMessage(t.body);
  }

  return (
    <EALayout title="Communications">
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900" data-testid="text-comms-title">
              Communications Center
            </h1>
            <p className="text-gray-600">Log and track all executive communications</p>
          </div>
          <div className="flex gap-2">
            <Button
              variant={type === "email" ? "default" : "outline"}
              className={type === "email" ? "bg-primary hover:bg-primary/90" : ""}
              onClick={() => setType("email")}
              data-testid="button-new-email"
            >
              <Mail className="w-4 h-4 mr-2" /> Email
            </Button>
            <Button
              variant={type === "message" ? "default" : "outline"}
              className={type === "message" ? "bg-primary hover:bg-primary/90" : ""}
              onClick={() => setType("message")}
              data-testid="button-new-message"
            >
              <MessageSquare className="w-4 h-4 mr-2" /> Message
            </Button>
            <Button
              variant={type === "call" ? "default" : "outline"}
              className={type === "call" ? "bg-primary hover:bg-primary/90" : ""}
              onClick={() => setType("call")}
              data-testid="button-new-call"
            >
              <Phone className="w-4 h-4 mr-2" /> Call
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Communication History */}
          <div className="lg:col-span-2 space-y-4">
            <Card className="border border-gray-200">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">Recent Communications</CardTitle>
                  <div className="relative w-64">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <Input
                      placeholder="Search..."
                      className="pl-9"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      data-testid="input-search-comms"
                    />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-96">
                  <div className="space-y-3">
                    {recentComms.length === 0 && (
                      <div className="text-center py-12">
                        <MessageSquare className="w-10 h-10 text-[#AEAEA6] mx-auto mb-3" />
                        <p className="text-[#7A7A72] text-sm">No communications yet</p>
                      </div>
                    )}
                    {recentComms.length > 0 && filteredComms.length === 0 && (
                      <p className="text-center text-sm text-[#7A7A72] py-8">No communications match your search</p>
                    )}
                    {filteredComms.map((comm) => (
                      <div
                        key={comm.id}
                        className="p-3 rounded-lg border border-gray-200 hover:bg-gray-50"
                        data-testid={`comm-${comm.id}`}
                      >
                        <div className="flex items-start gap-3">
                          <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center">
                            {comm.type === "email" && <Mail className="w-5 h-5 text-gray-600" />}
                            {comm.type === "message" && <MessageSquare className="w-5 h-5 text-gray-600" />}
                            {comm.type === "call" && <Phone className="w-5 h-5 text-gray-600" />}
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center justify-between">
                              <p className="font-medium text-gray-900">{comm.subject}</p>
                              <span className="text-xs text-gray-500">{comm.sentAt ? new Date(comm.sentAt).toLocaleDateString() : ""}</span>
                            </div>
                            <p className="text-sm text-gray-500">
                              <span className="font-medium">{comm.executiveName}</span> → {comm.recipient}
                            </p>
                            <Badge variant="outline" className="mt-1 text-xs">
                              {comm.status}
                            </Badge>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>

            {/* Compose */}
            <Card className="border border-gray-200">
              <CardHeader>
                <CardTitle className="text-lg">Quick Compose — {type[0].toUpperCase() + type.slice(1)}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <Select value={executiveId || undefined} onValueChange={setExecutiveId}>
                    <SelectTrigger data-testid="select-comm-executive">
                      <SelectValue placeholder="Executive (optional)" />
                    </SelectTrigger>
                    <SelectContent>
                      {executives.map((exec) => (
                        <SelectItem key={exec.id} value={exec.id}>{exec.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input placeholder="Recipient" value={recipient} onChange={(e) => setRecipient(e.target.value)} data-testid="input-recipient" />
                </div>
                <Input placeholder="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} data-testid="input-subject" />
                <Textarea
                  placeholder="Type your message..."
                  className="min-h-32"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  data-testid="input-message"
                />
                <div className="flex justify-between">
                  <Button
                    variant="outline"
                    disabled={delegate.isPending || !subject}
                    onClick={() => delegate.mutate({
                      type: "communication_draft",
                      task: `Draft a ${type}${subject ? ` about "${subject}"` : ""}${recipient ? ` to ${recipient}` : ""}`,
                    })}
                    data-testid="button-ai-assist"
                  >
                    <Bot className="w-4 h-4 mr-2" /> AI Assist
                  </Button>
                  <Button
                    className="bg-primary hover:bg-primary/90"
                    disabled={sendMutation.isPending || !subject}
                    onClick={() => sendMutation.mutate()}
                    data-testid="button-send"
                  >
                    <Send className="w-4 h-4 mr-2" /> {sendMutation.isPending ? "Sending…" : "Send"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right Column */}
          <div className="space-y-4">
            {/* Templates */}
            <Card className="border border-gray-200">
              <CardHeader>
                <CardTitle className="text-lg">Quick Templates</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {Object.keys(TEMPLATES).map((name) => (
                  <Button
                    key={name}
                    variant="outline"
                    className="w-full justify-start text-sm"
                    onClick={() => applyTemplate(name)}
                    data-testid={`template-${name.toLowerCase().replace(/\s+/g, "-")}`}
                  >
                    {name}
                  </Button>
                ))}
              </CardContent>
            </Card>

            {/* Stats */}
            <Card className="border border-gray-200">
              <CardHeader>
                <CardTitle className="text-lg">This Week</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">Emails Sent</span>
                  <span className="font-medium">{emailsSent}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">Messages</span>
                  <span className="font-medium">{messagesCount}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">Calls Logged</span>
                  <span className="font-medium">{callsLogged}</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </EALayout>
  );
}
