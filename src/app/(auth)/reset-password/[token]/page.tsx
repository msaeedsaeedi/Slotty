import { resetPasswordAction } from "@/app/actions/auth";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { PublicHeading } from "@/components/public/public-shell";
import { Card, CardContent } from "@/components/ui/card";
import { PasswordFields } from "../../password-fields";

export const metadata = { title: "Choose a new password" };

export default async function ResetPasswordPage({ params }: PageProps<"/reset-password/[token]">) {
  const { token } = await params;
  return (
    <>
      <PublicHeading kicker="Gate · password" title="Choose a new password" />
      <Card>
        <CardContent>
          <ActionForm action={resetPasswordAction} className="space-y-4">
            <input type="hidden" name="token" value={token} />
            <PasswordFields />
            <SubmitButton className="w-full">Save password</SubmitButton>
          </ActionForm>
        </CardContent>
      </Card>
    </>
  );
}
