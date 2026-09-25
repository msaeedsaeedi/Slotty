"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function CourseNav({ base, items }: { base: string; items: { href: string; label: string; badge?: number }[] }) {
  const pathname = usePathname();
  return (
    <nav className="-mx-4 mb-6 flex gap-1 overflow-x-auto border-b px-4 text-sm">
      {items.map((item) => {
        const href = `${base}${item.href}`;
        const active = item.href === "" ? pathname === base || pathname.startsWith(`${base}/assignments`) : pathname.startsWith(href);
        return (
          <Link
            key={item.href}
            href={href}
            className={cn(
              "-mb-px flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-muted-foreground hover:text-foreground",
              active && "border-primary font-medium text-foreground",
            )}
          >
            {item.label}
            {item.badge ? <span className="rounded-full bg-amber-500 px-1.5 text-xs text-white">{item.badge}</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}
