import "../landing/landing.css";
import "./public.css";
import Link from "next/link";
import { mono, sans } from "../landing/fonts";
import { SiteFooter } from "../landing/site-footer";
import { Wordmark } from "../landing/wordmark";

/**
 * The frame for public pages (sign-in, password reset, invite, privacy): the landing page's
 * dark board, fonts and footer, with a slim header (ADR-028). Forms inside keep the app's own
 * components; public.css maps their colour tokens to the landing palette.
 */
export function PublicShell({ children }: { children: React.ReactNode }) {
  return (
    <div data-theme="slotty-landing" data-public className={`${sans.variable} ${mono.variable} flex flex-1 flex-col`}>
      <header className="border-b border-[var(--line)]">
        <div className="lp-container flex h-16 items-center">
          <Wordmark />
          <Link
            href="/"
            className="ml-auto inline-flex min-h-11 items-center px-1 text-[15px] text-[var(--text-2)] transition-colors duration-100 hover:text-[var(--text)]"
          >
            How it works
          </Link>
        </div>
      </header>
      {children}
      <SiteFooter mobileBar={false} />
    </div>
  );
}

/** A small monospace label, then the page's condensed headline. */
export function PublicHeading({ kicker, title, id }: { kicker: string; title: string; id?: string }) {
  return (
    <div className="mb-6">
      <p className="pub-kicker">{kicker}</p>
      <h1 id={id} className="lp-h1 mt-2 text-[clamp(40px,8vw,56px)]">
        {title}
      </h1>
    </div>
  );
}
