import { Flap } from "./flap";

type Seat = { role: string; promise: string; chips: [string, string, string]; view: { time: string; who: string; status: string; tone: "go" | "text" }; label: string };

const SEATS: Seat[] = [
  {
    role: "Student",
    promise: "Book, get reminded, see your marks.",
    chips: ["Book in a minute", "Reminders 24h + 1h", "Add to calendar"],
    view: { time: "10:15", who: "Lab 4 · CS Lab 3", status: "BOOKED", tone: "go" },
    label: "What a student sees of the 10:15 demo: their slot in CS Lab 3, booked.",
  },
  {
    role: "TA",
    promise: "Run the day and mark on the spot.",
    chips: ["Who's on now", "Rubric marking", "Submit for review"],
    view: { time: "10:15", who: "Hamza Tariq", status: "ON NOW", tone: "text" },
    label: "What the TA sees of the 10:15 demo: Hamza Tariq, on now.",
  },
  {
    role: "Instructor",
    promise: "Set the rules, review, release.",
    chips: ["Booking rules", "Review TA marks", "Export CSV"],
    view: { time: "10:15", who: "Hamza · 18/20", status: "REVIEW", tone: "text" },
    label: "What the instructor sees of the 10:15 demo: Hamza's 18 out of 20, waiting for review.",
  },
];

/** Three seats at the same demo: each card opens with that role's view of the 10:15 slot. */
export function Roles() {
  return (
    <section id="roles" aria-labelledby="roles-title" className="border-t border-[var(--line)] bg-[var(--panel)] py-20 sm:py-24">
      <div className="lp-container">
        <p className="lp-mono text-[11px] text-[var(--text-3)]">03 · Roles</p>
        <h2 id="roles-title" className="lp-h2 mt-4">
          Everyone sees only their part.
        </h2>

        <ul className="mt-10 grid gap-4 sm:mt-12 lg:grid-cols-3">
          {SEATS.map((s) => (
            <li key={s.role} className="lp-card flex flex-col rounded-[16px] p-5 sm:p-6">
              {/* That role's view of the same slot */}
              <div role="img" aria-label={s.label} className="rounded-[10px] border border-[var(--line)] bg-[rgb(0_0_0/0.22)] px-3.5 py-3">
                <div aria-hidden>
                  <div className="flex items-center justify-between gap-3">
                    <Flap text={s.view.time} className="text-[15px]" />
                    <Flap text={s.view.status} length={6} tone={s.view.tone} className="text-[15px]" />
                  </div>
                  <div className="lp-mono mt-2 truncate text-[11px] text-[var(--text-2)]">{s.view.who}</div>
                </div>
              </div>
              <h3 className="mt-6 text-[22px] font-semibold tracking-[-0.02em] text-[var(--text)] [font-stretch:100%]">{s.role}</h3>
              <p className="mt-1.5 text-[16px] text-[var(--text-2)]">{s.promise}</p>
              <ul className="mt-5 flex flex-wrap gap-2">
                {s.chips.map((c) => (
                  <li key={c} className="lp-chip">
                    {c}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
        <p className="mt-6 text-[14px] text-[var(--text-3)]">Your role is set per course.</p>
      </div>
    </section>
  );
}
