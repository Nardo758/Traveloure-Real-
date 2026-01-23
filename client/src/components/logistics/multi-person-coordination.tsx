import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { 
  Users, 
  Check, 
  X, 
  Clock, 
  DollarSign, 
  MessageSquare, 
  UtensilsCrossed,
  Accessibility,
  Mail,
  Phone,
  Copy,
  Send,
  AlertCircle,
  UserPlus,
  CalendarCheck
} from "lucide-react";

export interface Attendee {
  id: string;
  name: string;
  email: string;
  phone?: string;
  avatarUrl?: string;
  rsvpStatus: "pending" | "confirmed" | "declined" | "maybe";
  paymentStatus: "pending" | "partial" | "paid";
  amountPaid: number;
  amountDue: number;
  dietaryRestrictions?: string[];
  accessibilityNeeds?: string[];
  notes?: string;
  invitedAt: Date;
  respondedAt?: Date;
}

export interface GroupMessage {
  id: string;
  senderId: string;
  senderName: string;
  message: string;
  timestamp: Date;
  isAnnouncement?: boolean;
}

interface MultiPersonCoordinationProps {
  experienceId: string;
  experienceName: string;
  totalBudget: number;
  perPersonCost: number;
  attendees: Attendee[];
  messages: GroupMessage[];
  onAddAttendee?: (email: string, name: string) => void;
  onUpdateRsvp?: (attendeeId: string, status: Attendee["rsvpStatus"]) => void;
  onRecordPayment?: (attendeeId: string, amount: number) => void;
  onSendMessage?: (message: string, isAnnouncement: boolean) => void;
  onSendReminder?: (attendeeId: string, type: "rsvp" | "payment") => void;
}

