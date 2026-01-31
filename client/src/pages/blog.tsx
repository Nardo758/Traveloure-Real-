import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { 
  Search, 
  Calendar, 
  User, 
  ArrowRight,
  TrendingUp,
  MapPin,
  Heart,
  Compass
} from "lucide-react";

const blogPosts = [
  {
    id: 1,
    title: "10 Hidden Gems in Paris You've Never Heard Of",
    excerpt: "Discover the secret spots that locals cherish but tourists rarely find. From hidden gardens to underground speakeasies...",
    author: "Marie Laurent",
    authorRole: "Paris Expert",
    date: "2024-01-15",
    category: "Destinations",
    readTime: "5 min read",
    image: "https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=800&h=500&fit=crop",
    featured: true
  },
  {
    id: 2,
    title: "The Ultimate Guide to Planning a Honeymoon in Bali",
    excerpt: "Everything you need to know to plan the perfect romantic getaway to Indonesia's paradise island...",
    author: "Isabella Chen",
    authorRole: "Honeymoon Specialist",
    date: "2024-01-12",
    category: "Romance",
    readTime: "8 min read",
    image: "https://images.unsplash.com/photo-1537996194471-e657df975ab4?w=800&h=500&fit=crop",
    featured: true
  },
  {
    id: 3,
    title: "Budget Travel: How to See Europe on $50 a Day",
    excerpt: "Practical tips and insider strategies for exploring Europe without breaking the bank...",
    author: "Travel Team",
    authorRole: "Budget Travel Experts",
    date: "2024-01-10",
    category: "Tips & Guides",
    readTime: "6 min read",
    image: "https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=800&h=500&fit=crop",
    featured: false
  },
  {
    id: 4,
    title: "Tokyo Street Food: A Local's Guide",
    excerpt: "Navigate Tokyo's incredible street food scene like a local with our comprehensive guide...",
    author: "Kenji Tanaka",
    authorRole: "Tokyo Expert",
    date: "2024-01-08",
    category: "Food & Drink",
    readTime: "7 min read",
    image: "https://images.unsplash.com/photo-1542051841857-5f90071e7989?w=800&h=500&fit=crop",
    featured: false
  },
  {
    id: 5,
    title: "Sustainable Travel: How to Reduce Your Carbon Footprint",
    excerpt: "Travel responsibly with these eco-friendly tips that make a real difference...",
    author: "Green Travel Initiative",
    authorRole: "Sustainability Experts",
    date: "2024-01-05",
    category: "Sustainability",
    readTime: "6 min read",
    image: "https://images.unsplash.com/photo-1501594907352-04cda38ebc29?w=800&h=500&fit=crop",
    featured: false
  },
  {
    id: 6,
    title: "Best Photography Spots in Santorini",
    excerpt: "Capture the magic of Greece's most photogenic island with our location guide...",
    author: "Sophie Anderson",
    authorRole: "Travel Photographer",
    date: "2024-01-03",
    category: "Photography",
    readTime: "5 min read",
    image: "https://images.unsplash.com/photo-1613395877344-13d4a8e0d49e?w=800&h=500&fit=crop",
    featured: false
  },
];

const categories = [
  "All Posts",
  "Destinations",
  "Tips & Guides",
  "Food & Drink",
  "Romance",
  "Photography",
  "Sustainability"
];

