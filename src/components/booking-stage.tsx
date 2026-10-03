import type { BookingStage } from "@/domain/booking-rules";
import { fmt } from "@/lib/time";
import { cn } from "@/lib/utils";

const STYLE: Record<BookingStage, string> = {
  preparing: "bg-muted text-muted-foreground",
  scheduled: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200",
  open: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  closed: "bg-muted text-muted-foreground",
};

/** "Not open yet", "Opens Fri 9 Oct, 9:00 AM", "Booking open" or "Booking closed". */
export function BookingStageBadge({ stage, opensAt, timezone, className }: { stage: BookingStage; opensAt?: Date | null; timezone: string; className?: string }) {
  const label =
    stage === "preparing"
      ? "Not open yet"
      : stage === "scheduled"
        ? `Opens ${fmt(opensAt!, timezone, "EEE d MMM, HH:mm")}`
        : stage === "open"
          ? "Booking open"
          : "Booking closed";
  return <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap", STYLE[stage], className)}>{label}</span>;
}
