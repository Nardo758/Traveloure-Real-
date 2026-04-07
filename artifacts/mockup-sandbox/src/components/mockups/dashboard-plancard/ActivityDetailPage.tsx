import { useState } from "react";
import {
  ArrowLeft, Clock, MapPin, Star, Navigation, ExternalLink, Map,
  Route, Phone, Globe, Lightbulb, MessageSquare, Footprints, Car,
  TrainFront, DollarSign, Hash, ChevronDown,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  DAYS, TRIP, TYPE_COLORS, STATUS_STYLES, MODE_COLORS,
  formatDuration, buildMapsUrl, buildAppleMapsUrl,
  type Activity, type Transport,
} from "./shared-data";

function buildWazeUrl(lat?: number, lng?: number) {
  if (lat && lng) return `https://www.waze.com/ul?ll=${lat},${lng}&navigate=yes`;
  return null;
}

function ModeIcon({ mode, className = "w-4 h-4" }: { mode: string; className?: string }) {
  if (mode === "walk") return <Footprints className={className} />;
  if (mode === "taxi" || mode === "car") return <Car className={className} />;
  if (mode === "ferry") return <TrainFront className={className} />;
  if (mode === "bus") return <TrainFront className={className} />;
  return <Footprints className={className} />;
}

const SAMPLE_ACTIVITY = DAYS[0].activities[0];

const RELATED_TRANSPORTS: { direction: "to" | "from"; transport: Transport }[] = [];
for (const day of DAYS) {
  for (const t of day.transports) {
    if (t.to.toLowerCase().includes("golden gate") || t.from.toLowerCase().includes("golden gate")) {
      RELATED_TRANSPORTS.push({
        direction: t.to.toLowerCase().includes("golden gate") ? "to" : "from",
        transport: t,
      });
    }
  }
}

const SAMPLE_COMMENTS = [
  { id: "cmt1", author: "You", initials: "YO", message: "Should we bring jackets? Heard it can be windy.", when: "1 day ago" },
  { id: "cmt2", author: "Sofia Chen", initials: "SC", message: "Definitely! Layers are a must. The wind picks up especially in the morning. A windbreaker is ideal.", when: "1 day ago" },
];

