import Link from "next/link";
import { acceptInviteAction } from "@/app/actions/auth";
import { ActionForm } from "@/components/action-form";
import { PublicSubmit } from "@/components/public/public-submit";
import { PublicHeading } from "@/components/public/public-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { peekInvite } from "@/server/services/accounts";
import { PERSON_NAME_MAX_LENGTH } from "@/lib/form-schemas";
import { SUPPORT_EMAIL, supportMailto } from "@/lib/site";
import { PasswordFields } from "../../password-fields";

export const metadata = { title: "Accept invitation" };

export default async function InvitePage({ params }: PageProps<"/invite/[token]">) {
  const { token } = await params;
  const invite = await peekInvite(token);
  if (!invite) {
    return (
      <>
        <PublicHeading title="Link expired" center />
        <Card>
          <CardContent>
            <p className="mb-5 text-[var(--text-2)]">
              This invitation is invalid or has already been used. If you&apos;ve set a password, just sign in. Otherwise, use &ldquo;Forgot
              password&rdquo; with the same email to get a fresh link. Still stuck? Email{" "}
              <a href={supportMailto("Invite problem")} className="text-[var(--text)] underline underline-offset-2">
                {SUPPORT_EMAIL}
              </a>
              .
            </p>
            <Link href="/login" className="lp-btn lp-btn-primary w-full">
              Go to sign in
            </Link>
          </CardContent>
        </Card>
      </>
    );
  }
  return (
    <>
      <PublicHeading title="Welcome to Slotty" center />
      <Card>
        <CardContent>
          <p className="mb-5 text-[var(--text-2)]">
            Set a password for <span className="font-medium text-[var(--text)]">{invite.email}</span>.
          </p>
          <ActionForm action={acceptInviteAction} className="space-y-4">
            <input type="hidden" name="token" value={token} />
            <div className="space-y-2">
              <Label htmlFor="name">Your name</Label>
              <Input id="name" name="name" defaultValue={invite.name} maxLength={PERSON_NAME_MAX_LENGTH} required />
            </div>
            <PasswordFields />
            <PublicSubmit>Activate account</PublicSubmit>
          </ActionForm>
        </CardContent>
      </Card>
    </>
  );
}
