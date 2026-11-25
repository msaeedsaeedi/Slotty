"use client";

import { createContext, startTransition, useActionState, useContext, useEffect, useRef, useState, type ComponentProps, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { ActionState } from "@/server/action-utils";
import type { Flow } from "@/domain/analytics";
import { connectionNow, NEEDS_CONNECTION, reportUnreachable, useConnection, whenReachable, type OfflinePolicy } from "@/components/connection";
import { NetworkButton } from "@/components/ui/network-button";
import { openSurvey } from "@/components/survey";
import { trackStep } from "@/lib/analytics";

type Action = (state: ActionState, formData: FormData) => Promise<ActionState>;
/** The form's last result: the action's, or Unconfirmed when the request got no answer (#161). */
type FormState = ActionState | { ok: false; error: string; unconfirmed: true };

/** Pending state of the enclosing ActionForm (submits are dispatched by hand, so useFormStatus can't see them). */
const PendingContext = createContext(false);
/** The last failed submit's messages by field name (from `run()`), for <FormField>. */
const FieldErrorsContext = createContext<Record<string, string>>({});

/** The server's message for this field from the last submit of the enclosing ActionForm, if any. */
export function useFieldError(name: string): string | undefined {
  return useContext(FieldErrorsContext)[name];
}

/**
 * A <form> bound to a Server Action. Success messages show as toasts; errors
 * show inline (or as a toast for compact forms like single buttons).
 */
export function ActionForm({
  action,
  children,
  className,
  compact = false,
  resetOnSuccess = false,
  confirm,
  confirmLabel = "Confirm",
  onSuccess,
  track,
}: {
  action: Action;
  children: ReactNode;
  className?: string;
  /** Show errors as toasts instead of an inline alert (for button-only forms). */
  compact?: boolean;
  resetOnSuccess?: boolean;
  /** Ask before submitting: the dialog shows this text, which should say what will happen. */
  confirm?: string;
  /** Label of the confirming button (default "Confirm"). */
  confirmLabel?: string;
  /** Called after a successful submit (client components only). */
  onSuccess?: () => void;
  /** Record this form's submit and its outcome as steps of a usage funnel. */
  track?: Flow;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const onSuccessRef = useRef(onSuccess);
  useEffect(() => {
    onSuccessRef.current = onSuccess;
  });

  // After a submit that never reached Uniflow, refresh once it can be reached again,
  // so the page shows whether the change went through.
  const stopWaiting = useRef<(() => void) | null>(null);
  useEffect(() => () => stopWaiting.current?.(), []);

  // Toasts and navigation run when the action resolves rather than in an effect,
  // so they still happen if the refreshed page no longer renders this form
  // (e.g. the slot a student just booked leaves the picker).
  const [state, formAction, pending] = useActionState(async (prev: FormState, fd: FormData): Promise<FormState> => {
    if (track) trackStep(track, "submit");
    let result: ActionState;
    try {
      result = await action(prev && "unconfirmed" in prev ? null : prev, fd);
    } catch (err) {
      // A dropped connection: Unconfirmed, not an error — the change may already have
      // happened, so calling it an error would invite a second booking or submit. Keep what
      // was typed, never retry by itself, and refresh once Uniflow answers to show the truth.
      if (!isNetworkError(err)) throw err;
      if (track) trackStep(track, "error");
      reportUnreachable();
      if (compact) toast.warning(UNCONFIRMED);
      stopWaiting.current?.();
      stopWaiting.current = whenReachable(() => router.refresh());
      return { ok: false as const, error: UNCONFIRMED, unconfirmed: true as const };
    }
    if (track && result) trackStep(track, result.ok ? "done" : "error");
    if (result?.ok) {
      if (result.message) toast.success(result.message);
      if (resetOnSuccess) formRef.current?.reset();
      onSuccessRef.current?.();
      if (result.navigate) router.replace(result.navigate);
      if (result.survey) openSurvey(result.survey);
    } else if (result && compact) {
      toast.error(result.error);
    }
    return result;
  }, null);

  // Confirmation: hold the submit, show a dialog, then resubmit with the same
  // submitter (so buttons with name/value still send them).
  const [asking, setAsking] = useState(false);
  const confirmed = useRef(false);
  const submitter = useRef<HTMLElement | null>(null);

  return (
    <form
      ref={formRef}
      className={className}
      onSubmit={(e) => {
        // Dispatch the action ourselves instead of using <form action>: React resets
        // uncontrolled fields after a form action, which wiped what people typed
        // when a save failed validation (or after saving a draft).
        e.preventDefault();
        // Actions that need Uniflow are never queued (ADR-038): with no connection, don't send.
        if (connectionNow() !== "online") {
          toast(NEEDS_CONNECTION, { id: "needs-connection" });
          return;
        }
        const by = (e.nativeEvent as SubmitEvent).submitter;
        if (confirm && !confirmed.current) {
          submitter.current = by;
          setAsking(true);
          return;
        }
        confirmed.current = false;
        const fd = new FormData(e.currentTarget, by instanceof HTMLButtonElement || by instanceof HTMLInputElement ? by : null);
        startTransition(() => formAction(fd));
      }}
    >
      <PendingContext.Provider value={pending}>
        <FieldErrorsContext.Provider value={(state && !state.ok && "fieldErrors" in state && state.fieldErrors) || NO_FIELD_ERRORS}>{children}</FieldErrorsContext.Provider>
      </PendingContext.Provider>
      {confirm && (
        <Dialog open={asking} onOpenChange={setAsking}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Are you sure?</DialogTitle>
              <DialogDescription>{confirm}</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAsking(false)}>
                Go back
              </Button>
              <Button
                type="button"
                autoFocus
                onClick={() => {
                  setAsking(false);
                  confirmed.current = true;
                  formRef.current?.requestSubmit(submitter.current instanceof HTMLButtonElement ? submitter.current : undefined);
                }}
              >
                {confirmLabel}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
      {!compact && state && !state.ok && (
        <Alert variant={"unconfirmed" in state ? "warning" : "destructive"} data-state={"unconfirmed" in state ? "unconfirmed" : "error"} className="mt-3">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
    </form>
  );
}

const NO_FIELD_ERRORS: Record<string, string> = {};

/** Unconfirmed (#161): a submit got no answer, so whether it took effect is unknown. */
export const UNCONFIRMED = "Couldn't confirm — check before trying again";

/** The request never got an answer (offline, connection dropped), as opposed to an error from the server. */
function isNetworkError(err: unknown) {
  return !navigator.onLine || err instanceof TypeError;
}

/**
 * Whether the surrounding form is submitting, and whether Uniflow can take changes now
 * (`online`: the browser is online and the page isn't a saved copy), for custom submit buttons.
 */
export function useSubmitState() {
  const { pending: nativePending } = useFormStatus();
  const pending = useContext(PendingContext) || nativePending;
  const { canSubmit } = useConnection();
  return { pending, online: canSubmit, offlineHint: NEEDS_CONNECTION };
}

/**
 * Submit button with a pending spinner. Policy `network` by default (#161): when Uniflow
 * can't be reached it shows Offline (focusable, reason announced, click blocked) and
 * nothing is queued. `offline="local"` is for submits that work without the server.
 */
export function SubmitButton({ children, offline = "network", ...props }: Omit<ComponentProps<typeof NetworkButton>, "pending"> & { offline?: OfflinePolicy }) {
  const { pending } = useSubmitState();
  if (offline === "local") {
    return (
      <Button type="submit" offline="local" {...props} disabled={pending || props.disabled}>
        {pending && <Loader2 className="animate-spin" />}
        {children}
      </Button>
    );
  }
  return (
    <NetworkButton type="submit" pending={pending} {...props}>
      {children}
    </NetworkButton>
  );
}
