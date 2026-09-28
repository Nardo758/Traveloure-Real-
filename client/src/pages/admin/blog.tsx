/**
 * Admin blog console (Lane C.4; ledger `2026-09-28-blog-consoles`, Locked Decision 57).
 *
 * Lists every post by status, creates a draft by hand or from research + AI, edits, and moves a post
 * along its lifecycle. The server owns every decision: which buttons appear is ONE pure rule
 * (`client/src/lib/blog-console.ts`) that mirrors the server's from-states, and every refusal is
 * shown as the server wrote it. Editing a signed or published post clears the expert's signature
 * (ruling 3) and the page says so BEFORE the save. A failed load is a failure, never "no posts" (§13).
 * Bodies are plain text — never rendered as HTML.
 */
import { useState } from "react";
import { AdminLayout } from "@/components/admin-layout";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Newspaper, Loader2, Plus, Trash2 } from "lucide-react";
import { BLOG_CONTENT_TYPES, BLOG_POST_STATUSES } from "@shared/blog";
import {
  BLOG_ACTION_LABELS,
  BLOG_STATUS_LABELS,
  blogConsoleActions,
  canEditBlogPost,
  createPostBody,
  draftPostBody,
  editConsequence,
  editPostBody,
  serverErrorText,
  statusLabel,
  type BlogConsoleAction,
  type BlogCreateForm,
  type BlogDraftForm,
  type BlogSourceForm,
} from "@/lib/blog-console";
import { bodyParagraphs } from "@/lib/blog-view";

interface AdminBlogPost {
  id: string;
  slug: string;
  contentType: string;
  authorship: string;
  status: string;
  marketSlug: string | null;
  occasionSlug: string | null;
  title: string;
  summary: string | null;
  body: string;
  contentSha256: string;
  signedContentSha256: string | null;
  signedAt: string | null;
  publishedAt: string | null;
  withdrawnAt: string | null;
  withdrawReason: string | null;
  updatedAt: string | null;
}

const LIST_KEY = "/api/admin/blog/posts";
const ALL = "all";

function useInvalidateList() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: [LIST_KEY] });
}

function ErrorLine({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <p className="text-sm text-destructive" role="alert" data-testid="text-blog-error">
      Server said: {serverErrorText(error)}
    </p>
  );
}

