import Link from "next/link";
import { forgotPasswordAction } from "@/app/actions/auth";
import { ActionForm } from "@/components/action-form";
import { PublicSubmit } from "@/components/public/public-submit";
import { PublicHeading } from "@/components/public/public-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const metadata = { title: "Reset password" };

export default function ForgotPasswordPage() {
  return (
    <>
      <PublicHeading title="Reset your password" center />
      <Card>
        <CardContent>
          <p className="mb-5 text-[var(--text-2)]">We&apos;ll email you a link to choose a new one.</p>
          <ActionForm action={forgotPasswordAction} className="space-y-4" resetOnSuccess>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" required autoFocus />
            </div>
            <PublicSubmit>Send reset link</PublicSubmit>
          </ActionForm>
          <Link href="/login" className="mt-2 flex min-h-11 w-full items-center justify-center rounded-full text-sm text-[var(--text-2)] transition-colors hover:bg-white/[0.04] hover:text-[var(--text)]">
            Back to sign in
          </Link>
        </CardContent>
      </Card>
    </>
  );
}
