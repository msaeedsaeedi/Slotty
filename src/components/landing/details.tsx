import { cn } from "@/lib/utils";

type Tile = { title: string; line: string; big?: React.ReactNode; bigLabel?: string; span?: string };

const TILES: Tile[] = [
  {
    title: "Fair booking rules",
    line: "Same limits and lock times for everyone.",
    span: "lg:col-span-2",
    bigLabel: "A change counter: 2 of 2 changes left.",
    big: (
      <div className="flex items-center gap-4">
        <span className="flex gap-1.5">
          <span className="h-2 w-8 rounded-full bg-[var(--text)]" />
          <span className="h-2 w-8 rounded-full bg-[var(--text)]" />
        </span>
        <span className="lp-mono text-[12px] text-[var(--text-2)]">2 of 2 changes left</span>
      </div>
    ),
  },
  { title: "Works on your phone", line: "Install it; your next demo works offline." },
  { title: "On your calendar", line: "Google, Outlook or Apple Calendar." },
  { title: "Two-step review", line: "TAs submit. Instructors release." },
  { title: "Help built in", line: "Message staff from the assignment page." },
  {
    title: "Everything on record",
    line: "Every move and correction, with who and why.",
    span: "lg:col-span-2",
    bigLabel: "An audit log line: at 10:02 Ali Raza moved Hamza to 10:30.",
    big: <div className="lp-mono truncate text-[12px] text-[var(--text-2)]">10:02 Ali Raza moved Hamza → 10:30</div>,
  },
];

/** The small stuff, as a two-row bento: two wide tiles carry a tiny piece of the board. */
export function Details() {
  return (
    <section aria-labelledby="details-title" className="border-t border-[var(--line)] bg-[var(--board)] py-20 sm:py-24">
      <div className="lp-container">
        <p className="lp-mono text-[11px] text-[var(--text-3)]">04 · Details</p>
        <h2 id="details-title" className="lp-h2 mt-4">
          The small stuff, handled.
        </h2>

        <ul className="mt-10 grid gap-3 sm:mt-12 sm:grid-cols-2 lg:grid-cols-4">
          {TILES.map((t) => (
            <li key={t.title} className={cn("lp-card flex min-h-[148px] flex-col justify-end gap-5 rounded-[14px] p-5", t.span)}>
              {t.big && (
                <div role="img" aria-label={t.bigLabel} className="mb-auto rounded-[10px] border border-[var(--line)] bg-[rgb(0_0_0/0.22)] px-4 py-3.5">
                  <div aria-hidden>{t.big}</div>
                </div>
              )}
              <div>
                <h3 className="text-[17px] font-semibold tracking-[-0.01em] text-[var(--text)] [font-stretch:100%]">{t.title}</h3>
                <p className="mt-1 text-[15px] text-[var(--text-2)]">{t.line}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
