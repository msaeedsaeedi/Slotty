import { PublicShell } from "@/components/public/public-shell";
import { SUPPORT_EMAIL, supportMailto } from "@/lib/site";

const help = "text-[var(--text-2)] underline decoration-[var(--line-strong)] underline-offset-4 hover:text-[var(--text)] hover:decoration-[var(--text)]";

/** Sign-in, password reset and invite pages, in the landing page's theme (ADR-028). "How it works" is in the header. */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <PublicShell>
      <main id="main" className="flex flex-1 flex-col items-center px-5 pt-10 pb-16 sm:pt-16 sm:pb-24">
        <div className="relative isolate w-full max-w-[400px]">
          {/* The landing hero's background mark: a giant faint split-flap behind the panel. */}
          <div aria-hidden className="pointer-events-none absolute inset-x-[-40vw] top-0 -z-10 flex justify-center overflow-hidden">
            <div className="lp-ghost">
              <span>1</span>
              <span>0</span>
              <span className="lp-ghost-colon">:</span>
              <span>1</span>
              <span>5</span>
            </div>
          </div>
          {children}
        </div>
        <p className="mt-6 w-full max-w-[400px] text-center text-[13px] leading-relaxed text-[var(--text-3)]">
          Need help?{" "}
          <a href={supportMailto("Help signing in")} className={help}>
            {SUPPORT_EMAIL}
          </a>
        </p>
      </main>
    </PublicShell>
  );
}
