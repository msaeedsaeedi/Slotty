import Link from "next/link";
import { CalendarCheck, WifiOff } from "lucide-react";

export const metadata = { title: "Offline" };

/** Shown by the service worker when a page isn't available offline. */
export default function OfflinePage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-4 px-4 py-16 text-center">
      <CalendarCheck className="size-8 text-primary" />
      <WifiOff className="size-6 text-muted-foreground" aria-hidden />
      <h1 className="text-xl font-semibold">You&apos;re offline</h1>
      <p className="text-sm text-muted-foreground">
        This page hasn&apos;t been saved on this device. Pages you&apos;ve opened recently — your dashboard, bookings and demo details — are
        available offline.
      </p>
      <nav className="flex gap-4 text-sm">
        <Link className="text-primary underline" href="/dashboard" prefetch={false}>
          Dashboard
        </Link>
        <Link className="text-primary underline" href="/bookings" prefetch={false}>
          My bookings
        </Link>
      </nav>
    </main>
  );
}
