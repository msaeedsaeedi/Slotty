"use client";

import { useActionState, useEffect, useRef, useState, type ComponentProps, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { ActionState } from "@/server/action-utils";
import { useOnline } from "@/components/pwa";

type Action = (state: ActionState, formData: FormData) => Promise<ActionState>;

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
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const onSuccessRef = useRef(onSuccess);
  useEffect(() => {
    onSuccessRef.current = onSuccess;
  });

  // Toasts and navigation run when the action resolves rather than in an effect,
  // so they still happen if the refreshed page no longer renders this form
  // (e.g. the slot a student just booked leaves the picker).
  const [state, formAction] = useActionState(async (prev: ActionState, fd: FormData) => {
    const result = await action(prev, fd);
    if (result?.ok) {
      if (result.message) toast.success(result.message);
      if (resetOnSuccess) formRef.current?.reset();
      onSuccessRef.current?.();
      if (result.navigate) router.replace(result.navigate);
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
      action={formAction}
      className={className}
      onSubmit={(e) => {
        if (!confirm || confirmed.current) {
          confirmed.current = false;
          return;
        }
        e.preventDefault();
        submitter.current = (e.nativeEvent as SubmitEvent).submitter;
        setAsking(true);
      }}
    >
      {children}
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
        <Alert variant="destructive" className="mt-3">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
    </form>
  );
}

/** Submit button with a pending spinner. Disabled while offline: changes are never queued for later. */
export function SubmitButton({ children, ...props }: ComponentProps<typeof Button>) {
  const { pending } = useFormStatus();
  const online = useOnline();
  return (
    <Button type="submit" {...props} disabled={pending || !online || props.disabled} title={!online ? "You're offline" : props.title}>
      {pending && <Loader2 className="animate-spin" />}
      {children}
    </Button>
  );
}
