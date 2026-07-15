import { useChats, useSendMessage } from "@/hooks/use-chat";
import { useAuth } from "@/hooks/use-auth";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, Loader2, MessageSquare, Search, Star, MapPin, ArrowLeft, User, Clock, Wifi, WifiOff } from "lucide-react";
import { format } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Link, useSearch } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useWebSocket } from "@/hooks/use-websocket";
import { useToast } from "@/hooks/use-toast";

interface RealtimeMessage {
  id: string;
  senderId: string;
  recipientId?: string;
  content: string;
  timestamp: string;
}

interface DisplayExpert {
  id: string | number;
  name: string;
  location: string;
  avatar: string;
  /** Real review-backed rating, or null when the expert has no reviews (§13: never a fabricated number). */
  rating: number | null;
  reviews: number;
  specialties: string[];
  languages: string[];
  responseTime: string;
}

/** Map a raw /api/experts row to the chat display shape. Ratings stay honest —
 *  a score renders only when reviewCount > 0, else null (shown as "New"). */
function mapExpertToDisplay(data: any): DisplayExpert {
  const reviews = Number(data.reviewCount ?? 0);
  const rawRating = data.averageRating ?? data.rating;
  return {
    id: data.id,
    name: `${data.firstName ?? ""} ${data.lastName ?? ""}`.trim() || data.name || "Local Expert",
    location:
      data.expertForm?.city ||
      data.destinations?.[0] ||
      data.location ||
      "Trip Planner",
    avatar: data.profileImage || data.profileImageUrl || "",
    rating: reviews > 0 && rawRating ? Number(rawRating) : null,
    reviews,
    specialties:
      data.expertForm?.primarySpecialty
        ? [data.expertForm.primarySpecialty, ...(data.specialties ?? [])]
        : data.specialties ?? [],
    languages: data.languages ?? ["English"],
    responseTime: data.responseTime || "< 2 hours",
  };
}

