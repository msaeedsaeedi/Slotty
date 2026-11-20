"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { motionAllowed } from "./motion";

const GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789:";
const TONE = { text: "text-[var(--text)]", go: "text-[var(--go)]", amber: "text-[var(--amber)]", stop: "text-[var(--stop)]" } as const;

type FlapProps = {
  text: string;
  /** Pad to this many cells, so a column of flaps lines up. */
  length?: number;
  tone?: keyof typeof TONE;
  className?: string;
};

/**
 * A split-flap display: one cell per character, with a seam across the middle. The server
 * renders the final text. With motion allowed, it flips through letters to the target once when
 * it first scrolls into view (within 600 ms), and again whenever `text` changes.
 * Only for times and statuses on the board.
 */
export function Flap({ text, length, tone = "text", className }: FlapProps) {
  const target = text.toUpperCase().padEnd(length ?? text.length, " ");
  const ref = useRef<HTMLSpanElement>(null);
  const shown = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || !motionAllowed()) return;
    const cells = Array.from(el.querySelectorAll<HTMLElement>("[data-char]"));
    let frame = 0;
    let io: IntersectionObserver | undefined;

    const flip = () => {
      const start = performance.now();
      const span = 380 / Math.max(cells.length, 1);
      let last = 0;
      const tick = (now: number) => {
        const t = now - start;
        if (t - last < 45 && t < 600) {
          frame = requestAnimationFrame(tick);
          return;
        }
        last = t;
        let running = false;
        cells.forEach((cell, i) => {
          const settle = 200 + i * span; // left to right, all settled by ~580 ms
          if (t < settle) {
            running = true;
            cell.dataset.char = GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
          } else {
            cell.dataset.char = target[i] === " " ? "" : target[i];
          }
        });
        if (running) frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    };

    if (shown.current) {
      flip();
    } else {
      io = new IntersectionObserver(
        ([entry]) => {
          if (!entry.isIntersecting) return;
          shown.current = true;
          io?.disconnect();
          flip();
        },
        { threshold: 0.6 },
      );
      io.observe(el);
    }
    return () => {
      cancelAnimationFrame(frame);
      io?.disconnect();
      cells.forEach((cell, i) => (cell.dataset.char = target[i] === " " ? "" : target[i]));
    };
  }, [target]);

  return (
    <span ref={ref} className={cn("lp-flap", TONE[tone], className)}>
      <span className="sr-only">{text}</span>
      {target.split("").map((ch, i) => (
        <span key={i} aria-hidden className="lp-flap-cell" data-char={ch === " " ? "" : ch} />
      ))}
    </span>
  );
}
