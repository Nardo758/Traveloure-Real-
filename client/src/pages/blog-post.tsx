import { useState } from "react";
import { Link, useLocation, useRoute } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { ArrowLeft, MessageCircle } from "lucide-react";
import { SEOHead } from "@/components/seo-head";
import { useAuth } from "@/hooks/use-auth";
import { useSignInModal } from "@/contexts/SignInModalContext";
import { apiRequest } from "@/lib/queryClient";
import { conversationChatPath, startConversation } from "@/lib/earner-address";
import { usePlanning } from "@/contexts/PlanningContext";
import { planAroundSource } from "@/components/landing/events-strip";
import type { BlogReactionKind } from "@shared/blog";
import {
  BLOG_REACTION_LABELS,
  BLOG_REACTION_ORDER,
  BLOG_SOURCE_LINK_REL,
  blogPostNoindex,
  bodyParagraphs,
  bylinePath,
  canAskTheLocal,
  publishedLabel,
  type PublicBlogPost,
  type BlogPlanDoor,
} from "@/lib/blog-view";

/**
 * One published post (Lane C.3b; ledger `2026-09-27-blog-pages`, Locked Decision 57).
 *
 * Renders the server's allowlist projection only: the body as plain paragraphs (never HTML), the
 * byline as a link to the expert's storefront by HANDLE (LD 40), every source with attribution,
 * the reader's OWN reactions (ruling 6 — no totals, ever), and "Ask the local" (ruling 7), which
 * opens a conversation through the ONE contact start rail with the post's slug. A post that is not
 * published is simply "not found" and is `noindex`, exactly as the server's header says.
 */
export default function BlogPostPage() {
  const [, params] = useRoute("/blog/:slug");
  const slug = params?.slug ?? "";
  const { data, isLoading, isError, error } = useQuery<{ post: PublicBlogPost }>({
    queryKey: [`/api/blog/posts/${encodeURIComponent(slug)}`],
    enabled: slug.length > 0,
    retry: false,
  });
  const post = data?.post ?? null;
  const notFound = isError && /^404/.test(String((error as Error)?.message ?? ""));

  return (
    <div className="min-h-screen bg-background">
      <SEOHead
        title={post?.title ?? "Blog"}
        description={post?.summary ?? undefined}
        url={`/blog/${slug}`}
        type="article"
        publishedTime={post?.publishedAt ?? undefined}
        noindex={blogPostNoindex(post)}
      />
      <div className="container mx-auto px-4 max-w-3xl py-10">
        <Link href="/blog" className="inline-flex items-center text-sm text-muted-foreground hover:underline">
          <ArrowLeft className="w-4 h-4 mr-1" /> All posts
        </Link>
        {isLoading ? (
          <p className="mt-8 text-muted-foreground" data-testid="text-blog-post-loading">Loading…</p>
        ) : !post ? (
          <p className="mt-8 text-muted-foreground" data-testid="text-blog-post-missing">
            {notFound || !isError ? "This post isn't available." : "We couldn't load this post right now."}
          </p>
        ) : (
          <PostBody post={post} />
        )}
      </div>
    </div>
  );
}

function PostBody({ post }: { post: PublicBlogPost }) {
  const storefront = bylinePath(post.byline);
  const date = publishedLabel(post.publishedAt);
  return (
    <article className="mt-6" data-testid={`article-blog-post-${post.slug}`}>
      <h1 className="text-4xl font-bold">{post.title}</h1>
      <p className="mt-3 text-sm text-muted-foreground">
        {post.byline && storefront ? (
          <Link href={storefront} className="font-medium hover:underline" data-testid="link-blog-byline">
            {post.byline.displayName}
          </Link>
        ) : post.platformLabel ? (
          <span data-testid="text-blog-platform-label">{post.platformLabel}</span>
        ) : null}
        {date && <span>{post.byline || post.platformLabel ? " · " : ""}{date}</span>}
      </p>
      {post.summary && <p className="mt-6 text-lg text-muted-foreground">{post.summary}</p>}
      <div className="mt-6 space-y-4 leading-relaxed">
        {bodyParagraphs(post.body).map((p, i) => (
          <p key={i} className="whitespace-pre-line">{p}</p>
        ))}
      </div>

      {post.planDoor && <StartThisPlanDoor door={post.planDoor} />}
      {post.seriesDoors && post.seriesDoors.length > 0 && <SeriesDoors doors={post.seriesDoors} />}

      {post.sources.length > 0 && (
        <section className="mt-10" data-testid="section-blog-sources">
          <h2 className="text-lg font-semibold">Sources</h2>
          <ol className="mt-3 space-y-3 list-decimal pl-5">
            {post.sources.map((s, i) => (
              <li key={i}>
                <a href={s.url} target="_blank" rel={BLOG_SOURCE_LINK_REL} className="underline">
                  {s.title || s.url}
                </a>
                {s.publisher && <span className="text-muted-foreground"> — {s.publisher}</span>}
                {s.quote && <blockquote className="mt-1 border-l-2 pl-3 text-muted-foreground italic">{s.quote}</blockquote>}
              </li>
            ))}
          </ol>
        </section>
      )}

      <Reactions slug={post.slug} />
      {canAskTheLocal(post) && <AskTheLocal post={post} />}
    </article>
  );
}

