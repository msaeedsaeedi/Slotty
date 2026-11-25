"use client"

import * as React from "react"
import { CloudOff, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { buttonVariants, type ButtonVariantProps } from "./button-variants"
import { connectionNow, NEEDS_CONNECTION, useOfflinePolicy } from "@/components/connection"
import { controlState } from "@/lib/control-state"
import { cn } from "@/lib/utils"

/**
 * A button whose action needs Uniflow (offline policy `network`, #161). When Uniflow can't
 * be reached it shows the Offline state:
 *
 * - `aria-disabled`, not `disabled`: it stays focusable and the reason is announced, so a
 *   keyboard or screen-reader user learns why it doesn't work. The click is blocked here.
 * - Full shape, muted, with a small crossed cloud (not 50 % like a business-rule disable).
 * - A tap shows a short toast, "Needs a connection" (phones have no hover).
 *
 * Which state wins (business disabled > pending > offline) is `controlState`. Nothing is
 * ever queued: the action just doesn't run.
 */
export function NetworkButton({
  className,
  variant = "default",
  size = "default",
  pending = false,
  children,
  onClick,
  title,
  disabled,
  ...props
}: React.ComponentProps<"button"> & ButtonVariantProps & { pending?: boolean }) {
  const { blocked, reason } = useOfflinePolicy("network")
  const state = controlState({ disabled, pending, offline: blocked })
  const offline = state === "offline"
  const iconOnly = typeof size === "string" && size.startsWith("icon")

  return (
    <button
      data-slot="button"
      data-variant={variant}
      data-size={size}
      data-offline={offline ? "blocked" : undefined}
      className={cn(buttonVariants({ variant, size, className }))}
      disabled={state === "disabled" || state === "pending"}
      aria-disabled={offline || undefined}
      title={offline ? reason : title}
      onClick={(e) => {
        // Also blocks during the 2 s before "offline" shows: with no network the request
        // can't leave the device anyway.
        if (offline || connectionNow() === "offline") {
          e.preventDefault()
          e.stopPropagation()
          toast(NEEDS_CONNECTION, { id: "needs-connection" })
          return
        }
        onClick?.(e)
      }}
      {...props}
    >
      {pending && <Loader2 className="animate-spin" />}
      {children}
      {offline && !iconOnly && <CloudOff data-icon="inline-end" aria-hidden />}
      {offline && <span className="sr-only">, {NEEDS_CONNECTION.toLowerCase()}</span>}
    </button>
  )
}
