import Link from "next/link";
import { cn } from "@/lib/utils";

/** A row of filter links that keep the other query params (e.g. the search box). */
export function FilterTabs({
  label,
  current,
  options,
  hrefFor,
}: {
  label: string;
  current: string;
  options: readonly (readonly [string, string])[];
  hrefFor: (value: string) => string;
}) {
  return (
    <nav aria-label={label} className="flex flex-wrap gap-1.5 text-sm">
      {options.map(([value, text]) => (
        <Link
          key={value}
          href={hrefFor(value)}
          aria-current={current === value ? "page" : undefined}
          className={cn(
            "rounded-full border px-3 py-1",
            current === value ? "border-primary bg-primary/10 font-medium" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {text}
        </Link>
      ))}
    </nav>
  );
}

export function query(base: string, params: Record<string, string | undefined>) {
  const q = new URLSearchParams(Object.entries(params).filter((e): e is [string, string] => Boolean(e[1])));
  const s = q.toString();
  return s ? `${base}?${s}` : base;
}
