import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { ArrowRight, Compass } from "lucide-react";
import { SEOHead } from "@/components/seo-head";
import { useImpressionTracker } from "@/hooks/use-impression-tracker";
import { BLOG_IMPRESSION_CONTENT_TYPE } from "@shared/blog";
import {
  authorLine,
  blogIndexNoindex,
  blogPostPath,
  publishedLabel,
  type PublicBlogPost,
} from "@/lib/blog-view";

/**
 * The blog index (Lane C.3b; ledger `2026-09-27-blog-pages`, Locked Decision 57).
 *
 * It renders exactly what `GET /api/blog/posts` returns — published posts only, already ranked by
 * the server (ruling 6). It decides nothing about publication or order, shows no reader or reaction
 * number, and keeps the honest empty state: while nothing is published the page says so and is
 * `noindex` here and in the server's `X-Robots-Tag` (server/services/blog-seo.service.ts). A failed
 * load is NOT the empty state — it says the posts could not be loaded (§13).
 */
export default function BlogPage() {
  const { data, isLoading, isError } = useQuery<{ posts: PublicBlogPost[] }>({
    queryKey: ["/api/blog/posts"],
  });
  const posts = data?.posts;
  const noindex = blogIndexNoindex(posts);

  return (
    <div className="min-h-screen bg-background">
      <SEOHead
        title="Blog"
        url="/blog"
        description="Destination guides and field notes signed by the local experts who wrote them."
        noindex={noindex}
      />
      <section className="bg-gradient-to-br from-primary to-primary/80 text-primary-foreground py-16">
        <div className="container mx-auto px-4 max-w-6xl text-center">
          <h1 className="text-4xl md:text-5xl font-bold mb-4">Traveloure Blog</h1>
          <p className="text-xl text-primary-foreground/90 max-w-2xl mx-auto">
            Guides and field notes, each signed by the local expert who wrote it
          </p>
        </div>
      </section>

      <section className="py-12">
        <div className="container mx-auto px-4 max-w-3xl">
          {isLoading ? (
            <p className="text-center text-muted-foreground" data-testid="text-blog-loading">Loading posts…</p>
          ) : isError ? (
            <p className="text-center text-muted-foreground" data-testid="text-blog-error">
              We couldn't load the posts right now. Please try again in a moment.
            </p>
          ) : !posts || posts.length === 0 ? (
            <BlogEmptyState />
          ) : (
            <ul className="space-y-6" data-testid="list-blog-posts">
              {posts.map((post, i) => (
                <BlogCard key={post.slug} post={post} position={i + 1} />
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}

function BlogCard({ post, position }: { post: PublicBlogPost; position: number }) {
  // Impressions feed the server's ranking only (ruling 6); the card shows none.
  const { ref } = useImpressionTracker(BLOG_IMPRESSION_CONTENT_TYPE, post.slug, post.marketSlug ?? "", position);
  const author = authorLine(post);
  const date = publishedLabel(post.publishedAt);
  return (
    <li>
      <div ref={ref} className="rounded-lg border bg-card p-6" data-testid={`card-blog-post-${post.slug}`}>
        <Link href={blogPostPath(post.slug)} className="block">
          <h2 className="text-2xl font-semibold hover:underline">{post.title}</h2>
        </Link>
        {post.summary && <p className="mt-2 text-muted-foreground">{post.summary}</p>}
        {(author || date) && (
          <p className="mt-3 text-sm text-muted-foreground">
            {[author, date].filter(Boolean).join(" · ")}
          </p>
        )}
      </div>
    </li>
  );
}

function BlogEmptyState() {
  return (
    <div className="text-center py-8">
      <Compass className="w-16 h-16 mx-auto text-muted-foreground mb-6" />
      <h2 className="text-2xl font-bold mb-3" data-testid="text-blog-empty-title">No posts yet</h2>
      <p className="text-muted-foreground mb-8">
        We haven't published anything here yet. In the meantime, the real expert knowledge on
        Traveloure lives in the destinations and experts you can browse today.
      </p>
      <div className="flex flex-wrap justify-center gap-3">
        <Link href="/discover">
          <Button data-testid="button-blog-discover">
            Explore destinations <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </Link>
        <Link href="/experts">
          <Button variant="outline" data-testid="button-blog-experts">Browse experts</Button>
        </Link>
      </div>
    </div>
  );
}
