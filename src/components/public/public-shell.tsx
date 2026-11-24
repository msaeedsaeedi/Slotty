import "../landing/landing.css";
import "./public.css";
import Link from "next/link";
import { mono, sans } from "../landing/fonts";
import { HeroShader } from "../landing/hero-shader";
import { MotionFlag } from "../landing/motion";
import { SiteFooter } from "../landing/site-footer";
import { Wordmark } from "../landing/wordmark";

/**
 * The frame for public pages (sign-in, password reset, invite, privacy): the landing page's
 * dark board, fonts and footer, with a slim header (ADR-028). Forms inside keep the app's own
 * components; public.css maps their colour tokens to the landing palette.
 */
export function PublicShell({ children }: { children: React.ReactNode }) {
  return (
    <div data-theme="uniflow-landing" data-public className={`${sans.variable} ${mono.variable} flex flex-1 flex-col`}>
      <MotionFlag />
      {/* The hero's light: the same warm haze as the landing page, under the header and the page. */}
      <div className="lp-hero relative isolate flex flex-1 flex-col overflow-hidden">
        <HeroShader />
        <header>
          <div className="lp-container flex h-16 items-center">
            <Wordmark />
            <Link href="/" className="lp-btn lp-btn-quiet lp-btn-sm ml-auto">
              How it works
            </Link>
          </div>
        </header>
        {children}
      </div>
      <SiteFooter mobileBar={false} />
    </div>
  );
}

/** The page's headline in the landing's condensed type. */
export function PublicHeading({ title, center = false }: { title: string; center?: boolean }) {
  return <h1 className={`lp-h1 mb-7 text-[clamp(44px,9vw,64px)] ${center ? "text-center" : ""}`}>{title}</h1>;
}
