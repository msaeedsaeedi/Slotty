import { cn } from "@/lib/utils";

/**
 * Slotty's mark: two split-flap cells in a board frame. Drawn in currentColor, with the flap
 * seam left as a gap (not painted), so it works on any background, light or dark.
 */
export function SlottyMark({ className }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" fill="none" className={cn("size-6 shrink-0", className)}>
      <rect x="2.75" y="4.75" width="18.5" height="14.5" rx="3.25" stroke="currentColor" strokeOpacity="0.45" strokeWidth="1.5" />
      <g fill="currentColor">
        <rect x="6.5" y="8.25" width="4.5" height="3.45" rx="0.9" />
        <rect x="6.5" y="12.3" width="4.5" height="3.45" rx="0.9" />
        <rect x="13" y="8.25" width="4.5" height="3.45" rx="0.9" />
        <rect x="13" y="12.3" width="4.5" height="3.45" rx="0.9" />
      </g>
    </svg>
  );
}
