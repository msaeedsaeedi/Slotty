import Link from "next/link";
import { BookingDemo } from "./booking-demo";
import { HeroShader } from "./hero-shader";
import { InviteHint } from "./invite-hint";

export function Hero() {
  return (
    <section aria-labelledby="hero-title" className="lp-hero relative isolate -mt-16 overflow-hidden pt-[calc(64px+32px)] pb-20 text-center sm:pt-[calc(64px+56px)] sm:pb-28">
      <HeroShader />
      <div className="lp-container">
        <div className="relative isolate">
          {/* Background mark: the slot the board below books, as a giant faint split-flap. */}
          <div aria-hidden className="absolute inset-0 -z-10 flex items-center justify-center overflow-hidden">
            <div className="lp-ghost">
              <span>1</span>
              <span>0</span>
              <span className="lp-ghost-colon">:</span>
              <span>1</span>
              <span>5</span>
            </div>
          </div>
          <h1 id="hero-title" className="lp-h1 mx-auto max-w-[16ch] py-4 sm:py-8">
            Demo week, without the spreadsheet.
          </h1>
        </div>
        <p className="lp-lede relative mx-auto mt-4 max-w-[34rem] lg:max-w-none">Book a slot, show up, get marked. One place for students, TAs and instructors.</p>
        <div className="mt-9 flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
          <Link id="hero-cta" href="/login" className="lp-btn lp-btn-primary lp-btn-lg">
            Sign in <span aria-hidden className="lp-btn-arrow">→</span>
          </Link>
          <a href="#how-it-works" className="lp-link inline-flex min-h-11 items-center gap-1.5 px-1 text-[16px] font-medium no-underline hover:underline">
            How it works <span aria-hidden className="lp-link-arrow">↓</span>
          </a>
        </div>
        <div className="mt-2">
          <InviteHint />
        </div>
        <div className="mt-12 sm:mt-14">
          <BookingDemo />
        </div>
      </div>
    </section>
  );
}