export default function Chat() {
  const { user } = useAuth();
  const { data: chats, isLoading, refetch } = useChats();
  const sendMessageMutation = useSendMessage();
  const { toast } = useToast();
  const searchString = useSearch();
  const urlParams = new URLSearchParams(searchString);
  const expertIdFromUrl = urlParams.get("expertId");
  // clientId: forwarded from /expert/messages/:clientId and /provider/messages/:clientId
  // deep-links. Pre-populates the search box so the relevant conversation is surfaced.
  const clientIdFromUrl = urlParams.get("clientId");
  // about: forwarded from "Ask expert" buttons on gem/activity cards — pre-fills the message
  const aboutFromUrl = urlParams.get("about");

  // Real experts for the browse sidebar (replaces the old hardcoded sample list).
  const { data: expertList = [] } = useQuery<DisplayExpert[]>({
    queryKey: ["/api/experts"],
    queryFn: async () => {
      const res = await fetch("/api/experts", { credentials: "include" });
      if (!res.ok) return [];
      const rows = await res.json();
      return Array.isArray(rows) ? rows.map(mapExpertToDisplay) : [];
    },
  });

  const { data: linkedExpert } = useQuery<DisplayExpert | null>({
    queryKey: ["/api/experts", expertIdFromUrl],
    queryFn: async () => {
      const res = await fetch(`/api/experts/${expertIdFromUrl}`);
      if (!res.ok) return null;
      return mapExpertToDisplay(await res.json());
    },
    enabled: !!expertIdFromUrl,
  });

  // Fetch client info when arriving from /expert/messages/:clientId deep-link
  const { data: linkedClient } = useQuery<any>({
    queryKey: ["/api/users", clientIdFromUrl],
    queryFn: async () => {
      const res = await fetch(`/api/users/${clientIdFromUrl}`);
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!clientIdFromUrl,
  });

  const allExperts = useMemo(() => {
    if (linkedExpert) {
      const exists = expertList.some(e => String(e.id) === String(linkedExpert.id));
      if (!exists) return [linkedExpert, ...expertList];
    }
    return expertList;
  }, [linkedExpert, expertList]);

  const [message, setMessage] = useState("");
  const [selectedExpert, setSelectedExpert] = useState<DisplayExpert | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Pre-fill message when arriving from "Ask expert" on a gem/activity card
  useEffect(() => {
    if (aboutFromUrl) {
      setMessage(`I'm interested in ${aboutFromUrl} — can you share any tips or help me plan this?`);
    }
  }, [aboutFromUrl]);

  useEffect(() => {
    if (linkedExpert && !selectedExpert) {
      setSelectedExpert(linkedExpert);
    }
  }, [linkedExpert]);

  // When arriving from /expert/messages/:clientId deep-link, pre-populate search with the
  // client's name so the relevant conversation thread is surfaced immediately.
  useEffect(() => {
    if (linkedClient && !searchQuery) {
      const clientName = linkedClient.firstName
        ? `${linkedClient.firstName} ${linkedClient.lastName || ""}`.trim()
        : (linkedClient.username || linkedClient.email || "");
      if (clientName) setSearchQuery(clientName);
    }
  }, [linkedClient]);
  const [realtimeMessages, setRealtimeMessages] = useState<RealtimeMessage[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const handleNewMessage = useCallback((msg: any) => {
    if (msg.type === "chat") {
      setRealtimeMessages(prev => [...prev, {
        id: msg.id || crypto.randomUUID(),
        senderId: msg.senderId,
        recipientId: msg.recipientId,
        content: msg.content,
        timestamp: msg.timestamp || new Date().toISOString(),
      }]);
      refetch();
    }
  }, [refetch]);

  const handleTyping = useCallback((senderId: string) => {
    if (selectedExpert && String(selectedExpert.id) === senderId) {
      setIsTyping(true);
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      typingTimeoutRef.current = setTimeout(() => setIsTyping(false), 3000);
    }
  }, [selectedExpert]);

  const handleWsError = useCallback((error: string) => {
    toast({
      title: "Message failed",
      description: error || "Failed to send message. Please try again.",
      variant: "destructive",
    });
  }, [toast]);

  const { isConnected, sendMessage: wsSendMessage, sendTyping } = useWebSocket({
    userId: user?.id,
    onMessage: handleNewMessage,
    onTyping: handleTyping,
    onConnected: () => {},
    onError: handleWsError,
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [realtimeMessages, chats]);

  const handleSend = () => {
    if (!message.trim() || !selectedExpert) return;
    
    const currentMessage = message;
    const recipientId = String(selectedExpert.id);
    
    // For demo experts (numeric IDs), use HTTP fallback which doesn't enforce FK
    // WebSocket real-time only works with actual platform users
    if (isConnected && recipientId.length > 10) {
      // Real user ID (UUID format), try WebSocket
      const success = wsSendMessage(recipientId, currentMessage);
      if (success) {
        setMessage("");
      }
    } else {
      // Demo mode or WebSocket failed - use HTTP mutation
      sendMessageMutation.mutate(
        { message: currentMessage, senderId: user?.id },
        { 
          onSuccess: () => {
            setMessage("");
            refetch();
          },
          onError: () => {
            toast({
              title: "Message failed",
              description: "Failed to send message. Please try again.",
              variant: "destructive",
            });
          }
        }
      );
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setMessage(e.target.value);
    if (selectedExpert && isConnected) {
      sendTyping(String(selectedExpert.id));
    }
  };

  const filteredExperts = allExperts.filter(expert => 
    expert.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    expert.location.toLowerCase().includes(searchQuery.toLowerCase()) ||
    expert.specialties.some((s: string) => s.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <Loader2 className="animate-spin w-8 h-8 text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-white dark:bg-slate-900 border-b border-border sticky top-16 z-40">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Link href="/dashboard">
              <Button variant="ghost" size="icon" data-testid="button-back">
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </Link>
            <div>
              <h1 className="text-xl font-bold font-display text-slate-900 dark:text-white">Expert Chat</h1>
              <p className="text-sm text-muted-foreground">Connect with local experts for your trips</p>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6">
        <div className="grid md:grid-cols-3 gap-6 h-[calc(100vh-200px)]">
          {/* Expert List */}
          <div className="md:col-span-1 space-y-4">
            <div className="relative">
              <Input
                placeholder="Search experts..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
                data-testid="input-search-experts"
              />
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            </div>

            <ScrollArea className="h-[calc(100vh-280px)]">
              <div className="space-y-3 pr-4">
                {filteredExperts.map((expert, index) => (
                  <motion.div
                    key={expert.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                  >
                    <Card 
                      className={`cursor-pointer transition-all hover:shadow-md ${selectedExpert?.id === expert.id ? 'ring-2 ring-primary' : ''}`}
                      onClick={() => setSelectedExpert(expert)}
                      data-testid={`card-expert-${expert.id}`}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-start gap-3">
                          <Avatar className="w-12 h-12">
                            <AvatarImage src={expert.avatar} alt={expert.name} />
                            <AvatarFallback>{expert.name[0]}</AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <h3 className="font-semibold text-slate-900 dark:text-white truncate">
                                {expert.name}
                              </h3>
                              {expert.rating !== null ? (
                                <div className="flex items-center gap-1 text-amber-500 text-sm shrink-0">
                                  <Star className="w-3 h-3 fill-current" />
                                  {expert.rating.toFixed(1)}
                                </div>
                              ) : (
                                <span className="text-xs text-muted-foreground shrink-0">New</span>
                              )}
                            </div>
                            <div className="flex items-center gap-1 text-sm text-muted-foreground mt-1">
                              <MapPin className="w-3 h-3" />
                              {expert.location}
                            </div>
                            <div className="flex flex-wrap gap-1 mt-2">
                              {expert.specialties.slice(0, 2).map(spec => (
                                <Badge key={spec} variant="secondary" className="text-xs">
                                  {spec}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </div>
            </ScrollArea>
          </div>

          {/* Chat Area */}
          <div className="md:col-span-2">
            <Card className="h-full flex flex-col">
              {selectedExpert ? (
                <>
                  {/* Chat Header */}
                  <div className="p-4 border-b border-border flex items-center gap-4">
                    <Avatar className="w-10 h-10">
                      <AvatarImage src={selectedExpert.avatar} alt={selectedExpert.name} />
                      <AvatarFallback>{selectedExpert.name[0]}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-slate-900 dark:text-white">{selectedExpert.name}</h3>
                        {isConnected ? (
                          <Badge variant="secondary" className="text-xs bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">
                            <Wifi className="w-3 h-3 mr-1" /> Live
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="text-xs bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400">
                            <WifiOff className="w-3 h-3 mr-1" /> Offline
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        {isTyping ? (
                          <span className="flex items-center gap-1 text-primary">
                            <motion.span
                              animate={{ opacity: [0.4, 1, 0.4] }}
                              transition={{ duration: 1.2, repeat: Infinity }}
                            >
                              typing...
                            </motion.span>
                          </span>
                        ) : (
                          <>
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              Responds {selectedExpert.responseTime}
                            </span>
                            {selectedExpert.reviews > 0 && (
                              <>
                                <span>|</span>
                                <span>{selectedExpert.reviews} reviews</span>
                              </>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                    <Button variant="outline" size="sm" data-testid="button-view-profile">View Profile</Button>
                  </div>

                  {/* Messages */}
                  <ScrollArea className="flex-1 p-4">
                    {chats && chats.length > 0 ? (
                      <div className="space-y-4">
                        {chats.map((chat) => (
                          <div
                            key={chat.id}
                            className={`flex ${chat.senderId === user?.id ? 'justify-end' : 'justify-start'}`}
                          >
                            <div className="flex items-end gap-2 max-w-[70%]">
                              {chat.senderId !== user?.id && (
                                <Avatar className="w-8 h-8">
                                  <AvatarImage src={selectedExpert.avatar} />
                                  <AvatarFallback>{selectedExpert.name[0]}</AvatarFallback>
                                </Avatar>
                              )}
                              <div
                                className={`
                                  rounded-2xl p-4 shadow-sm
                                  ${chat.senderId === user?.id 
                                    ? 'bg-primary text-white rounded-br-none' 
                                    : 'bg-muted text-foreground rounded-bl-none'}
                                `}
                              >
                                <p>{chat.message}</p>
                                <div className={`text-xs mt-2 ${chat.senderId === user?.id ? 'text-white/70' : 'text-muted-foreground'}`}>
                                  {chat.createdAt && format(new Date(chat.createdAt), "h:mm a")}
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="h-full flex flex-col items-center justify-center text-center py-12">
                        <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                          <MessageSquare className="w-8 h-8 text-primary" />
                        </div>
                        <h3 className="font-semibold text-slate-900 dark:text-white mb-2">Start a conversation</h3>
                        <p className="text-muted-foreground text-sm max-w-xs">
                          Say hello to {selectedExpert.name} and get personalized travel advice!
                        </p>
                      </div>
                    )}
                  </ScrollArea>

                  {/* Input */}
                  <div className="p-4 border-t border-border">
                    <form 
                      onSubmit={(e) => { e.preventDefault(); handleSend(); }}
                      className="flex gap-3"
                    >
                      <Input
                        value={message}
                        onChange={handleInputChange}
                        placeholder="Type your message..."
                        className="flex-1"
                        data-testid="input-message"
                      />
                      <Button 
                        type="submit" 
                        disabled={sendMessageMutation.isPending || !message.trim()}
                        data-testid="button-send"
                      >
                        {sendMessageMutation.isPending ? (
                          <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                          <Send className="w-5 h-5" />
                        )}
                      </Button>
                    </form>
                  </div>
                </>
              ) : (
                <CardContent className="flex-1 flex flex-col items-center justify-center text-center py-12">
                  <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center mb-6">
                    <User className="w-10 h-10 text-muted-foreground" />
                  </div>
                  <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">
                    Select an Expert
                  </h3>
                  <p className="text-muted-foreground max-w-sm">
                    Choose a local expert from the list to start chatting and get personalized travel advice.
                  </p>
                </CardContent>
              )}
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
