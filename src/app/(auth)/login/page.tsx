import Link from "next/link";
import { redirect } from "next/navigation";
import { loginAction } from "@/app/actions/auth";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
    <Card>
      <ClearSavedPages />
      <CardHeader>
        <CardTitle>Sign in</CardTitle>
        <CardDescription>Use the email your course staff added you with.</CardDescription>
      </CardHeader>
      <CardContent>
        <ActionForm action={loginAction} className="space-y-4">
          <input type="hidden" name="next" value={typeof next === "string" ? next : ""} />
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" autoComplete="email" required autoFocus />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Password</Label>
              <Link href="/forgot-password" className="text-xs text-muted-foreground hover:underline">
                Forgot password?
              </Link>
            </div>
            <Input id="password" name="password" type="password" autoComplete="current-password" required />
          </div>
          <SubmitButton className="w-full">Sign in</SubmitButton>
        </ActionForm>
        <div className="mt-6 space-y-1 rounded-lg bg-muted/60 p-3 text-xs text-muted-foreground">
          <p className="font-medium text-foreground">No account yet?</p>
          <p>
            Slotty is invite-only: your course staff add you, and you get an email to set a password. Invite expired? Use{" "}
            <Link href="/forgot-password" className="underline underline-offset-2">
              Forgot password
            </Link>{" "}
            to get a new one. Still stuck? Email{" "}
            <a href={supportMailto("Help signing in")} className="underline underline-offset-2">
              {SUPPORT_EMAIL}
            </a>
            .
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
