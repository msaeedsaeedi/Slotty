"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

type Item = { href: string; label: string; badge?: number };

export function CourseNav({ base, items }: { base: string; items: Item[] }) {
  const pathname = usePathname();
  return (
    // overflow-y-hidden: a horizontally scrolling strip otherwise grows a vertical scrollbar too.
    <nav className="-mx-4 mb-6 flex gap-1 overflow-x-auto overflow-y-hidden border-b px-4 text-sm [scrollbar-width:thin]">
      {items.map((item) => {
        const href = `${base}${item.href}`;
        const active = item.href === "" ? pathname === base || pathname.startsWith(`${base}/assignments`) : pathname.startsWith(href);
        return (
          <Link
            key={item.href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-1.5 whitespace-nowrap px-3 py-2 text-muted-foreground hover:text-foreground",
              active && "font-medium text-foreground shadow-[inset_0_-2px_0_0_var(--color-primary)]",
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

/**
 * The course header and tabs, fitted to where you are: the full tabs on the
 * course pages, just a slim course line inside an assignment (which has its own
 * tabs, so tabs don't stack on tabs), and nothing on the marking page.
 */
export function CourseChrome({ base, header, slim, items }: { base: string; header: React.ReactNode; slim: React.ReactNode; items: Item[] }) {
  const pathname = usePathname();
  if (/\/assignments\/[^/]+\/mark$/.test(pathname)) return null;
  if (pathname.startsWith(`${base}/assignments/`)) return <div className="mb-3">{slim}</div>;
  return (
    <>
      {header}
      <CourseNav base={base} items={items} />
    </>
  );
}
