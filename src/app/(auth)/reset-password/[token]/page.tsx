import { resetPasswordAction } from "@/app/actions/auth";
import { ActionForm } from "@/components/action-form";
import { PublicSubmit } from "@/components/public/public-submit";
import { PublicHeading } from "@/components/public/public-shell";
import { Card, CardContent } from "@/components/ui/card";
import { PasswordFields } from "../../password-fields";

export const metadata = { title: "Choose a new password" };

export default async function ResetPasswordPage({ params }: PageProps<"/reset-password/[token]">) {
  const { token } = await params;
  return (
    <>
      <PublicHeading title="Choose a new password" center />
      <Card>
        <CardContent>
          <ActionForm action={resetPasswordAction} className="space-y-4">
            <input type="hidden" name="token" value={token} />
            <PasswordFields />
            <PublicSubmit>Save password</PublicSubmit>
          </ActionForm>
        </CardContent>
      </Card>
    </>
  );
}
