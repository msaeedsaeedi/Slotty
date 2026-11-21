import Link from "next/link";
import { redirect } from "next/navigation";
import { loginAction } from "@/app/actions/auth";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { PublicHeading } from "@/components/public/public-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ClearSavedPages } from "@/components/pwa";
import { getCurrentUser } from "@/server/auth/session";
import { SUPPORT_EMAIL, supportMailto } from "@/lib/site";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  if (await getCurrentUser()) redirect("/dashboard");
  const { next } = await searchParams;
  return (
    <>
      <ClearSavedPages />
      <PublicHeading kicker="Gate · sign in" title="Sign in" />
      <Card>
        <CardContent>
          <p className="mb-5 text-[var(--text-2)]">Use the email your course staff added you with.</p>
          <ActionForm action={loginAction} className="space-y-4">
            <input type="hidden" name="next" value={typeof next === "string" ? next : ""} />
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" autoComplete="email" required autoFocus />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                <Link href="/forgot-password" className="text-xs text-[var(--text-2)] hover:text-[var(--text)] hover:underline">
                  Forgot password?
                </Link>
              </div>
              <Input id="password" name="password" type="password" autoComplete="current-password" required />
            </div>
            <SubmitButton className="w-full">Sign in</SubmitButton>
          </ActionForm>
          <div className="mt-6 space-y-1 border-t border-[var(--line)] pt-4 text-xs leading-relaxed text-[var(--text-3)]">
            <p className="font-medium text-[var(--text-2)]">No account yet?</p>
            <p>
              Slotty is invite-only: your course staff add you, and you get an email to set a password. Invite expired? Use{" "}
              <Link href="/forgot-password" className="underline underline-offset-2 hover:text-[var(--text)]">
                Forgot password
              </Link>{" "}
              to get a new one. Still stuck? Email{" "}
              <a href={supportMailto("Help signing in")} className="underline underline-offset-2 hover:text-[var(--text)]">
                {SUPPORT_EMAIL}
              </a>
              .
            </p>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
