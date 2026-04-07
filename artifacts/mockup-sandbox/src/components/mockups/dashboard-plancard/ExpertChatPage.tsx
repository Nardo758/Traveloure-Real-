import {
  ArrowLeft, Star, Clock, Globe, MessageSquare, Send, Lightbulb,
  MapPin, Calendar, Filter,
} from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  EXPERT_PROFILE, CHAT_MESSAGES, EXPERT_NOTES, TRIP, DAY_COLORS,
  type ExpertNote,
} from "./shared-data";

const TAG_COLORS: Record<string, { bg: string; fg: string }> = {
  Accommodation: { bg: "bg-purple-100", fg: "text-purple-700" },
  Activities: { bg: "bg-blue-100", fg: "text-blue-700" },
  Logistics: { bg: "bg-amber-100", fg: "text-amber-700" },
  Transport: { bg: "bg-cyan-100", fg: "text-cyan-700" },
  Dining: { bg: "bg-rose-100", fg: "text-rose-700" },
};

function ExpertProfileCard() {
  return (
    <Card className="mx-4 mt-4 mb-3 overflow-hidden">
      <div className="p-4">
        <div className="flex items-start gap-3">
          <div className="w-14 h-14 rounded-full bg-purple-200 flex items-center justify-center text-lg font-bold text-purple-800 flex-shrink-0">
            {EXPERT_PROFILE.initials}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-[15px] font-bold text-gray-900" data-testid="text-expert-name">{EXPERT_PROFILE.name}</h3>
              <div className="flex items-center gap-1">
                <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                <span className="text-[12px] font-bold text-gray-800">{EXPERT_PROFILE.rating}</span>
                <span className="text-[11px] text-gray-500">({EXPERT_PROFILE.reviews})</span>
              </div>
            </div>
            <p className="text-[12px] text-gray-500 mt-0.5">{EXPERT_PROFILE.title}</p>
            <div className="flex items-center gap-3 mt-1.5 flex-wrap">
              <span className="text-[11px] text-gray-500 flex items-center gap-1">
                <MapPin className="w-3 h-3" /> {EXPERT_PROFILE.trips} trips guided
              </span>
              <span className="text-[11px] text-gray-500 flex items-center gap-1">
                <Clock className="w-3 h-3" /> {EXPERT_PROFILE.responseTime}
              </span>
              <span className="text-[11px] text-gray-500 flex items-center gap-1">
                <Globe className="w-3 h-3" /> {EXPERT_PROFILE.languages.join(", ")}
              </span>
            </div>
          </div>
        </div>
        <p className="text-[12px] text-gray-600 mt-3 leading-relaxed">{EXPERT_PROFILE.bio}</p>
        <div className="flex flex-wrap gap-1.5 mt-3">
          {EXPERT_PROFILE.specialties.map(s => (
            <Badge key={s} variant="secondary" className="text-[10px] font-medium" data-testid={`badge-specialty-${s}`}>
              {s}
            </Badge>
          ))}
        </div>
      </div>
    </Card>
  );
}

