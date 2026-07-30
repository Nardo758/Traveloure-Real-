import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowRight, Compass } from "lucide-react";

/**
 * §13: this page previously rendered six fabricated articles attributed to
 * invented "platform experts". There is no article store or CMS behind /blog,
 * so the honest state is an empty one — a real post can only appear once there
 * is a real source for it.
 */
export default function BlogPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <section className="bg-gradient-to-br from-primary to-primary/80 text-primary-foreground py-16">
        <div className="container mx-auto px-4 max-w-6xl">
          <div className="text-center">
            <h1 className="text-4xl md:text-5xl font-bold mb-4">
              Traveloure Blog
            </h1>
            <p className="text-xl text-primary-foreground/90 max-w-2xl mx-auto">
              Travel inspiration, insider tips and destination guides from our
              community of local experts
            </p>
          </div>
        </div>
      </section>

      {/* Empty state */}
      <section className="py-20">
        <div className="container mx-auto px-4 max-w-2xl text-center">
          <Compass className="w-16 h-16 mx-auto text-muted-foreground mb-6" />
          <h2 className="text-2xl font-bold mb-3" data-testid="text-blog-empty-title">
            No posts yet
          </h2>
          <p className="text-muted-foreground mb-8">
            We haven't published anything here yet. In the meantime, the real
            expert knowledge on Traveloure lives in the destinations and experts
            you can browse today.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link href="/discover">
              <Button data-testid="button-blog-discover">
                Explore destinations <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </Link>
            <Link href="/experts">
              <Button variant="outline" data-testid="button-blog-experts">
                Browse experts
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
