import { useState } from "react";
import {
  ArrowLeft, Phone, MapPin, Navigation, ExternalLink, FileText,
  CheckCircle2, Clock, AlertCircle, Hotel, Compass, Car, Shield,
  UtensilsCrossed, ChevronDown, ChevronUp, Copy, Check,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  SERVICE_BOOKINGS, TRIP, STATUS_STYLES, buildMapsUrl,
  type ServiceBooking,
} from "./shared-data";

const TYPE_CONFIG: Record<string, { icon: typeof Hotel; label: string; color: string; bg: string }> = {
  hotel: { icon: Hotel, label: "Hotels", color: "text-blue-700", bg: "bg-blue-50" },
  tour: { icon: Compass, label: "Tours & Activities", color: "text-purple-700", bg: "bg-purple-50" },
  transport: { icon: Car, label: "Transport", color: "text-amber-700", bg: "bg-amber-50" },
  restaurant: { icon: UtensilsCrossed, label: "Dining", color: "text-red-700", bg: "bg-red-50" },
  insurance: { icon: Shield, label: "Insurance", color: "text-green-700", bg: "bg-green-50" },
};

const confirmedCount = SERVICE_BOOKINGS.filter(b => b.status === "confirmed").length;
const pendingCount = SERVICE_BOOKINGS.filter(b => b.status === "pending").length;
const totalCost = SERVICE_BOOKINGS.reduce((s, b) => s + b.cost, 0);

const grouped = Object.entries(TYPE_CONFIG).reduce<Record<string, ServiceBooking[]>>((acc, [type]) => {
  const items = SERVICE_BOOKINGS.filter(b => b.type === type);
  if (items.length > 0) acc[type] = items;
  return acc;
}, {});

function BookingCard({ booking }: { booking: ServiceBooking }) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const statusStyle = STATUS_STYLES[booking.status] || STATUS_STYLES.pending;
  const typeConf = TYPE_CONFIG[booking.type];
  const Icon = typeConf?.icon || FileText;

  const handleCopy = () => {
    if (booking.confirmationCode) {
      navigator.clipboard.writeText(booking.confirmationCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <Card className="overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-3.5 py-3 flex items-start gap-3 text-left hover:bg-gray-50/50 transition-colors"
      >
        <div className={`w-9 h-9 rounded-lg ${typeConf?.bg || "bg-gray-50"} flex items-center justify-center flex-shrink-0 mt-0.5`}>
          <Icon className={`w-4.5 h-4.5 ${typeConf?.color || "text-gray-600"}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[13px] font-semibold text-gray-900">{booking.name}</span>
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${statusStyle.bg} ${statusStyle.fg}`}>
              {statusStyle.label}
            </span>
          </div>
          <div className="text-[11px] text-gray-500 mt-0.5">{booking.provider}</div>
          {booking.confirmationCode && (
            <div className="text-[11px] text-gray-400 mt-0.5 font-mono">{booking.confirmationCode}</div>
          )}
        </div>
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          <span className="text-[14px] font-bold text-gray-900">${booking.cost.toLocaleString()}</span>
          {expanded ? <ChevronUp className="w-3.5 h-3.5 text-gray-400" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-400" />}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-gray-100 px-3.5 py-3 space-y-3 bg-gray-50/30">
          <div className="grid grid-cols-2 gap-2">
            {booking.checkIn && booking.checkOut && (
              <>
                <div>
                  <div className="text-[10px] text-gray-400 font-medium uppercase tracking-wide">Check-in</div>
                  <div className="text-[12px] text-gray-800 font-medium mt-0.5">{booking.checkIn}</div>
                </div>
                <div>
                  <div className="text-[10px] text-gray-400 font-medium uppercase tracking-wide">Check-out</div>
                  <div className="text-[12px] text-gray-800 font-medium mt-0.5">{booking.checkOut}</div>
                </div>
              </>
            )}
            {booking.date && !booking.checkIn && (
              <div>
                <div className="text-[10px] text-gray-400 font-medium uppercase tracking-wide">Date</div>
                <div className="text-[12px] text-gray-800 font-medium mt-0.5">{booking.date}</div>
              </div>
            )}
          </div>

          {booking.confirmationCode && (
            <div className="flex items-center gap-2 bg-white rounded-lg border border-gray-200 px-3 py-2">
              <FileText className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
              <span className="text-[12px] text-gray-700 font-mono flex-1">{booking.confirmationCode}</span>
              <button onClick={handleCopy} className="text-[10px] font-semibold text-blue-600 flex items-center gap-1 hover:text-blue-700">
                {copied ? <><Check className="w-3 h-3" /> Copied</> : <><Copy className="w-3 h-3" /> Copy</>}
              </button>
            </div>
          )}

          {booking.address && (
            <div className="flex items-start gap-2">
              <MapPin className="w-3.5 h-3.5 text-gray-400 mt-0.5 flex-shrink-0" />
              <span className="text-[12px] text-gray-700">{booking.address}</span>
            </div>
          )}

          {booking.contact && (
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-gray-500">{booking.contact}</span>
            </div>
          )}

          {booking.notes && (
            <div className="bg-amber-50/60 border border-amber-200/40 rounded-lg px-3 py-2">
              <div className="text-[11px] text-amber-800">{booking.notes}</div>
            </div>
          )}

          <div className="flex gap-2 pt-1">
            {booking.phone && (
              <a href={`tel:${booking.phone}`} className="flex items-center gap-1.5 text-[11px] font-semibold text-green-700 bg-green-50 border border-green-200 px-3 py-1.5 rounded-lg hover:bg-green-100 transition-colors">
                <Phone className="w-3 h-3" /> Call
              </a>
            )}
            {booking.address && (
              <a href={buildMapsUrl(booking.address)} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-[11px] font-semibold text-blue-700 bg-blue-50 border border-blue-200 px-3 py-1.5 rounded-lg hover:bg-blue-100 transition-colors">
                <Navigation className="w-3 h-3" /> Navigate
              </a>
            )}
            <button className="flex items-center gap-1.5 text-[11px] font-semibold text-gray-700 bg-gray-50 border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors ml-auto">
              <ExternalLink className="w-3 h-3" /> View Booking
            </button>
          </div>
        </div>
      )}
    </Card>
  );
}

