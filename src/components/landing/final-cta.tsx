import Link from "next/link";
import { supportMailto } from "@/lib/site";
import { Flap } from "./flap";

/**
 * The last word, and the page's clearest call to action: your slot on the board, then Sign in.
 * Marked data-own-cta so the nav and the phone bar step back while it's on screen.
 */
export function FinalCta() {
  return (
    <section aria-labelledby="cta-title" data-own-cta className="lp-final border-t border-[var(--line)] py-24 text-center sm:py-32">
      <div className="lp-container">
        <h2 id="cta-title" className="lp-h2 text-[clamp(44px,6vw,80px)]">
          Got your invite?
        </h2>
        <div
          role="img"
          aria-label="Departure board: your slot, now boarding."
          className="lp-board mx-auto mt-10 flex max-w-[560px] items-center justify-center gap-5 rounded-[14px] px-5 py-4 sm:gap-7 sm:px-7"
        >
          <span aria-hidden className="contents">
            <Flap text="10:15" className="text-[20px] sm:text-[26px]" />
            <span className="lp-mono text-left text-[12px] leading-relaxed text-[var(--text-2)] sm:text-[14px]">
              Your slot · <span className="text-[var(--amber)]">now boarding</span>
            </span>
          </span>
        </div>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
          <Link href="/login" className="lp-btn lp-btn-primary lp-btn-lg">
            Sign in <span aria-hidden className="lp-btn-arrow">→</span>
          </Link>
          <a href={supportMailto("Help with Uniflow")} className="lp-link inline-flex min-h-11 items-center px-1 text-[16px] font-medium no-underline hover:underline">
            Email support
          </a>
        </div>
      </div>
    </section>
  );
}
