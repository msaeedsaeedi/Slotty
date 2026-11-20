import Link from "next/link";
import { SlottyMark } from "@/components/slotty-mark";
import { SUPPORT_EMAIL, supportMailto } from "@/lib/site";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-4 py-12">
      <Link href="/" className="flex items-center gap-2 text-xl font-semibold">
        <SlottyMark className="size-7 text-primary" />
        Slotty
      </Link>
      <div className="w-full max-w-sm">{children}</div>
      <p className="max-w-sm text-center text-xs text-muted-foreground">
        New to Slotty?{" "}
        <Link href="/" className="underline underline-offset-2 hover:text-foreground">
          See how it works
        </Link>
        . Need help?{" "}
        <a href={supportMailto("Help signing in")} className="underline underline-offset-2 hover:text-foreground">
          {SUPPORT_EMAIL}
        </a>
      </p>
    </main>
  );
}
