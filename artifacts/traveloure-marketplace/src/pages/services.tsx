import { useState, useEffect } from "react";
import { Shell } from "@/components/layout/Shell";
import { useDiscoverServices, useServiceCategories, useAddToCart } from "@/lib/api";
import { Search, MapPin, Filter, ChevronDown, ArrowUpRight } from "lucide-react";
import { useLocation, useSearch } from "wouter";

export default function ServicesPage() {
  useEffect(() => { document.title = "Services | Traveloure Field Guide"; }, []);

  const [, setLocation] = useLocation();
  const searchString = useSearch();
  const urlParams = new URLSearchParams(searchString);

  const [filtersOpen, setFiltersOpen] = useState(false);
  const [categoryId, setCategoryId] = useState(urlParams.get("categoryId") || "all");
  const [expandedCategories, setExpandedCategories] = useState(false);
  
  const [query, setQuery] = useState(urlParams.get("q") || "");
  const [destination, setDestination] = useState(urlParams.get("location") || "");
  const [price, setPrice] = useState(urlParams.get("price") || "Any price");
  const [rating, setRating] = useState(urlParams.get("rating") || "Any rating");
  const [sort, setSort] = useState(urlParams.get("sort") || "Recommended");
  
  const [localQuery, setLocalQuery] = useState(query);
  const [localDestination, setLocalDestination] = useState(destination);

  // Sync state to URL
  useEffect(() => {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (destination) params.set("location", destination);
    if (categoryId && categoryId !== "all") params.set("categoryId", categoryId);
    if (price && price !== "Any price") params.set("price", price);
    if (rating && rating !== "Any rating") params.set("rating", rating);
    if (sort && sort !== "Recommended") params.set("sort", sort);
    
    const newSearch = params.toString();
    if (newSearch !== searchString) {
      setLocation(`/services${newSearch ? `?${newSearch}` : ""}`, { replace: true });
    }
  }, [query, destination, categoryId, price, rating, sort, setLocation, searchString]);

  // Debounce text inputs
  useEffect(() => {
    const timer = setTimeout(() => {
      if (localQuery !== query) setQuery(localQuery);
      if (localDestination !== destination) setDestination(localDestination);
    }, 500);
    return () => clearTimeout(timer);
  }, [localQuery, localDestination, query, destination]);

  let minPrice, maxPrice;
  if (price === "Under $150") maxPrice = 150;
  if (price === "$150–$300") { minPrice = 150; maxPrice = 300; }
  
  let minRating;
  if (rating === "4.5 and above") minRating = 4.5;
  if (rating === "4.0 and above") minRating = 4.0;

  const { data: remoteData, isLoading, isError } = useDiscoverServices({
    q: query,
    categoryId: categoryId,
    location: destination,
    minPrice,
    maxPrice,
    minRating,
    sortBy: sort === "Lowest price" ? "price_low" : "rating"
  });
  
  const { data: categories } = useServiceCategories();
  
  const addToCartMutation = useAddToCart();
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());

  const handleAddToCart = (id: string) => {
    addToCartMutation.mutate({ serviceId: id }, {
      onSuccess: () => {
        setAddedIds(prev => new Set(prev).add(id));
      }
    });
  };

  const clearRefinements = () => {
    setPrice("Any price");
    setRating("Any rating");
    setSort("Recommended");
    setLocalQuery("");
    setQuery("");
    setLocalDestination("");
    setDestination("");
    setCategoryId("all");
  };

  const visibleServices = remoteData?.services || [];
  const currentCategoryName = categoryId === "all" ? "All services" : (categories?.find(c => c.id === categoryId)?.name || "Services");

  return (
    <Shell surface="services">
      {/* Top Filters */}
      <div className="fg-search-row">
        <label className="fg-input-wrap">
          <Search />
          <input 
            value={localQuery} 
            onChange={(e) => setLocalQuery(e.target.value)} 
            placeholder="What do you need help with?" 
            aria-label="Service search" 
            data-testid="input-search-query"
          />
        </label>
        <label className="fg-input-wrap">
          <MapPin />
          <input 
            value={localDestination} 
            onChange={(e) => setLocalDestination(e.target.value)} 
            placeholder="Where are you going?" 
            aria-label="Destination" 
            data-testid="input-search-location"
          />
        </label>
        <button 
          className="fg-filter-button" 
          onClick={() => setFiltersOpen(!filtersOpen)}
          data-testid="button-toggle-filters"
        >
          <Filter size={15} />Filters {filtersOpen ? "−" : "+"}
        </button>
      </div>

      <div className="fg-chip-row" style={{ marginBottom: 12 }}>
        <button 
          aria-pressed={categoryId === "all"} 
          className={`fg-chip ${categoryId === "all" ? "active" : ""}`} 
          onClick={() => setCategoryId("all")}
          data-testid="chip-category-all"
        >
          All services
        </button>
        {categories?.slice(0, expandedCategories ? categories.length : 4).map((c) => (
          <button 
            aria-pressed={categoryId === c.id} 
            className={`fg-chip ${categoryId === c.id ? "active" : ""}`} 
            onClick={() => setCategoryId(c.id)} 
            key={c.id}
            data-testid={`chip-category-${c.id}`}
          >
            {c.name}
          </button>
        ))}
        {categories && categories.length > 4 && (
          <button 
            className="fg-chip" 
            onClick={() => setExpandedCategories(!expandedCategories)}
            data-testid="button-expand-categories"
          >
            {expandedCategories ? "Fewer categories" : "More categories"} <ChevronDown />
          </button>
        )}
      </div>

      {filtersOpen && (
        <div className="fg-refine" data-testid="container-refinements">
          <select className="fg-filter-select" value={price} onChange={(e) => setPrice(e.target.value)} aria-label="Price range" data-testid="select-filter-price">
            <option>Any price</option>
            <option>Under $150</option>
            <option>$150–$300</option>
          </select>
          <select className="fg-filter-select" value={rating} onChange={(e) => setRating(e.target.value)} aria-label="Minimum rating" data-testid="select-filter-rating">
            <option>Any rating</option>
            <option>4.5 and above</option>
            <option>4.0 and above</option>
          </select>
          <select className="fg-filter-select" value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort services" data-testid="select-filter-sort">
            <option>Recommended</option>
            <option>Lowest price</option>
          </select>
          <button className="fg-link" onClick={clearRefinements} data-testid="button-clear-refinements">Clear refinements</button>
        </div>
      )}

      <div className="fg-section-head">
        <div>
          <p className="fg-kicker">{currentCategoryName}{rating !== "Any rating" ? ` · ${rating}` : ""}</p>
          <h2 className="fg-section-title">Good hands, exactly where you need them</h2>
        </div>
        <p className="fg-section-note" data-testid="text-total-matches">{remoteData?.total || 0} matches</p>
      </div>

      {isLoading ? (
        <div className="fg-card-grid">
          {[1, 2, 3].map(i => (
            <div key={i} className="fg-card fg-service-card animate-pulse bg-gray-50 h-56 border-none" data-testid={`loading-service-${i}`}></div>
          ))}
        </div>
      ) : isError ? (
        <div className="fg-card p-6 text-center text-muted" data-testid="error-services">
          Could not load services. Please try again later.
        </div>
      ) : visibleServices.length > 0 ? (
        <div className="fg-card-grid">
          {visibleServices.map((service) => {
            const providerName = [service.providerFirstName, service.providerLastName].filter(Boolean).join(" ") || service.providerBusinessName || "Provider not listed";
            const imageUrl = service.serviceImage || (service.galleryImages?.length ? service.galleryImages[0] : null);

            return (
              <article className="fg-card fg-service-card" key={service.id} data-testid={`service-card-${service.id}`}>
                <div className="fg-service-top">
                  <span className="fg-service-provider" data-testid={`service-provider-${service.id}`}>
                    Local service
                  </span>
                </div>
                
                {imageUrl && (
                  <div className="mt-3 h-24 rounded-lg bg-gray-100" style={{ backgroundImage: `url(${imageUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }} />
                )}

                <a href={`/services/${service.id}`} style={{ textDecoration: 'none', color: 'inherit' }} data-testid={`service-link-${service.id}`}>
                  <p className="fg-card-title" style={{ marginTop: 19 }}>{service.serviceName}</p>
                </a>
                
                <p className="fg-meta">{providerName} · {service.averageRating ? `${service.averageRating} star` : "Not rated"} · {service.location}</p>
                
                <div style={{ flex: 1 }} />
                
                <p className="fg-meta" style={{ color: "var(--teal)", fontWeight: 700 }}>
                  {service.deliveryTimeframe || service.shortDescription}
                </p>
                
                <div className="fg-facts">
                  <div className="fg-fact" data-testid={`service-price-${service.id}`}>
                    <strong>{service.price ? `$${service.price}` : "Price on request"}</strong>
                    {service.priceBasedOn || "pricing basis not listed"}
                  </div>
                  <div className="fg-fact">
                    <strong>{service.averageRating || "Not rated"}</strong>guest rating
                  </div>
                  <div className="fg-fact">
                    <strong>{service.reviewCount}</strong>reviews
                  </div>
                </div>
                
                <div className="fg-card-rule" />
                
                <div className="fg-card-foot">
                  <span className="fg-service-price">
                    {service.price ? `$${service.price}` : "Price on request"}
                    <span>{service.priceBasedOn || ""}</span>
                  </span>
                  <button 
                    className="fg-card-cta" 
                    onClick={() => handleAddToCart(service.id)}
                    disabled={addedIds.has(service.id) || addToCartMutation.isPending}
                    data-testid={`button-add-to-cart-${service.id}`}
                  >
                    {addedIds.has(service.id) ? "Added" : "Add to trip"} <ArrowUpRight size={13} />
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="fg-card" style={{ padding: 24, marginTop: 16, color: "var(--fg-muted)", textAlign: "center" }} data-testid="empty-services">
          No services match those refinements. <button className="fg-link" onClick={clearRefinements} data-testid="button-clear-all-services">Clear all</button>
        </div>
      )}
    </Shell>
  );
}
