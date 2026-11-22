import Link from "next/link";
import { redirect } from "next/navigation";
import { loginAction } from "@/app/actions/auth";
import { ActionForm } from "@/components/action-form";
import { PublicSubmit } from "@/components/public/public-submit";
import { PublicHeading } from "@/components/public/public-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ClearSavedPages } from "@/components/pwa";
import { getCurrentUser } from "@/server/auth/session";

export const metadata = { title: "Sign in" };

/**
 * Two fields and one big action. The only other choice, "Forgot password?", is a full-width
 * target right under it; how accounts work sits behind "No account yet?".
 */
export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  if (await getCurrentUser()) redirect("/dashboard");
  const { next } = await searchParams;
  return (
    <>
      <ClearSavedPages />
      <PublicHeading title="Sign in" center />
      <Card>
        <CardContent>
          <ActionForm action={loginAction} className="space-y-4">
            <input type="hidden" name="next" value={typeof next === "string" ? next : ""} />
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" autoComplete="email" required autoFocus />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" name="password" type="password" autoComplete="current-password" required />
            </div>
            <PublicSubmit>Sign in</PublicSubmit>
          </ActionForm>
          <Link
            href="/forgot-password"
            className="mt-2 flex min-h-11 w-full items-center justify-center rounded-full text-sm text-[var(--text-2)] transition-colors hover:bg-white/[0.04] hover:text-[var(--text)]"
          >
            Forgot password?
          </Link>
        </CardContent>
      </Card>
      <details className="group mt-4 text-center text-[13px] text-[var(--text-3)]">
        <summary className="inline-flex min-h-11 cursor-pointer list-none items-center px-2 text-[var(--text-2)] hover:text-[var(--text)]">
          No account yet?
        </summary>
        <p className="mx-auto max-w-[340px] leading-relaxed">
          Slotty is invite-only: your course staff add you and you get an email to set a password. Invite expired? Use Forgot password to get a new
          one.
        </p>
      </details>
    </>
  );
}
