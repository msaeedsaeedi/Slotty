import { GITHUB_URL, INSTITUTION, MAKER } from "@/lib/site";

/** Who's behind Uniflow, and where its source lives. */
export function Maker() {
  return (
    <section aria-labelledby="maker-title" className="border-t border-[var(--line)] bg-[var(--board)] py-16 sm:py-20">
      <div className="lp-container">
        <div className="lp-card grid overflow-hidden rounded-[18px] md:grid-cols-[1.5fr_1fr]">
          <div className="flex flex-col gap-5 p-6 sm:flex-row sm:items-center sm:gap-6 sm:p-8">
            <span aria-hidden className="lp-mono grid size-16 shrink-0 place-items-center rounded-full border border-[var(--line-strong)] bg-[linear-gradient(to_bottom,#2a2925,#1f1e1b)] text-[18px] text-[var(--text)] shadow-[inset_0_1px_0_rgb(255_255_255/0.08)]">
              {MAKER.initials}
            </span>
            <div className="min-w-0">
              <p className="lp-mono text-[11px] text-[var(--text-3)]">Made by</p>
              <h2 id="maker-title" className="lp-h2 mt-2 text-[clamp(30px,3.2vw,40px)]">
                {MAKER.name}
              </h2>
              <p className="mt-2 text-[16px] text-[var(--text-2)]">The person behind Uniflow.</p>
              <a href={MAKER.url} target="_blank" rel="noopener" className="lp-btn lp-btn-quiet mt-5">
                More work at {MAKER.host} <span aria-hidden className="lp-btn-arrow">↗</span>
                <span className="sr-only">(opens in a new tab)</span>
              </a>
            </div>
          </div>
          <div className="flex flex-col justify-center gap-2 border-t border-[var(--line)] p-6 sm:p-8 md:border-t-0 md:border-l">
            <p className="text-[18px] text-[var(--text)]">Built at {INSTITUTION}. Open source.</p>
            <a href={GITHUB_URL} className="lp-link inline-flex min-h-11 w-fit items-center gap-1.5 text-[15px] text-[var(--text-2)] no-underline hover:text-[var(--text)] hover:underline">
              GitHub <span aria-hidden className="lp-btn-arrow">→</span>
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
