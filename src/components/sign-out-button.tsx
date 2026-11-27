"use client";

/**
 * Sign out without losing marks (#163; agreed design: step 3, point 10 on #160). Signing out
 * wipes this device (`Clear-Site-Data`), marking drafts included, so it first uploads any
 * that are waiting. If some still haven't reached Uniflow (offline, a conflict, a refusal),
 * it asks: stay signed in, or sign out and delete them.
 */
import { useRef, useState } from "react";
import { Loader2, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { draftsOf } from "@/lib/draft-store";
import { syncAllDrafts } from "@/lib/draft-sync";

export function SignOutButton({ owner }: { owner: string }) {
  const form = useRef<HTMLFormElement>(null);
  const confirmed = useRef(false);
  const [checking, setChecking] = useState(false);
  const [left, setLeft] = useState(0);

  const signOut = () => {
    confirmed.current = true;
    form.current?.requestSubmit();
  };

  return (
    <form
      ref={form}
      action="/logout"
      method="post"
      onSubmit={async (e) => {
        if (confirmed.current) return;
        e.preventDefault();
        setChecking(true);
        let n = (await draftsOf(owner)).length;
        if (n) n = await syncAllDrafts(owner, { force: true, includeOpenSheets: true });
        setChecking(false);
        if (n) setLeft(n);
        else signOut();
      }}
    >
      <Button type="submit" variant="ghost" size="icon" aria-label="Sign out" disabled={checking}>
        {checking ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : <LogOut />}
      </Button>
      <Dialog open={left > 0} onOpenChange={(open) => !open && setLeft(0)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {left} student{left === 1 ? "'s" : "s'"} marks haven&apos;t reached Uniflow yet
            </DialogTitle>
            <DialogDescription>They&apos;re kept on this device. Signing out deletes them from it; stay signed in and they upload as soon as Uniflow can be reached.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" autoFocus onClick={() => setLeft(0)}>
              Stay signed in
            </Button>
            <Button type="button" variant="destructive" onClick={signOut}>
              Sign out and delete them
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </form>
  );
}
