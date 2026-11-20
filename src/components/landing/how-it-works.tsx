"use client";

import { useEffect, useRef, useState } from "react";
import { motionAllowed } from "./motion";
import { BookVisual, ImportVisual, MarkVisual, ReleaseVisual, SlotsVisual } from "./step-visuals";

const STEPS = [
  { label: "Import class", role: "TA", line: "Paste the class list. Everyone gets an invite to set a password.", Visual: ImportVisual },
  { label: "Publish slots", role: "Staff", line: "Pick days, hours and a room. Slotty cuts them into slots.", Visual: SlotsVisual },
  { label: "Students book", role: "Student", line: "Students pick a slot and get reminders 24h and 1h before.", Visual: BookVisual },
  { label: "Mark on the day", role: "TA", line: "Mark attendance and score the rubric. The total adds itself up.", Visual: MarkVisual },
  { label: "Release marks", role: "Instructor", line: "The instructor checks the marks. Students see them only after release.", Visual: ReleaseVisual },
];

const NAV = 64; // sticky nav height
const PHONE_BAR = 80; // the phone's bottom Sign in bar
const pad = (i: number) => String(i + 1).padStart(2, "0");

/**
 * Five steps. When the pinned content fits the screen, the section becomes a scroll track: the
 * stepper stays under the nav and scrolling walks through the steps, with a progress line.
 * Choosing a step (click, arrow keys, Home, End) scrolls to it, and "Skip" jumps past the track.
 * Otherwise it's plain tabs; without JavaScript, every step shows as a list (landing-page.tsx).
 */
