import { useMemo, useState } from "react";
import {
  ArrowUpRight,
  BadgeCheck,
  Check,
  ChevronRight,
  Handshake,
  MapPin,
  MessageCircle,
  Search,
  Share2,
  ShieldCheck,
  Sparkles,
  Star,
} from "lucide-react";
import { ContinuityShell } from "./_shared/ContinuityShell";
import "./ProviderStorefrontContinuity.css";

type Category = "All" | "Services" | "Templates" | "Ready-made";
type Offering = {
  category: Exclude<Category, "All">;
  title: string;
  description: string;
  image: string;
  details: string[];
  price: string;
  unit: string;
  rating?: string;
  reviews?: number;
  action: string;
};

const offerings: Offering[] = [
  {
    category: "Services",
    title: "Kyoto food market & home-style lunch",
    description: "A gentle half-day through Nishiki Market, followed by a family-style meal.",
    image: "https://images.unsplash.com/photo-1528360983277-13d401cdc186?auto=format&fit=crop&w=1000&q=82",
    details: ["In person", "Kyoto", "4 hours"],
    price: "$125",
    unit: "per person",
    rating: "4.9",
    reviews: 28,
    action: "View service",
  },
  {
    category: "Services",
    title: "A quiet morning in Arashiyama",
    description: "Bamboo, river paths, and the corners that are best before the day gets busy.",
    image: "https://images.unsplash.com/photo-1524413840807-0c3cb6fa808d?auto=format&fit=crop&w=1000&q=82",
    details: ["In person", "Kyoto", "5 hours"],
    price: "$190",
    unit: "per event",
    rating: "5.0",
    reviews: 12,
    action: "View service",
  },
  {
    category: "Services",
    title: "Seasonal Kyoto planning call",
    description: "A focused conversation to turn a list of must-sees into a trip with breathing room.",
    image: "https://images.unsplash.com/photo-1492571350019-22de08371fd3?auto=format&fit=crop&w=1000&q=82",
    details: ["Video call", "Kyoto", "1 hour"],
    price: "$65",
    unit: "per hour",
    action: "View service",
  },
  {
    category: "Templates",
    title: "Kyoto in bloom: temples, tea & tucked-away streets",
    description: "A four-day editable route for first-time visitors who prefer the slower way around.",
    image: "https://images.unsplash.com/photo-1490806843957-31f4c9a91c65?auto=format&fit=crop&w=1000&q=82",
    details: ["4 days", "Kyoto, Japan", "Editable plan"],
    price: "$38",
    unit: "one-time",
    rating: "4.8",
    reviews: 19,
    action: "Preview template",
  },
  {
    category: "Ready-made",
    title: "The unhurried Kyoto week",
    description: "Six days of considered stops, with enough white space to notice where you are.",
    image: "https://images.unsplash.com/photo-1545569341-9eb8b30979d9?auto=format&fit=crop&w=1000&q=82",
    details: ["6 days", "14 stops", "Editable after purchase"],
    price: "$240",
    unit: "complete trip",
    action: "Preview trip",
  },
];

function Rating({ rating, reviews }: Pick<Offering, "rating" | "reviews">) {
  if (!rating || !reviews) return <span className="psc-new">New listing</span>;
  return <span className="psc-rating"><Star size={13} fill="currentColor" /> {rating} <span>({reviews} reviews)</span></span>;
}

