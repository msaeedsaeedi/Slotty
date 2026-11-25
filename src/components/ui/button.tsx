import * as React from "react"
import { buttonVariants, type ButtonVariantProps } from "./button-variants"
import { NetworkButton } from "./network-button"
import type { OfflinePolicy } from "@/components/connection"
import { cn } from "@/lib/utils"
import { Slot } from "radix-ui"

export type ButtonProps = React.ComponentProps<"button"> &
  ButtonVariantProps & {
    asChild?: boolean
    /**
     * What the button needs when Uniflow can't be reached (#161): `network` (shown as
     * Offline and blocked; never queued) or `local` (works offline). Submit buttons are
     * `network` unless they say otherwise; other buttons have no policy.
     */
    offline?: OfflinePolicy
  }

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  offline,
  ...props
}: ButtonProps) {
  const policy = offline ?? (props.type === "submit" ? "network" : undefined)
  if (policy === "network" && !asChild) {
    return <NetworkButton className={className} variant={variant} size={size} {...props} />
  }

  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