export default function BlogPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All Posts");

  const filteredPosts = blogPosts.filter((post) => {
    const matchesSearch = 
      searchQuery === "" ||
      post.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      post.excerpt.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesCategory = 
      selectedCategory === "All Posts" || 
      post.category === selectedCategory;
    
    return matchesSearch && matchesCategory;
  });

  const featuredPosts = blogPosts.filter(post => post.featured);
  const regularPosts = filteredPosts.filter(post => !post.featured);

  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <section className="bg-gradient-to-br from-primary to-primary/80 text-primary-foreground py-16">
        <div className="container mx-auto px-4 max-w-6xl">
          <div className="text-center mb-8">
            <h1 className="text-4xl md:text-5xl font-bold mb-4">
              Traveloure Blog
            </h1>
            <p className="text-xl text-primary-foreground/90 max-w-2xl mx-auto">
              Travel inspiration, insider tips, and destination guides from our community of local experts
            </p>
          </div>

          {/* Search Bar */}
          <div className="max-w-2xl mx-auto">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <Input
                placeholder="Search articles..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 h-12 bg-white"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Category Filter */}
      <section className="py-8 border-b">
        <div className="container mx-auto px-4 max-w-6xl">
          <div className="flex flex-wrap gap-2 justify-center">
            {categories.map((category) => (
              <Button
                key={category}
                variant={selectedCategory === category ? "default" : "outline"}
                onClick={() => setSelectedCategory(category)}
                className="rounded-full"
              >
                {category}
              </Button>
            ))}
          </div>
        </div>
      </section>

      {/* Featured Posts */}
      {selectedCategory === "All Posts" && featuredPosts.length > 0 && (
        <section className="py-12 bg-muted/30">
          <div className="container mx-auto px-4 max-w-6xl">
            <div className="flex items-center gap-2 mb-6">
              <TrendingUp className="w-5 h-5 text-primary" />
              <h2 className="text-2xl font-bold">Featured Articles</h2>
            </div>
            
            <div className="grid md:grid-cols-2 gap-6">
              {featuredPosts.map((post) => (
                <Card key={post.id} className="overflow-hidden hover:shadow-lg transition-shadow group cursor-pointer">
                  <div className="relative h-64 overflow-hidden">
                    <img 
                      src={post.image} 
                      alt={post.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                    <Badge className="absolute top-4 left-4">
                      {post.category}
                    </Badge>
                  </div>
                  <CardContent className="p-6">
                    <h3 className="text-xl font-bold mb-2 group-hover:text-primary transition-colors">
                      {post.title}
                    </h3>
                    <p className="text-muted-foreground mb-4 line-clamp-2">
                      {post.excerpt}
                    </p>
                    <div className="flex items-center justify-between text-sm text-muted-foreground">
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1">
                          <User className="w-4 h-4" />
                          <span>{post.author}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Calendar className="w-4 h-4" />
                          <span>{new Date(post.date).toLocaleDateString()}</span>
                        </div>
                      </div>
                      <span>{post.readTime}</span>
                    </div>
                    <Button variant="ghost" className="w-full mt-4 group/btn">
                      Read More
                      <ArrowRight className="w-4 h-4 ml-2 group-hover/btn:translate-x-1 transition-transform" />
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* All Posts */}
      <section className="py-12">
        <div className="container mx-auto px-4 max-w-6xl">
          <h2 className="text-2xl font-bold mb-6">
            {selectedCategory === "All Posts" ? "Latest Articles" : selectedCategory}
          </h2>
          
          {regularPosts.length > 0 ? (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {regularPosts.map((post) => (
                <Card key={post.id} className="overflow-hidden hover:shadow-lg transition-shadow group cursor-pointer">
                  <div className="relative h-48 overflow-hidden">
                    <img 
                      src={post.image} 
                      alt={post.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                    <Badge className="absolute top-4 left-4" variant="secondary">
                      {post.category}
                    </Badge>
                  </div>
                  <CardContent className="p-6">
                    <h3 className="text-lg font-bold mb-2 group-hover:text-primary transition-colors line-clamp-2">
                      {post.title}
                    </h3>
                    <p className="text-sm text-muted-foreground mb-4 line-clamp-2">
                      {post.excerpt}
                    </p>
                    <div className="flex items-center justify-between text-xs text-muted-foreground mb-4">
                      <span>{post.author}</span>
                      <span>{post.readTime}</span>
                    </div>
                    <Button variant="ghost" size="sm" className="w-full group/btn">
                      Read Article
                      <ArrowRight className="w-4 h-4 ml-2 group-hover/btn:translate-x-1 transition-transform" />
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="text-center py-16">
              <Compass className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No articles found</h3>
              <p className="text-muted-foreground mb-4">
                Try adjusting your search or browse all posts
              </p>
              <Button 
                variant="outline"
                onClick={() => {
                  setSearchQuery("");
                  setSelectedCategory("All Posts");
                }}
              >
                Clear Filters
              </Button>
            </div>
          )}
        </div>
      </section>

      {/* Newsletter CTA */}
      <section className="py-16 bg-muted/30">
        <div className="container mx-auto px-4 max-w-4xl text-center">
          <Heart className="w-12 h-12 mx-auto mb-4 text-primary" />
          <h2 className="text-3xl font-bold mb-4">Never Miss an Adventure</h2>
          <p className="text-muted-foreground mb-8 max-w-2xl mx-auto">
            Subscribe to our newsletter for travel inspiration, insider tips, and exclusive deals delivered to your inbox
          </p>
          <div className="flex gap-2 max-w-md mx-auto">
            <Input 
              type="email" 
              placeholder="Enter your email"
              className="flex-1"
            />
            <Button>Subscribe</Button>
          </div>
        </div>
      </section>
    </div>
  );
}
