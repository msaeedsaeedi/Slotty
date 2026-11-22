"use client";

import { cloneElement, type ReactElement } from "react";
import { useFieldError } from "@/components/action-form";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type FieldChild = ReactElement<{ id?: string; "aria-invalid"?: boolean; "aria-describedby"?: string }>;

/**
 * A labelled input inside an ActionForm, with its message right under it: `error` (checked as
 * you type) or else the server's message for `name` from the last submit (`run()`'s fieldErrors).
 * The input gets aria-invalid and aria-describedby, so screen readers read the message with it.
 */
export function FormField({
  name,
  label,
  hint,
  error,
  className,
  children,
}: {
  /** The input's form name: server messages are keyed by it. */
  name: string;
  label: string;
  hint?: string;
  error?: string;
  className?: string;
  children: FieldChild;
}) {
  const server = useFieldError(name);
  const message = error ?? server;
  const id = children.props.id ?? name;
  const noteId = `${id}-note`;
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={id}>{label}</Label>
      {cloneElement(children, {
        id,
        "aria-invalid": Boolean(message) || children.props["aria-invalid"] || undefined,
        "aria-describedby": message || hint ? noteId : undefined,
      })}
      {message ? (
        <p id={noteId} className="text-xs text-destructive">
          {message}
        </p>
      ) : (
        hint && (
          <p id={noteId} className="text-xs text-muted-foreground">
            {hint}
          </p>
        )
      )}
    </div>
  );
}