/** The reader's OWN reactions. Guests are asked to sign in; nobody ever sees a total (ruling 6). */
function Reactions({ slug }: { slug: string }) {
  const { user } = useAuth();
  const { openSignInModal } = useSignInModal();
  const queryClient = useQueryClient();
  const key = [`/api/blog/posts/${encodeURIComponent(slug)}/reactions/mine`];
  const { data } = useQuery<{ reactions: BlogReactionKind[] }>({ queryKey: key, enabled: !!user });
  const mine = new Set(data?.reactions ?? []);
  const toggle = useMutation({
    mutationFn: async (kind: BlogReactionKind) => {
      const base = `/api/blog/posts/${encodeURIComponent(slug)}/reactions`;
      const res = mine.has(kind)
        ? await apiRequest("DELETE", `${base}/${kind}`)
        : await apiRequest("POST", base, { kind });
      return (await res.json()) as { reactions: BlogReactionKind[] };
    },
    onSuccess: (next) => queryClient.setQueryData(key, next),
  });
  return (
    <section className="mt-10 flex flex-wrap gap-2" data-testid="section-blog-reactions">
      {BLOG_REACTION_ORDER.map((kind) => (
        <Button
          key={kind}
          type="button"
          size="sm"
          variant={mine.has(kind) ? "default" : "outline"}
          aria-pressed={mine.has(kind)}
          disabled={toggle.isPending}
          onClick={() => (user ? toggle.mutate(kind) : openSignInModal())}
          data-testid={`button-blog-reaction-${kind}`}
        >
          {BLOG_REACTION_LABELS[kind]}
        </Button>
      ))}
    </section>
  );
}

/** "Ask the local" (ruling 7): opens a conversation by the post's slug; the server names the expert. */
function AskTheLocal({ post }: { post: PublicBlogPost }) {
  const { user } = useAuth();
  const { openSignInModal } = useSignInModal();
  const [, navigate] = useLocation();
  const [failed, setFailed] = useState(false);
  const [pending, setPending] = useState(false);
  const ask = async () => {
    if (!user) return openSignInModal();
    setPending(true);
    setFailed(false);
    const started = await startConversation({ blogPostSlug: post.slug });
    setPending(false);
    if (!started) return setFailed(true);
    navigate(conversationChatPath(started.conversationId, {
      name: started.recipient.displayName || null,
      avatar: started.recipient.avatarUrl,
    }));
  };
  return (
    <section className="mt-8 rounded-lg border p-5" data-testid="section-blog-ask-local">
      <p className="font-medium">Have a question for {post.byline!.displayName}?</p>
      <Button className="mt-3" onClick={ask} disabled={pending} data-testid="button-blog-ask-local">
        <MessageCircle className="w-4 h-4 mr-2" /> Ask the local
      </Button>
      {failed && (
        <p className="mt-2 text-sm text-muted-foreground" data-testid="text-blog-ask-failed">
          We couldn't open a conversation right now. Please try again.
        </p>
      )}
    </section>
  );
}

/**
 * An event post's ONE door (ledger `2026-09-30-blog-event-guide`): opens the one planning modal with
 * the event as the fixed anchor, through the SAME `planAroundSource` the events strip uses, door
 * `blog_post`. Minutes and distances appear inside the plan, never on the post.
 */
/** A series follow: one dated row per live instance, each its own door into the one planning modal. */
function SeriesDoors({ doors }: { doors: BlogPlanDoor[] }) {
  const { open } = usePlanning();
  return (
    <section className="mt-10" data-testid="section-blog-series-doors">
      <ul className="space-y-3">
        {doors.map((door, i) => (
          <li key={`${door.city}-${door.firstDate}`} className="flex flex-wrap items-center justify-between gap-3 border-b pb-3">
            <span>
              <span className="font-mono text-sm">{door.firstDate}</span> · {door.city} · {door.venue}
            </span>
            <Button variant="outline" onClick={() => open(planAroundSource({ ...door, series: null }, "blog_post"))} data-testid={`button-blog-series-plan-${i}`}>
              Start this plan
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function StartThisPlanDoor({ door }: { door: NonNullable<PublicBlogPost["planDoor"]> }) {
  const { open } = usePlanning();
  return (
    <section className="mt-10" data-testid="section-blog-plan-door">
      <Button onClick={() => open(planAroundSource({ ...door, series: null }, "blog_post"))} data-testid="button-blog-start-plan">
        Start this plan
      </Button>
    </section>
  );
}
