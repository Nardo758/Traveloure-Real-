import * as React from "react"

import type {
  ToastActionElement,
  ToastProps,
} from "@/components/ui/toast"
// R4-3 part 2: the QA-only logger. It observes; it never changes the store. Off unless ?debugToasts=1.
import { logToastAdd, logToastDismiss, toastCallerLine, toastCloseReason, toastDebugEnabled } from "@/lib/toast-debug"

const TOAST_LIMIT = 1
const TOAST_REMOVE_DELAY = 1000000
const TOAST_DEFAULT_DURATION_MS = 5000
// Debug-only: when a toast started and how long it asked to live, so a close can be labelled
// "timer" or "user" from the elapsed time. Never read on the normal path.
const toastStartedAt = new Map<string, number>()
const toastDurationMs = new Map<string, number>()

type ToasterToast = ToastProps & {
  id: string
  title?: React.ReactNode
  description?: React.ReactNode
  action?: ToastActionElement
}

const actionTypes = {
  ADD_TOAST: "ADD_TOAST",
  UPDATE_TOAST: "UPDATE_TOAST",
  DISMISS_TOAST: "DISMISS_TOAST",
  REMOVE_TOAST: "REMOVE_TOAST",
} as const

let count = 0

function genId() {
  count = (count + 1) % Number.MAX_SAFE_INTEGER
  return count.toString()
}

type ActionType = typeof actionTypes

type Action =
  | {
      type: ActionType["ADD_TOAST"]
      toast: ToasterToast
    }
  | {
      type: ActionType["UPDATE_TOAST"]
      toast: Partial<ToasterToast>
    }
  | {
      type: ActionType["DISMISS_TOAST"]
      toastId?: ToasterToast["id"]
    }
  | {
      type: ActionType["REMOVE_TOAST"]
      toastId?: ToasterToast["id"]
    }

interface State {
  toasts: ToasterToast[]
}

const toastTimeouts = new Map<string, ReturnType<typeof setTimeout>>()

const addToRemoveQueue = (toastId: string) => {
  if (toastTimeouts.has(toastId)) {
    return
  }

  const timeout = setTimeout(() => {
    toastTimeouts.delete(toastId)
    dispatch({
      type: "REMOVE_TOAST",
      toastId: toastId,
    })
  }, TOAST_REMOVE_DELAY)

  toastTimeouts.set(toastId, timeout)
}

export const reducer = (state: State, action: Action): State => {
  switch (action.type) {
    case "ADD_TOAST":
      return {
        ...state,
        toasts: [action.toast, ...state.toasts].slice(0, TOAST_LIMIT),
      }

    case "UPDATE_TOAST":
      return {
        ...state,
        toasts: state.toasts.map((t) =>
          t.id === action.toast.id ? { ...t, ...action.toast } : t
        ),
      }

    case "DISMISS_TOAST": {
      const { toastId } = action

      // ! Side effects ! - This could be extracted into a dismissToast() action,
      // but I'll keep it here for simplicity
      if (toastId) {
        addToRemoveQueue(toastId)
      } else {
        state.toasts.forEach((toast) => {
          addToRemoveQueue(toast.id)
        })
      }

      return {
        ...state,
        toasts: state.toasts.map((t) =>
          t.id === toastId || toastId === undefined
            ? {
                ...t,
                open: false,
              }
            : t
        ),
      }
    }
    case "REMOVE_TOAST":
      if (action.toastId === undefined) {
        return {
          ...state,
          toasts: [],
        }
      }
      return {
        ...state,
        toasts: state.toasts.filter((t) => t.id !== action.toastId),
      }
  }
}

const listeners: Array<(state: State) => void> = []

let memoryState: State = { toasts: [] }

function dispatch(action: Action) {
  memoryState = reducer(memoryState, action)
  listeners.forEach((listener) => {
    listener(memoryState)
  })
}

type Toast = Omit<ToasterToast, "id">

function toast({ ...props }: Toast) {
  const id = genId()

  // R4-3 part 2: an ADD evicts whatever sat past the limit — name it before it disappears, because
  // that eviction is exactly the "closed early" a QA run sees. Nothing here mutates the state.
  if (toastDebugEnabled()) {
    for (const evicted of memoryState.toasts.slice(TOAST_LIMIT - 1)) {
      logToastDismiss(evicted.id, evicted.title, "replaced", { replacedBy: { id, title: props.title ?? null } })
      toastStartedAt.delete(evicted.id)
      toastDurationMs.delete(evicted.id)
    }
    toastStartedAt.set(id, Date.now())
    toastDurationMs.set(id, Number(props.duration ?? TOAST_DEFAULT_DURATION_MS))
    logToastAdd(id, props.title, props.duration)
  }

  const update = (props: ToasterToast) =>
    dispatch({
      type: "UPDATE_TOAST",
      toast: { ...props, id },
    })

  // Radix reports "closed" for its own timer AND for a user close, so the elapsed time decides.
  const dismissFromRadix = () => {
    if (toastDebugEnabled()) {
      const started = toastStartedAt.get(id)
      const duration = toastDurationMs.get(id) ?? TOAST_DEFAULT_DURATION_MS
      const elapsed = started == null ? duration : Date.now() - started
      logToastDismiss(id, props.title, toastCloseReason(elapsed, duration))
      toastStartedAt.delete(id)
      toastDurationMs.delete(id)
    }
    dispatch({ type: "DISMISS_TOAST", toastId: id })
  }

  // The returned dismiss() is a CALLER closing it, so it says so, with the caller line.
  const dismiss = () => {
    if (toastDebugEnabled()) {
      logToastDismiss(id, props.title, "programmatic", { caller: toastCallerLine() })
      toastStartedAt.delete(id)
      toastDurationMs.delete(id)
    }
    dispatch({ type: "DISMISS_TOAST", toastId: id })
  }

  dispatch({
    type: "ADD_TOAST",
    toast: {
      ...props,
      id,
      open: true,
      onOpenChange: (open) => {
        if (!open) dismissFromRadix()
      },
    },
  })

  return {
    id: id,
    dismiss,
    update,
  }
}

function useToast() {
  const [state, setState] = React.useState<State>(memoryState)

  React.useEffect(() => {
    listeners.push(setState)
    return () => {
      const index = listeners.indexOf(setState)
      if (index > -1) {
        listeners.splice(index, 1)
      }
    }
  }, [state])

  return {
    ...state,
    toast,
    dismiss: (toastId?: string) => dispatch({ type: "DISMISS_TOAST", toastId }),
  }
}

export { useToast, toast }
