import { ChatMock, SheetMock } from "./sheet-mock";

export function OldWay() {
  return (
    <section aria-labelledby="old-way-title" className="border-t border-[var(--line)] bg-[var(--panel)] py-20 sm:py-24">
      <div className="lp-container grid items-center gap-12 lg:grid-cols-12 lg:gap-10">
        <div className="lg:col-span-4">
          <p className="lp-mono text-[11px] text-[var(--text-3)]">01 · The old way</p>
          <h2 id="old-way-title" className="lp-h2 mt-4">
            You know this sheet.
          </h2>
          <p className="lp-lede mt-5 max-w-[36ch]">One shared sheet. Overwritten rows. Swaps in the class group. Marks everyone can see.</p>
        </div>

        <figure
          role="img"
          aria-label="A shared spreadsheet of demo slots: one name struck out and retyped, two students in the same 10:15 slot, a #REF! error, a comment asking who deleted a row, and marks anyone can see. Beside it, a class group chat asking to swap slots."
          className="relative lg:col-span-8 lg:pr-14 lg:pb-16"
        >
          <div aria-hidden>
            <SheetMock />
            <ChatMock className="mt-5 ml-auto rotate-[1.5deg] lg:absolute lg:right-1 lg:bottom-1 lg:mt-0" />
          </div>
        </figure>
      </div>
    </section>
  );
}
