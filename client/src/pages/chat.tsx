import { useChats, useSendMessage } from "@/hooks/use-chat";
import { useAuth } from "@/hooks/use-auth";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, Loader2, MessageSquare, Search, Star, MapPin, ArrowLeft, User, Clock } from "lucide-react";
import { format } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { ScrollArea } from "@/components/ui/scroll-area";

const sampleExperts = [
  {
    id: 1,
    name: "Yuki Tanaka",
    location: "Tokyo, Japan",
    avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200",
    rating: 4.9,
    reviews: 127,
    specialties: ["Culture", "Food", "Nightlife"],
    languages: ["Japanese", "English"],
    responseTime: "< 1 hour"
  },
  {
    id: 2,
    name: "Marie Dubois",
    location: "Paris, France",
    avatar: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=200",
    rating: 4.8,
    reviews: 89,
    specialties: ["Art", "Wine", "Fashion"],
    languages: ["French", "English"],
    responseTime: "< 2 hours"
  },
  {
    id: 3,
    name: "Made Surya",
    location: "Bali, Indonesia",
    avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200",
    rating: 4.9,
    reviews: 156,
    specialties: ["Nature", "Wellness", "Adventure"],
    languages: ["Indonesian", "English"],
    responseTime: "< 30 min"
  },
];

export default function Chat() {
  const { user } = useAuth();
  const { data: chats, isLoading } = useChats();
  const sendMessage = useSendMessage();
  const [message, setMessage] = useState("");
  const [selectedExpert, setSelectedExpert] = useState<typeof sampleExperts[0] | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const handleSend = () => {
    if (!message.trim()) return;
    sendMessage.mutate(
      { message, senderId: user?.id },
      {
        onSuccess: () => setMessage(""),
      }
    );
  };

  const filteredExperts = sampleExperts.filter(expert => 
    expert.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    expert.location.toLowerCase().includes(searchQuery.toLowerCase()) ||
    expert.specialties.some(s => s.toLowerCase().includes(searchQuery.toLowerCase()))
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
                              <div className="flex items-center gap-1 text-amber-500 text-sm shrink-0">
                                <Star className="w-3 h-3 fill-current" />
                                {expert.rating}
                              </div>
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
                      <h3 className="font-semibold text-slate-900 dark:text-white">{selectedExpert.name}</h3>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          Responds {selectedExpert.responseTime}
                        </span>
                        <span>|</span>
                        <span>{selectedExpert.reviews} reviews</span>
                      </div>
                    </div>
                    <Button variant="outline" size="sm">View Profile</Button>
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
                        onChange={(e) => setMessage(e.target.value)}
                        placeholder="Type your message..."
                        className="flex-1"
                        data-testid="input-message"
                      />
                      <Button 
                        type="submit" 
                        disabled={sendMessage.isPending || !message.trim()}
                        data-testid="button-send"
                      >
                        {sendMessage.isPending ? (
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
