import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  MessageCircle,
  X,
  Send,
  Headphones,
  Star,
  Clock,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Message {
  id: string;
  text: string;
  sender: "user" | "expert" | "system";
  timestamp: Date;
}

interface ExpertChatWidgetProps {
  experienceType?: string;
  destination?: string;
  onRequestExpert?: () => void;
  isOpen?: boolean;
  onClose?: () => void;
}

export function ExpertChatWidget({
  experienceType,
  destination,
  onRequestExpert,
  isOpen = true,
  onClose,
}: ExpertChatWidgetProps) {
  const [isMinimized, setIsMinimized] = useState(false);
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "1",
      text: `Hi! I'm here to help you plan the perfect ${experienceType || "experience"}${destination ? ` in ${destination}` : ""}. How can I assist you today?`,
      sender: "system",
      timestamp: new Date(),
    },
  ]);
  const [isConnecting, setIsConnecting] = useState(false);
  const [expertConnected, setExpertConnected] = useState(false);

  const handleSend = () => {
    if (!message.trim()) return;

    const newMessage: Message = {
      id: Date.now().toString(),
      text: message,
      sender: "user",
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, newMessage]);
    setMessage("");

    if (!expertConnected) {
      setTimeout(() => {
        setMessages((prev) => [
          ...prev,
          {
            id: Date.now().toString(),
            text: "I'll connect you with one of our local experts who can help with your specific needs. Would you like to speak with an expert now?",
            sender: "system",
            timestamp: new Date(),
          },
        ]);
      }, 1000);
    }
  };

  const handleConnectExpert = () => {
    setIsConnecting(true);
    setTimeout(() => {
      setIsConnecting(false);
      setExpertConnected(true);
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          text: "Great news! Sarah, one of our local travel experts, will be with you shortly. Average wait time: 2-3 minutes.",
          sender: "system",
          timestamp: new Date(),
        },
      ]);
      if (onRequestExpert) onRequestExpert();
    }, 1500);
  };

  const handleClose = () => {
    if (onClose) {
      onClose();
    }
  };

  if (!isOpen) {
    return null;
  }

  return (
    <Card
      className={cn(
        "fixed z-[9999] shadow-2xl border-0 transition-all duration-300",
        isMinimized
          ? "bottom-6 right-6 w-72"
          : "bottom-6 right-6 w-96 h-[500px]"
      )}
      data-testid="chat-widget"
    >
      <CardHeader
        className="bg-[#FF385C] text-white rounded-t-lg p-4 cursor-pointer"
        onClick={() => setIsMinimized(!isMinimized)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative">
              <Avatar className="h-10 w-10 border-2 border-white/30">
                <AvatarImage src="" />
                <AvatarFallback className="bg-white/20 text-white">
                  <Headphones className="w-5 h-5" />
                </AvatarFallback>
              </Avatar>
              {expertConnected && (
                <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-400 border-2 border-[#FF385C] rounded-full" />
              )}
            </div>
            <div>
              <CardTitle className="text-sm font-semibold">
                {expertConnected ? "Expert Connected" : "Need Help?"}
              </CardTitle>
              <p className="text-xs text-white/80">
                {expertConnected
                  ? "Sarah is typing..."
                  : "Chat with a local expert"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="text-white hover:bg-white/20"
              onClick={(e) => {
                e.stopPropagation();
                setIsMinimized(!isMinimized);
              }}
              data-testid="button-minimize-chat"
            >
              <ChevronDown
                className={cn(
                  "w-5 h-5 transition-transform",
                  isMinimized && "rotate-180"
                )}
              />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="text-white hover:bg-white/20"
              onClick={(e) => {
                e.stopPropagation();
                handleClose();
              }}
              data-testid="button-close-chat"
            >
              <X className="w-5 h-5" />
            </Button>
          </div>
        </div>
      </CardHeader>

      {!isMinimized && (
        <CardContent className="p-0 flex flex-col h-[calc(500px-80px)]">
          <ScrollArea className="flex-1 p-4">
            <div className="space-y-4">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={cn(
                    "flex",
                    msg.sender === "user" ? "justify-end" : "justify-start"
                  )}
                >
                  <div
                    className={cn(
                      "max-w-[80%] rounded-lg px-4 py-2",
                      msg.sender === "user"
                        ? "bg-[#FF385C] text-white"
                        : msg.sender === "expert"
                          ? "bg-gray-100 dark:bg-gray-800"
                          : "bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800"
                    )}
                  >
                    <p className="text-sm">{msg.text}</p>
                    <p
                      className={cn(
                        "text-xs mt-1",
                        msg.sender === "user"
                          ? "text-white/70"
                          : "text-muted-foreground"
                      )}
                    >
                      {msg.timestamp.toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                </div>
              ))}

              {!expertConnected && messages.length > 1 && (
                <div className="flex justify-center py-2">
                  <Button
                    onClick={handleConnectExpert}
                    disabled={isConnecting}
                    className="bg-[#FF385C] hover:bg-[#E23350]"
                    data-testid="button-connect-expert"
                  >
                    {isConnecting ? (
                      <>
                        <Clock className="w-4 h-4 mr-2 animate-spin" />
                        Connecting...
                      </>
                    ) : (
                      <>
                        <Headphones className="w-4 h-4 mr-2" />
                        Connect with Expert
                      </>
                    )}
                  </Button>
                </div>
              )}
            </div>
          </ScrollArea>

          <div className="p-4 border-t">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSend();
              }}
              className="flex gap-2"
            >
              <Input
                placeholder="Type your message..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="flex-1"
                data-testid="input-chat-message"
              />
              <Button
                type="submit"
                size="icon"
                className="bg-[#FF385C] hover:bg-[#E23350]"
                data-testid="button-send-message"
              >
                <Send className="w-4 h-4" />
              </Button>
            </form>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

export function ExpertSidebarCard({
  experienceType,
  onConnect,
}: {
  experienceType?: string;
  onConnect?: () => void;
}) {
  return (
    <Card className="bg-gradient-to-br from-[#FF385C]/5 to-[#FF385C]/10 border-[#FF385C]/20">
      <CardContent className="p-4">
        <div className="flex items-center gap-3 mb-4">
          <Avatar className="h-12 w-12 border-2 border-[#FF385C]/30">
            <AvatarImage src="https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&h=100&fit=crop&crop=face" />
            <AvatarFallback>SE</AvatarFallback>
          </Avatar>
          <div>
            <h4 className="font-semibold text-sm">Sarah Edwards</h4>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
              4.9 (127 reviews)
            </div>
          </div>
        </div>

        <p className="text-sm text-muted-foreground mb-4">
          {experienceType
            ? `I specialize in ${experienceType.toLowerCase()} planning and can help you find the perfect vendors for your needs.`
            : "I can help you plan the perfect experience with personalized recommendations."}
        </p>

        <div className="flex items-center gap-2 mb-4">
          <Badge variant="secondary" className="text-xs">
            Local Expert
          </Badge>
          <Badge variant="secondary" className="text-xs">
            5+ Years
          </Badge>
          <Badge variant="secondary" className="text-xs">
            <span className="w-2 h-2 bg-green-400 rounded-full mr-1" />
            Online
          </Badge>
        </div>

        <Button
          onClick={onConnect}
          className="w-full bg-[#FF385C] hover:bg-[#E23350]"
          data-testid="button-connect-sidebar-expert"
        >
          <MessageCircle className="w-4 h-4 mr-2" />
          Chat with Sarah
        </Button>

        <p className="text-xs text-center text-muted-foreground mt-3">
          Average response time: 2 minutes
        </p>
      </CardContent>
    </Card>
  );
}

export function CheckoutExpertBanner({
  onConnect,
  cartTotal,
}: {
  onConnect?: () => void;
  cartTotal?: number;
}) {
  return (
    <div className="bg-gradient-to-r from-[#FF385C]/10 to-[#FF385C]/5 rounded-lg p-4 mb-4">
      <div className="flex items-start gap-3">
        <div className="bg-[#FF385C] p-2 rounded-full flex-shrink-0">
          <Headphones className="w-4 h-4 text-white" />
        </div>
        <div className="flex-1">
          <h4 className="font-semibold text-sm mb-1">Not sure about your selections?</h4>
          <p className="text-xs text-muted-foreground mb-3">
            Our experts can review your choices and suggest optimizations{" "}
            {cartTotal && cartTotal > 200
              ? "that could save you money."
              : "for a better experience."}
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={onConnect}
            className="border-[#FF385C] text-[#FF385C] hover:bg-[#FF385C]/10"
            data-testid="button-checkout-expert"
          >
            <MessageCircle className="w-3 h-3 mr-2" />
            Get Expert Review
          </Button>
        </div>
      </div>
    </div>
  );
}
