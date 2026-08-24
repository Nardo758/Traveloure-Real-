import { useState } from "react";
import {
  BadgeCheck, Handshake, MapPin, MessageCircle, Share2, ShieldAlert,
  ShieldCheck, Star,
} from "lucide-react";
import "./CurrentProviderStorefront.css";

type Offering = {
  title: string;
  image: string;
  chips: string[];
  price: string;
  unit?: string;
  rating?: string;
  reviews?: number;
  cta: string;
};

const coverImage = "https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?auto=format&fit=crop&w=1800&q=85";
const avatarImage = "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=300&q=85";

const services: Offering[] = [
  {
    title: "Kyoto food market & home-style lunch",
    image: "https://images.unsplash.com/photo-1528360983277-13d401cdc186?auto=format&fit=crop&w=900&q=85",
    chips: ["In-person", "📍 Kyoto"],
    price: "$125",
    unit: "per person",
    rating: "4.9",
    reviews: 28,
    cta: "View & book →",
  },
  {
    title: "A quiet morning in Arashiyama",
    image: "https://images.unsplash.com/photo-1524413840807-0c3cb6fa808d?auto=format&fit=crop&w=900&q=85",
    chips: ["In-person", "📍 Kyoto"],
    price: "$190",
    unit: "per event",
    rating: "5.0",
    reviews: 12,
    cta: "View & book →",
  },
  {
    title: "Seasonal Kyoto planning call",
    image: "https://images.unsplash.com/photo-1492571350019-22de08371fd3?auto=format&fit=crop&w=900&q=85",
    chips: ["Video call"],
    price: "$65",
    unit: "per hour",
    cta: "View & book →",
  },
];

const templates: Offering[] = [
  {
    title: "Kyoto in bloom: temples, tea & tucked-away streets",
    image: "https://images.unsplash.com/photo-1490806843957-31f4c9a91c65?auto=format&fit=crop&w=900&q=85",
    chips: ["4 days", "Kyoto, Japan"],
    price: "$38",
    rating: "4.8",
    reviews: 19,
    cta: "View template →",
  },
];

const readyMade: Offering[] = [
  {
    title: "The unhurried Kyoto week",
    image: "https://images.unsplash.com/photo-1545569341-9eb8b30979d9?auto=format&fit=crop&w=900&q=85",
    chips: ["6 days", "14 stops"],
    price: "$240",
    cta: "Preview trip →",
  },
];

function Rating({ rating, reviews }: Pick<Offering, "rating" | "reviews">) {
  if (!rating || !reviews) return <span className="ps-new">New</span>;
  return <span className="ps-rating"><Star /> {rating}<span>· {reviews} reviews</span></span>;
}

function Logo() {
  return <div className="ps-logo"><span className="ps-logo-mark">T</span><span>TRAVELOURE</span></div>;
}

function LaneHeader({ eyebrow, title, count }: { eyebrow: string; title: string; count: number }) {
  return <div className="ps-lane-head">
    <div><p>{eyebrow}</p><h2>{title}</h2></div>
    <span>{count} available</span>
  </div>;
}

function OfferingCard({ item }: { item: Offering }) {
  return <article className="ps-offering">
    <img src={item.image} alt="" />
    <div className="ps-offering-body">
      <h3>{item.title}</h3>
      <div className="ps-chips">{item.chips.map((chip) => <span key={chip}>{chip}</span>)}</div>
      <Rating rating={item.rating} reviews={item.reviews} />
      <div className="ps-card-bottom">
        <div><strong>{item.price}</strong>{item.unit && <small>{item.unit}</small>}</div>
        <button onClick={() => undefined}>{item.cta}</button>
      </div>
    </div>
  </article>;
}

export function CurrentProviderStorefront() {
  const [notice, setNotice] = useState<string | null>(null);
  const message = () => setNotice("Message composer would open for Yuki in Traveloure.");
  const share = () => setNotice("Storefront link copied.");

  return (
    <main className="provider-storefront">
      <header className="ps-topbar">
        <Logo />
        <button className="ps-language" onClick={() => setNotice("Language menu would open.")}>🌐 <span>English</span>⌄</button>
      </header>

      <div className="ps-cover" style={{ backgroundImage: `url(${coverImage})` }} />
      <div className="ps-shell">
        <section className="ps-identity">
          <img className="ps-avatar" src={avatarImage} alt="Yuki Flowers" />
          <div className="ps-person">
            <h1>Yuki Flowers</h1>
            <div className="ps-meta">
              <span>@yuki-flowers</span>
              <span className="ps-verified"><ShieldCheck /> Identity verified</span>
              <span><MapPin /> Kyoto, Japan</span>
              <Rating rating="4.9" reviews={46} />
            </div>
            <p>Kyoto local and lifelong wanderer. I make gentle, seasonal plans for people who want to see the city beyond the guidebook.</p>
          </div>
          <div className="ps-actions">
            <button className="ps-primary" onClick={message}><MessageCircle /> Message @yuki-flowers</button>
            <button className="ps-outline" onClick={share}><Share2 /> Share</button>
          </div>
        </section>

        {notice && <div className="ps-notice" role="status">{notice}<button onClick={() => setNotice(null)}>×</button></div>}

        <section className="ps-facts">
          <div><strong>5</strong><span>Offerings</span></div>
          <div><strong>46</strong><span>Reviews</span></div>
          <div><strong>2022</strong><span>On Traveloure since</span></div>
        </section>

        <section className="ps-lane">
          <LaneHeader eyebrow="Book directly" title="Services" count={services.length} />
          <div className="ps-grid">{services.map((item) => <OfferingCard item={item} key={item.title} />)}</div>
        </section>
        <section className="ps-lane">
          <LaneHeader eyebrow="Guided itineraries" title="Itinerary Templates" count={templates.length} />
          <div className="ps-grid">{templates.map((item) => <OfferingCard item={item} key={item.title} />)}</div>
        </section>
        <section className="ps-lane">
          <LaneHeader eyebrow="Buy the whole plan" title="Ready-Made Trips" count={readyMade.length} />
          <div className="ps-grid">{readyMade.map((item) => <OfferingCard item={item} key={item.title} />)}</div>
        </section>

        <section className="ps-message-band">
          <img src={avatarImage} alt="" />
          <div><h2>Not sure what you&apos;re looking for?</h2><p>Tell Yuki what you&apos;re planning — a private tour, a special occasion, something seasonal — and get pointed to the right offering, or something custom.</p></div>
          <button className="ps-primary" onClick={message}><MessageCircle /> Start a conversation</button>
        </section>

        <section className="ps-trust">
          <div><ShieldAlert /><p><strong>Payment held until your booking completes</strong>Funds are secured through Traveloure and release to Yuki only after your experience.</p></div>
          <div><BadgeCheck /><p><strong>Every listing is admin-reviewed</strong>Offerings appear here only after Traveloure approves them.</p></div>
          <div><Handshake /><p><strong>Book and message in one place</strong>Your conversation, booking, and receipts stay on Traveloure.</p></div>
        </section>
      </div>
    </main>
  );
}