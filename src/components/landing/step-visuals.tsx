import { Check } from "lucide-react";
import { Flap } from "./flap";
import { Unseal } from "./unseal";

/*
 * One picture per step of "How it works". Every label sits inside the picture it describes.
 * Pictures are role="img" with a description; the markup inside is hidden from assistive tech.
 */

function Frame({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div role="img" aria-label={label} className="lp-board flex h-full flex-col overflow-hidden rounded-[14px]">
      <div aria-hidden className="flex flex-1 flex-col">
        {children}
      </div>
    </div>
  );
}

function Caption({ children }: { children: React.ReactNode }) {
  return <div className="lp-mono border-b border-[var(--line)] px-5 py-3 text-[10px] text-[var(--text-3)]">{children}</div>;
}

function Chip({ children, tone = "text" }: { children: React.ReactNode; tone?: "text" | "go" }) {
  return (
    <span
      className={
        tone === "go"
          ? "lp-mono inline-flex items-center gap-1.5 rounded-full border border-[rgb(61_214_140/0.35)] bg-[rgb(61_214_140/0.08)] px-3 py-1.5 text-[11px] text-[var(--go)]"
          : "lp-mono inline-flex items-center rounded-full border border-[var(--line-strong)] px-3 py-1.5 text-[11px] text-[var(--text-2)]"
      }
    >
      {children}
    </span>
  );
}

export function ImportVisual() {
  return (
    <Frame label="A class list pasted into Uniflow: three student emails and 39 more, and a confirmation that 42 students were invited.">
      <Caption>Class list · CS 2001</Caption>
      <div className="flex flex-1 flex-col justify-center gap-5 p-5">
        <div className="lp-mono space-y-1.5 rounded-[10px] border border-dashed border-[var(--line-strong)] bg-[rgb(0_0_0/0.2)] px-4 py-3.5 text-[12px] normal-case text-[var(--text-2)]">
          <p>ayesha.khan@…</p>
          <p>hamza.tariq@…</p>
          <p>zainab.malik@…</p>
          <p className="text-[var(--text-3)]">+ 39 more</p>
        </div>
        <div>
          <Chip tone="go">
            <Check className="size-3.5" strokeWidth={2.5} /> 42 invited
          </Chip>
        </div>
      </div>
    </Frame>
  );
}

export function SlotsVisual() {
  return (
    <Frame label="Four 15-minute slots published for Tuesday 24 November in CS Lab 3 with Ali Raza: 10:00, 10:15, 10:30 and 10:45, all open.">
      <Caption>Tue 24 Nov · CS Lab 3 · Ali Raza</Caption>
      <div className="grid flex-1 grid-cols-2 content-center gap-3 p-5 sm:grid-cols-4">
        {["10:00", "10:15", "10:30", "10:45"].map((t) => (
          <div key={t} className="flex flex-col items-center gap-2.5 rounded-[10px] border border-[var(--line)] bg-[rgb(0_0_0/0.18)] py-4">
            <Flap text={t} className="text-[16px] sm:text-[18px]" />
            <span className="lp-mono text-[10px] text-[var(--text-3)]">Open</span>
          </div>
        ))}
      </div>
    </Frame>
  );
}

export function BookVisual() {
  return (
    <Frame label="A student's booking: 10:15 in CS Lab 3 with Ali Raza, booked, with reminders 24 hours and 1 hour before.">
      <Caption>Lab 4 demo · Student view</Caption>
      <div className="flex flex-1 flex-col justify-center gap-5 p-5">
        <div className="lp-board-row flex items-center justify-between gap-4 rounded-[10px] border border-[var(--line)] px-4 py-3.5" data-mine="true">
          <span className="flex items-center gap-4">
            <Flap text="10:15" className="text-[16px] sm:text-[19px]" />
            <span className="lp-mono hidden text-[13px] text-[var(--text-2)] sm:inline">CS Lab 3</span>
          </span>
          <Flap text="BOOKED" tone="go" className="text-[16px] sm:text-[19px]" />
        </div>
        <div className="flex flex-wrap gap-2">
          <Chip>Reminder 24h</Chip>
          <Chip>Reminder 1h</Chip>
        </div>
      </div>
    </Frame>
  );
}

const RUBRIC = [
  ["Correctness", "9", "10"],
  ["Code quality", "5", "5"],
  ["Viva", "4", "5"],
] as const;

export function MarkVisual() {
  return (
    <Frame label="Marking Hamza Tariq's demo against a rubric: correctness 9 of 10, code quality 5 of 5, viva 4 of 5, total 18 of 20.">
      <Caption>Rubric · Hamza Tariq · 10:15</Caption>
      <div className="flex flex-1 flex-col justify-center p-5">
        <ul className="divide-y divide-[var(--line)] rounded-[10px] border border-[var(--line)] bg-[rgb(0_0_0/0.18)]">
          {RUBRIC.map(([name, score, max]) => (
            <li key={name} className="flex items-center justify-between px-4 py-2.5 text-[14px]">
              <span className="text-[var(--text-2)]">{name}</span>
              <span className="lp-mono text-[var(--text)]">
                {score}
                <span className="text-[var(--text-3)]">/{max}</span>
              </span>
            </li>
          ))}
          <li className="flex items-center justify-between px-4 py-3">
            <span className="lp-mono text-[11px] text-[var(--text-3)]">Total</span>
            <span className="lp-mono text-[20px] text-[var(--text)]">18/20</span>
          </li>
        </ul>
      </div>
    </Frame>
  );
}

export function ReleaseVisual() {
  return (
    <Frame label="Hamza Tariq's marks for Lab 4, sealed until the instructor releases them: 18 of 20, released.">
      <Caption>Lab 4 demo · Hamza Tariq</Caption>
      <div className="flex flex-1 items-center justify-center p-5">
        <Unseal className="lp-seal relative w-full max-w-[340px] overflow-hidden rounded-[12px] border border-[var(--line-strong)]">
          <div className="flex items-center justify-between gap-4 bg-[rgb(0_0_0/0.18)] px-5 py-5">
            <span className="lp-mono text-[30px] text-[var(--text)]">18/20</span>
            <Flap text="RELEASED" tone="go" className="text-[14px]" />
          </div>
          {/* The seal: covers the marks until release, then lifts away. */}
          <div className="lp-seal-cover absolute inset-0 flex items-center justify-center gap-2.5 bg-[linear-gradient(to_bottom,#2a2925_0_50%,#24231f_50%)]">
            <span className="size-2.5 rounded-full bg-[var(--text-3)]" />
            <span className="lp-mono text-[11px] text-[var(--text-2)]">Sealed until release</span>
          </div>
        </Unseal>
      </div>
    </Frame>
  );
}
