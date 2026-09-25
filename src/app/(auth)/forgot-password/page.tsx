import Link from "next/link";
import { forgotPasswordAction } from "@/app/actions/auth";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const metadata = { title: "Reset password" };

export default function ForgotPasswordPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Reset your password</CardTitle>
        <CardDescription>We&apos;ll email you a link to choose a new one.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <ActionForm action={forgotPasswordAction} className="space-y-4" resetOnSuccess>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" required autoFocus />
          </div>
          <SubmitButton className="w-full">Send reset link</SubmitButton>
        </ActionForm>
        <Link href="/login" className="block text-center text-sm text-muted-foreground hover:underline">
          Back to sign in
        </Link>
      </CardContent>
    </Card>
  );
}
