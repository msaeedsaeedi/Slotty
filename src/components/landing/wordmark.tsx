import Link from "next/link";
import { UniflowMark } from "@/components/uniflow-mark";

/** Uniflow's mark, then the name. */
export function Wordmark() {
  return (
    <Link href="/" className="inline-flex min-h-11 items-center gap-2.5 text-[17px] font-semibold tracking-[-0.02em] text-[var(--text)]">
      <UniflowMark className="text-[var(--text)]" />
      Uniflow
    </Link>
  );
}
