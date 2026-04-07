import { useState } from "react";
import {
  ArrowLeft, MapPin, Navigation, ExternalLink, Route, Map,
  Clock, DollarSign, Footprints, Car, TrainFront, Check, X,
  ArrowRight, Ticket, Building2, ChevronRight, Ship, Bus, Train,
  CarTaxiFront, KeyRound, Repeat, Star, Sparkles,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  DAYS, DAY_COLORS, MODE_COLORS, STATUS_STYLES, TRANSIT_MODE_META,
  formatDuration, buildMapsUrl, buildAppleMapsUrl,
  type Transport, type TransitOption, type TransitMode,
} from "./shared-data";

function ModeIcon({ mode, className = "w-4 h-4", style }: { mode: string; className?: string; style?: React.CSSProperties }) {
  if (mode === "walk") return <Footprints className={className} style={style} />;
  if (mode === "taxi" || mode === "rideshare") return <CarTaxiFront className={className} style={style} />;
  if (mode === "car") return <Car className={className} style={style} />;
  if (mode === "ferry") return <Ship className={className} style={style} />;
  if (mode === "bus") return <Bus className={className} style={style} />;
  if (mode === "train") return <Train className={className} style={style} />;
  if (mode === "subway") return <TrainFront className={className} style={style} />;
  if (mode === "private_car") return <Car className={className} style={style} />;
  if (mode === "rental_car") return <KeyRound className={className} style={style} />;
  return <Footprints className={className} style={style} />;
}

const MODE_LABELS: Record<string, string> = {
  walk: "Walk", taxi: "Taxi", bus: "Bus", ferry: "Ferry", car: "Car",
  train: "Train", subway: "Subway", rideshare: "Rideshare",
  private_car: "Private Car", rental_car: "Rental Car",
};

