import Link from "next/link";
import { AlertCircle, ChevronRight, CircleDot, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Task } from "@/server/services/home";

const TONE = {
  danger: { icon: AlertCircle, className: "text-red-600 dark:text-red-400", label: "Urgent" },
  warning: { icon: CircleDot, className: "text-amber-600 dark:text-amber-400", label: "To do" },
  info: { icon: Info, className: "text-blue-600 dark:text-blue-400", label: "Heads-up" },
} as const;

/** A short, tappable to-do list: each row says what to do and goes straight there. */
export function TaskList({ tasks, empty }: { tasks: Task[]; empty: string }) {
  if (tasks.length === 0) return <p className="rounded-xl border border-dashed px-4 py-3 text-sm text-muted-foreground">{empty}</p>;
  return (
    <ul className="divide-y overflow-hidden rounded-xl border bg-card">
      {tasks.map((t) => {
        const tone = TONE[t.tone];
        const Icon = tone.icon;
        return (
          <li key={t.key}>
            <Link href={t.href} className="flex items-center gap-3 px-4 py-3 text-sm transition-colors hover:bg-muted/50">
              <Icon className={cn("size-4 shrink-0", tone.className)} aria-label={tone.label} />
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{t.title}</span>
                {t.detail && <span className="block truncate text-xs text-muted-foreground">{t.detail}</span>}
              </span>
              <span className="hidden shrink-0 text-xs font-medium text-primary sm:inline">{t.action}</span>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