export function HowItWorks() {
  const [active, setActive] = useState(0);
  const sectionRef = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef<HTMLSpanElement>(null);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  // While we scroll to a chosen step, scroll position doesn't pick steps (else they'd flicker by).
  const locked = useRef(false);
  const lockTimer = useRef(0);

  // Where step i sits on the track (the middle of its share of the scroll distance).
  const stepScrollY = (i: number) => {
    const el = sectionRef.current!;
    const top = el.getBoundingClientRect().top + window.scrollY;
    const distance = el.offsetHeight - (window.innerHeight - NAV);
    return top - NAV + (distance * (i + 0.5)) / STEPS.length;
  };

  useEffect(() => {
    const el = sectionRef.current;
    const content = contentRef.current;
    if (!el || !content) return;
    let frame = 0;

    const update = () => {
      if (el.dataset.scroll !== "on") return;
      const distance = el.offsetHeight - (window.innerHeight - NAV);
      const p = Math.min(1, Math.max(0, (NAV - el.getBoundingClientRect().top) / distance));
      if (progressRef.current) progressRef.current.style.transform = `scaleX(${p})`;
      if (locked.current) return;
      const i = Math.min(STEPS.length - 1, Math.floor(p * STEPS.length));
      setActive((prev) => (prev === i ? prev : i));
    };

    const measure = () => {
      const room = window.innerHeight - NAV - (window.innerWidth < 640 ? PHONE_BAR : 0) - 24;
      el.dataset.scroll = content.offsetHeight <= room ? "on" : "off";
      update();
    };

    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    };
    const onScrollEnd = () => {
      locked.current = false;
      update();
    };

    const ro = new ResizeObserver(() => requestAnimationFrame(measure));
    ro.observe(content);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("scrollend", onScrollEnd);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(lockTimer.current);
      ro.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("scrollend", onScrollEnd);
    };
  }, []);

  // Phones: keep the active chip in view inside its own row (without scrolling the page).
  useEffect(() => {
    const row = rowRef.current;
    const tab = tabs.current[active];
    if (!row || !tab || row.scrollWidth <= row.clientWidth) return;
    row.scrollTo({ left: tab.offsetLeft - 20, behavior: motionAllowed() ? "smooth" : "instant" });
  }, [active]);

  const goTo = (i: number, focus: boolean) => {
    const next = (i + STEPS.length) % STEPS.length;
    setActive(next);
    if (focus) tabs.current[next]?.focus({ preventScroll: true });
    if (sectionRef.current?.dataset.scroll === "on") {
      locked.current = true; // cleared on scrollend, or after 1.2 s where that event isn't supported
      window.clearTimeout(lockTimer.current);
      lockTimer.current = window.setTimeout(() => (locked.current = false), 1200);
      window.scrollTo({ top: stepScrollY(next), behavior: motionAllowed() ? "smooth" : "instant" });
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const keys: Record<string, number> = { ArrowRight: active + 1, ArrowLeft: active - 1, Home: 0, End: STEPS.length - 1 };
    if (!(e.key in keys)) return;
    e.preventDefault();
    goTo(keys[e.key], true);
  };

  return (
    <section ref={sectionRef} id="how-it-works" aria-labelledby="how-title" className="lp-steps relative border-t border-[var(--line)] bg-[var(--board)] py-20 sm:py-24">
      <div className="lp-steps-sticky">
        <div ref={contentRef} className="lp-container">
          <div className="flex items-end justify-between gap-6">
            <div>
              <p className="lp-mono text-[11px] text-[var(--text-3)]">02 · How it works</p>
              <h2 id="how-title" className="lp-h2 mt-4">
                Five steps, one demo.
              </h2>
            </div>
            <a href="#how-it-works-end" className="lp-steps-skip lp-link inline-flex min-h-11 shrink-0 items-center gap-1.5 text-[14px] text-[var(--text-2)] no-underline hover:text-[var(--text)] hover:underline">
              Skip <span aria-hidden className="lp-link-arrow">↓</span>
            </a>
          </div>

          <div ref={rowRef} role="tablist" aria-label="Steps" className="lp-tabs mt-8 sm:mt-10" onKeyDown={onKeyDown}>
            {STEPS.map((s, i) => (
              <button
                key={s.label}
                ref={(el) => {
                  tabs.current[i] = el;
                }}
                type="button"
                role="tab"
                id={`step-tab-${i}`}
                aria-selected={i === active}
                aria-controls={`step-panel-${i}`}
                tabIndex={i === active ? 0 : -1}
                onClick={() => goTo(i, false)}
                className="lp-tab"
              >
                <span className="lp-mono text-[11px] text-[var(--text-3)]">{pad(i)}</span>
                <span className="text-[15px] font-semibold tracking-[-0.01em] [font-stretch:100%]">{s.label}</span>
                <span className="lp-mono hidden text-[10px] text-[var(--text-3)] md:inline">{s.role}</span>
              </button>
            ))}
          </div>
          {/* How far through the five steps the scroll is */}
          <div aria-hidden className="lp-steps-progress mt-3 h-[2px] overflow-hidden rounded-full bg-[var(--line)]">
            {/* Inline transform, not a scale utility: Tailwind's `scale` would multiply with it. */}
            <span ref={progressRef} className="block h-full origin-left bg-[var(--text-2)]" style={{ transform: "scaleX(0)" }} />
          </div>

          {STEPS.map((s, i) => (
            <div
              key={s.label}
              role="tabpanel"
              id={`step-panel-${i}`}
              aria-labelledby={`step-tab-${i}`}
              data-active={i === active}
              className="lp-step-panel mt-6 grid items-center gap-6 md:grid-cols-12 md:gap-10"
            >
              <div className="md:col-span-5">
                <p className="lp-mono text-[11px] text-[var(--text-3)]">
                  Step {pad(i)} · {s.role}
                </p>
                <p className="mt-3 max-w-[30ch] text-[20px] leading-snug text-[var(--text)] sm:text-[22px]">{s.line}</p>
              </div>
              <div className="h-[260px] sm:h-[280px] md:col-span-7">
                <s.Visual />
              </div>
            </div>
          ))}
        </div>
      </div>
      {/* "Skip" lands here: the end of the scroll track */}
      <div id="how-it-works-end" aria-hidden className="absolute bottom-0 h-px w-full scroll-mt-16" />
    </section>
  );
}