function ContentTypeSelect({ value, onChange, testId }: { value: string; onChange: (v: string) => void; testId: string }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-9 w-64 text-sm" data-testid={testId}>
        <SelectValue placeholder="Content type" />
      </SelectTrigger>
      <SelectContent>
        {BLOG_CONTENT_TYPES.map((t) => (
          <SelectItem key={t} value={t}>{t}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-xs text-muted-foreground block">{label}</label>
      {children}
    </div>
  );
}

const emptySource = (): BlogSourceForm => ({ url: "", title: "", publisher: "", quote: "" });

function CreatePostForm({ onDone }: { onDone: () => void }) {
  const { toast } = useToast();
  const invalidate = useInvalidateList();
  const [form, setForm] = useState<BlogCreateForm>({
    contentType: BLOG_CONTENT_TYPES[0],
    slug: "", title: "", summary: "", body: "",
    marketSlug: "", occasionSlug: "", bylineExpertId: "",
    sources: [],
  });
  const set = (patch: Partial<BlogCreateForm>) => setForm((f) => ({ ...f, ...patch }));
  const setSource = (i: number, patch: Partial<BlogSourceForm>) =>
    setForm((f) => ({ ...f, sources: f.sources.map((s, j) => (j === i ? { ...s, ...patch } : s)) }));

  const create = useMutation({
    mutationFn: () => apiRequest("POST", LIST_KEY, createPostBody(form)),
    onSuccess: () => { invalidate(); toast({ title: "Draft created" }); onDone(); },
  });

  return (
    <Card data-testid="card-blog-create">
      <CardHeader className="pb-2"><h3 className="font-semibold">Write a draft</h3></CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-3">
          <Field label="Content type"><ContentTypeSelect value={form.contentType} onChange={(v) => set({ contentType: v })} testId="select-create-content-type" /></Field>
          <Field label="Slug (lower-case-words)"><Input className="h-9 w-64" value={form.slug} onChange={(e) => set({ slug: e.target.value })} data-testid="input-create-slug" /></Field>
          <Field label="Market slug"><Input className="h-9 w-40" value={form.marketSlug} onChange={(e) => set({ marketSlug: e.target.value })} data-testid="input-create-market" /></Field>
          <Field label="Occasion slug (optional)"><Input className="h-9 w-48" value={form.occasionSlug} onChange={(e) => set({ occasionSlug: e.target.value })} data-testid="input-create-occasion" /></Field>
          <Field label="Byline expert id (expert posts only)"><Input className="h-9 w-72" value={form.bylineExpertId} onChange={(e) => set({ bylineExpertId: e.target.value })} data-testid="input-create-byline" /></Field>
        </div>
        <Field label="Title"><Input value={form.title} onChange={(e) => set({ title: e.target.value })} data-testid="input-create-title" /></Field>
        <Field label="Summary (optional)"><Textarea rows={2} value={form.summary} onChange={(e) => set({ summary: e.target.value })} data-testid="input-create-summary" /></Field>
        <Field label="Body (plain text; a blank line separates paragraphs)"><Textarea rows={10} value={form.body} onChange={(e) => set({ body: e.target.value })} data-testid="input-create-body" /></Field>
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Sources. Quotes over the configured limit and partner domains are refused by the server, never trimmed.
          </p>
          {form.sources.map((s, i) => (
            <div key={i} className="flex flex-wrap gap-2 items-end" data-testid={`row-create-source-${i}`}>
              <Input className="h-8 w-72" placeholder="URL" value={s.url} onChange={(e) => setSource(i, { url: e.target.value })} />
              <Input className="h-8 w-48" placeholder="Title" value={s.title} onChange={(e) => setSource(i, { title: e.target.value })} />
              <Input className="h-8 w-40" placeholder="Publisher" value={s.publisher} onChange={(e) => setSource(i, { publisher: e.target.value })} />
              <Input className="h-8 w-72" placeholder="Short quote" value={s.quote} onChange={(e) => setSource(i, { quote: e.target.value })} />
              <Button size="sm" variant="ghost" className="h-8" onClick={() => set({ sources: form.sources.filter((_, j) => j !== i) })} aria-label="Remove source">
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          ))}
          <Button size="sm" variant="outline" onClick={() => set({ sources: [...form.sources, emptySource()] })} data-testid="button-create-add-source">
            <Plus className="w-4 h-4 mr-1" /> Add source
          </Button>
        </div>
        <ErrorLine error={create.error} />
        <div className="flex gap-2">
          <Button disabled={create.isPending || !form.title.trim() || !form.body.trim() || !form.slug.trim()} onClick={() => create.mutate()} data-testid="button-create-draft">
            {create.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Create draft"}
          </Button>
          <Button variant="ghost" onClick={onDone}>Cancel</Button>
        </div>
      </CardContent>
    </Card>
  );
}

function AiDraftForm({ onDone }: { onDone: () => void }) {
  const { toast } = useToast();
  const invalidate = useInvalidateList();
  const [form, setForm] = useState<BlogDraftForm>({
    contentType: BLOG_CONTENT_TYPES[0], slug: "", topic: "", marketSlug: "", occasionSlug: "", bylineExpertId: "",
  });
  const set = (patch: Partial<BlogDraftForm>) => setForm((f) => ({ ...f, ...patch }));
  const draft = useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/blog/drafts", draftPostBody(form)),
    onSuccess: () => { invalidate(); toast({ title: "AI draft created", description: "It is a draft: read it before it goes anywhere." }); onDone(); },
  });
  return (
    <Card data-testid="card-blog-ai-draft">
      <CardHeader className="pb-2">
        <h3 className="font-semibold">Research and AI draft</h3>
        <p className="text-xs text-muted-foreground">
          The server researches public sources and drafts a post that cites only those sources. The result is a draft
          like any other; not every content type can be drafted this way, and the server says which it refuses.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-3">
          <Field label="Content type"><ContentTypeSelect value={form.contentType} onChange={(v) => set({ contentType: v })} testId="select-draft-content-type" /></Field>
          <Field label="Slug"><Input className="h-9 w-64" value={form.slug} onChange={(e) => set({ slug: e.target.value })} data-testid="input-draft-slug" /></Field>
          <Field label="Market slug"><Input className="h-9 w-40" value={form.marketSlug} onChange={(e) => set({ marketSlug: e.target.value })} data-testid="input-draft-market" /></Field>
          <Field label="Occasion slug (optional)"><Input className="h-9 w-48" value={form.occasionSlug} onChange={(e) => set({ occasionSlug: e.target.value })} data-testid="input-draft-occasion" /></Field>
          <Field label="Byline expert id (expert posts only)"><Input className="h-9 w-72" value={form.bylineExpertId} onChange={(e) => set({ bylineExpertId: e.target.value })} data-testid="input-draft-byline" /></Field>
        </div>
        <Field label="Topic"><Input value={form.topic} onChange={(e) => set({ topic: e.target.value })} data-testid="input-draft-topic" /></Field>
        <ErrorLine error={draft.error} />
        <div className="flex gap-2">
          <Button disabled={draft.isPending || form.topic.trim().length < 3 || !form.slug.trim()} onClick={() => draft.mutate()} data-testid="button-start-ai-draft">
            {draft.isPending ? <><Loader2 className="w-4 h-4 animate-spin mr-1" /> Researching…</> : "Start AI draft"}
          </Button>
          <Button variant="ghost" onClick={onDone}>Cancel</Button>
        </div>
      </CardContent>
    </Card>
  );
}

function PostCard({ post }: { post: AdminBlogPost }) {
  const { toast } = useToast();
  const invalidate = useInvalidateList();
  const [editing, setEditing] = useState(false);
  const [edit, setEdit] = useState({ title: post.title, summary: post.summary ?? "", body: post.body });
  const [withdrawReason, setWithdrawReason] = useState("");
  const actions = blogConsoleActions(post);
  const consequence = editConsequence(post);

  const act = useMutation({
    mutationFn: (action: BlogConsoleAction) =>
      apiRequest(
        "POST",
        `/api/admin/blog/posts/${post.id}/${action}`,
        action === "withdraw" ? { reason: withdrawReason.trim() || null } : undefined,
      ),
    onSuccess: (_r, action) => { invalidate(); toast({ title: `${BLOG_ACTION_LABELS[action]}: done` }); },
  });

  const save = useMutation({
    mutationFn: () => apiRequest("PATCH", `/api/admin/blog/posts/${post.id}`, editPostBody(edit)),
    onSuccess: () => { invalidate(); setEditing(false); toast({ title: "Saved" }); },
  });

  return (
    <Card data-testid={`card-blog-post-${post.id}`}>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge data-testid={`badge-blog-status-${post.id}`}>{statusLabel(post.status)}</Badge>
          <Badge variant="outline">{post.contentType}</Badge>
          {post.marketSlug && <Badge variant="outline">{post.marketSlug}</Badge>}
          <span className="text-xs text-muted-foreground">/{post.slug}</span>
        </div>
        <h3 className="font-semibold mt-1">{post.title}</h3>
        {post.status === "signed" && !actions.includes("publish") && (
          <p className="text-xs text-destructive">The signature does not cover the current content; it cannot be published until signed again.</p>
        )}
        {post.withdrawReason && <p className="text-xs text-muted-foreground">Withdrawn: {post.withdrawReason}</p>}
      </CardHeader>
      <CardContent className="space-y-3">
        {!editing && (
          <details>
            <summary className="text-sm cursor-pointer">Read the post</summary>
            <div className="mt-2 space-y-2 text-sm">
              {post.summary && <p className="italic">{post.summary}</p>}
              {bodyParagraphs(post.body).map((p, i) => <p key={i} className="whitespace-pre-line">{p}</p>)}
            </div>
          </details>
        )}

        {editing && (
          <div className="space-y-2" data-testid={`form-blog-edit-${post.id}`}>
            {consequence && (
              <p className="text-sm rounded border border-amber-300 bg-amber-50 p-2 text-amber-900" data-testid={`text-edit-consequence-${post.id}`}>
                {consequence}
              </p>
            )}
            <Field label="Title"><Input value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} /></Field>
            <Field label="Summary"><Textarea rows={2} value={edit.summary} onChange={(e) => setEdit({ ...edit, summary: e.target.value })} /></Field>
            <Field label="Body"><Textarea rows={10} value={edit.body} onChange={(e) => setEdit({ ...edit, body: e.target.value })} /></Field>
            <p className="text-xs text-muted-foreground">Sources are kept as they are; this form does not change them.</p>
            <ErrorLine error={save.error} />
            <div className="flex gap-2">
              <Button size="sm" disabled={save.isPending || !edit.title.trim() || !edit.body.trim()} onClick={() => save.mutate()} data-testid={`button-save-edit-${post.id}`}>
                {save.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : consequence ? "Save and clear signature" : "Save"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
            </div>
          </div>
        )}

        {!editing && (
          <div className="flex flex-wrap items-end gap-2">
            {canEditBlogPost(post.status) && (
              <Button size="sm" variant="outline" onClick={() => setEditing(true)} data-testid={`button-edit-${post.id}`}>Edit</Button>
            )}
            {actions.includes("withdraw") && (
              <Input className="h-8 w-64 text-sm" placeholder="Withdraw reason (optional)" value={withdrawReason}
                onChange={(e) => setWithdrawReason(e.target.value)} data-testid={`input-withdraw-reason-${post.id}`} />
            )}
            {actions.map((a) => (
              <Button key={a} size="sm" variant={a === "withdraw" ? "destructive" : "default"} disabled={act.isPending}
                onClick={() => act.mutate(a)} data-testid={`button-${a}-${post.id}`}>
                {BLOG_ACTION_LABELS[a]}
              </Button>
            ))}
            {post.status === "in_review" && (
              <span className="text-xs text-muted-foreground">Waiting for the byline expert to review and sign.</span>
            )}
          </div>
        )}
        <ErrorLine error={act.error} />
      </CardContent>
    </Card>
  );
}

export default function AdminBlog() {
  const [status, setStatus] = useState<string>(ALL);
  const [panel, setPanel] = useState<"none" | "create" | "draft">("none");
  const { data, isLoading, isError, error } = useQuery<{ posts: AdminBlogPost[] }>({
    queryKey: [LIST_KEY, status === ALL ? {} : { status }],
  });
  const posts = data?.posts;

  return (
    <AdminLayout title="Blog">
      <div className="p-6 space-y-6">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Newspaper className="w-5 h-5" /> Expert-signed blog
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Expert posts go draft → review → signed by the expert → published. A post is published only when the
            expert's signature covers its current content, and any edit after signing clears that signature.
            Published posts are withdrawn, never deleted.
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <Field label="Status">
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="h-9 w-64" data-testid="select-blog-status-filter"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All statuses</SelectItem>
                {BLOG_POST_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>{BLOG_STATUS_LABELS[s]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Button variant="outline" onClick={() => setPanel("create")} data-testid="button-open-create">Write a draft</Button>
          <Button variant="outline" onClick={() => setPanel("draft")} data-testid="button-open-ai-draft">Research and AI draft</Button>
        </div>

        {panel === "create" && <CreatePostForm onDone={() => setPanel("none")} />}
        {panel === "draft" && <AiDraftForm onDone={() => setPanel("none")} />}

        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Loading posts…</div>
        ) : isError ? (
          <p className="text-sm text-destructive" role="alert" data-testid="text-blog-load-failed">
            Could not load posts. Server said: {serverErrorText(error)}
          </p>
        ) : !posts || posts.length === 0 ? (
          <p className="text-sm text-muted-foreground" data-testid="text-blog-empty">
            No posts{status === ALL ? "" : ` with status "${statusLabel(status)}"`}.
          </p>
        ) : (
          <div className="space-y-4">
            {posts.map((p) => <PostCard key={p.id} post={p} />)}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
