import { useChats, useSendMessage } from "@/hooks/use-chat";
import { useAuth } from "@/hooks/use-auth";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, Loader2, MessageSquare } from "lucide-react";
import { format } from "date-fns";
import { Card } from "@/components/ui/card";

export default function Chat() {
  const { user } = useAuth();
  const { data: chats, isLoading } = useChats();
  const sendMessage = useSendMessage();
  const [message, setMessage] = useState("");

  const handleSend = () => {
    if (!message.trim()) return;
    sendMessage.mutate(
      { message, senderId: user?.id }, // Simplified, real schema might need receiverId etc.
      {
        onSuccess: () => setMessage(""),
      }
    );
  };

  if (isLoading) return <div className="flex justify-center p-12"><Loader2 className="animate-spin" /></div>;

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl h-[calc(100vh-80px)] flex flex-col">
      <div className="mb-6">
        <h1 className="text-2xl font-bold font-display">Expert Chat</h1>
        <p className="text-slate-500">Connect with local experts for your trips.</p>
      </div>

      <Card className="flex-1 flex flex-col overflow-hidden bg-white shadow-xl border-0">
        <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-slate-50/50">
          {chats && chats.length > 0 ? (
            chats.map((chat) => (
              <div
                key={chat.id}
                className={`flex ${chat.senderId === user?.id ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`
                    max-w-[70%] rounded-2xl p-4 shadow-sm
                    ${chat.senderId === user?.id 
                      ? 'bg-primary text-white rounded-tr-none' 
                      : 'bg-white text-slate-800 border border-gray-100 rounded-tl-none'}
                  `}
                >
                  <p>{chat.message}</p>
                  <div className={`text-xs mt-2 ${chat.senderId === user?.id ? 'text-white/70' : 'text-slate-400'}`}>
                    {chat.createdAt && format(new Date(chat.createdAt), "h:mm a")}
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-slate-400">
              <MessageSquare className="w-12 h-12 mb-4 opacity-20" />
              <p>No messages yet. Start a conversation!</p>
            </div>
          )}
        </div>

        <div className="p-4 bg-white border-t border-gray-100">
          <form 
            onSubmit={(e) => { e.preventDefault(); handleSend(); }}
            className="flex gap-4"
          >
            <Input
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Type your message..."
              className="flex-1 rounded-full bg-gray-50 border-gray-200 focus:bg-white transition-all"
            />
            <Button 
              type="submit" 
              disabled={sendMessage.isPending || !message.trim()}
              className="rounded-full w-12 h-12 p-0 flex items-center justify-center shrink-0"
            >
              {sendMessage.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
            </Button>
          </form>
        </div>
      </Card>
    </div>
  );
}
