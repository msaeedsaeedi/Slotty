import Link from "next/link";
import { CalendarCheck } from "lucide-react";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-4 py-12">
      <Link href="/" className="flex items-center gap-2 text-xl font-semibold">
        <CalendarCheck className="size-6 text-primary" />
        Slotty
      </Link>
      <div className="w-full max-w-sm">{children}</div>
      <p className="max-w-sm text-center text-xs text-muted-foreground">
        Book, run and mark course demos and vivas — without the spreadsheet.
      </p>
    </main>
  );
}
