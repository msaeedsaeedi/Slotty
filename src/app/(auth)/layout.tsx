import Link from "next/link";
import { PublicShell } from "@/components/public/public-shell";
import { SUPPORT_EMAIL, supportMailto } from "@/lib/site";

const help = "text-[var(--text-2)] underline decoration-[var(--line-strong)] underline-offset-4 hover:text-[var(--text)] hover:decoration-[var(--text)]";

/** Sign-in, password reset and invite pages, in the landing page's theme (ADR-028). */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <PublicShell>
      <main id="main" className="flex flex-1 flex-col items-center px-5 py-12 sm:py-20">
        <div className="w-full max-w-[400px]">{children}</div>
        <p className="mt-8 w-full max-w-[400px] text-center text-[13px] leading-relaxed text-[var(--text-3)]">
          New to Slotty?{" "}
          <Link href="/" className={help}>
            See how it works
          </Link>
          . Need help?{" "}
          <a href={supportMailto("Help signing in")} className={help}>
            {SUPPORT_EMAIL}
          </a>
        </p>
      </main>
    </PublicShell>
  );
}
