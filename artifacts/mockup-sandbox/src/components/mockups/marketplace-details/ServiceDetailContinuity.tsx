import { useState } from "react";
import {
  ArrowLeft, Building2, Calendar, CalendarCheck, Car, Check, CheckCircle2,
  ChevronLeft, ChevronRight, Clock3, Handshake, Info, Languages, MapPin,
  MessageSquare, ShieldCheck, ShoppingCart, Star, Users,
} from "lucide-react";
import { ContinuityShell } from "./_shared/ContinuityShell";
import "./ServiceDetailContinuity.css";

const slots = [
  { id: "thu", day: "Thu, Aug 21", time: "5:00 PM–9:00 PM", spots: "3 spots open" },
  { id: "fri", day: "Fri, Aug 22", time: "5:00 PM–9:00 PM", spots: "1 spot open" },
  { id: "sat", day: "Sat, Aug 23", time: "5:00 PM–9:00 PM", spots: "Fully booked", full: true },
];

function DetailCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section className={`sdc-card ${className}`}>{children}</section>;
}

function GoodToKnow({ icon: Icon, children }: { icon: typeof Clock3; children: React.ReactNode }) {
  return <li><Icon aria-hidden="true" /><span>{children}</span></li>;
}

export function ServiceDetailContinuity() {
  const [month, setMonth] = useState("August 2026");
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [status, setStatus] = useState<"cart" | "book" | "contact" | null>(null);
  const [storefrontOpened, setStorefrontOpened] = useState(false);
  const changeMonth = (next: boolean) => setMonth(next ? "September 2026" : "July 2026");
  const selectedLabel = slots.find((slot) => slot.id === selectedSlot)?.day;

  return (
    <ContinuityShell active="Marketplace">
      <div className="sdc-page">
        <div className="sdc-crumb"><button type="button"><ArrowLeft size={13} /> Back to services</button><span>/</span><button type="button">@norisato</button><span>/</span><strong>Private Gion after-hours walk</strong></div>
        <section className="sdc-hero" aria-label="Service overview">
          <div className="sdc-hero-art" aria-label="Abstract lantern-lit Kyoto street illustration">
            <div className="sdc-lanterns"><i className="sdc-lantern" /><i className="sdc-lantern" /><i className="sdc-lantern" /></div>
          </div>
          <div className="sdc-hero-note">
            <span className="sdc-kicker">Private experience · Kyoto</span>
            <h1>Private Gion after-hours walk</h1>
            <p>Quiet lanes, living traditions, and a local point of view after the daytime crowds have gone.</p>
            <div className="sdc-badge-row" style={{ marginTop: 16 }}><span className="sdc-badge"><ShieldCheck /> ID verified</span><span className="sdc-badge"><Building2 /> Business verified</span></div>
            <div className="sdc-meta"><span><MapPin /> Gion, Kyoto, Japan</span><span className="sdc-rating"><Star size={13} fill="currentColor" /> 4.9 (61 reviews)</span></div>
          </div>
        </section>

        <div className="sdc-layout">
          <div className="sdc-content">
            <DetailCard>
              <h2>About this service</h2>
              <p className="sdc-copy">Step into the quieter side of Kyoto with a local guide who knows Gion after the daytime crowds have gone. We&apos;ll wander lantern-lit lanes, hear the stories behind the district&apos;s traditions, and pause at small places most visitors pass by.</p>
              <div className="sdc-facts"><div className="sdc-fact"><strong>4 hours</strong>duration</div><div className="sdc-fact"><strong>In person</strong>delivery</div><div className="sdc-fact"><strong>English, Japanese</strong>languages</div></div>
            </DetailCard>
            <DetailCard>
              <h2>Good to know</h2>
              <ul className="sdc-list">
                <GoodToKnow icon={Users}>Party size: 1–6 guests</GoodToKnow><GoodToKnow icon={Users}>Private experience</GoodToKnow>
                <GoodToKnow icon={Calendar}>Runs Thursday–Sunday</GoodToKnow><GoodToKnow icon={Clock3}>Starts 5:00–6:00 PM JST</GoodToKnow>
                <GoodToKnow icon={Clock3}>Book at least 24 hours ahead</GoodToKnow><GoodToKnow icon={Calendar}>Duration: 4 hours</GoodToKnow>
                <GoodToKnow icon={MapPin}>Meet at Gion Shijo Station, Exit 6</GoodToKnow><GoodToKnow icon={Car}>Serves Gion, Higashiyama, Pontocho</GoodToKnow>
                <GoodToKnow icon={Info}>Bring comfortable walking shoes and a light layer.</GoodToKnow>
              </ul>
            </DetailCard>
            <DetailCard>
              <h2>What&apos;s included</h2>
              <ul className="sdc-list included"><GoodToKnow icon={CheckCircle2}>A private, local-led evening walk</GoodToKnow><GoodToKnow icon={CheckCircle2}>Stories behind Gion&apos;s living traditions</GoodToKnow><GoodToKnow icon={CheckCircle2}>Personalized neighborhood recommendations</GoodToKnow><GoodToKnow icon={CheckCircle2}>A follow-up note with places discussed</GoodToKnow></ul>
            </DetailCard>
            <DetailCard>
              <h2>Location &amp; route</h2>
              <div className="sdc-map"><span className="sdc-pin">1</span><div className="sdc-map-label">Gion, Kyoto<small>General meeting area</small></div></div>
              <div className="sdc-route"><b>Meet:</b> Gion Shijo Station, Exit 6 &nbsp;•&nbsp; <b>Drop-off:</b> Yasaka Shrine</div>
            </DetailCard>
            <DetailCard>
              <div className="sdc-seller"><div className="sdc-seller-avatar">N</div><div><strong>More from Nori Sato</strong><p>See everything @norisato offers on Traveloure.</p></div><button type="button" className="sdc-contact" onClick={() => setStorefrontOpened(true)}>{storefrontOpened ? "Storefront ready" : "View storefront"}</button></div>
            </DetailCard>
            <DetailCard>
              <h2>Reviews</h2>
              <div className="sdc-review"><div className="sdc-review-avatar">M</div><div><h3>Maria L.</h3><p className="sdc-review-stars">★★★★★ <small>July 2026 · Verified booking</small></p><p>One of the best evenings of our trip. Nori was thoughtful, generous with his knowledge, and made Gion feel much more personal.</p><div className="sdc-reply"><b>Response from Nori</b><br />Thank you, Maria — it was a pleasure to walk with you.</div></div></div>
            </DetailCard>
          </div>

          <aside className="sdc-booking">
            <DetailCard className="sdc-booking-card">
              <div className="sdc-price"><strong>$180</strong><span>per experience</span><small>Private booking · 1–6 guests</small></div>
              <div className="sdc-actions">
                <button type="button" className="sdc-primary" onClick={() => setStatus("book")}>{status === "book" ? <><Check /> Booking started</> : "Book on Traveloure"}</button>
                <button type="button" className="sdc-secondary" onClick={() => setStatus("cart")}><ShoppingCart /> {status === "cart" ? "Added to cart" : "Add to cart"}</button>
                <button type="button" className="sdc-contact" onClick={() => setStatus("contact")}><MessageSquare /> {status === "contact" ? "Message ready" : "Contact provider"}</button>
              </div>
              {status && <div className="sdc-success" role="status">{status === "cart" ? "Saved to your trip. You can review it before checkout." : status === "book" ? "Your booking flow is ready. Choose a date below to continue." : "A provider message draft is ready to open."}</div>}
              <div className="sdc-trust"><h3><Handshake /> Direct booking</h3><p>You&apos;re booking directly with the provider. Payment is processed securely through Traveloure.</p><ul><li><ShieldCheck size={13} /> Identity verified</li><li><Building2 size={13} /> Business verified</li><li><MapPin size={13} /> Meets at Gion Shijo Station exit</li><li><Car size={13} /> Transport not provided — arrange your own</li></ul></div>
              <div className="sdc-availability"><h3><CalendarCheck /> Availability</h3><div className="sdc-month"><button type="button" onClick={() => changeMonth(false)} aria-label="Previous month"><ChevronLeft size={15} /></button><span>{month}</span><button type="button" onClick={() => changeMonth(true)} aria-label="Next month"><ChevronRight size={15} /></button></div>
                <div className="sdc-slots">{slots.map((slot) => <button type="button" key={slot.id} disabled={slot.full} className={`sdc-slot ${slot.full ? "full" : ""} ${selectedSlot === slot.id ? "selected" : ""}`} onClick={() => setSelectedSlot(selectedSlot === slot.id ? null : slot.id)}><span><b>{slot.day}</b><small>{slot.time}</small></span><em>{selectedSlot === slot.id ? "Selected" : slot.spots}</em></button>)}</div>
                <label className="sdc-request"><Calendar /> Or request a date &amp; time <small>(optional)</small></label>
                <div className="sdc-date"><input aria-label="Requested date" type="date" value={date} onChange={(event) => setDate(event.target.value)} /><input aria-label="Requested time" type="time" disabled={!date} value={time} onChange={(event) => setTime(event.target.value)} /></div>
                {selectedLabel && <p className="sdc-fee" style={{ color: "var(--sdc-teal)", fontWeight: 700 }}>Selected: {selectedLabel}</p>}
              </div>
              <div className="sdc-policy"><h3><ShieldCheck /> Cancellation policy</h3><p>Flexible — full refund if cancelled at least 24 hours before the start.</p><small>Please contact the provider with questions before booking.</small></div>
              <p className="sdc-fee">A platform service fee is deducted from each booking; the provider receives the remainder.</p>
            </DetailCard>
          </aside>
        </div>
      </div>
    </ContinuityShell>
  );
}