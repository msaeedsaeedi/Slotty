import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const TONES = {
  neutral: "bg-muted text-muted-foreground",
  info: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200",
  success: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  warning: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  danger: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
} as const;

type Tone = keyof typeof TONES;

const LABELS: Record<string, [string, Tone]> = {
  // assignment
  DRAFT: ["Draft", "neutral"],
  PUBLISHED: ["Open", "success"],
  CLOSED: ["Closed", "neutral"],
  // slot
  CANCELLED: ["Cancelled", "danger"],
  // booking
  BOOKED: ["Booked", "info"],
  COMPLETED: ["Completed", "success"],
  NO_SHOW: ["No-show", "danger"],
  // evaluation
  SUBMITTED: ["Awaiting review", "warning"],
  RETURNED: ["Returned", "warning"],
  FINALIZED: ["Finalized", "success"],
  // user
  INVITED: ["Invited", "warning"],
  ACTIVE: ["Active", "success"],
  DISABLED: ["Disabled", "danger"],
  // roles
  INSTRUCTOR: ["Instructor", "info"],
  TA: ["TA", "info"],
  STUDENT: ["Student", "neutral"],
};

export function StatusBadge({ status, label, tone, className }: { status: string; label?: string; tone?: Tone; className?: string }) {
  const [defaultLabel, defaultTone] = LABELS[status] ?? [status, "neutral"];
  return <Badge className={cn(TONES[tone ?? defaultTone], className)}>{label ?? defaultLabel}</Badge>;
}

export function Pill({ children, tone = "neutral" }: { children: React.ReactNode; tone?: Tone }) {
  return <Badge className={TONES[tone]}>{children}</Badge>;
}
