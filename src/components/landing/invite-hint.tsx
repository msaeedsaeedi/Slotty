import { Info } from "lucide-react";
import { SUPPORT_EMAIL, supportMailto } from "@/lib/site";

/** "Invite only" in two words; who sends it and where to ask opens on tap. Works without JavaScript. */
export function InviteHint() {
  return (
    <details className="lp-hint relative inline-block">
      <summary className="inline-flex min-h-11 items-center gap-1.5 rounded-md px-2 text-[13px] text-[var(--text-3)] transition-colors duration-100 hover:text-[var(--text-2)]">
        <Info aria-hidden className="size-3.5" strokeWidth={2} />
        Invite only
      </summary>
      <div className="absolute top-full left-1/2 z-20 mt-1 w-[min(320px,calc(100vw-40px))] -translate-x-1/2 rounded-[12px] border border-[var(--line-strong)] bg-[var(--panel-2)] p-4 text-left text-[14px] leading-snug text-[var(--text-2)] shadow-[inset_0_1px_0_rgb(255_255_255/0.06),0_20px_40px_-16px_rgb(0_0_0/0.9)]">
        Your course staff send the invite. No invite?
        <a href={supportMailto("Slotty account")} className="lp-link mt-1 block w-fit whitespace-nowrap">
          {SUPPORT_EMAIL}
        </a>
      </div>
    </details>
  );
}
