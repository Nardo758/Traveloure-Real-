import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useLocation } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { 
  ArrowLeft, 
  Send, 
  Bot, 
  User, 
  Plus, 
  Trash2, 
  Loader2,
  MessageSquare,
  Sparkles,
  Plane,
  MapPin,
  Calendar,
  Pencil,
  Check,
  X
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { motion, AnimatePresence } from "framer-motion";

interface Message {
  id: number;
  conversationId: number;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

interface Conversation {
  id: number;
  title: string;
  createdAt: string;
  messages?: Message[];
}

export default function AIAssistant() {
  const [, setLocation] = useLocation();
  const [selectedConversation, setSelectedConversation] = useState<number | null>(null);
  const [inputMessage, setInputMessage] = useState("");
  const [streamingMessage, setStreamingMessage] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  const { data: conversations = [], isLoading: loadingConversations } = useQuery<Conversation[]>({
    queryKey: ["/api/conversations"],
  });

  const { data: currentConversation, isLoading: loadingMessages } = useQuery<Conversation>({
    queryKey: ["/api/conversations", selectedConversation],
    enabled: !!selectedConversation,
  });

  const createConversation = useMutation({
    mutationFn: async (title: string) => {
      const res = await apiRequest("POST", "/api/conversations", { title });
      return res.json() as Promise<Conversation>;
    },
    onSuccess: (newConversation: Conversation) => {
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
      setSelectedConversation(newConversation.id);
    },
  });

  const deleteConversation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/conversations/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
      if (selectedConversation) {
        setSelectedConversation(null);
      }
    },
  });

  const renameConversation = useMutation({
    mutationFn: async ({ id, title }: { id: number; title: string }) => {
      const res = await apiRequest("PATCH", `/api/conversations/${id}`, { title });
      return res.json() as Promise<Conversation>;
    },
    onMutate: ({ id, title }) => {
      queryClient.setQueryData<Conversation[]>(["/api/conversations"], (old) =>
        old ? old.map((c) => (c.id === id ? { ...c, title } : c)) : old
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
    },
    onError: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
    },
  });

  const startRename = (conv: Conversation, e: React.MouseEvent) => {
    e.stopPropagation();
    setRenamingId(conv.id);
    setRenameValue(conv.title);
    setTimeout(() => renameInputRef.current?.select(), 0);
  };

  const commitRename = (id: number) => {
    const trimmed = renameValue.trim();
    if (trimmed && trimmed !== conversations.find((c) => c.id === id)?.title) {
      renameConversation.mutate({ id, title: trimmed });
    }
    setRenamingId(null);
  };

  const cancelRename = () => setRenamingId(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [currentConversation?.messages, streamingMessage]);

  const handleSendMessage = async () => {
    if (!inputMessage.trim() || isStreaming) return;

    let conversationId = selectedConversation;

    if (!conversationId) {
      const newConversation = await createConversation.mutateAsync(
        inputMessage.slice(0, 50) + (inputMessage.length > 50 ? "..." : "")
      );
      conversationId = newConversation.id;
      // Seed the cache so the optimistic update below always has an entry to attach to
      queryClient.setQueryData<Conversation>(
        ["/api/conversations", conversationId],
        { ...newConversation, messages: [] }
      );
    }

    const userMessage = inputMessage;
    setInputMessage("");
    setIsStreaming(true);
    setStreamingMessage("");

    queryClient.setQueryData<Conversation>(
      ["/api/conversations", conversationId],
      (old) => {
        const base = old ?? { id: conversationId!, title: "", createdAt: new Date().toISOString(), messages: [] };
        return {
          ...base,
          messages: [
            ...(base.messages || []),
            {
              id: Date.now(),
              conversationId,
              role: "user" as const,
              content: userMessage,
              createdAt: new Date().toISOString(),
            },
          ],
        };
      }
    );

    try {
      const response = await fetch(`/api/conversations/${conversationId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: userMessage }),
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (reader) {
        let fullResponse = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const text = decoder.decode(value);
          const lines = text.split("\n");

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              try {
                const data = JSON.parse(line.slice(6));
                if (data.content) {
                  fullResponse += data.content;
                  setStreamingMessage(fullResponse);
                }
                if (data.done) {
                  queryClient.invalidateQueries({ queryKey: ["/api/conversations", conversationId] });
                }
              } catch {
              }
            }
          }
        }
      }
    } catch (error) {
      console.error("Error sending message:", error);
    } finally {
      setIsStreaming(false);
      setStreamingMessage("");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleNewChat = () => {
    setSelectedConversation(null);
    setInputMessage("");
  };

  const messages = currentConversation?.messages || [];

  const suggestedPrompts = [
    { icon: Plane, text: "Plan a romantic getaway to Bali" },
    { icon: MapPin, text: "Best destinations for a winter wedding" },
    { icon: Calendar, text: "Create an itinerary for Tokyo in spring" },
    { icon: Sparkles, text: "Surprise anniversary trip ideas" },
  ];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="container mx-auto px-4 py-6 max-w-7xl">
        <div className="mb-6">
          <Button
            variant="ghost"
            onClick={() => setLocation("/dashboard")}
            className="mb-4 text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
            data-testid="button-back-dashboard"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Dashboard
          </Button>
          <div className="flex items-center gap-3">
            <div className="p-3 bg-primary rounded-lg">
              <Bot className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white">
                AI Travel Assistant
              </h1>
              <p className="text-gray-600 dark:text-gray-400">
                Your personal travel planning companion
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 h-[calc(100vh-200px)]">
          <Card className="lg:col-span-1 bg-white dark:bg-gray-800 rounded-lg shadow-md border border-gray-200 dark:border-gray-700">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-lg">Conversations</CardTitle>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleNewChat}
                  data-testid="button-new-chat"
                >
                  <Plus className="w-4 h-4 mr-1" />
                  New
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-3 pt-0">
              <ScrollArea className="h-[calc(100vh-340px)]">
                {loadingConversations ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-gray-600 dark:text-gray-400" />
                  </div>
                ) : conversations.length === 0 ? (
                  <div className="text-center py-8 text-gray-600 dark:text-gray-400">
                    <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No conversations yet</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {conversations.map((conv) => (
                      <div
                        key={conv.id}
                        className={cn(
                          "p-3 rounded-lg transition-all group flex items-center justify-between gap-2",
                          renamingId === conv.id
                            ? "bg-muted"
                            : selectedConversation === conv.id
                            ? "bg-primary/10 border border-primary/20 cursor-pointer"
                            : "hover:bg-muted cursor-pointer"
                        )}
                        onClick={() => renamingId !== conv.id && setSelectedConversation(conv.id)}
                        data-testid={`card-conversation-${conv.id}`}
                      >
                        <div className="flex-1 min-w-0">
                          {renamingId === conv.id ? (
                            <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                              <Input
                                ref={renameInputRef}
                                value={renameValue}
                                onChange={(e) => setRenameValue(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") commitRename(conv.id);
                                  if (e.key === "Escape") cancelRename();
                                }}
                                onBlur={() => commitRename(conv.id)}
                                className="h-7 text-sm px-2 py-0"
                                autoFocus
                                data-testid={`input-rename-conversation-${conv.id}`}
                              />
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-6 w-6 flex-shrink-0 text-green-600 hover:text-green-700"
                                onMouseDown={(e) => { e.preventDefault(); commitRename(conv.id); }}
                                data-testid={`button-confirm-rename-${conv.id}`}
                              >
                                <Check className="w-3 h-3" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-6 w-6 flex-shrink-0"
                                onMouseDown={(e) => { e.preventDefault(); cancelRename(); }}
                                data-testid={`button-cancel-rename-${conv.id}`}
                              >
                                <X className="w-3 h-3" />
                              </Button>
                            </div>
                          ) : (
                            <>
                              <p className="text-sm font-medium truncate">{conv.title}</p>
                              <p className="text-xs text-gray-600 dark:text-gray-400">
                                {new Date(conv.createdAt).toLocaleDateString()}
                              </p>
                            </>
                          )}
                        </div>
                        {renamingId !== conv.id && (
                          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7"
                              onClick={(e) => startRename(conv, e)}
                              data-testid={`button-rename-conversation-${conv.id}`}
                            >
                              <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7"
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteConversation.mutate(conv.id);
                              }}
                              data-testid={`button-delete-conversation-${conv.id}`}
                            >
                              <Trash2 className="w-3.5 h-3.5 text-destructive" />
                            </Button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>

          <Card className="lg:col-span-3 bg-white dark:bg-gray-800 rounded-lg shadow-md border border-gray-200 dark:border-gray-700 flex flex-col">
            <CardContent className="flex-1 p-4 flex flex-col overflow-hidden">
              <ScrollArea className="flex-1 pr-4">
                {selectedConversation && loadingMessages ? (
                  <div className="flex items-center justify-center h-full">
                    <Loader2 className="w-8 h-8 animate-spin text-gray-500" />
                  </div>
                ) : messages.length === 0 && !streamingMessage && !selectedConversation ? (
                  <div className="h-full flex flex-col items-center justify-center py-12">
                    <div className="text-center mb-8">
                      <Sparkles className="w-16 h-16 mx-auto text-primary mb-4" />
                      <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                        How can I help you today?
                      </h2>
                      <p className="text-gray-600 dark:text-gray-400 max-w-md">
                        I can help you plan trips, find destinations, create itineraries, and more!
                      </p>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 w-full max-w-2xl">
                      {suggestedPrompts.map((prompt, index) => (
                        <button
                          key={index}
                          onClick={() => setInputMessage(prompt.text)}
                          className="p-4 rounded-lg border-2 border-gray-200 dark:border-gray-700 text-left transition-all flex items-center gap-3 hover:border-gray-300 dark:hover:border-gray-600 hover:shadow-md"
                          data-testid={`button-suggestion-${index}`}
                        >
                          <prompt.icon className="w-5 h-5 text-primary flex-shrink-0" />
                          <span className="text-sm text-gray-700 dark:text-gray-300">{prompt.text}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4 py-4">
                    <AnimatePresence mode="popLayout">
                      {messages.map((message) => (
                        <motion.div
                          key={message.id}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className={cn(
                            "flex gap-3",
                            message.role === "user" ? "justify-end" : "justify-start"
                          )}
                        >
                          {message.role === "assistant" && (
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center flex-shrink-0">
                              <Bot className="w-4 h-4 text-white" />
                            </div>
                          )}
                          <div
                            className={cn(
                              "max-w-[80%] p-4 rounded-2xl",
                              message.role === "user"
                                ? "bg-primary text-primary-foreground"
                                : "bg-muted"
                            )}
                          >
                            <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                          </div>
                          {message.role === "user" && (
                            <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-600 flex items-center justify-center flex-shrink-0">
                              <User className="w-4 h-4" />
                            </div>
                          )}
                        </motion.div>
                      ))}
                    </AnimatePresence>

                    {streamingMessage && (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex gap-3 justify-start"
                      >
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center flex-shrink-0">
                          <Bot className="w-4 h-4 text-white" />
                        </div>
                        <div className="max-w-[80%] p-4 rounded-2xl bg-muted">
                          <p className="text-sm whitespace-pre-wrap">{streamingMessage}</p>
                          <span className="inline-block w-2 h-4 bg-primary animate-pulse ml-1" />
                        </div>
                      </motion.div>
                    )}
                    <div ref={messagesEndRef} />
                  </div>
                )}
              </ScrollArea>

              <div className="pt-4 border-t border-border mt-4">
                <div className="flex gap-3">
                  <Textarea
                    ref={textareaRef}
                    value={inputMessage}
                    onChange={(e) => setInputMessage(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Ask me about your travel plans..."
                    className="resize-none min-h-[60px] max-h-[120px]"
                    disabled={isStreaming}
                    data-testid="input-message"
                  />
                  <Button
                    size="lg"
                    onClick={handleSendMessage}
                    disabled={!inputMessage.trim() || isStreaming}
                    className="px-6"
                    data-testid="button-send-message"
                  >
                    {isStreaming ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <Send className="w-5 h-5" />
                    )}
                  </Button>
                </div>
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-2 text-center">
                  AI assistant powered by Claude. Responses are for planning purposes only.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
