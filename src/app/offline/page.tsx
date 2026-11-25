import Link from "next/link";
import { WifiOff } from "lucide-react";
import { UniflowMark } from "@/components/uniflow-mark";

export const metadata = { title: "Offline" };

/** Shown by the service worker when a page isn't available offline. */
export default function OfflinePage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-4 px-4 py-16 text-center">
      <UniflowMark className="size-10 text-primary" />
      <WifiOff className="size-6 text-muted-foreground" aria-hidden />
      <h1 className="text-xl font-semibold">You&apos;re offline</h1>
      <p className="text-sm text-muted-foreground">This page isn&apos;t on this device.</p>
      <Link className="text-sm text-primary underline" href="/dashboard" prefetch={false}>
        Back to the dashboard
      </Link>
    </main>
  );
}
