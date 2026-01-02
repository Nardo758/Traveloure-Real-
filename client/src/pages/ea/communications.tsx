import { EALayout } from "@/components/ea-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Search, 
  Send, 
  Bot,
  Mail,
  Phone,
  MessageSquare,
  Clock,
  User
} from "lucide-react";

export default function EACommunications() {
  const recentComms = [
    {
      id: 1,
      type: "email",
      executive: "James Anderson",
      subject: "Paris Dinner Confirmation",
      recipient: "Le Jules Verne",
      time: "2 hours ago",
      status: "sent",
    },
    {
      id: 2,
      type: "message",
      executive: "Sarah Chen",
      subject: "Hotel Options for Tokyo",
      recipient: "Sarah Chen",
      time: "3 hours ago",
      status: "read",
    },
    {
      id: 3,
      type: "email",
      executive: "Michael Torres",
      subject: "Anniversary Dinner Reservation",
      recipient: "The Capital Grille",
      time: "5 hours ago",
      status: "sent",
    },
    {
      id: 4,
      type: "call",
      executive: "Lisa Parker",
      subject: "Board Meeting Setup",
      recipient: "Internal - IT Department",
      time: "Yesterday",
      status: "completed",
    },
  ];

  const drafts = [
    {
      id: 1,
      executive: "James Anderson",
      type: "Thank You Note",
      content: "Dear Mr. Smith, Thank you for joining us for dinner in Paris...",
      aiGenerated: true,
    },
    {
      id: 2,
      executive: "Sarah Chen",
      type: "Travel Itinerary",
      content: "Your upcoming trip: London (Mar 15-17) → Tokyo (Mar 17-22)...",
      aiGenerated: true,
    },
  ];

  return (
    <EALayout title="Communications">
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900" data-testid="text-comms-title">
              Communications Center
            </h1>
            <p className="text-gray-600">Manage all executive communications</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" data-testid="button-new-email">
              <Mail className="w-4 h-4 mr-2" /> New Email
            </Button>
            <Button variant="outline" data-testid="button-new-message">
              <MessageSquare className="w-4 h-4 mr-2" /> New Message
            </Button>
            <Button className="bg-[#FF385C] hover:bg-[#E23350]" data-testid="button-ai-draft">
              <Bot className="w-4 h-4 mr-2" /> AI Draft
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
                      data-testid="input-search-comms"
                    />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-96">
                  <div className="space-y-3">
                    {recentComms.map((comm) => (
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
                              <span className="text-xs text-gray-500">{comm.time}</span>
                            </div>
                            <p className="text-sm text-gray-500">
                              <span className="font-medium">{comm.executive}</span> → {comm.recipient}
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
                <CardTitle className="text-lg">Quick Compose</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <Input placeholder="Recipient" data-testid="input-recipient" />
                  <Input placeholder="Subject" data-testid="input-subject" />
                </div>
                <Textarea 
                  placeholder="Type your message..." 
                  className="min-h-32"
                  data-testid="input-message"
                />
                <div className="flex justify-between">
                  <Button variant="outline" data-testid="button-ai-assist">
                    <Bot className="w-4 h-4 mr-2" /> AI Assist
                  </Button>
                  <Button className="bg-[#FF385C] hover:bg-[#E23350]" data-testid="button-send">
                    <Send className="w-4 h-4 mr-2" /> Send
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right Column */}
          <div className="space-y-4">
            {/* AI Drafts */}
            <Card className="border border-gray-200">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Bot className="w-5 h-5 text-green-600" />
                  <CardTitle className="text-lg">AI Drafts Pending</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {drafts.map((draft) => (
                  <div 
                    key={draft.id} 
                    className="p-3 rounded-lg border border-gray-200"
                    data-testid={`draft-${draft.id}`}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <Badge className="bg-green-100 text-green-700 text-xs">AI Generated</Badge>
                      <span className="text-sm font-medium text-gray-900">{draft.type}</span>
                    </div>
                    <p className="text-sm text-gray-600 mb-2">For: {draft.executive}</p>
                    <p className="text-sm text-gray-500 truncate">{draft.content}</p>
                    <div className="flex gap-2 mt-3">
                      <Button size="sm" variant="outline" data-testid={`button-review-${draft.id}`}>
                        Review
                      </Button>
                      <Button size="sm" variant="outline" data-testid={`button-approve-${draft.id}`}>
                        Approve & Send
                      </Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Templates */}
            <Card className="border border-gray-200">
              <CardHeader>
                <CardTitle className="text-lg">Quick Templates</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Button variant="outline" className="w-full justify-start text-sm" data-testid="template-thank-you">
                  Thank You Note
                </Button>
                <Button variant="outline" className="w-full justify-start text-sm" data-testid="template-confirmation">
                  Booking Confirmation
                </Button>
                <Button variant="outline" className="w-full justify-start text-sm" data-testid="template-reminder">
                  Event Reminder
                </Button>
                <Button variant="outline" className="w-full justify-start text-sm" data-testid="template-itinerary">
                  Travel Itinerary
                </Button>
                <Button variant="outline" className="w-full justify-start text-sm" data-testid="template-update">
                  Status Update
                </Button>
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
                  <span className="font-medium">24</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">Messages</span>
                  <span className="font-medium">38</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">Calls Logged</span>
                  <span className="font-medium">12</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">AI Drafted</span>
                  <span className="font-medium text-green-600">15</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </EALayout>
  );
}
