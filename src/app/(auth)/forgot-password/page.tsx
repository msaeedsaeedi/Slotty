import Link from "next/link";
import { forgotPasswordAction } from "@/app/actions/auth";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { PublicHeading } from "@/components/public/public-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const metadata = { title: "Reset password" };

export default function ForgotPasswordPage() {
  return (
    <>
      <PublicHeading kicker="Gate · password" title="Reset your password" />
      <Card>
        <CardContent className="space-y-4">
          <p className="text-[var(--text-2)]">We&apos;ll email you a link to choose a new one.</p>
          <ActionForm action={forgotPasswordAction} className="space-y-4" resetOnSuccess>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" required autoFocus />
            </div>
            <SubmitButton className="w-full">Send reset link</SubmitButton>
          </ActionForm>
          <Link href="/login" className="block text-center text-sm text-[var(--text-2)] hover:text-[var(--text)] hover:underline">
            Back to sign in
          </Link>
        </CardContent>
      </Card>
    </>
  );
}
