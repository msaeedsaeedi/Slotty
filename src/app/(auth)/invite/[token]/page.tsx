import Link from "next/link";
import { acceptInviteAction } from "@/app/actions/auth";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { peekInvite } from "@/server/services/accounts";
import { PasswordFields } from "../../password-fields";

export const metadata = { title: "Accept invitation" };

export default async function InvitePage({ params }: PageProps<"/invite/[token]">) {
  const { token } = await params;
  const invite = await peekInvite(token);
  if (!invite) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Link expired</CardTitle>
          <CardDescription>
            This invitation is invalid or has already been used. If you&apos;ve set a password, just sign in. Otherwise, use
            &ldquo;Forgot password&rdquo; to get a fresh link.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/login" className="text-sm underline">
            Go to sign in
          </Link>
        </CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>Welcome to Slotty</CardTitle>
        <CardDescription>
          Set a password for <span className="font-medium text-foreground">{invite.email}</span>.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ActionForm action={acceptInviteAction} className="space-y-4">
          <input type="hidden" name="token" value={token} />
          <div className="space-y-2">
            <Label htmlFor="name">Your name</Label>
            <Input id="name" name="name" defaultValue={invite.name} required />
          </div>
          <PasswordFields />
          <SubmitButton className="w-full">Activate account</SubmitButton>
        </ActionForm>
      </CardContent>
    </Card>
  );
}
