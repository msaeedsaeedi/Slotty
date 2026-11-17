"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MessageSquarePlus } from "lucide-react";
import { submitFeedbackAction } from "@/app/actions/feedback";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FEEDBACK_MAX_LENGTH } from "@/domain/analytics";

/** "Send feedback" in the header: anonymous message plus an optional 1–5 rating. */
export function FeedbackButton() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  return (
    <>
      <Button variant="ghost" size="icon" aria-label="Send feedback" title="Send feedback" onClick={() => setOpen(true)}>
        <MessageSquarePlus />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send feedback</DialogTitle>
            <DialogDescription>
              What was confusing, slow or missing? It&apos;s sent anonymously, so we can&apos;t reply: please leave out names and other personal details.
            </DialogDescription>
          </DialogHeader>
          <ActionForm action={submitFeedbackAction} resetOnSuccess onSuccess={() => setOpen(false)} className="space-y-4">
            <input type="hidden" name="path" value={pathname} />
            <div className="space-y-2">
              <Label htmlFor="feedback-message">Your feedback</Label>
              <Textarea id="feedback-message" name="message" required maxLength={FEEDBACK_MAX_LENGTH} rows={4} />
            </div>
            <fieldset className="space-y-2 text-sm">
              <legend className="font-medium">How is Slotty working for you? (optional)</legend>
              <div className="flex flex-wrap gap-3">
                {[1, 2, 3, 4, 5].map((n) => (
                  <label key={n} className="flex items-center gap-1.5">
                    <input type="radio" name="rating" value={n} /> {n}
                  </label>
                ))}
                <span className="text-xs text-muted-foreground">1 = very poorly, 5 = very well</span>
              </div>
            </fieldset>
            <div className="flex items-center justify-between gap-3">
              <Link href="/privacy" className="text-xs text-muted-foreground underline underline-offset-2" onClick={() => setOpen(false)}>
                What Slotty collects
              </Link>
              <SubmitButton>Send</SubmitButton>
            </div>
          </ActionForm>
        </DialogContent>
      </Dialog>
    </>
  );
}
