import { ExpertLayout } from "@/components/expert-layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Search, 
  Send, 
  Paperclip, 
  MoreVertical,
  Phone,
  Video,
  Bot
} from "lucide-react";
import { useState } from "react";

export default function ExpertMessages() {
  const [selectedConversation, setSelectedConversation] = useState(1);

  const conversations = [
    { id: 1, name: "Sarah & Mike", event: "Tokyo Trip", lastMessage: "Thank you! We'll check out those restaurants.", time: "2 min ago", unread: 0, status: "online" },
    { id: 2, name: "Jennifer", event: "Proposal Planning", lastMessage: "The venue looks perfect!", time: "1 hour ago", unread: 2, status: "offline" },
    { id: 3, name: "David & Emma", event: "Anniversary", lastMessage: "Can we change the menu?", time: "3 hours ago", unread: 1, status: "offline" },
    { id: 4, name: "Amanda", event: "Birthday Party", lastMessage: "Thanks for the suggestions!", time: "Yesterday", unread: 0, status: "offline" },
  ];

  const messages = [
    { id: 1, sender: "client", text: "Hi Yuki! We just checked into our hotel in Tokyo. Everything is amazing so far!", time: "10:30 AM" },
    { id: 2, sender: "expert", text: "Welcome to Tokyo! I'm so glad you arrived safely. How was the flight?", time: "10:32 AM" },
    { id: 3, sender: "client", text: "The flight was great, very smooth. We're excited to explore!", time: "10:35 AM" },
    { id: 4, sender: "expert", text: "Perfect! I've prepared some restaurant recommendations for tonight. Would you like traditional Japanese or something more modern?", time: "10:40 AM" },
    { id: 5, sender: "client", text: "Traditional Japanese sounds wonderful! Any sushi recommendations?", time: "10:45 AM" },
    { id: 6, sender: "expert", text: "Absolutely! Here are my top 3 picks:\n\n1. Sushi Saito (Roppongi) - Michelin 3-star\n2. Sukiyabashi Jiro (Ginza) - Legendary\n3. Sushi Yoshitake - Intimate atmosphere\n\nI can make a reservation for any of these. What time works for you?", time: "10:50 AM" },
    { id: 7, sender: "client", text: "Thank you! We'll check out those restaurants.", time: "10:55 AM" },
  ];

  const selectedConvo = conversations.find(c => c.id === selectedConversation);

  return (
    <ExpertLayout title="Messages">
      <div className="h-[calc(100vh-3.5rem)] flex">
        {/* Conversations List */}
        <div className="w-80 border-r border-gray-200 bg-white flex flex-col">
          <div className="p-4 border-b border-gray-200">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input 
                placeholder="Search conversations..." 
                className="pl-9"
                data-testid="input-search-conversations"
              />
            </div>
          </div>
          <ScrollArea className="flex-1">
            {conversations.map((convo) => (
              <div
                key={convo.id}
                className={`p-4 cursor-pointer border-b border-gray-100 hover-elevate ${
                  selectedConversation === convo.id ? "bg-[#FF385C]/5 border-l-2 border-l-[#FF385C]" : ""
                }`}
                onClick={() => setSelectedConversation(convo.id)}
                data-testid={`conversation-${convo.id}`}
              >
                <div className="flex items-start gap-3">
                  <div className="relative">
                    <Avatar className="h-10 w-10">
                      <AvatarFallback className="bg-[#FF385C]/10 text-[#FF385C]">
                        {convo.name.split(" ").map(n => n[0]).join("").slice(0, 2)}
                      </AvatarFallback>
                    </Avatar>
                    {convo.status === "online" && (
                      <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-white rounded-full" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="font-medium text-gray-900 truncate">{convo.name}</p>
                      <span className="text-xs text-gray-500">{convo.time}</span>
                    </div>
                    <p className="text-xs text-gray-500">{convo.event}</p>
                    <p className="text-sm text-gray-600 truncate mt-1">{convo.lastMessage}</p>
                  </div>
                  {convo.unread > 0 && (
                    <Badge className="bg-[#FF385C] text-white h-5 w-5 flex items-center justify-center p-0 text-xs">
                      {convo.unread}
                    </Badge>
                  )}
                </div>
              </div>
            ))}
          </ScrollArea>
        </div>

        {/* Chat Area */}
        <div className="flex-1 flex flex-col bg-gray-50">
          {/* Chat Header */}
          <div className="h-16 px-4 border-b border-gray-200 bg-white flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Avatar className="h-10 w-10">
                <AvatarFallback className="bg-[#FF385C]/10 text-[#FF385C]">
                  {selectedConvo?.name.split(" ").map(n => n[0]).join("").slice(0, 2)}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="font-medium text-gray-900">{selectedConvo?.name}</p>
                <p className="text-sm text-gray-500">{selectedConvo?.event}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" data-testid="button-call">
                <Phone className="w-5 h-5 text-gray-600" />
              </Button>
              <Button variant="ghost" size="icon" data-testid="button-video">
                <Video className="w-5 h-5 text-gray-600" />
              </Button>
              <Button variant="ghost" size="icon" data-testid="button-ai-assist">
                <Bot className="w-5 h-5 text-gray-600" />
              </Button>
              <Button variant="ghost" size="icon" data-testid="button-more">
                <MoreVertical className="w-5 h-5 text-gray-600" />
              </Button>
            </div>
          </div>

          {/* Messages */}
          <ScrollArea className="flex-1 p-4">
            <div className="space-y-4 max-w-3xl mx-auto">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex ${message.sender === "expert" ? "justify-end" : "justify-start"}`}
                  data-testid={`message-${message.id}`}
                >
                  <div
                    className={`max-w-md px-4 py-2 rounded-lg ${
                      message.sender === "expert"
                        ? "bg-[#FF385C] text-white"
                        : "bg-white border border-gray-200 text-gray-900"
                    }`}
                  >
                    <p className="text-sm whitespace-pre-line">{message.text}</p>
                    <p className={`text-xs mt-1 ${message.sender === "expert" ? "text-white/70" : "text-gray-500"}`}>
                      {message.time}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>

          {/* Message Input */}
          <div className="p-4 border-t border-gray-200 bg-white">
            <div className="flex items-center gap-3 max-w-3xl mx-auto">
              <Button variant="ghost" size="icon" data-testid="button-attach">
                <Paperclip className="w-5 h-5 text-gray-600" />
              </Button>
              <Input 
                placeholder="Type a message..." 
                className="flex-1"
                data-testid="input-message"
              />
              <Button className="bg-[#FF385C] " data-testid="button-send">
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </ExpertLayout>
  );
}
