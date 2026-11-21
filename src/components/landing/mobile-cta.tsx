"use client";

import Link from "next/link";
import { useCtaVisibility } from "./use-hero-cta";

/**
 * Phones only: a bottom Sign in bar once the hero's Sign in has scrolled away. It steps aside
 * over the final call to action (data-own-cta), which has its own button.
 */
export function MobileCta() {
  const { heroGone, ownCtaVisible } = useCtaVisibility();
  const visible = heroGone && !ownCtaVisible;
  return (
    <div
      className="lp-mobile-cta fixed inset-x-0 bottom-0 z-40 border-t border-[var(--line)] bg-[var(--board)] px-4 pt-3 pb-[max(12px,env(safe-area-inset-bottom))] sm:hidden"
      data-visible={visible}
      aria-hidden={!visible}
      inert={!visible}
    >
      <Link href="/login" className="lp-btn lp-btn-primary lp-btn-lg w-full">
        Sign in
      </Link>
    </div>
  );
}
