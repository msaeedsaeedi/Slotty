import { cn } from "@/lib/utils";

/*
 * The old way: a generic shared spreadsheet and a class group chat, in a dark spreadsheet theme
 * that sits on the board. Fictional names and numbers, no product branding. Colours are local
 * (.lp-sheet in landing.css), not board tokens.
 */

type Cell = { text?: React.ReactNode; className?: string };
type Row = { n: number; cells: Cell[]; conflict?: boolean };

const struck = (
  <>
    <s className="text-[var(--sheet-muted)]">Bilal Ahmed</s> Hamza T
    <span aria-hidden className="ml-px inline-block h-3.5 w-px translate-y-0.5 bg-[var(--sheet-text)] motion-safe:animate-pulse" />
  </>
);

const ROWS: Row[] = [
  { n: 1, cells: [{ text: "Name" }, { text: "Slot (Tue)" }, { text: "TA" }, { text: "Marks" }].map((c) => ({ ...c, className: "font-bold text-[var(--sheet-strong)]" })) },
  { n: 2, cells: [{ text: "Ayesha Khan" }, { text: "10:00" }, { text: "Ali" }, { text: "17" }] },
  { n: 3, conflict: true, cells: [{ text: struck }, { text: "10:15" }, { text: "Ali" }, { text: "" }] },
  { n: 4, conflict: true, cells: [{ text: "Zainab Malik" }, { text: "10:15" }, { text: "Ali" }, { text: "" }] },
  { n: 5, cells: [{ text: "Usman Ali" }, { text: "#REF!", className: "font-bold text-[var(--sheet-red)]" }, { text: "" }, { text: "14" }] },
  { n: 6, cells: [{ text: "Fatima Noor" }, { text: "10:45" }, { text: "Sana" }, { text: "19" }] },
  { n: 7, cells: [{ text: "" }, { text: "" }, { text: "" }, { text: "" }] },
];

export function SheetMock({ className }: { className?: string }) {
  return (
    <div className={cn("lp-sheet relative overflow-hidden rounded-[10px] bg-[var(--sheet-bg)] text-[13px] text-[var(--sheet-text)]", className)}>
      {/* Toolbar: a file name, and the share setting that makes the marks public. */}
      <div className="flex items-center justify-between gap-3 border-b border-[var(--sheet-grid)] bg-[var(--sheet-chrome)] px-3 py-2">
        <span className="flex min-w-0 items-center gap-2">
          <span className="size-4 shrink-0 rounded-[3px] bg-[var(--sheet-green)]" />
          <span className="truncate font-medium">CS2001 Lab4 demo slots FINAL (2)</span>
        </span>
        <span className="shrink-0 rounded-full bg-[var(--sheet-chip)] px-2 py-0.5 text-[11px] text-[var(--sheet-soft)]">Anyone with the link can edit</span>
      </div>
      <div className="flex items-center gap-2 border-b border-[var(--sheet-grid)] px-3 py-1.5 font-mono text-[12px] text-[var(--sheet-soft)]">
        <span className="italic">fx</span>
        <span className="truncate">=VLOOKUP(A5,Slots!A:C,2,FALSE)</span>
      </div>

      <div className="grid grid-cols-[28px_minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,0.7fr)_minmax(0,0.7fr)]">
        <div className="border-r border-b border-[var(--sheet-grid)] bg-[var(--sheet-header)]" />
        {["A", "B", "C", "D"].map((l) => (
          <div key={l} className="border-r border-b border-[var(--sheet-grid)] bg-[var(--sheet-header)] py-1 text-center text-[11px] text-[var(--sheet-muted)] last:border-r-0">
            {l}
          </div>
        ))}
        {ROWS.map((row) => (
          <div key={row.n} className="contents">
            <div className="border-r border-b border-[var(--sheet-grid)] bg-[var(--sheet-header)] py-1.5 text-center text-[11px] text-[var(--sheet-muted)]">{row.n}</div>
            {row.cells.map((cell, i) => (
              <div
                key={i}
                className={cn("truncate border-r border-b border-[var(--sheet-grid)] px-2 py-1.5 last:border-r-0", row.conflict && "bg-[var(--sheet-red-tint)]", cell.className)}
              >
                {cell.text}
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Sheet tabs */}
      <div className="flex gap-1 bg-[var(--sheet-chrome)] px-2 pt-1 pb-1.5 text-[12px]">
        <span className="rounded-b-md bg-[var(--sheet-bg)] px-3 py-1 font-medium text-[var(--sheet-green)] shadow-[0_1px_0_var(--sheet-grid)]">Slots</span>
        <span className="px-3 py-1 text-[var(--sheet-soft)]">Marks</span>
        <span className="px-3 py-1 text-[var(--sheet-soft)]">Copy of Slots</span>
      </div>

      {/* A comment where Usman's row used to be */}
      <div className="absolute top-[286px] left-9 max-w-[150px] -rotate-[1.5deg] rounded-md border border-[#5a4f2c] bg-[#3b3420] px-2 py-1.5 text-[#efe3b0] text-[11px] leading-snug shadow-[0_10px_20px_-10px_rgb(0_0_0/0.8)] sm:max-w-[170px] sm:px-2.5 sm:py-2 sm:text-[12px]">
        <span className="block text-[11px] font-bold text-[#d9c77a]">Usman Ali</span>
        who deleted my row??
      </div>
    </div>
  );
}

const CHAT = [
  ["sir can I swap to 2pm?", "21:14"],
  ["is the sheet updated?", "21:16"],
  ["my name disappeared 😭", "21:17"],
] as const;

/** A class group chat in generic green bubbles: no app branding. */
export function ChatMock({ className }: { className?: string }) {
  return (
    <div className={cn("lp-sheet w-[236px] rounded-[16px] bg-[var(--panel-2)] p-3", className)}>
      <p className="mb-2 px-1 text-[12px] font-bold text-[var(--text)]">CS 2001 class group</p>
      <div className="space-y-1.5">
        {CHAT.map(([text, time]) => (
          <div key={time} className="ml-auto w-fit max-w-[92%] rounded-[12px] rounded-tr-[4px] bg-[#1e3326] px-3 py-1.5 text-[13px] text-[#e2efe4]">
            {text}
            <span className="ml-2 align-bottom text-[10px] text-[#8fb39a]">{time}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