function NavigateSection({ activity }: { activity: Activity }) {
  const wazeUrl = buildWazeUrl(activity.lat, activity.lng);

  return (
    <Card className="p-4" data-testid="navigate-section">
      <h3 className="text-[13px] font-bold text-gray-900 mb-3 flex items-center gap-2">
        <Navigation className="w-4 h-4 text-blue-600" />
        Navigate
      </h3>
      <div className="space-y-2">
        <a
          href={buildMapsUrl(activity.location, activity.lat, activity.lng)}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-gray-50 hover:bg-gray-100 transition-colors"
          data-testid="link-google-maps"
        >
          <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
            <MapPin className="w-4 h-4 text-blue-600" />
          </div>
          <span className="text-[13px] font-semibold text-gray-800 flex-1">Google Maps</span>
          <ExternalLink className="w-3.5 h-3.5 text-gray-400" />
        </a>
        <a
          href={buildAppleMapsUrl(activity.location, activity.lat, activity.lng)}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-gray-50 hover:bg-gray-100 transition-colors"
          data-testid="link-apple-maps"
        >
          <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center">
            <Map className="w-4 h-4 text-gray-600" />
          </div>
          <span className="text-[13px] font-semibold text-gray-800 flex-1">Apple Maps</span>
          <ExternalLink className="w-3.5 h-3.5 text-gray-400" />
        </a>
        {wazeUrl && (
          <a
            href={wazeUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-gray-50 hover:bg-gray-100 transition-colors"
            data-testid="link-waze"
          >
            <div className="w-8 h-8 rounded-lg bg-cyan-100 flex items-center justify-center">
              <Route className="w-4 h-4 text-cyan-600" />
            </div>
            <span className="text-[13px] font-semibold text-gray-800 flex-1">Waze</span>
            <ExternalLink className="w-3.5 h-3.5 text-gray-400" />
          </a>
        )}
      </div>
    </Card>
  );
}

export function ActivityDetailPage() {
  const activity = SAMPLE_ACTIVITY;
  const typeStyle = TYPE_COLORS[activity.type] || { bg: "bg-gray-100", fg: "text-gray-800", dot: "#6b7280" };
  const statusStyle = STATUS_STYLES[activity.status] || STATUS_STYLES.confirmed;

  return (
    <div className="min-h-screen bg-gray-50" data-testid="activity-detail-page">
      <div className="relative">
        {activity.imageUrl ? (
          <div className="h-52 relative overflow-hidden">
            <img src={activity.imageUrl} alt={activity.name} className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
          </div>
        ) : (
          <div className="h-36 bg-gradient-to-br from-blue-500 to-indigo-600" />
        )}
        <div className="absolute top-3 left-3">
          <button className="w-8 h-8 rounded-lg bg-white/90 backdrop-blur-sm flex items-center justify-center hover:bg-white transition-colors shadow-sm" data-testid="button-back">
            <ArrowLeft className="w-4 h-4 text-gray-700" />
          </button>
        </div>
        <div className="absolute bottom-4 left-4 right-4">
          <h1 className="font-['DM_Serif_Display',serif] text-[22px] text-white leading-tight drop-shadow-sm">
            {activity.name}
          </h1>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <Badge className={`text-[10px] px-2 py-0.5 border-0 ${typeStyle.bg} ${typeStyle.fg}`}>
              {activity.type}
            </Badge>
            <Badge className={`text-[10px] px-2 py-0.5 border-0 ${statusStyle.bg} ${statusStyle.fg}`}>
              {statusStyle.label}
            </Badge>
            {activity.rating && (
              <span className="flex items-center gap-1 text-[12px] text-white/90 font-semibold">
                <Star className="w-3 h-3 fill-amber-400 text-amber-400" /> {activity.rating}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="p-4 space-y-4">
        <Card className="p-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
                <Clock className="w-4 h-4 text-blue-600" />
              </div>
              <div>
                <div className="text-[11px] text-gray-500">Time</div>
                <div className="text-[13px] font-bold text-gray-900">{activity.time}</div>
              </div>
            </div>
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center">
                <DollarSign className="w-4 h-4 text-emerald-600" />
              </div>
              <div>
                <div className="text-[11px] text-gray-500">Cost</div>
                <div className="text-[13px] font-bold text-gray-900">
                  {activity.cost > 0 ? `$${activity.cost}` : "Free"}
                </div>
              </div>
            </div>
            {activity.duration && (
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center">
                  <Clock className="w-4 h-4 text-amber-600" />
                </div>
                <div>
                  <div className="text-[11px] text-gray-500">Duration</div>
                  <div className="text-[13px] font-bold text-gray-900">{formatDuration(activity.duration)}</div>
                </div>
              </div>
            )}
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center">
                <MapPin className="w-4 h-4 text-purple-600" />
              </div>
              <div>
                <div className="text-[11px] text-gray-500">Location</div>
                <div className="text-[12px] font-semibold text-gray-900 truncate max-w-[120px]">{activity.location}</div>
              </div>
            </div>
          </div>
        </Card>

        {activity.description && (
          <Card className="p-4">
            <h3 className="text-[13px] font-bold text-gray-900 mb-2">Description</h3>
            <p className="text-[12px] text-gray-600 leading-relaxed">{activity.description}</p>
          </Card>
        )}

        {activity.bookingRef && (
          <Card className="p-4">
            <h3 className="text-[13px] font-bold text-gray-900 mb-2 flex items-center gap-2">
              <Hash className="w-4 h-4 text-gray-500" />
              Booking Reference
            </h3>
            <div className="bg-gray-50 rounded-lg px-3 py-2.5 flex items-center gap-2">
              <code className="text-[14px] font-mono font-bold text-blue-700 flex-1">{activity.bookingRef}</code>
            </div>
          </Card>
        )}

        {activity.expertNote && (
          <Card className="p-4 border-purple-200/60 bg-purple-50/30">
            <h3 className="text-[13px] font-bold text-purple-900 mb-2 flex items-center gap-2">
              <Lightbulb className="w-4 h-4 text-purple-500" />
              Expert Note
            </h3>
            <div className="flex gap-2.5">
              <div className="w-7 h-7 rounded-full bg-purple-200 flex items-center justify-center text-[10px] font-bold text-purple-800 flex-shrink-0">SC</div>
              <div>
                <div className="text-[11px] text-purple-600 font-medium">Sofia Chen</div>
                <p className="text-[12px] text-purple-800 leading-relaxed mt-0.5 italic">"{activity.expertNote}"</p>
              </div>
            </div>
          </Card>
        )}

        <NavigateSection activity={activity} />

        {(activity.phone || activity.website) && (
          <Card className="p-4">
            <h3 className="text-[13px] font-bold text-gray-900 mb-3">Contact</h3>
            <div className="space-y-2">
              {activity.phone && (
                <a
                  href={`tel:${activity.phone}`}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-gray-50 hover:bg-gray-100 transition-colors"
                  data-testid="link-phone"
                >
                  <div className="w-8 h-8 rounded-lg bg-green-100 flex items-center justify-center">
                    <Phone className="w-4 h-4 text-green-600" />
                  </div>
                  <span className="text-[13px] font-medium text-gray-800">{activity.phone}</span>
                </a>
              )}
              {activity.website && (
                <a
                  href={activity.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-gray-50 hover:bg-gray-100 transition-colors"
                  data-testid="link-website"
                >
                  <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
                    <Globe className="w-4 h-4 text-blue-600" />
                  </div>
                  <span className="text-[13px] font-medium text-gray-800 flex-1 truncate">{activity.website}</span>
                  <ExternalLink className="w-3.5 h-3.5 text-gray-400" />
                </a>
              )}
            </div>
          </Card>
        )}

        {RELATED_TRANSPORTS.length > 0 && (
          <Card className="p-4">
            <h3 className="text-[13px] font-bold text-gray-900 mb-3">Related Transport</h3>
            <div className="space-y-2">
              {RELATED_TRANSPORTS.map(({ direction, transport }) => {
                const modeColor = MODE_COLORS[transport.mode] || "#6b7280";
                return (
                  <div key={transport.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-gray-50">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: modeColor + "20" }}>
                      <ModeIcon mode={transport.mode} className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[12px] font-semibold text-gray-800">
                        {direction === "to" ? "Arriving from" : "Departing to"}{" "}
                        {direction === "to" ? transport.from : transport.to}
                      </div>
                      <div className="text-[11px] text-gray-500 flex items-center gap-2">
                        <span className="capitalize">{transport.mode}</span>
                        <span>{formatDuration(transport.duration)}</span>
                        {transport.cost > 0 && <span className="font-semibold">${transport.cost}</span>}
                      </div>
                    </div>
                    {transport.status === "suggested" && (
                      <Badge className="text-[9px] px-1.5 py-0 bg-indigo-100 text-indigo-800 border-0">Suggested</Badge>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        <Card className="p-4">
          <h3 className="text-[13px] font-bold text-gray-900 mb-3 flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-gray-500" />
            Comments
            <span className="text-[11px] text-gray-400 font-normal">({SAMPLE_COMMENTS.length})</span>
          </h3>
          <div className="space-y-3">
            {SAMPLE_COMMENTS.map(comment => (
              <div key={comment.id} className="flex gap-2.5">
                <div className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center text-[10px] font-bold text-gray-600 flex-shrink-0">
                  {comment.initials}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[12px] font-semibold text-gray-800">{comment.author}</span>
                    <span className="text-[10px] text-gray-400">{comment.when}</span>
                  </div>
                  <p className="text-[12px] text-gray-600 mt-0.5 leading-relaxed">{comment.message}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <input
              type="text"
              placeholder="Add a comment..."
              className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-[12px] text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-200"
              data-testid="input-comment"
            />
            <Button size="sm" data-testid="button-send-comment">Send</Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
