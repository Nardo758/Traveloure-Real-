import { useState } from "react";
import {
  ArrowLeft, Building2, Calendar, CalendarCheck, Car, CheckCircle, ChevronLeft,
  ChevronRight, Clock, Handshake, Info, Languages, MapPin, MessageSquare,
  ShieldCheck, ShoppingCart, Star, Users,
} from "lucide-react";
import "./CurrentServiceDetail.css";

const service = {
  name: "Private Gion after-hours walk",
  location: "Gion, Kyoto, Japan",
  rating: "4.9",
  reviews: 61,
  price: "$180",
  image: "https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?auto=format&fit=crop&w=1500&q=85",
  gallery: [
    "https://images.unsplash.com/photo-1528360983277-13d401cdc186?auto=format&fit=crop&w=400&q=80",
    "https://images.unsplash.com/photo-1524413840807-0c3cb6fa808d?auto=format&fit=crop&w=400&q=80",
    "https://images.unsplash.com/photo-1545569341-9eb8b30979d9?auto=format&fit=crop&w=400&q=80",
  ],
};

const slots = [
  { id: "1", day: "Thu, Aug 21", time: "5:00 PM–9:00 PM", spots: "3 spots open" },
  { id: "2", day: "Fri, Aug 22", time: "5:00 PM–9:00 PM", spots: "1 spot open" },
  { id: "3", day: "Sat, Aug 23", time: "5:00 PM–9:00 PM", spots: "Fully booked", full: true },
];

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section className={`csd-card ${className}`}>{children}</section>;
}

function GoodToKnowLine({ icon: Icon, children }: { icon: typeof Clock; children: React.ReactNode }) {
  return <li><Icon /> <span>{children}</span></li>;
}

