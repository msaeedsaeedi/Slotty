"use client";

import { useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { Flap } from "./flap";

type Slot = { time: string; room: string; ta: string; full?: boolean; target?: boolean };

const SLOTS: Slot[] = [
  { time: "10:00", room: "CS LAB 3", ta: "ALI RAZA", full: true },
  { time: "10:15", room: "CS LAB 3", ta: "ALI RAZA", target: true },
  { time: "10:30", room: "ONLINE", ta: "SANA IQBAL" },
  { time: "10:45", room: "CS LAB 3", ta: "ALI RAZA" },
];

/* One grid for the whole table; header and rows are subgrids, so every column lines up. */
const table = "grid grid-cols-[auto_minmax(0,1fr)_auto] gap-x-4 sm:grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)_auto] sm:gap-x-8";
const row = "col-span-full grid grid-cols-subgrid items-center";

type Phase = "pick" | "booked";

/**
 * The hero picture: one student booking one demo. It reads as a single assignment's slots
 * (title, date, "student view"), and a pointer books 10:15 so the result is shown, not described:
 * the row flips to BOOKED and the footer turns from the rules into the confirmation.
 * Without JavaScript it shows the slots to pick from; with reduced motion, the booked state.
 */
export function BookingDemo() {
  const boardRef = useRef<HTMLDivElement>(null);
  const keyRef = useRef<HTMLSpanElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<Phase>("pick");
  const [pressed, setPressed] = useState(false);

  useEffect(() => {
    const board = boardRef.current;
    if (!board) return;
    const timers: number[] = [];
    const later = (ms: number, fn: () => void) => timers.push(window.setTimeout(fn, ms));
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // Reduced motion: show the result straight away, wherever the board is on screen.
    if (reduced) {
      const frame = requestAnimationFrame(() => setPhase("booked"));
      return () => cancelAnimationFrame(frame);
    }

    const play = () => {
      const key = keyRef.current;
      const cursor = cursorRef.current;
      if (!key || !cursor) {
        setPhase("booked");
        return;
      }
      const b = board.getBoundingClientRect();
      const k = key.getBoundingClientRect();
      const from = { x: b.width * 0.78, y: b.height - 26 };
      const to = { x: k.left - b.left + k.width * 0.55, y: k.top - b.top + k.height * 0.6 };
      // Place the pointer without animating, then glide it to the Book key.
      cursor.style.transition = "none";
      cursor.style.transform = `translate(${from.x}px, ${from.y}px)`;
      void cursor.offsetWidth;
      cursor.style.transition = "";
      later(80, () => {
        cursor.style.opacity = "1";
        cursor.style.transform = `translate(${to.x}px, ${to.y}px)`;
      });
      later(1050, () => setPressed(true));
      later(1200, () => {
        setPressed(false);
        setPhase("booked");
      });
      later(1900, () => (cursor.style.opacity = "0"));
    };

    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        io.disconnect();
        later(700, play);
      },
      { threshold: 0.5 },
    );
    io.observe(board);
    return () => {
      io.disconnect();
      timers.forEach(clearTimeout);
    };
  }, []);

  const booked = phase === "booked";

  return (
    <div
      ref={boardRef}
      role="img"
      aria-label="A student books a demo slot. CS 2001, Lab 4 demo, Tuesday 24 November, 15-minute slots. 10:00 in CS Lab 3 with Ali Raza is full. The student books 10:15 in CS Lab 3 with Ali Raza; 10:30 online with Sana Iqbal and 10:45 in CS Lab 3 stay open. Booked: reminders 24 hours and 1 hour before."
      className="lp-board relative mx-auto w-full max-w-[880px] overflow-hidden rounded-[16px] text-left"
    >
      <div aria-hidden>
        {/* What this is: one assignment's slots, seen by one student */}
        <div className="flex items-start justify-between gap-4 border-b border-[var(--line)] px-5 py-4 sm:px-7">
          <div>
            <div className="text-[17px] font-semibold tracking-[-0.01em] text-[var(--text)] [font-stretch:106%]">Lab 4 demo</div>
            <div className="lp-mono mt-1 text-[11px] text-[var(--text-3)]">
              CS 2001 · TUE 24 NOV<span className="hidden sm:inline"> · 15 MIN</span>
            </div>
          </div>
          <span className="lp-mono shrink-0 rounded-full border border-[var(--line-strong)] px-2.5 py-1 text-[10px] text-[var(--text-2)]">Student view</span>
        </div>

        <div className={cn(table, "px-5 sm:px-7")}>
          <div className={cn(row, "lp-mono border-b border-[var(--line)] py-2.5 text-[10px] text-[var(--text-3)]")}>
            <span>Time</span>
            <span>Room</span>
            <span className="hidden sm:block">TA</span>
            <span className="justify-self-end">Slot</span>
          </div>
          <ul className={row}>
            {SLOTS.map((s) => {
              const mine = s.target && booked;
              return (
                <li
                  key={s.time}
                  data-mine={mine}
                  className={cn(row, "lp-board-row -mx-5 border-b border-[var(--line)] px-5 py-3 last:border-b-0 sm:-mx-7 sm:px-7 sm:py-3.5")}
                >
                  <Flap text={s.time} className="text-[15px] sm:text-[19px]" />
                  <span className="lp-mono truncate text-[12px] text-[var(--text-2)] sm:text-[14px]">{s.room}</span>
                  <span className="lp-mono hidden truncate text-[14px] text-[var(--text-2)] sm:block">{s.ta}</span>
                  <span className="justify-self-end">
                    {s.full ? (
                      <Flap text="FULL" length={6} tone="stop" className="text-[15px] sm:text-[19px]" />
                    ) : mine ? (
                      <Flap text="BOOKED" length={6} tone="go" className="text-[15px] sm:text-[19px]" />
                    ) : (
                      <span ref={s.target ? keyRef : undefined} className="lp-key" data-pressed={s.target && pressed}>
                        Book
                      </span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>

        {/* The rules before booking; the confirmation after */}
        <div className="lp-swap relative grid border-t border-[var(--line)] bg-[rgb(0_0_0/0.18)] px-5 py-3.5 text-[13px] sm:px-7" data-state={booked ? "after" : "before"}>
          <span data-when="before" className="col-start-1 row-start-1 text-[var(--text-3)]">
            2 changes left · they lock 2h before your demo
          </span>
          <span data-when="after" className="col-start-1 row-start-1 flex items-center gap-2 text-[var(--text)]">
            <Check aria-hidden className="size-4 text-[var(--go)]" strokeWidth={2.5} />
            Booked for 10:15 · reminders 24h and 1h before
          </span>
        </div>
      </div>

      <div ref={cursorRef} aria-hidden className="lp-cursor">
        <svg width="22" height="26" viewBox="0 0 22 26" fill="none">
          <path d="M2 2l16.5 11.2-7.4 1.4 4.3 8.2-3.1 1.6-4.3-8.2L2.6 21.4z" fill="#F1EEE6" stroke="#0D0D0C" strokeWidth="1.4" strokeLinejoin="round" />
        </svg>
      </div>
    </div>
  );
}
