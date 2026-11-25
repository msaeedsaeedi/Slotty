"use client";

import { Loader2 } from "lucide-react";
import { useSubmitState } from "@/components/action-form";

/**
 * The public pages' one action: the landing page's amber pill (lp-btn-primary), full width, with
 * its arrow. Same pending and offline handling as SubmitButton.
 */
export function PublicSubmit({ children }: { children: React.ReactNode }) {
  const { pending, online, offlineHint } = useSubmitState();
  return (
    <button type="submit" disabled={pending || !online} title={!online ? offlineHint : undefined} className="lp-btn lp-btn-primary lp-btn-lg w-full disabled:opacity-70">
      {pending && <Loader2 aria-hidden className="size-4 animate-spin" />}
      {children}
      {!pending && (
        <span aria-hidden className="lp-btn-arrow">
          →
        </span>
      )}
    </button>
  );
}
