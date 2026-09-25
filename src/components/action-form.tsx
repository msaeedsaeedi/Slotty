"use client";

import { useActionState, useEffect, useRef, type ComponentProps, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { ActionState } from "@/server/action-utils";

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
  onSuccess,
}: {
  action: Action;
  children: ReactNode;
  className?: string;
  /** Show errors as toasts instead of an inline alert (for button-only forms). */
  compact?: boolean;
  resetOnSuccess?: boolean;
  /** Ask the browser to confirm before submitting. */
  confirm?: string;
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

  return (
    <form
      ref={formRef}
      action={formAction}
      className={className}
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      {children}
      {!compact && state && !state.ok && (
        <Alert variant="destructive" className="mt-3">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
    </form>
  );
}

export function SubmitButton({ children, ...props }: ComponentProps<typeof Button>) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || props.disabled} {...props}>
      {pending && <Loader2 className="animate-spin" />}
      {children}
    </Button>
  );
}