export function MultiPersonCoordination({
  experienceName,
  totalBudget,
  perPersonCost,
  attendees,
  messages,
  onAddAttendee,
  onUpdateRsvp,
  onRecordPayment,
  onSendMessage,
  onSendReminder
}: MultiPersonCoordinationProps) {
  const [activeTab, setActiveTab] = useState("rsvp");
  const [newMessage, setNewMessage] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");

  const confirmedCount = attendees.filter(a => a.rsvpStatus === "confirmed").length;
  const pendingCount = attendees.filter(a => a.rsvpStatus === "pending").length;
  const declinedCount = attendees.filter(a => a.rsvpStatus === "declined").length;
  const maybeCount = attendees.filter(a => a.rsvpStatus === "maybe").length;

  const totalPaid = attendees.reduce((sum, a) => sum + a.amountPaid, 0);
  const totalDue = attendees.reduce((sum, a) => sum + a.amountDue, 0);
  const paymentProgress = totalDue > 0 ? (totalPaid / totalDue) * 100 : 0;

  const paidCount = attendees.filter(a => a.paymentStatus === "paid").length;
  const partialCount = attendees.filter(a => a.paymentStatus === "partial").length;
  const paymentPendingCount = attendees.filter(a => a.paymentStatus === "pending").length;

  const dietaryItems = attendees.flatMap(a => a.dietaryRestrictions || []);
  const dietarySummary = dietaryItems.reduce((acc, item) => {
    acc[item] = (acc[item] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const accessibilityItems = attendees.flatMap(a => a.accessibilityNeeds || []);
  const accessibilitySummary = accessibilityItems.reduce((acc, item) => {
    acc[item] = (acc[item] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const getRsvpBadge = (status: Attendee["rsvpStatus"]) => {
    switch (status) {
      case "confirmed":
        return <Badge variant="default" className="bg-green-600" data-testid="badge-rsvp-confirmed"><Check className="w-3 h-3 mr-1" />Confirmed</Badge>;
      case "declined":
        return <Badge variant="destructive" data-testid="badge-rsvp-declined"><X className="w-3 h-3 mr-1" />Declined</Badge>;
      case "maybe":
        return <Badge variant="secondary" data-testid="badge-rsvp-maybe"><Clock className="w-3 h-3 mr-1" />Maybe</Badge>;
      default:
        return <Badge variant="outline" data-testid="badge-rsvp-pending"><Clock className="w-3 h-3 mr-1" />Pending</Badge>;
    }
  };

  const getPaymentBadge = (status: Attendee["paymentStatus"]) => {
    switch (status) {
      case "paid":
        return <Badge variant="default" className="bg-green-600" data-testid="badge-payment-paid"><DollarSign className="w-3 h-3 mr-1" />Paid</Badge>;
      case "partial":
        return <Badge variant="secondary" className="bg-amber-500" data-testid="badge-payment-partial"><DollarSign className="w-3 h-3 mr-1" />Partial</Badge>;
      default:
        return <Badge variant="outline" data-testid="badge-payment-pending"><DollarSign className="w-3 h-3 mr-1" />Pending</Badge>;
    }
  };

  const handleAddAttendee = () => {
    if (newEmail && newName && onAddAttendee) {
      onAddAttendee(newEmail, newName);
      setNewEmail("");
      setNewName("");
    }
  };

  const handleSendMessage = () => {
    if (newMessage.trim() && onSendMessage) {
      onSendMessage(newMessage, false);
      setNewMessage("");
    }
  };

  return (
    <Card className="w-full" data-testid="card-multi-person-coordination">
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <div>
          <CardTitle className="flex items-center gap-2" data-testid="text-coordination-title">
            <Users className="h-5 w-5" />
            Group Coordination
          </CardTitle>
          <CardDescription data-testid="text-coordination-description">
            Manage RSVPs, payments, and communications for {experienceName}
          </CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-lg px-3 py-1" data-testid="badge-attendee-count">
            {confirmedCount}/{attendees.length} Confirmed
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-4" data-testid="tabs-coordination">
            <TabsTrigger value="rsvp" data-testid="tab-rsvp">
              <CalendarCheck className="w-4 h-4 mr-2" />
              RSVPs
            </TabsTrigger>
            <TabsTrigger value="payments" data-testid="tab-payments">
              <DollarSign className="w-4 h-4 mr-2" />
              Payments
            </TabsTrigger>
            <TabsTrigger value="communication" data-testid="tab-communication">
              <MessageSquare className="w-4 h-4 mr-2" />
              Messages
            </TabsTrigger>
            <TabsTrigger value="requirements" data-testid="tab-requirements">
              <UtensilsCrossed className="w-4 h-4 mr-2" />
              Requirements
            </TabsTrigger>
          </TabsList>

          <TabsContent value="rsvp" className="space-y-4 mt-4">
            <div className="grid grid-cols-4 gap-4">
              <Card data-testid="card-rsvp-confirmed">
                <CardContent className="pt-4">
                  <div className="text-2xl font-bold text-green-600">{confirmedCount}</div>
                  <p className="text-sm text-muted-foreground">Confirmed</p>
                </CardContent>
              </Card>
              <Card data-testid="card-rsvp-pending">
                <CardContent className="pt-4">
                  <div className="text-2xl font-bold text-amber-600">{pendingCount}</div>
                  <p className="text-sm text-muted-foreground">Pending</p>
                </CardContent>
              </Card>
              <Card data-testid="card-rsvp-maybe">
                <CardContent className="pt-4">
                  <div className="text-2xl font-bold text-blue-600">{maybeCount}</div>
                  <p className="text-sm text-muted-foreground">Maybe</p>
                </CardContent>
              </Card>
              <Card data-testid="card-rsvp-declined">
                <CardContent className="pt-4">
                  <div className="text-2xl font-bold text-red-600">{declinedCount}</div>
                  <p className="text-sm text-muted-foreground">Declined</p>
                </CardContent>
              </Card>
            </div>

            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <label className="text-sm font-medium">Name</label>
                <Input 
                  placeholder="Guest name" 
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  data-testid="input-guest-name"
                />
              </div>
              <div className="flex-1">
                <label className="text-sm font-medium">Email</label>
                <Input 
                  placeholder="guest@email.com" 
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  data-testid="input-guest-email"
                />
              </div>
              <Button onClick={handleAddAttendee} data-testid="button-add-guest">
                <UserPlus className="w-4 h-4 mr-2" />
                Add Guest
              </Button>
            </div>

            <ScrollArea className="h-[300px]">
              <div className="space-y-2">
                {attendees.map((attendee) => (
                  <div 
                    key={attendee.id} 
                    className="flex items-center justify-between p-3 rounded-lg border"
                    data-testid={`row-attendee-${attendee.id}`}
                  >
                    <div className="flex items-center gap-3">
                      <Avatar>
                        <AvatarImage src={attendee.avatarUrl} />
                        <AvatarFallback>{attendee.name.split(" ").map(n => n[0]).join("")}</AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium" data-testid={`text-attendee-name-${attendee.id}`}>{attendee.name}</p>
                        <p className="text-sm text-muted-foreground">{attendee.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {getRsvpBadge(attendee.rsvpStatus)}
                      {attendee.rsvpStatus === "pending" && onSendReminder && (
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => onSendReminder(attendee.id, "rsvp")}
                          data-testid={`button-remind-rsvp-${attendee.id}`}
                        >
                          <Mail className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="payments" className="space-y-4 mt-4">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Payment Progress</span>
                <span className="font-medium">${totalPaid.toLocaleString()} / ${totalDue.toLocaleString()}</span>
              </div>
              <Progress value={paymentProgress} className="h-3" data-testid="progress-payments" />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <Card data-testid="card-payment-paid">
                <CardContent className="pt-4">
                  <div className="text-2xl font-bold text-green-600">{paidCount}</div>
                  <p className="text-sm text-muted-foreground">Fully Paid</p>
                </CardContent>
              </Card>
              <Card data-testid="card-payment-partial">
                <CardContent className="pt-4">
                  <div className="text-2xl font-bold text-amber-600">{partialCount}</div>
                  <p className="text-sm text-muted-foreground">Partial Payment</p>
                </CardContent>
              </Card>
              <Card data-testid="card-payment-pending">
                <CardContent className="pt-4">
                  <div className="text-2xl font-bold text-red-600">{paymentPendingCount}</div>
                  <p className="text-sm text-muted-foreground">Awaiting Payment</p>
                </CardContent>
              </Card>
            </div>

            <Card data-testid="card-cost-breakdown">
              <CardHeader>
                <CardTitle className="text-base">Cost Breakdown</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span>Total Budget</span>
                    <span className="font-medium">${totalBudget.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Per Person Cost</span>
                    <span className="font-medium">${perPersonCost.toLocaleString()}</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between text-green-600">
                    <span>Collected</span>
                    <span className="font-medium">${totalPaid.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-amber-600">
                    <span>Outstanding</span>
                    <span className="font-medium">${(totalDue - totalPaid).toLocaleString()}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <ScrollArea className="h-[200px]">
              <div className="space-y-2">
                {attendees.filter(a => a.rsvpStatus === "confirmed").map((attendee) => (
                  <div 
                    key={attendee.id} 
                    className="flex items-center justify-between p-3 rounded-lg border"
                    data-testid={`row-payment-${attendee.id}`}
                  >
                    <div className="flex items-center gap-3">
                      <Avatar>
                        <AvatarFallback>{attendee.name.split(" ").map(n => n[0]).join("")}</AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium">{attendee.name}</p>
                        <p className="text-sm text-muted-foreground">
                          ${attendee.amountPaid} / ${attendee.amountDue}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {getPaymentBadge(attendee.paymentStatus)}
                      {attendee.paymentStatus !== "paid" && onSendReminder && (
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => onSendReminder(attendee.id, "payment")}
                          data-testid={`button-remind-payment-${attendee.id}`}
                        >
                          <Mail className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="communication" className="space-y-4 mt-4">
            <div className="flex gap-2">
              <Button variant="outline" size="sm" data-testid="button-copy-emails">
                <Copy className="w-4 h-4 mr-2" />
                Copy All Emails
              </Button>
              <Button variant="outline" size="sm" data-testid="button-send-announcement">
                <AlertCircle className="w-4 h-4 mr-2" />
                Send Announcement
              </Button>
            </div>

            <ScrollArea className="h-[300px] border rounded-lg p-4">
              <div className="space-y-4">
                {messages.map((msg) => (
                  <div 
                    key={msg.id} 
                    className={`flex flex-col gap-1 ${msg.isAnnouncement ? 'bg-amber-50 dark:bg-amber-900/20 p-3 rounded-lg' : ''}`}
                    data-testid={`message-${msg.id}`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{msg.senderName}</span>
                      {msg.isAnnouncement && <Badge variant="secondary" className="text-xs">Announcement</Badge>}
                      <span className="text-xs text-muted-foreground">
                        {new Date(msg.timestamp).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-sm">{msg.message}</p>
                  </div>
                ))}
              </div>
            </ScrollArea>

            <div className="flex gap-2">
              <Textarea 
                placeholder="Type a message to the group..." 
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                className="min-h-[60px]"
                data-testid="input-group-message"
              />
              <Button onClick={handleSendMessage} className="self-end" data-testid="button-send-message">
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="requirements" className="space-y-4 mt-4">
            <div className="grid grid-cols-2 gap-4">
              <Card data-testid="card-dietary-requirements">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <UtensilsCrossed className="w-4 h-4" />
                    Dietary Requirements
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {Object.keys(dietarySummary).length > 0 ? (
                    <div className="space-y-2">
                      {Object.entries(dietarySummary).map(([restriction, count]) => (
                        <div key={restriction} className="flex justify-between items-center" data-testid={`row-dietary-${restriction}`}>
                          <span className="capitalize" data-testid={`text-dietary-name-${restriction}`}>{restriction}</span>
                          <Badge variant="secondary" data-testid={`badge-dietary-count-${restriction}`}>{count} {count === 1 ? 'person' : 'people'}</Badge>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No dietary requirements specified</p>
                  )}
                </CardContent>
              </Card>

              <Card data-testid="card-accessibility-needs">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Accessibility className="w-4 h-4" />
                    Accessibility Needs
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {Object.keys(accessibilitySummary).length > 0 ? (
                    <div className="space-y-2">
                      {Object.entries(accessibilitySummary).map(([need, count]) => (
                        <div key={need} className="flex justify-between items-center" data-testid={`row-accessibility-${need}`}>
                          <span className="capitalize" data-testid={`text-accessibility-name-${need}`}>{need}</span>
                          <Badge variant="secondary" data-testid={`badge-accessibility-count-${need}`}>{count} {count === 1 ? 'person' : 'people'}</Badge>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No accessibility needs specified</p>
                  )}
                </CardContent>
              </Card>
            </div>

            <Card data-testid="card-guest-notes">
              <CardHeader>
                <CardTitle className="text-base">Guest Notes</CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[200px]">
                  <div className="space-y-3">
                    {attendees.filter(a => a.notes || a.dietaryRestrictions?.length || a.accessibilityNeeds?.length).map((attendee) => (
                      <div key={attendee.id} className="p-3 rounded-lg border" data-testid={`row-guest-note-${attendee.id}`}>
                        <p className="font-medium" data-testid={`text-guest-note-name-${attendee.id}`}>{attendee.name}</p>
                        {attendee.dietaryRestrictions?.length ? (
                          <p className="text-sm text-muted-foreground">
                            Dietary: {attendee.dietaryRestrictions.join(", ")}
                          </p>
                        ) : null}
                        {attendee.accessibilityNeeds?.length ? (
                          <p className="text-sm text-muted-foreground">
                            Accessibility: {attendee.accessibilityNeeds.join(", ")}
                          </p>
                        ) : null}
                        {attendee.notes && (
                          <p className="text-sm mt-1">{attendee.notes}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
