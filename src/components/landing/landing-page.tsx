import "./landing.css";
import { sans, mono } from "./fonts";
import { Details } from "./details";
import { Faq } from "./faq";
import { FinalCta } from "./final-cta";
import { Hero } from "./hero";
import { HowItWorks } from "./how-it-works";
import { Maker } from "./maker";
import { MobileCta } from "./mobile-cta";
import { MotionFlag } from "./motion";
import { OldWay } from "./old-way";
import { Roles } from "./roles";
import { SiteFooter } from "./site-footer";
import { SiteNav } from "./site-nav";
import { Trust } from "./trust";

/**
 * The public landing page at / for signed-out visitors: a departure board for demo slots. Its
 * own scoped theme (landing.css) keeps it apart from the app. Every product claim describes
 * shipped behaviour (docs chapter 3); keep it in step when a flow changes.
 */
export function LandingPage() {
  return (
    <div data-theme="uniflow-landing" className={`${sans.variable} ${mono.variable} flex flex-1 flex-col`}>
      {/* Without JavaScript the stepper can't switch: show every step as a list instead. */}
      <noscript>
        <style>{`[data-theme="uniflow-landing"] .lp-tabs{display:none!important}[data-theme="uniflow-landing"] .lp-step-panel{display:grid!important}[data-theme="uniflow-landing"] .lp-step-panel+.lp-step-panel{margin-top:48px}`}</style>
      </noscript>
      <MotionFlag />
      <SiteNav />
      <main id="main" className="flex-1">
        <Hero />
        <OldWay />
        <HowItWorks />
        <Roles />
        <Details />
        <Trust />
        <Maker />
        <Faq />
        <FinalCta />
      </main>
      <SiteFooter />
      <MobileCta />
    </div>
  );
}
