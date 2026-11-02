/**
 * CN-1e-UI (ledger `2026-11-02-cn1e-ui-task-log`): ONE task log per concierge hire, shown to the traveler and the
 * assigned expert. Only the traveler OKs or withdraws; only the expert resolves, inside the access window — the
 * server enforces both, and these controls only show what the viewer may do (`actionsFor`). Caps come from the
 * listing. Stays and transport are links, never "Booked". No amounts anywhere.
 *
 * Every word comes from `CONCIERGE_TASK_COPY` (client/src/lib/concierge-task-copy.ts). The body (`TaskLogBody`,
 * `TaskRow`, `TaskRequestForm`, `TaskDoneForm`) is pure markup so it renders without a DOM; `ConciergeTaskLog`
 * owns the reads and writes. Writes go through apiRequest and then refetch — never optimistic.
 */
import React, { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ListChecks, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { createSingleFlight, serverMessageOf } from "@/lib/concierge-hire-copy";
import {
  ACTION_PATH,
  CONCIERGE_TASK_COPY,
  actionLabel,
  actionsFor,
  actorName,
  calendarDateOf,
  createBody,
  doneBody,
  kindOptions,
  linkOnlyLine,
  safeLinkProps,
  stateLabel,
  taskErrorCopy,
  taskLogQueryKey,
  type KindOption,
  type ListingTaskOption,
  type TaskAction,
  type TaskView,
  type TaskViewer,
} from "@/lib/concierge-task-copy";

/** ≥430px a centred dialog; below that a full-height sheet with no horizontal overflow. */
export const TASK_LOG_DIALOG_CLASS =
  "max-w-lg w-full overflow-y-auto overflow-x-hidden max-h-[90vh] max-[429px]:h-[100dvh] max-[429px]:max-h-[100dvh] max-[429px]:w-screen max-[429px]:max-w-none max-[429px]:rounded-none max-[429px]:border-0 max-[429px]:p-4";

export interface TaskLogProps {
  bookingId: string;
  tripId?: string | null;
  viewer: TaskViewer;
  expertFirstName: string;
  listingServiceId: string | null | undefined;
}

// ── Pure markup ─────────────────────────────────────────────────────────────────────────────────

export function TaskLinkOrText({ url }: { url: string }) {
  const props = safeLinkProps(url);
  if (!props) {
    return <span className="break-all text-[12px] text-muted-foreground" data-testid="text-task-link-plain">{url}</span>;
  }
  return (
    <a {...props} className="text-[13px] font-medium underline underline-offset-2" data-testid="link-task-open">
      {CONCIERGE_TASK_COPY.openLink}
    </a>
  );
}

export function TaskRow({
  task,
  viewer,
  expertFirstName,
  busy,
  onAction,
  doneFormFor,
}: {
  task: TaskView;
  viewer: TaskViewer;
  expertFirstName: string;
  busy: boolean;
  onAction: (task: TaskView, action: TaskAction) => void;
  doneFormFor?: React.ReactNode;
}) {
  const actions = actionsFor(viewer, task.state);
  const requester = task.requestedBy === viewer ? CONCIERGE_TASK_COPY.byYou : task.requestedBy === "expert" ? expertFirstName : CONCIERGE_TASK_COPY.traveler;
  return (
    <li className="space-y-1.5 rounded-md border p-3 min-w-0" data-testid={`task-row-${task.id}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2 min-w-0">
        <div className="min-w-0">
          <p className="text-[12px] text-muted-foreground break-words">{task.kind.label}</p>
          <p className="text-[14px] font-semibold break-words">{task.title}</p>
        </div>
        <span className="shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium" data-testid={`task-state-${task.id}`}>
          {stateLabel(task.state, task.travelerOkAt)}
        </span>
      </div>
      <p className="text-[11px] text-muted-foreground" data-testid={`task-requested-by-${task.id}`}>{requester}</p>
      {task.note && <p className="text-[13px] break-words">{task.note}</p>}
      {task.kind.linkOnly && (
        <p className="text-[12px] text-muted-foreground break-words" data-testid={`task-link-only-${task.id}`}>
          {linkOnlyLine(expertFirstName)}
        </p>
      )}
      {task.kind.linkOnly && task.state === "done" && task.linkUrl && <TaskLinkOrText url={task.linkUrl} />}
      {task.events.length > 0 && (
        <details className="text-[12px]" data-testid={`task-history-${task.id}`}>
          <summary className="cursor-pointer text-muted-foreground">{CONCIERGE_TASK_COPY.history}</summary>
          <ol className="mt-1 space-y-1">
            {task.events.map((ev, i) => {
              const who = actorName(ev.actorType, viewer, expertFirstName);
              const when = calendarDateOf(ev.createdAt);
              return (
                <li key={i} className="break-words" data-testid={`task-event-${task.id}-${i}`}>
                  {[who, stateLabel(ev.toState, ev.toState === "traveler_ok" ? ev.createdAt : null), when].filter(Boolean).join(" · ")}
                  {ev.note ? <span className="block text-muted-foreground">{ev.note}</span> : null}
                </li>
              );
            })}
          </ol>
        </details>
      )}
      {actions.length > 0 && (
        <div className="flex flex-wrap gap-2 pt-1">
          {actions.map((a) => (
            <Button
              key={a}
              size="sm"
              variant={a === "withdrawn" || a === "could_not_get" ? "outline" : "default"}
              disabled={busy}
              onClick={() => onAction(task, a)}
              data-testid={`button-task-${ACTION_PATH[a]}-${task.id}`}
            >
              {actionLabel(a)}
            </Button>
          ))}
        </div>
      )}
      {doneFormFor}
    </li>
  );
}

export function TaskRequestForm({
  viewer,
  options,
  expertFirstName,
  busy,
  onSubmit,
  onCancel,
}: {
  viewer: TaskViewer;
  options: KindOption[];
  expertFirstName: string;
  busy: boolean;
  onSubmit: (body: { taskKindId: string; title: string; note?: string }) => void;
  onCancel: () => void;
}) {
  const firstOpen = options.find((o) => !o.atCap)?.taskKindKey ?? "";
  const [kind, setKind] = useState(firstOpen);
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const body = createBody(kind, title, note);
  const chosen = options.find((o) => o.taskKindKey === kind);
  return (
    <form
      className="space-y-3 rounded-md border p-3"
      data-testid="form-task-request"
      onSubmit={(e) => {
        e.preventDefault();
        if (body && chosen && !chosen.atCap) onSubmit(body);
      }}
    >
      <fieldset className="space-y-1.5">
        <legend className="text-[13px] font-medium">{CONCIERGE_TASK_COPY.kindField}</legend>
        {options.map((o) => (
          <label key={o.taskKindKey} className="flex items-start gap-2 text-[13px] min-w-0" data-testid={`task-kind-${o.taskKindKey}`}>
            <input
              type="radio"
              name="task-kind"
              value={o.taskKindKey}
              checked={kind === o.taskKindKey}
              disabled={o.atCap}
              onChange={() => setKind(o.taskKindKey)}
              data-testid={`radio-task-kind-${o.taskKindKey}`}
            />
            <span className="min-w-0 break-words">
              {o.label}
              {o.capText && <span className="ml-2 text-[12px] text-muted-foreground" data-testid={`task-kind-cap-${o.taskKindKey}`}>{o.capText}</span>}
              {o.linkOnly && <span className="block text-[12px] text-muted-foreground">{linkOnlyLine(expertFirstName)}</span>}
            </span>
          </label>
        ))}
      </fieldset>
      <div className="space-y-1">
        <Label htmlFor="task-title">{CONCIERGE_TASK_COPY.titleField}</Label>
        <Input id="task-title" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} data-testid="input-task-title" />
      </div>
      <div className="space-y-1">
        <Label htmlFor="task-note">{CONCIERGE_TASK_COPY.noteField}</Label>
        <Textarea id="task-note" value={note} maxLength={2000} onChange={(e) => setNote(e.target.value)} data-testid="input-task-note" />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" disabled={busy || !body || !chosen || chosen.atCap} data-testid="button-task-submit">
          {busy && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
          {CONCIERGE_TASK_COPY.submit}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onCancel} data-testid="button-task-cancel">
          {CONCIERGE_TASK_COPY.cancel}
        </Button>
      </div>
      <span className="sr-only">{viewer === "expert" ? CONCIERGE_TASK_COPY.propose : CONCIERGE_TASK_COPY.request}</span>
    </form>
  );
}

export function TaskDoneForm({
  task,
  busy,
  onSubmit,
  onCancel,
}: {
  task: TaskView;
  busy: boolean;
  onSubmit: (body: { linkUrl?: string; note?: string }) => void;
  onCancel: () => void;
}) {
  const [link, setLink] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="space-y-2 pt-1"
      data-testid={`form-task-done-${task.id}`}
      onSubmit={(e) => {
        e.preventDefault();
        const out = doneBody(task.kind.linkOnly, link, note);
        if (!out.ok) return setError(out.error);
        setError(null);
        onSubmit(out.body);
      }}
    >
      {task.kind.linkOnly && (
        <div className="space-y-1">
          <Label htmlFor={`task-link-${task.id}`}>{CONCIERGE_TASK_COPY.linkField}</Label>
          <Input id={`task-link-${task.id}`} type="url" inputMode="url" value={link} onChange={(e) => setLink(e.target.value)} data-testid={`input-task-link-${task.id}`} />
        </div>
      )}
      <div className="space-y-1">
        <Label htmlFor={`task-done-note-${task.id}`}>{CONCIERGE_TASK_COPY.noteField}</Label>
        <Textarea id={`task-done-note-${task.id}`} value={note} maxLength={2000} onChange={(e) => setNote(e.target.value)} data-testid={`input-task-done-note-${task.id}`} />
      </div>
      {error && <p className="text-[12px] text-destructive" data-testid={`text-task-done-error-${task.id}`}>{error}</p>}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" disabled={busy} data-testid={`button-task-done-submit-${task.id}`}>
          {CONCIERGE_TASK_COPY.markDone}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onCancel}>
          {CONCIERGE_TASK_COPY.cancel}
        </Button>
      </div>
    </form>
  );
}

export function TaskLogBody({
  tasks,
  viewer,
  expertFirstName,
  options,
  busy,
  formOpen,
  doneTaskId,
  onOpenForm,
  onCloseForm,
  onCreate,
  onAction,
  onDone,
  onCloseDone,
}: {
  tasks: TaskView[];
  viewer: TaskViewer;
  expertFirstName: string;
  options: KindOption[];
  busy: boolean;
  formOpen: boolean;
  doneTaskId: string | null;
  onOpenForm: () => void;
  onCloseForm: () => void;
  onCreate: (body: { taskKindId: string; title: string; note?: string }) => void;
  onAction: (task: TaskView, action: TaskAction) => void;
  onDone: (task: TaskView, body: { linkUrl?: string; note?: string }) => void;
  onCloseDone: () => void;
}) {
  const openLabel = viewer === "expert" ? CONCIERGE_TASK_COPY.propose : CONCIERGE_TASK_COPY.request;
  return (
    <div className="space-y-3 min-w-0" data-testid={`task-log-${viewer}`}>
      {tasks.length === 0 ? (
        <p className="text-[13px] text-muted-foreground" data-testid="text-task-log-empty">{CONCIERGE_TASK_COPY.empty}</p>
      ) : (
        <ul className="space-y-2">
          {tasks.map((t) => (
            <TaskRow
              key={t.id}
              task={t}
              viewer={viewer}
              expertFirstName={expertFirstName}
              busy={busy}
              onAction={onAction}
              doneFormFor={
                doneTaskId === t.id ? (
                  <TaskDoneForm task={t} busy={busy} onSubmit={(body) => onDone(t, body)} onCancel={onCloseDone} />
                ) : undefined
              }
            />
          ))}
        </ul>
      )}
      {formOpen ? (
        <TaskRequestForm viewer={viewer} options={options} expertFirstName={expertFirstName} busy={busy} onSubmit={onCreate} onCancel={onCloseForm} />
      ) : (
        options.length > 0 && (
          <Button size="sm" variant="outline" onClick={onOpenForm} data-testid={viewer === "expert" ? "button-task-propose" : "button-task-request"}>
            {openLabel}
          </Button>
        )
      )}
    </div>
  );
}

// ── Reads and writes ────────────────────────────────────────────────────────────────────────────

export function ConciergeTaskLog({ bookingId, viewer, expertFirstName, listingServiceId }: TaskLogProps) {
  const { toast } = useToast();
  const latch = useRef(createSingleFlight());
  const [busy, setBusy] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [doneTaskId, setDoneTaskId] = useState<string | null>(null);
  const key = taskLogQueryKey(bookingId);
  const { data, isLoading } = useQuery<{ tasks: TaskView[]; viewer: string }>({
    queryKey: key,
    queryFn: async () => (await apiRequest("GET", `/api/concierge/bookings/${encodeURIComponent(bookingId)}/tasks`)).json(),
  });
  const { data: listing } = useQuery<{ conciergeTasks?: ListingTaskOption[] }>({
    queryKey: [`/api/services/${listingServiceId}`],
    enabled: !!listingServiceId,
  });
  const tasks = data?.tasks ?? [];
  const options = kindOptions(listing?.conciergeTasks ?? [], tasks);

  async function run(write: () => Promise<unknown>, capForKind?: number | null, after?: () => void) {
    if (!latch.current.tryStart()) return;
    setBusy(true);
    try {
      await write();
      after?.();
    } catch (err) {
      const held = taskErrorCopy(err, capForKind);
      toast({ title: "Error", description: held ?? serverMessageOf(err) ?? undefined, variant: "destructive" });
    } finally {
      latch.current.settle();
      setBusy(false);
      await queryClient.invalidateQueries({ queryKey: key });
    }
  }

  if (isLoading) {
    return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" data-testid="task-log-loading" />;
  }
  return (
    <TaskLogBody
      tasks={tasks}
      viewer={viewer}
      expertFirstName={expertFirstName}
      options={options}
      busy={busy}
      formOpen={formOpen}
      doneTaskId={doneTaskId}
      onOpenForm={() => setFormOpen(true)}
      onCloseForm={() => setFormOpen(false)}
      onCreate={(body) =>
        run(
          () => apiRequest("POST", `/api/concierge/bookings/${encodeURIComponent(bookingId)}/tasks`, body),
          options.find((o) => o.taskKindKey === body.taskKindId)?.cap ?? null,
          () => setFormOpen(false),
        )
      }
      onAction={(task, action) => {
        if (action === "done") return setDoneTaskId(task.id);
        void run(() => apiRequest("POST", `/api/concierge/tasks/${encodeURIComponent(task.id)}/${ACTION_PATH[action]}`, {}));
      }}
      onDone={(task, body) =>
        run(() => apiRequest("POST", `/api/concierge/tasks/${encodeURIComponent(task.id)}/done`, body), null, () => setDoneTaskId(null))
      }
      onCloseDone={() => setDoneTaskId(null)}
    />
  );
}

/** The Tasks button and its dialog (≥430px) / full-height sheet (<430px). */
export function ConciergeTaskLogButton(props: TaskLogProps & { testId?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)} data-testid={props.testId ?? `button-concierge-tasks-${props.bookingId}`}>
        <ListChecks className="w-3 h-3 mr-1" />
        {CONCIERGE_TASK_COPY.tasks}
      </Button>
      <ConciergeTaskLogDialog {...props} open={open} onOpenChange={setOpen} />
    </>
  );
}

export function ConciergeTaskLogDialog({
  open,
  onOpenChange,
  ...props
}: TaskLogProps & { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={TASK_LOG_DIALOG_CLASS} data-testid="dialog-concierge-tasks">
        <DialogHeader>
          <DialogTitle>{CONCIERGE_TASK_COPY.tasks}</DialogTitle>
          <DialogDescription className="sr-only">{CONCIERGE_TASK_COPY.tasks}</DialogDescription>
        </DialogHeader>
        {open && <ConciergeTaskLog {...props} />}
      </DialogContent>
    </Dialog>
  );
}
