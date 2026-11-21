import Link from "next/link";
import { SlottyMark } from "@/components/slotty-mark";

/** Slotty's mark (two split-flap cells), then the name. */
export function Wordmark() {
  return (
    <Link href="/" className="inline-flex min-h-11 items-center gap-2.5 text-[17px] font-semibold tracking-[-0.02em] text-[var(--text)]">
      <SlottyMark className="text-[var(--text)]" />
      Slotty
    </Link>
  );
}
