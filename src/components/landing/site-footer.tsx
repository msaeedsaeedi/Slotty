import Link from "next/link";
import { GITHUB_URL, MAKER, supportMailto } from "@/lib/site";
import { Wordmark } from "./wordmark";

const link = "inline-flex min-h-11 items-center text-[14px] text-[var(--text-2)] transition-colors duration-100 hover:text-[var(--text)]";

/** The landing footer. On phones it leaves room for the landing's bottom Sign in bar (`mobileBar`). */
export function SiteFooter({ mobileBar = true }: { mobileBar?: boolean }) {
  return (
    <footer className={`border-t border-[var(--line)] bg-[var(--board)] ${mobileBar ? "pb-24 sm:pb-0" : ""}`}>
      <div className="lp-container flex flex-col gap-3 py-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
          <Wordmark />
        </div>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-6">
          <Link href="/privacy" className={link}>
            Privacy
          </Link>
          <a href={supportMailto()} className={link}>
            Support
          </a>
          <a href={GITHUB_URL} className={link}>
            GitHub
          </a>
          <a href={MAKER.url} className={link}>
            {MAKER.host}
          </a>
        </nav>
      </div>
    </footer>
  );
}
