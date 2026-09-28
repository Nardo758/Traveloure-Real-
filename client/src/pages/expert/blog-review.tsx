/**
 * Expert blog review-and-sign (Lane C.4; ledger `2026-09-28-blog-consoles`, Locked Decision 57).
 *
 * Lists the SESSION expert's own posts awaiting their signature (`GET /api/expert/blog/review`) and
 * shows each one in full — title, summary, plain-text body (never HTML) and sources. "Sign" posts the
 * `contentSha256` the review endpoint returned for THAT version: the hash is never computed or
 * re-typed here, so the signature covers exactly what was on screen, and a post edited since the page
 * loaded is refused by the server (`content_changed_since_review`) rather than signed blind.
 * The signature is the per-post publishing consent (ruling 2); publishing is still an admin's act.
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { ExpertLayout } from "@/components/expert/expert-layout";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, PenLine } from "lucide-react";
import { BLOG_SIGN_COPY, serverErrorText } from "@/lib/blog-console";
import { BLOG_SOURCE_LINK_REL, bodyParagraphs } from "@/lib/blog-view";

interface ReviewSource { url: string; title: string | null; publisher: string | null; quote: string | null }
interface ReviewPost {
  id: string;
  slug: string;
  contentType: string;
  marketSlug: string | null;
  title: string;
  summary: string | null;
  body: string;
  contentSha256: string;
  sources: ReviewSource[];
}

const REVIEW_KEY = "/api/expert/blog/review";

function ReviewCard({ post }: { post: ReviewPost }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [consent, setConsent] = useState(false);

  const sign = useMutation({
    // The hash is the one the server returned for this version — never computed here.
    mutationFn: () => apiRequest("POST", `/api/expert/blog/posts/${post.id}/sign`, { contentSha256: post.contentSha256 }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [REVIEW_KEY] });
      toast({ title: "Signed", description: BLOG_SIGN_COPY.publishNote });
    },
  });

  return (
    <Card data-testid={`card-blog-review-${post.id}`}>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">{post.contentType}</Badge>
          {post.marketSlug && <Badge variant="outline">{post.marketSlug}</Badge>}
        </div>
        <h2 className="text-lg font-semibold mt-1" data-testid={`text-review-title-${post.id}`}>{post.title}</h2>
        {post.summary && <p className="text-sm italic text-muted-foreground">{post.summary}</p>}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-3 text-sm leading-relaxed">
          {bodyParagraphs(post.body).map((p, i) => <p key={i} className="whitespace-pre-line">{p}</p>)}
        </div>
        {post.sources.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold">Sources</h3>
            <ol className="list-decimal pl-5 space-y-1 text-sm">
              {post.sources.map((s, i) => (
                <li key={i}>
                  <a href={s.url} target="_blank" rel={BLOG_SOURCE_LINK_REL} className="underline">{s.title || s.url}</a>
                  {s.publisher && <span className="text-muted-foreground"> — {s.publisher}</span>}
                  {s.quote && <blockquote className="border-l-2 pl-2 mt-1 text-muted-foreground">“{s.quote}”</blockquote>}
                </li>
              ))}
            </ol>
          </div>
        )}
        <div className="rounded border p-3 space-y-2 bg-muted/30">
          <label className="flex items-start gap-2 text-sm">
            <Checkbox checked={consent} onCheckedChange={(v) => setConsent(v === true)} data-testid={`checkbox-sign-consent-${post.id}`} />
            <span>I have read this version and consent to it being published under my name.</span>
          </label>
          {sign.error && (
            <p className="text-sm text-destructive" role="alert" data-testid={`text-sign-error-${post.id}`}>
              Server said: {serverErrorText(sign.error)}
            </p>
          )}
          <Button disabled={!consent || sign.isPending} onClick={() => sign.mutate()} data-testid={`button-sign-${post.id}`}>
            {sign.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Sign this version"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function ExpertBlogReview() {
  const { data, isLoading, isError, error } = useQuery<{ posts: ReviewPost[] }>({ queryKey: [REVIEW_KEY] });
  const posts = data?.posts;

  return (
    <ExpertLayout title="Blog review">
      <div className="p-6 space-y-6 max-w-3xl">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2"><PenLine className="w-5 h-5" /> Posts awaiting your signature</h1>
          <p className="text-sm text-muted-foreground mt-1">{BLOG_SIGN_COPY.intro}</p>
          <p className="text-sm text-muted-foreground mt-1">{BLOG_SIGN_COPY.publishNote}</p>
          <p className="text-sm text-muted-foreground mt-1">{BLOG_SIGN_COPY.reSignNote}</p>
        </div>
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
        ) : isError ? (
          <p className="text-sm text-destructive" role="alert" data-testid="text-review-load-failed">
            Could not load your review queue. Server said: {serverErrorText(error)}
          </p>
        ) : !posts || posts.length === 0 ? (
          <p className="text-sm text-muted-foreground" data-testid="text-review-empty">{BLOG_SIGN_COPY.empty}</p>
        ) : (
          <div className="space-y-6">{posts.map((p) => <ReviewCard key={p.id} post={p} />)}</div>
        )}
      </div>
    </ExpertLayout>
  );
}
