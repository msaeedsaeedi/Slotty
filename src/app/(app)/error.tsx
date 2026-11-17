"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { track } from "@/lib/analytics";

/**
 * Shown when a page fails to render. The error is reported (scrubbed, see
 * `scrubErrorMessage`) so the Errors tab in Insights shows where Slotty breaks.
 * Server errors arrive here as a generic message plus a digest that matches the
 * server log.
 */
export default function AppError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    track("client_error", { kind: "boundary", message: error.message || "Render error", ...(error.digest ? { digest: error.digest } : {}) });
  }, [error]);

  return (
    <div role="alert" className="mx-auto max-w-md space-y-4 rounded-xl border bg-card p-6 text-sm">
      <p className="flex items-center gap-2 font-medium">
        <AlertTriangle className="size-4 text-amber-600" aria-hidden /> Something went wrong on this page.
      </p>
      <p className="text-muted-foreground">
        It has been reported. Try again; if it keeps happening, use the feedback button to tell us what you were doing.
        {error.digest && <span className="mt-1 block text-xs">Reference: {error.digest}</span>}
      </p>
      <Button onClick={() => retry()}>Try again</Button>
    </div>
  );
}
