"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { useCtaVisibility } from "./use-hero-cta";
import { Wordmark } from "./wordmark";

/**
 * First on the page, sticky at 64px: the wordmark and Sign in, nothing else. Transparent over the
 * hero; a flat bar with a hairline once scrolled. Sign in turns amber only while no other amber
 * Sign in is on screen (the hero's, the final call to action's), so there's only ever one. On
 * phones the bottom bar takes that role.
 */
export function SiteNav() {
  const ref = useRef<HTMLElement>(null);
  const { heroGone, ownCtaVisible } = useCtaVisibility();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => (el.dataset.scrolled = String(window.scrollY > 8));
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);

  return (
    <header ref={ref} className="lp-nav sticky top-0 z-40 h-16">
      <a href="#main" className="sr-only rounded-md bg-[var(--panel)] px-3 py-2 text-sm text-[var(--text)] focus:not-sr-only focus:absolute focus:top-3 focus:left-3">
        Skip to content
      </a>
      <div className="lp-container flex h-16 items-center">
        <Wordmark />
        <Link href="/login" className="lp-btn lp-btn-quiet lp-btn-sm lp-nav-signin ml-auto" data-amber={heroGone && !ownCtaVisible}>
          Sign in
        </Link>
      </div>
    </header>
  );
}