export function CurrentServiceDetail() {
  const [month, setMonth] = useState("August 2026");
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [date, setDate] = useState("");
  const [added, setAdded] = useState<"cart" | "book" | null>(null);
  const [contacted, setContacted] = useState(false);

  const changeMonth = (next: boolean) => setMonth(next ? "September 2026" : "July 2026");
  return (
    <div className="current-service-detail">
      <header className="csd-nav">
        <div className="csd-brand">TRAVELOURE</div>
        <nav><span>Discover</span><span>Plan a trip</span><span>Messages</span></nav>
        <button className="csd-account">Sign in</button>
      </header>
      <main className="csd-container">
        <div className="csd-crumbs"><button>Home</button><i>/</i><button>@norisato</button><i>/</i><span>{service.name}</span></div>
        <div className="csd-title-row">
          <button className="csd-back" aria-label="Back"><ArrowLeft /></button>
          <div className="csd-title">
            <div className="csd-heading"><h1>{service.name}</h1><b className="csd-badge blue"><ShieldCheck />ID Verified</b><b className="csd-badge purple"><Building2 />Business Verified</b></div>
            <div className="csd-meta"><span><MapPin />{service.location}</span><span><Star className="star" />{service.rating} ({service.reviews} reviews)</span></div>
          </div>
        </div>

        <div className="csd-hero"><img src={service.image} alt="A lantern-lit Kyoto street" /></div>
        <div className="csd-gallery">{service.gallery.map((image, index) => <img src={image} alt={`Gion walk photo ${index + 1}`} key={image} />)}</div>

        <div className="csd-layout">
          <div className="csd-content">
            <Card>
              <h2>About this service</h2>
              <p className="csd-copy">Step into the quieter side of Kyoto with a local guide who knows Gion after the daytime crowds have gone. We&apos;ll wander lantern-lit lanes, hear the stories behind the district&apos;s traditions, and pause at small places most visitors pass by.</p>
              <p className="csd-inline"><Clock />Delivery: 4 hours</p>
              <span className="csd-outline">in person</span>
              <p className="csd-inline"><Languages />Delivered in: English, Japanese</p>
            </Card>

            <Card>
              <h2>Good to know</h2>
              <ul className="csd-list">
                <GoodToKnowLine icon={Users}>Party size: 1–6 guests</GoodToKnowLine>
                <GoodToKnowLine icon={Users}>Seating: Private experience</GoodToKnowLine>
                <GoodToKnowLine icon={Calendar}>Runs Thursday–Sunday</GoodToKnowLine>
                <GoodToKnowLine icon={Calendar}>Starts between 5:00 PM and 6:00 PM (Japan Standard Time)</GoodToKnowLine>
                <GoodToKnowLine icon={Clock}>Book at least 24 hours ahead</GoodToKnowLine>
                <GoodToKnowLine icon={Clock}>Duration: 4 hours</GoodToKnowLine>
                <GoodToKnowLine icon={Car}>Meet at the Gion Shijo Station exit</GoodToKnowLine>
                <GoodToKnowLine icon={MapPin}>Serves: Gion, Higashiyama, Pontocho</GoodToKnowLine>
                <GoodToKnowLine icon={Info}>Bring comfortable walking shoes and a light layer for the evening.</GoodToKnowLine>
              </ul>
            </Card>

            <Card>
              <h2>What&apos;s Included</h2>
              <ul className="csd-list included">
                {["A private, local-led evening walk", "Stories and context behind Gion’s living traditions", "Personalized neighborhood recommendations", "A follow-up note with places discussed"].map(item => <li key={item}><CheckCircle />{item}</li>)}
              </ul>
            </Card>

            <Card>
              <h2>Location &amp; route</h2>
              <div className="csd-map"><div className="csd-map-road r1" /><div className="csd-map-road r2" /><div className="csd-map-road r3" /><span className="csd-pin">1</span><strong>Gion, Kyoto</strong><small>General meeting area</small></div>
              <div className="csd-route"><b>Meet:</b> Gion Shijo Station, Exit 6 <span>•</span> <b>Drop-off:</b> Yasaka Shrine</div>
            </Card>

            <Card className="csd-store">
              <div className="csd-store-icon"><Building2 /></div><div><strong>More from this seller</strong><p>See everything @norisato offers on Traveloure.</p></div><button>View storefront</button>
            </Card>

            <Card>
              <div className="csd-review-title"><h2>Reviews</h2><span><Star className="star" /> {service.rating} <em>({service.reviews})</em></span></div>
              <article className="csd-review"><div className="csd-avatar">M</div><div><strong>Maria L.</strong><p className="csd-stars">★★★★★ <small>July 2026 · Verified booking</small></p><p>One of the best evenings of our trip. Nori was thoughtful, generous with his knowledge, and made Gion feel much more personal.</p><div className="csd-provider-reply"><b>Response from Nori</b><br />Thank you, Maria — it was a pleasure to walk with you.</div></div></article>
            </Card>
          </div>

          <aside className="csd-booking">
            <Card>
              <div className="csd-price"><strong>{service.price}</strong><span>per experience</span><small><Users />126 bookings</small></div>
              <div className="csd-actions">
                <button className="csd-primary" onClick={() => setAdded("book")}>{added === "book" ? "Booking started ✓" : "Book on Traveloure"}</button>
                <button className="csd-secondary" onClick={() => setAdded("cart")}><ShoppingCart />{added === "cart" ? "Added to Cart ✓" : "Add to Cart"}</button>
                <button className="csd-contact" onClick={() => setContacted(true)}><MessageSquare />{contacted ? "Message ready ✓" : "Contact Provider"}</button>
              </div>
              <div className="csd-trust"><h3><Handshake />Direct Booking</h3><p>You&apos;re booking directly with the provider. Payment is processed securely through Traveloure.</p><ul><li><ShieldCheck />Identity verified</li><li><Building2 />Business verified</li><li><MapPin />Meets at: Gion Shijo Station exit</li><li><Car />Transport not provided — arrange your own</li></ul></div>
              <hr />
              <div className="csd-availability-head"><h3><CalendarCheck />Availability</h3><div><button onClick={() => changeMonth(false)} aria-label="Previous month"><ChevronLeft /></button><b>{month}</b><button onClick={() => changeMonth(true)} aria-label="Next month"><ChevronRight /></button></div></div>
              <div className="csd-slots">{slots.map(slot => <button key={slot.id} disabled={slot.full} onClick={() => setSelectedSlot(selectedSlot === slot.id ? null : slot.id)} className={`${slot.full ? "full" : ""} ${selectedSlot === slot.id ? "selected" : ""}`}><span><b>{slot.day}</b> <small>{slot.time}</small></span><i>{selectedSlot === slot.id ? "Selected" : slot.spots}</i></button>)}</div>
              <label className="csd-request"><Calendar />Or request a date &amp; time <small>(optional)</small></label>
              <div className="csd-date"><input type="date" value={date} onChange={e => setDate(e.target.value)} /><input type="time" disabled={!date} /></div>
              <div className="csd-policy"><h3><ShieldCheck />Cancellation policy</h3><p>Flexible — full refund if cancelled at least 24 hours before the start.</p><small>Please contact the provider with any questions before booking.</small></div>
              <p className="csd-fee">A platform service fee is deducted from each booking; the provider receives the remainder.</p>
            </Card>
          </aside>
        </div>
      </main>
    </div>
  );
}