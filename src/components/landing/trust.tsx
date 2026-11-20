import Link from "next/link";
import { RAW_RETENTION_DAYS } from "@/domain/analytics";

const CHIPS = ["No tracking cookies", "Feedback without names", "Usage data: opt-out", `Events deleted after ${RAW_RETENTION_DAYS} days`];

/** Privacy in one glance; the detail is behind the link. */
export function Trust() {
  return (
    <section aria-labelledby="trust-title" className="border-t border-[var(--line)] bg-[var(--panel)] py-20 sm:py-24">
      <div className="lp-container">
        <p className="lp-mono text-[11px] text-[var(--text-3)]">05 · Trust</p>
        <h2 id="trust-title" className="lp-h2 mt-4">
          Marks stay sealed until release.
        </h2>
        <ul className="mt-8 flex flex-wrap gap-2 sm:mt-10">
          {CHIPS.map((c) => (
            <li key={c} className="lp-chip">
              {c}
            </li>
          ))}
        </ul>
        <Link href="/privacy" className="lp-link mt-6 inline-flex min-h-11 items-center gap-1.5 text-[15px] font-medium no-underline hover:underline">
          Read the privacy notice <span aria-hidden className="lp-btn-arrow">→</span>
        </Link>
      </div>
    </section>
  );
}