export function ServicesPage() {
  return (
    <div className="w-[520px] bg-gray-50 min-h-screen font-['Inter',sans-serif]">
      <div className="sticky top-0 z-10 bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3">
        <button className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors">
          <ArrowLeft className="w-4 h-4 text-gray-600" />
        </button>
        <div>
          <h1 className="text-[15px] font-bold text-gray-900">Services & Bookings</h1>
          <p className="text-[11px] text-gray-500">{TRIP.title}</p>
        </div>
      </div>

      <div className="p-4 space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <Card className="p-3 text-center">
            <div className="flex items-center justify-center gap-1.5 mb-1">
              <CheckCircle2 className="w-4 h-4 text-green-500" />
              <span className="text-[18px] font-bold text-green-700">{confirmedCount}</span>
            </div>
            <div className="text-[10px] text-gray-500 font-medium">Confirmed</div>
          </Card>
          <Card className="p-3 text-center">
            <div className="flex items-center justify-center gap-1.5 mb-1">
              <Clock className="w-4 h-4 text-yellow-500" />
              <span className="text-[18px] font-bold text-yellow-700">{pendingCount}</span>
            </div>
            <div className="text-[10px] text-gray-500 font-medium">Pending</div>
          </Card>
          <Card className="p-3 text-center">
            <div className="flex items-center justify-center gap-1.5 mb-1">
              <span className="text-[18px] font-bold text-gray-900">${totalCost.toLocaleString()}</span>
            </div>
            <div className="text-[10px] text-gray-500 font-medium">Total Cost</div>
          </Card>
        </div>

        {Object.entries(grouped).map(([type, bookings]) => {
          const conf = TYPE_CONFIG[type];
          const Icon = conf?.icon || FileText;
          return (
            <div key={type}>
              <div className="flex items-center gap-2 mb-2.5">
                <div className={`w-6 h-6 rounded-md ${conf?.bg || "bg-gray-50"} flex items-center justify-center`}>
                  <Icon className={`w-3.5 h-3.5 ${conf?.color || "text-gray-600"}`} />
                </div>
                <span className="text-[13px] font-bold text-gray-900">{conf?.label || type}</span>
                <span className="text-[11px] text-gray-400 font-medium">({bookings.length})</span>
              </div>
              <div className="space-y-2.5">
                {bookings.map(b => (
                  <BookingCard key={b.id} booking={b} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
