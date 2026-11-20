"use client";

import { useEffect, useState } from "react";

/**
 * Where the page's Sign in buttons are, so only one amber one shows at a time:
 * `heroGone` once the hero's Sign in has scrolled up out of view, and `ownCtaVisible` while a
 * section with its own Sign in (marked data-own-cta, the final call to action) is on screen.
 */
export function useCtaVisibility() {
  const [heroGone, setHeroGone] = useState(false);
  const [ownCtaVisible, setOwnCtaVisible] = useState(false);

  useEffect(() => {
    const hero = document.getElementById("hero-cta");
    const own = Array.from(document.querySelectorAll("[data-own-cta]"));
    const visible = new Set<Element>();
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.target === hero) setHeroGone(!e.isIntersecting && e.boundingClientRect.top < 0);
        else if (e.isIntersecting) visible.add(e.target);
        else visible.delete(e.target);
      }
      setOwnCtaVisible(visible.size > 0);
    });
    if (hero) io.observe(hero);
    own.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  return { heroGone, ownCtaVisible };
}
