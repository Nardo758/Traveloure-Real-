import { useState } from "react";
import {
  ArrowLeft, MapPin, Navigation, ExternalLink, Route, Map,
  Clock, DollarSign, Footprints, Car, TrainFront, Check, X,
  ArrowRight, Ticket, Building2, ChevronRight,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  DAYS, DAY_COLORS, MODE_COLORS, STATUS_STYLES,
  formatDuration, buildMapsUrl, buildAppleMapsUrl,
  type Transport,
} from "./shared-data";

function ModeIcon({ mode, className = "w-4 h-4", style }: { mode: string; className?: string; style?: React.CSSProperties }) {
  if (mode === "walk") return <Footprints className={className} style={style} />;
  if (mode === "taxi" || mode === "car") return <Car className={className} style={style} />;
  if (mode === "ferry" || mode === "bus") return <TrainFront className={className} style={style} />;
  return <Footprints className={className} style={style} />;
}

function buildWazeUrl(lat?: number, lng?: number) {
  if (lat && lng) return `https://www.waze.com/ul?ll=${lat},${lng}&navigate=yes`;
  return null;
}

function NavigateDropdown({ location, lat, lng }: { location: string; lat?: number; lng?: number }) {
  const [open, setOpen] = useState(false);
  const wazeUrl = buildWazeUrl(lat, lng);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 text-[12px] font-semibold text-blue-600 bg-blue-50 border border-blue-200 px-3 py-1.5 rounded-lg hover:bg-blue-100 transition-colors"
        data-testid="navigate-button"
      >
        <Navigation className="w-3.5 h-3.5" /> Navigate
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-20 bg-white border border-gray-200 rounded-xl shadow-xl py-1.5 w-44">
            <a href={buildMapsUrl(location, lat, lng)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2.5 px-3 py-2 hover:bg-gray-50 text-[12px] text-gray-800 font-medium">
              <div className="w-5 h-5 rounded bg-blue-100 flex items-center justify-center"><MapPin className="w-3 h-3 text-blue-600" /></div>
              Google Maps
              <ExternalLink className="w-3 h-3 text-gray-400 ml-auto" />
            </a>
            <a href={buildAppleMapsUrl(location, lat, lng)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2.5 px-3 py-2 hover:bg-gray-50 text-[12px] text-gray-800 font-medium">
              <div className="w-5 h-5 rounded bg-gray-100 flex items-center justify-center"><Map className="w-3 h-3 text-gray-600" /></div>
              Apple Maps
              <ExternalLink className="w-3 h-3 text-gray-400 ml-auto" />
            </a>
            {wazeUrl && (
              <a href={wazeUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2.5 px-3 py-2 hover:bg-gray-50 text-[12px] text-gray-800 font-medium">
                <div className="w-5 h-5 rounded bg-cyan-100 flex items-center justify-center"><Route className="w-3 h-3 text-cyan-600" /></div>
                Waze
                <ExternalLink className="w-3 h-3 text-gray-400 ml-auto" />
              </a>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function RoutePlaceholder({ from, to, mode }: { from: string; to: string; mode: string }) {
  const modeColor = MODE_COLORS[mode] || "#6b7280";
  return (
    <div className="relative w-full h-40 rounded-xl overflow-hidden border border-gray-200 bg-gradient-to-br from-blue-50 via-cyan-50 to-emerald-50">
      <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
        {Array.from({ length: 11 }).map((_, i) => (
          <line key={`h${i}`} x1="0" y1={i * 10} x2="100" y2={i * 10} stroke="#e5e7eb" strokeWidth="0.3" />
        ))}
        {Array.from({ length: 11 }).map((_, i) => (
          <line key={`v${i}`} x1={i * 10} y1="0" x2={i * 10} y2="100" stroke="#e5e7eb" strokeWidth="0.3" />
        ))}
        <path d="M 20 70 Q 50 20, 80 50" fill="none" stroke={modeColor} strokeWidth="1.2" strokeDasharray="3,2" opacity="0.7" />
      </svg>
      <div className="absolute" style={{ left: "20%", top: "70%", transform: "translate(-50%, -50%)" }}>
        <div className="w-5 h-5 rounded-full bg-green-500 border-2 border-white shadow flex items-center justify-center">
          <span className="text-white text-[8px] font-bold">A</span>
        </div>
      </div>
      <div className="absolute" style={{ left: "80%", top: "50%", transform: "translate(-50%, -50%)" }}>
        <div className="w-5 h-5 rounded-full bg-red-500 border-2 border-white shadow flex items-center justify-center">
          <span className="text-white text-[8px] font-bold">B</span>
        </div>
      </div>
      <div className="absolute bottom-2 left-2 bg-white/80 backdrop-blur-sm rounded-lg px-2 py-1 text-[10px] text-gray-500 font-medium">
        Route Preview
      </div>
    </div>
  );
}

const SAMPLE_TRANSPORT = DAYS[0].transports[1];

export function TransportDetailPage() {
  const transport = SAMPLE_TRANSPORT;
  const statusStyle = STATUS_STYLES[transport.status] || STATUS_STYLES.confirmed;
  const modeColor = MODE_COLORS[transport.mode] || "#6b7280";

  return (
    <div className="min-h-screen bg-gray-50 font-['Inter',sans-serif]">
      <div className="sticky top-0 z-30 bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3">
        <button className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center" data-testid="button-back">
          <ArrowLeft className="w-4 h-4 text-gray-600" />
        </button>
        <div className="flex-1">
          <h1 className="text-[15px] font-bold text-gray-900">Transport Details</h1>
          <p className="text-[11px] text-gray-500">Day 1 — Arrival Day</p>
        </div>
      </div>

      <div className="px-4 pt-4 pb-3">
        <Card className="overflow-hidden">
          <div className="p-4">
            <div className="flex items-center gap-3 mb-4">
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center"
                style={{ backgroundColor: `${modeColor}15` }}
              >
                <ModeIcon mode={transport.mode} className="w-6 h-6" style={{ color: modeColor }} />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[15px] font-bold text-gray-900 capitalize">{transport.mode}</span>
                  <Badge className={`${statusStyle.bg} ${statusStyle.fg} border-0 text-[10px]`}>
                    {statusStyle.label}
                  </Badge>
                </div>
                {transport.operator && (
                  <div className="flex items-center gap-1.5 mt-0.5 text-[12px] text-gray-500">
                    <Building2 className="w-3 h-3" /> {transport.operator}
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-3 mb-4">
              <div className="flex flex-col items-center">
                <div className="w-3 h-3 rounded-full bg-green-500 border-2 border-white shadow" />
                <div className="w-0.5 h-10 bg-gray-200" />
                <div className="w-3 h-3 rounded-full bg-red-500 border-2 border-white shadow" />
              </div>
              <div className="flex-1 space-y-3">
                <div>
                  <div className="text-[12px] font-semibold text-gray-900" data-testid="text-from">{transport.from}</div>
                  {transport.departureTime && (
                    <div className="text-[11px] text-gray-500 flex items-center gap-1">
                      <Clock className="w-3 h-3" /> Depart {transport.departureTime}
                    </div>
                  )}
                </div>
                <div>
                  <div className="text-[12px] font-semibold text-gray-900" data-testid="text-to">{transport.to}</div>
                  {transport.arrivalTime && (
                    <div className="text-[11px] text-gray-500 flex items-center gap-1">
                      <Clock className="w-3 h-3" /> Arrive {transport.arrivalTime}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="bg-gray-50 rounded-lg p-2.5 text-center">
                <div className="text-[10px] text-gray-500 mb-0.5">Duration</div>
                <div className="text-[14px] font-bold text-gray-900" data-testid="text-duration">{formatDuration(transport.duration)}</div>
              </div>
              <div className="bg-gray-50 rounded-lg p-2.5 text-center">
                <div className="text-[10px] text-gray-500 mb-0.5">Distance</div>
                <div className="text-[14px] font-bold text-gray-900" data-testid="text-distance">{transport.distance || "—"}</div>
              </div>
              <div className="bg-gray-50 rounded-lg p-2.5 text-center">
                <div className="text-[10px] text-gray-500 mb-0.5">Cost</div>
                <div className="text-[14px] font-bold text-gray-900" data-testid="text-cost">
                  {transport.cost > 0 ? `$${transport.cost}` : "Free"}
                </div>
              </div>
            </div>

            {transport.line && (
              <div className="flex items-center gap-2 mb-3 text-[12px] text-gray-600">
                <Route className="w-3.5 h-3.5 text-gray-400" />
                <span className="font-medium">Line:</span> {transport.line}
              </div>
            )}

            {transport.bookingRef && (
              <div className="flex items-center gap-2 mb-3 text-[12px] text-gray-600">
                <Ticket className="w-3.5 h-3.5 text-gray-400" />
                <span className="font-medium">Booking Ref:</span>
                <span className="font-mono text-[11px] bg-gray-100 px-2 py-0.5 rounded" data-testid="text-booking-ref">{transport.bookingRef}</span>
              </div>
            )}
          </div>
        </Card>
      </div>

      <div className="px-4 pb-3">
        <h2 className="text-[13px] font-bold text-gray-900 mb-2">Route Map</h2>
        <RoutePlaceholder from={transport.from} to={transport.to} mode={transport.mode} />
      </div>

      {transport.alternatives && transport.alternatives.length > 0 && (
        <div className="px-4 pb-3">
          <h2 className="text-[13px] font-bold text-gray-900 mb-2">Alternative Options</h2>
          <div className="space-y-2">
            {transport.alternatives.map((alt, i) => {
              const altColor = MODE_COLORS[alt.mode] || "#6b7280";
              return (
                <Card key={i} className="p-3">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: `${altColor}15` }}
                    >
                      <ModeIcon mode={alt.mode} className="w-4 h-4" style={{ color: altColor }} />
                    </div>
                    <div className="flex-1">
                      <div className="text-[12px] font-semibold text-gray-900 capitalize" data-testid={`text-alt-mode-${i}`}>{alt.mode}</div>
                      <div className="flex items-center gap-3 text-[11px] text-gray-500">
                        <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{formatDuration(alt.duration)}</span>
                        <span className="flex items-center gap-1"><DollarSign className="w-3 h-3" />{alt.cost > 0 ? `$${alt.cost}` : "Free"}</span>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      {alt.duration < transport.duration && (
                        <span className="text-[9px] text-green-700 bg-green-100 px-1.5 py-0.5 rounded-full font-medium">
                          {formatDuration(transport.duration - alt.duration)} faster
                        </span>
                      )}
                      {alt.cost < transport.cost && (
                        <span className="text-[9px] text-green-700 bg-green-100 px-1.5 py-0.5 rounded-full font-medium">
                          ${transport.cost - alt.cost} cheaper
                        </span>
                      )}
                      {alt.duration > transport.duration && (
                        <span className="text-[9px] text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded-full font-medium">
                          +{formatDuration(alt.duration - transport.duration)}
                        </span>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {transport.suggestedBy && (
        <div className="px-4 pb-3">
          <h2 className="text-[13px] font-bold text-gray-900 mb-2">Suggested Change</h2>
          <Card className="p-3 border-indigo-200 bg-indigo-50/30">
            <div className="text-[12px] text-gray-700 mb-3">
              This transport was suggested by your <span className="font-semibold text-indigo-700">{transport.suggestedBy}</span>.
              Would you like to accept or change it?
            </div>
            <div className="flex gap-2">
              <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white text-[12px] flex-1 gap-1" data-testid="button-accept">
                <Check className="w-3.5 h-3.5" /> Accept
              </Button>
              <Button size="sm" variant="outline" className="text-[12px] flex-1 gap-1" data-testid="button-change">
                <X className="w-3.5 h-3.5" /> Change
              </Button>
            </div>
          </Card>
        </div>
      )}

      <div className="px-4 pb-6">
        <NavigateDropdown location={transport.to} />
      </div>
    </div>
  );
}