export function ProviderStorefrontContinuity() {
  const [category, setCategory] = useState<Category>("All");
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const visible = useMemo(() => offerings.filter((item) => {
    const matchesCategory = category === "All" || item.category === category;
    const term = query.trim().toLowerCase();
    return matchesCategory && (!term || `${item.title} ${item.description} ${item.details.join(" ")}`.toLowerCase().includes(term));
  }), [category, query]);

  const message = () => setNotice("Message composer is ready for Yuki in Traveloure.");
  const share = async () => {
    try { await navigator.clipboard?.writeText("Traveloure · Yuki Flowers"); } catch { /* clipboard can be unavailable in canvas */ }
    setNotice("Storefront link copied.");
  };

  return (
    <ContinuityShell active="Experts & services">
      <div className="psc-page">
        <div className="tc-breadcrumb"><button onClick={() => setNotice("Marketplace home selected.")}>Marketplace</button><ChevronRight size={13} /><button onClick={() => setNotice("Experts & services selected.")}>Experts & services</button><ChevronRight size={13} /><strong>Yuki Flowers</strong></div>

        <section className="psc-hero tc-card">
          <div className="psc-cover" role="img" aria-label="Kyoto street and mountain view" />
          <div className="psc-profile">
            <div className="psc-avatar">YF</div>
            <div className="psc-intro">
              <div className="psc-name-row"><div><p className="tc-eyebrow">Local expert storefront</p><h1>Yuki Flowers</h1><p className="psc-handle">@yuki-flowers <span className="psc-dot" /> Kyoto, Japan</p></div><span className="tc-pill green"><ShieldCheck size={13} /> Identity verified</span></div>
              <p className="psc-bio">Kyoto local and lifelong wanderer. I make gentle, seasonal plans for people who want to see the city beyond the guidebook.</p>
              <div className="psc-proof"><span><Star size={14} fill="currentColor" /> 4.9 <em>· 46 reviews</em></span><span><MapPin size={14} /> Kyoto-based</span><span><Check size={14} /> On Traveloure since 2022</span></div>
            </div>
            <div className="psc-actions"><button className="tc-primary-button" onClick={message}><MessageCircle size={15} /> Message Yuki</button><button className="tc-secondary-button" onClick={share}><Share2 size={15} /> Share</button></div>
          </div>
        </section>

        {notice && <div className="psc-notice" role="status"><Check size={15} />{notice}<button aria-label="Dismiss notification" onClick={() => setNotice(null)}>×</button></div>}

        <section className="psc-summary">
          <div><strong>5</strong><span>offerings</span></div><div><strong>46</strong><span>reviews</span></div><div><strong>Kyoto</strong><span>area of expertise</span></div>
          <div className="psc-summary-note"><Sparkles size={16} /><span><b>One expert, three ways to plan</b><br />Book time with Yuki, bring home a route, or start with a complete trip.</span></div>
        </section>

        <section className="psc-offerings">
          <div className="tc-section-heading"><div><p className="tc-eyebrow">Choose your starting point</p><h2>Plans shaped around Kyoto</h2></div><p>{visible.length} {visible.length === 1 ? "offering" : "offerings"}</p></div>
          <div className="psc-toolbar"><div className="psc-tabs" role="tablist" aria-label="Offering categories">{(["All", "Services", "Templates", "Ready-made"] as Category[]).map((item) => <button role="tab" aria-selected={category === item} className={category === item ? "active" : ""} onClick={() => setCategory(item)} key={item}>{item}</button>)}</div><label className="psc-search"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search this storefront" aria-label="Search this storefront" /></label></div>
          {visible.length > 0 ? <div className="psc-grid">{visible.map((item) => <article className={`psc-offering ${selected === item.title ? "selected" : ""}`} key={item.title}>
            <div className="psc-image" style={{ backgroundImage: `url(${item.image})` }}><span>{item.category}</span></div>
            <div className="psc-offering-body"><div className="psc-card-top"><Rating rating={item.rating} reviews={item.reviews} /><span className="psc-price"><b>{item.price}</b> {item.unit}</span></div><h3>{item.title}</h3><p>{item.description}</p><div className="psc-details">{item.details.map((detail) => <span key={detail}>{detail}</span>)}</div><div className="psc-card-foot"><span className="psc-safe"><ShieldCheck size={13} /> Secure checkout</span><button className="psc-card-button" onClick={() => { setSelected(item.title); setNotice(`${item.title} selected — preview details are ready.`); }}>{selected === item.title ? <><Check size={14} /> Selected</> : <>{item.action} <ArrowUpRight size={14} /></>}</button></div></div>
          </article>)}</div> : <div className="psc-empty"><Search size={20} /><b>No offerings match “{query}”.</b><button onClick={() => { setQuery(""); setCategory("All"); }}>Clear search</button></div>}
          {visible.length > 0 && <button className="psc-show-more" onClick={() => { setShowAll(!showAll); setNotice(showAll ? "Showing the essentials." : "All storefront offerings are already visible in this prototype."); }}>{showAll ? "Show essentials" : "See how Yuki can help"} <ChevronRight size={14} /></button>}
        </section>

        <section className="psc-conversation tc-card"><div className="psc-mini-avatar">YF</div><div><p className="tc-eyebrow">A good place to begin</p><h2>Have a trip in mind, but not a format yet?</h2><p>Tell Yuki what you are hoping to feel, eat, or discover. A conversation can point you to the right offering — or clarify what is not listed here.</p></div><button className="tc-primary-button" onClick={message}><MessageCircle size={15} /> Start a conversation</button></section>

        <section className="psc-safety"><div><ShieldCheck size={18} /><b>Payment is held until your booking completes</b><p>Funds are secured through Traveloure and released according to the booking terms.</p></div><div><BadgeCheck size={18} /><b>Offerings are reviewed before publishing</b><p>Review status is shown where available; no extra trust claim is implied.</p></div><div><Handshake size={18} /><b>Keep planning in one place</b><p>Your messages, booking details, and receipts stay together on Traveloure.</p></div></section>
      </div>
    </ContinuityShell>
  );
}