function ChatThread() {
  const [message, setMessage] = useState("");

  return (
    <div className="mx-4 mb-3">
      <div className="flex items-center gap-2 mb-3">
        <MessageSquare className="w-4 h-4 text-gray-500" />
        <h4 className="text-[13px] font-bold text-gray-800">Chat</h4>
        <span className="text-[11px] text-gray-400">{CHAT_MESSAGES.length} messages</span>
      </div>
      <div className="space-y-3 mb-3">
        {CHAT_MESSAGES.map(msg => {
          const isExpert = msg.sender === "expert";
          return (
            <div key={msg.id} className={`flex ${isExpert ? "justify-start" : "justify-end"}`} data-testid={`chat-message-${msg.id}`}>
              <div className={`max-w-[85%] ${isExpert ? "order-2" : "order-1"}`}>
                {isExpert && (
                  <div className="flex items-center gap-1.5 mb-1">
                    <div className="w-5 h-5 rounded-full bg-purple-200 flex items-center justify-center text-[8px] font-bold text-purple-800">SC</div>
                    <span className="text-[10px] font-semibold text-purple-700">Sofia Chen</span>
                    <span className="text-[10px] text-gray-400">{msg.when}</span>
                  </div>
                )}
                <div className={`rounded-2xl px-3.5 py-2.5 text-[12px] leading-relaxed ${
                  isExpert
                    ? "bg-white border border-gray-200 text-gray-800 rounded-tl-md"
                    : "bg-blue-600 text-white rounded-tr-md"
                }`}>
                  {msg.message}
                </div>
                {!isExpert && (
                  <div className="text-right mt-1">
                    <span className="text-[10px] text-gray-400">{msg.when}</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2">
        <input
          type="text"
          value={message}
          onChange={e => setMessage(e.target.value)}
          placeholder="Type a message..."
          className="flex-1 bg-transparent text-[13px] text-gray-800 placeholder-gray-400 outline-none"
          data-testid="input-chat-message"
        />
        <Button size="icon" variant="default" className="rounded-full w-8 h-8" data-testid="button-send-message">
          <Send className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  );
}

function ExpertNotesSection() {
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const allTags = [...new Set(EXPERT_NOTES.map(n => n.topicTag).filter(Boolean))] as string[];

  const filtered = activeTag
    ? EXPERT_NOTES.filter(n => n.topicTag === activeTag)
    : EXPERT_NOTES;

  const grouped: Record<number, ExpertNote[]> = {};
  filtered.forEach(note => {
    const day = note.dayRef || 0;
    if (!grouped[day]) grouped[day] = [];
    grouped[day].push(note);
  });

  return (
    <div className="mx-4 mb-4">
      <div className="flex items-center gap-2 mb-3">
        <Lightbulb className="w-4 h-4 text-amber-500" />
        <h4 className="text-[13px] font-bold text-gray-800">Expert Notes</h4>
        <span className="text-[11px] text-gray-400">{EXPERT_NOTES.length} notes</span>
      </div>

      <div className="flex items-center gap-1.5 mb-3 overflow-x-auto pb-1">
        <button
          onClick={() => setActiveTag(null)}
          className={`flex-shrink-0 px-2.5 py-1 rounded-full text-[11px] font-semibold transition-colors ${
            activeTag === null ? "bg-gray-800 text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"
          }`}
          data-testid="button-filter-all"
        >
          All
        </button>
        {allTags.map(tag => {
          const colors = TAG_COLORS[tag] || { bg: "bg-gray-100", fg: "text-gray-600" };
          return (
            <button
              key={tag}
              onClick={() => setActiveTag(tag === activeTag ? null : tag)}
              className={`flex-shrink-0 px-2.5 py-1 rounded-full text-[11px] font-semibold transition-colors ${
                activeTag === tag ? `${colors.bg} ${colors.fg}` : "bg-gray-100 text-gray-500 hover:bg-gray-200"
              }`}
              data-testid={`button-filter-${tag}`}
            >
              {tag}
            </button>
          );
        })}
      </div>

      <div className="space-y-3">
        {Object.entries(grouped).sort(([a], [b]) => Number(a) - Number(b)).map(([dayNum, notes]) => (
          <div key={dayNum}>
            {Number(dayNum) > 0 && (
              <div className="flex items-center gap-2 mb-2">
                <div
                  className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white"
                  style={{ backgroundColor: DAY_COLORS[(Number(dayNum) - 1) % DAY_COLORS.length] }}
                >
                  {dayNum}
                </div>
                <span className="text-[11px] font-semibold text-gray-600">Day {dayNum}</span>
              </div>
            )}
            <div className="space-y-2 ml-1">
              {notes.map(note => (
                <Card key={note.id} className="p-3" data-testid={`note-card-${note.id}`}>
                  <div className="flex items-start gap-2.5">
                    <div className="w-7 h-7 rounded-full bg-purple-200 flex items-center justify-center text-[9px] font-bold text-purple-800 flex-shrink-0 mt-0.5">
                      {note.initials}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[11px] font-semibold text-gray-800">{note.who}</span>
                        <span className="text-[10px] text-gray-400">{note.when}</span>
                        {note.topicTag && (
                          <Badge variant="secondary" className="text-[9px] px-1.5 py-0" data-testid={`badge-topic-${note.topicTag}`}>
                            {note.topicTag}
                          </Badge>
                        )}
                      </div>
                      <p className="text-[12px] text-gray-700 mt-1 leading-relaxed">{note.message}</p>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ExpertChatPage() {
  return (
    <div className="w-full min-h-screen bg-gray-50" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      <div className="sticky top-0 z-30 bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3">
        <button className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors" data-testid="button-back">
          <ArrowLeft className="w-4 h-4 text-gray-600" />
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="text-[14px] font-bold text-gray-900" data-testid="text-page-title">Expert Chat</h2>
          <p className="text-[11px] text-gray-500 truncate">{TRIP.title} · {EXPERT_PROFILE.name}</p>
        </div>
        <div className="w-8 h-8 rounded-full bg-purple-200 flex items-center justify-center text-[10px] font-bold text-purple-800">
          {EXPERT_PROFILE.initials}
        </div>
      </div>

      <ExpertProfileCard />
      <ChatThread />

      <div className="mx-4 my-3 border-t border-gray-200" />

      <ExpertNotesSection />
    </div>
  );
}