const SOURCE_ICONS: Record<string, { label: string; color: string; bg: string }> = {
  google: { label: "Google Maps", color: "text-blue-700", bg: "bg-blue-50" },
  apple: { label: "Apple Maps", color: "text-gray-700", bg: "bg-gray-50" },
  waze: { label: "Waze", color: "text-cyan-700", bg: "bg-cyan-50" },
  platform: { label: "Traveloure", color: "text-sky-700", bg: "bg-sky-50" },
};

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
  const [selectedMode, setSelectedMode] = useState<string>(transport.selectedMode || transport.mode);
  const statusStyle = STATUS_STYLES[transport.status] || STATUS_STYLES.confirmed;

  const currentOption = transport.transitOptions?.find(o => o.mode === selectedMode);
  const displayMode = selectedMode;
  const displayDuration = currentOption?.duration ?? transport.duration;
  const displayCost = currentOption?.cost ?? transport.cost;
  const modeColor = MODE_COLORS[displayMode] || "#6b7280";

  const platformOptions = transport.transitOptions?.filter(o => o.source === "platform") || [];
  const transitOptions = transport.transitOptions?.filter(o => o.source !== "platform") || [];

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
                <ModeIcon mode={displayMode} className="w-6 h-6" style={{ color: modeColor }} />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[15px] font-bold text-gray-900">{MODE_LABELS[displayMode] || displayMode}</span>
                  <Badge className={`${statusStyle.bg} ${statusStyle.fg} border-0 text-[10px]`}>
                    {statusStyle.label}
                  </Badge>
                  {currentOption?.recommended && (
                    <Badge className="bg-green-100 text-green-700 border-0 text-[10px]">
                      <Star className="w-2.5 h-2.5 mr-0.5" /> Recommended
                    </Badge>
                  )}
                  {currentOption?.source === "platform" && (
                    <Badge className="bg-sky-100 text-sky-700 border-0 text-[10px]">
                      <Sparkles className="w-2.5 h-2.5 mr-0.5" /> Traveloure
                    </Badge>
                  )}
                </div>
                {currentOption?.provider && (
                  <div className="flex items-center gap-1.5 mt-0.5 text-[12px] text-gray-500">
                    <Building2 className="w-3 h-3" /> via {currentOption.provider}
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
                <div className="text-[14px] font-bold text-gray-900" data-testid="text-duration">{formatDuration(displayDuration)}</div>
              </div>
              <div className="bg-gray-50 rounded-lg p-2.5 text-center">
                <div className="text-[10px] text-gray-500 mb-0.5">Distance</div>
                <div className="text-[14px] font-bold text-gray-900" data-testid="text-distance">{transport.distance || "—"}</div>
              </div>
              <div className="bg-gray-50 rounded-lg p-2.5 text-center">
                <div className="text-[10px] text-gray-500 mb-0.5">Cost</div>
                <div className="text-[14px] font-bold text-gray-900" data-testid="text-cost">
                  {displayCost > 0 ? `$${displayCost}` : "Free"}
                </div>
              </div>
            </div>

            {currentOption?.notes && (
              <div className="mb-3 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-[11px] text-amber-800 flex items-start gap-2">
                <Sparkles className="w-3 h-3 text-amber-600 mt-0.5 flex-shrink-0" />
                {currentOption.notes}
              </div>
            )}

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
        <RoutePlaceholder from={transport.from} to={transport.to} mode={displayMode} />
      </div>

      {transport.transitOptions && transport.transitOptions.length > 1 && (
        <div className="px-4 pb-3">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-[13px] font-bold text-gray-900 flex items-center gap-1.5">
              <Repeat className="w-3.5 h-3.5 text-gray-500" /> Transit Mode Options
            </h2>
            <span className="text-[11px] text-gray-400">{transport.transitOptions.length} available</span>
          </div>

          {transitOptions.length > 0 && (
            <div className="mb-3">
              <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                <MapPin className="w-3 h-3" /> Maps & Transit
              </div>
              <div className="space-y-1.5">
                {transitOptions.map((opt) => {
                  const optColor = MODE_COLORS[opt.mode] || "#6b7280";
                  const isSelected = selectedMode === opt.mode;
                  const src = SOURCE_ICONS[opt.source];
                  return (
                    <Card
                      key={`transit-${opt.mode}`}
                      className={`p-3 cursor-pointer transition-all hover:shadow-md ${isSelected ? "ring-2 ring-blue-500 bg-blue-50/30" : ""}`}
                      onClick={() => setSelectedMode(opt.mode)}
                      data-testid={`transit-option-${opt.mode}`}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                          style={{ backgroundColor: `${optColor}15` }}
                        >
                          <ModeIcon mode={opt.mode} className="w-4 h-4" style={{ color: optColor }} />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[12px] font-semibold text-gray-900">{opt.label || MODE_LABELS[opt.mode]}</span>
                            {opt.recommended && <span className="text-[8px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-bold">REC</span>}
                          </div>
                          <div className="flex items-center gap-3 text-[11px] text-gray-500 mt-0.5">
                            <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{formatDuration(opt.duration)}</span>
                            <span className="flex items-center gap-1"><DollarSign className="w-3 h-3" />{opt.cost > 0 ? `$${opt.cost}` : "Free"}</span>
                            {opt.provider && <span className="text-gray-400">via {opt.provider}</span>}
                          </div>
                          {opt.notes && <div className="text-[10px] text-gray-400 mt-0.5">{opt.notes}</div>}
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          {src && <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded ${src.bg} ${src.color}`}>{src.label}</span>}
                          {isSelected && <Check className="w-4 h-4 text-blue-600" />}
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            </div>
          )}

          {platformOptions.length > 0 && (
            <div className="mb-3">
              <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-sky-500" /> Traveloure Services
              </div>
              <div className="space-y-1.5">
                {platformOptions.map((opt) => {
                  const optColor = MODE_COLORS[opt.mode] || "#6b7280";
                  const isSelected = selectedMode === opt.mode;
                  return (
                    <Card
                      key={`platform-${opt.mode}`}
                      className={`p-3 cursor-pointer transition-all hover:shadow-md border-sky-100 ${isSelected ? "ring-2 ring-sky-500 bg-sky-50/30" : ""}`}
                      onClick={() => setSelectedMode(opt.mode)}
                      data-testid={`platform-option-${opt.mode}`}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                          style={{ backgroundColor: `${optColor}15` }}
                        >
                          <ModeIcon mode={opt.mode} className="w-4 h-4" style={{ color: optColor }} />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[12px] font-semibold text-gray-900">{opt.label || MODE_LABELS[opt.mode]}</span>
                            {opt.recommended && <span className="text-[8px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-bold">REC</span>}
                            <span className="text-[8px] bg-sky-100 text-sky-700 px-1.5 py-0.5 rounded-full font-bold">TRAVELOURE</span>
                          </div>
                          <div className="flex items-center gap-3 text-[11px] text-gray-500 mt-0.5">
                            <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{formatDuration(opt.duration)}</span>
                            <span className="flex items-center gap-1"><DollarSign className="w-3 h-3" />{opt.cost > 0 ? `$${opt.cost}` : "Free"}</span>
                            {opt.provider && <span className="text-gray-400">via {opt.provider}</span>}
                          </div>
                          {opt.notes && <div className="text-[10px] text-gray-400 mt-0.5">{opt.notes}</div>}
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          {isSelected && <Check className="w-4 h-4 text-sky-600" />}
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            </div>
          )}
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
